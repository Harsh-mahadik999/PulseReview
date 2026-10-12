const { analyze, formatReport, inlineComments } = require('./review')

async function readFile(api, owner, repo, path, ref) {
  try {
    const { data } = await api.rest.repos.getContent({ owner, repo, path, ref })
    if (data.encoding !== 'base64' || data.size > 50000) return null
    return Buffer.from(data.content, 'base64').toString('utf8')
  } catch (error) {
    if (error.status === 404) return null
    throw error
  }
}

async function collectContext(api, owner, repo, number) {
  const { data: pr } = await api.rest.pulls.get({ owner, repo, pull_number: number })
  const allFiles = await api.paginate(api.rest.pulls.listFiles, { owner, repo, pull_number: number, per_page: 100 })
  let budget = 100000, incomplete = allFiles.length < pr.changed_files
  const files = allFiles.map(file => {
    const patch = (file.patch || '').slice(0, Math.max(0, budget))
    budget -= patch.length
    if (!file.patch || patch.length !== file.patch.length) incomplete = true
    return { filename: file.filename, status: file.status, patch }
  })
  // Policy comes from the trusted base commit, never the proposed branch.
  const intent = await readFile(api, owner, repo, 'PRODUCT_INTENT.md', pr.base.sha) ||
    await readFile(api, owner, repo, 'PRODUCT_INTENT.MD', pr.base.sha)
  const context = { owner, repo, prNumber: number, sha: pr.head.sha, title: pr.title, description: (pr.body || '').slice(0, 12000),
    intent: intent || 'No product intent found. Assess code quality; mark product alignment uncertain.', intentAvailable: Boolean(intent), files,
    incomplete: incomplete || !intent, relatedFiles: [], issues: [], checks: [] }
  const headOwner = pr.head.repo?.owner.login || owner
  const headRepo = pr.head.repo?.name || repo
  const paths = [...new Set(['package.json', ...files.filter(f => /\.(js|ts|tsx|jsx|py|go|rs|java)$/.test(f.filename)).map(f => f.filename)])].slice(0, 7)
  for (const path of paths) {
    const content = await readFile(api, headOwner, headRepo, path, pr.head.sha)
    if (content !== null) context.relatedFiles.push({ path, content: content.slice(0, 12000), truncated: content.length > 12000 })
  }
  // Explicit same-repository issue references only; no arbitrary URL fetching.
  const numbers = [...new Set([...context.description.matchAll(/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi)].map(m => Number(m[1])))].slice(0, 3)
  for (const issue_number of numbers) {
    try {
      const { data } = await api.rest.issues.get({ owner, repo, issue_number })
      context.issues.push({ number: issue_number, title: data.title, body: (data.body || '').slice(0, 6000) })
    } catch (error) {
      if (error.status !== 404) throw error
      context.issues.push({ number: issue_number, unavailable: true })
    }
  }
  try {
    const checks = await api.paginate(api.rest.checks.listForRef, { owner, repo, ref: pr.head.sha, per_page: 100 })
    context.checks = checks.filter(c => !c.name.startsWith('Pulse Analysis')).slice(0, 30).map(c => `${c.name}: ${c.status} / ${c.conclusion || 'pending'} (GitHub CI, not executed by Pulse)`)
  } catch { context.checks = ['CI evidence unavailable.'] }
  if (!context.checks.length) context.checks = ['No existing CI checks reported for this commit.']
  return context
}

async function reviewPR(api, owner, repo, number, expectedSha) {
  const context = await collectContext(api, owner, repo, number)
  if (expectedSha && context.sha !== expectedSha) return { skipped: true }
  const { data: check } = await api.rest.checks.create({ owner, repo, name: 'Pulse Analysis #' + number, head_sha: context.sha, status: 'in_progress' })
  try {
    const result = await analyze(context)
    const { data: latest } = await api.rest.pulls.get({ owner, repo, pull_number: number })
    if (latest.head.sha !== context.sha) {
      await api.rest.checks.update({ owner, repo, check_run_id: check.id, status: 'completed', conclusion: 'cancelled' })
      return { skipped: true }
    }
    // A submitted COMMENT review notifies the author and attaches replacements to exact lines.
    await api.rest.pulls.createReview({ owner, repo, pull_number: number, commit_id: context.sha,
      event: 'COMMENT', body: formatReport(result, context).slice(0, 60000), comments: inlineComments(result) })
    await api.rest.checks.update({ owner, repo, check_run_id: check.id, status: 'completed',
      conclusion: { APPROVE: 'success', WARN: 'neutral', BLOCK: 'failure' }[result.decision],
      output: { title: `Pulse: ${result.decision}`, summary: result.reasoning } })
    return result
  } catch (error) {
    await api.rest.checks.update({ owner, repo, check_run_id: check.id, status: 'completed', conclusion: 'action_required',
      output: { title: 'Pulse review incomplete', summary: 'Analysis or publishing failed. A maintainer should retry; no approval was issued.' } })
    throw error
  }
}

module.exports = { readFile, collectContext, reviewPR }
