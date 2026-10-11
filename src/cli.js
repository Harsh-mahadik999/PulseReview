#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const { analyze, formatReport } = require('./review')

const HELP = `Pulse — code review in CMD / terminal

node src/cli.js --demo
node src/cli.js --local . [--base HEAD] [--output review.md]
node src/cli.js --repo OWNER/REPO --pr 123 [--output review.md]
node src/cli.js --local . --run-tests -- node --test

Local mode reviews tracked changes against --base (default HEAD).
Untracked files are excluded. Selected code/context is sent to OpenRouter.
Remote mode reads GitHub; it does not publish comments. The installed App posts reviews.
--run-tests executes ONLY your supplied executable and arguments, with no shell.
For npm scripts on Windows use: -- node PATH/TO/npm-cli.js test
Inspect/trust the checkout before running tests. AI commands are never executed.
Remote reviews use GITHUB_TOKEN or your configured GitHub App credentials.
Live analysis requires OPENROUTER_API_KEY.
--demo is offline and does not need credentials.`

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true })
}
function localContext(directory, base = 'HEAD') {
  const cwd = path.resolve(directory)
  const ref = git(cwd, ['rev-parse', '--verify', '--end-of-options', base + '^{commit}']).trim()
  const names = git(cwd, ['diff', '--name-only', '-z', ref, '--']).split('\0').filter(Boolean)
  const context = { title: 'Local tracked changes', sha: git(cwd, ['rev-parse', 'HEAD']).trim(), files: [], relatedFiles: [],
    incomplete: false, checks: ['Local tests NOT RUN.'], issues: [], intent: '' }
  // Read committed intent so a proposed change cannot silently redefine policy.
  for (const name of ['PRODUCT_INTENT.md', 'PRODUCT_INTENT.MD']) {
    try { context.intent = git(cwd, ['show', `${ref}:${name}`]); break } catch {}
  }
  context.intentAvailable = Boolean(context.intent)
  if (!context.intent) { context.intent = 'No product intent found; alignment uncertain.'; context.incomplete = true }
  let remaining = 100000
  for (const filename of names) {
    if (!/\.(?:js|cjs|mjs|ts|tsx|jsx|py|go|rs|java|css|html|md|json|ya?ml)$/i.test(filename) ||
        /(?:^|\/)(?:\.env|secrets?|credentials|package-lock|yarn\.lock)/i.test(filename)) {
      context.incomplete = true; continue
    }
    const full = git(cwd, ['diff', '--no-ext-diff', '--no-textconv', '--unified=5', ref, '--', filename])
    const patch = full.slice(0, Math.max(0, remaining))
    remaining -= patch.length
    if (patch.length !== full.length || /Binary files/.test(patch)) context.incomplete = true
    context.files.push({ filename, patch })
  }
  const manifest = path.join(cwd, 'package.json')
  if (fs.existsSync(manifest) && !fs.lstatSync(manifest).isSymbolicLink() && fs.statSync(manifest).size < 30000) {
    context.relatedFiles.push({ path: 'package.json', content: fs.readFileSync(manifest, 'utf8') })
  }
  return context
}

function demo() {
  const context = { sha: 'offline-demo', files: [], checks: ['Demo only — no tests executed.'] }
  const result = { decision: 'WARN', intentScore: 85, securityRisk: 'LOW', summary: 'Example: simplify a user lookup.',
    value: 'Avoids maintaining a manual search loop.', beneficiaries: 'Developers maintaining user lookup.', issueAlignment: 'No linked issue supplied.',
    reasoning: 'Illustrative suggestion; verify duplicate-ID and missing-user behavior.',
    simplifications: ['Use Array.find when the intended behavior is to return the first matching user.'],
    dependencies: ['No new dependency needed.'], affectedFeatures: ['User lookup callers may rely on undefined when no match exists.'],
    tests: ['Add cases for an existing user, a missing user and duplicate IDs.'],
    fixes: [{ path: 'src/users.js', startLine: 10, endLine: 10, original: 'let user = users.filter(u => u.id === id)[0]',
      replacement: 'const user = users.find(u => u.id === id)', reason: 'Expresses first-match intent directly.' }] }
  return { context, result }
}

function runTests(cwd, command) {
  if (!command.length) throw new Error('--run-tests requires -- executable arguments')
  const result = spawnSync(command[0], command.slice(1), { cwd, shell: false, encoding: 'utf8', timeout: 120000,
    maxBuffer: 1024 * 1024, windowsHide: true })
  const status = result.error ? 'ERROR: ' + result.error.message : result.status === 0 ? 'PASSED' : `FAILED (exit ${result.status}, signal ${result.signal || 'none'})`
  return { status, passed: !result.error && result.status === 0 }
}

async function main(args = process.argv.slice(2)) {
  if (!args.length || args.includes('--help')) { console.log(HELP); return }
  const split = args.indexOf('--')
  const command = split < 0 ? [] : args.slice(split + 1)
  const options = split < 0 ? args : args.slice(0, split)
  const config = {}
  for (let i = 0; i < options.length; i++) {
    const option = options[i]
    if (['--demo', '--run-tests'].includes(option)) config[option] = true
    else if (['--local', '--base', '--repo', '--pr', '--output'].includes(option)) {
      if (!options[i + 1] || options[i + 1].startsWith('--')) throw new Error('Missing value for ' + option)
      config[option] = options[++i]
    } else throw new Error('Unknown option: ' + option)
  }
  if ([config['--demo'], config['--local'], config['--repo']].filter(Boolean).length !== 1) throw new Error('Choose exactly one of --demo, --local or --repo')
  if (config['--run-tests'] && !config['--local']) throw new Error('Tests can only run with --local')
  if (config['--run-tests'] && !command.length) throw new Error('Supply -- executable arguments for tests')
  let context, result
  if (config['--demo']) ({ context, result } = demo())
  else {
    require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true })
    if (config['--local']) {
      context = localContext(config['--local'], config['--base'])
      if (!context.files.length) throw new Error('No supported tracked changes to review. Edit a tracked file or choose --base.')
    } else {
      if (!/^[\w.-]+\/[\w.-]+$/.test(config['--repo']) || !/^[1-9]\d*$/.test(config['--pr'] || '')) throw new Error('Supply --repo OWNER/REPO --pr NUMBER')
      const { repositoryClient } = require('./auth')
      const { collectContext } = require('./github')
      const [owner, repo] = config['--repo'].split('/')
      context = await collectContext(await repositoryClient(owner, repo), owner, repo, Number(config['--pr']))
    }
    console.error('Pulse: reviewing selected code with AI...')
    result = await analyze(context)
    if (config['--run-tests']) {
      const evidence = runTests(path.resolve(config['--local']), command)
      context.checks = ['User-selected local test command: ' + evidence.status + '. Applies to the current checkout; suggested fixes are not applied.']
      if (!evidence.passed) process.exitCode = 1
    }
  }
  const report = formatReport(result, context)
  console.log(report)
  if (config['--output']) fs.writeFileSync(path.resolve(config['--output']), report + '\n', 'utf8')
}
if (require.main === module) main().catch(error => { console.error('Pulse:', error.message); process.exitCode = 1 })
module.exports = { localContext, runTests, main, demo }
