const { test } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { verifySignature, verifiedFixes, decision, analyze, formatReport, inlineComments } = require('../src/review')
const { demo, runTests } = require('../src/cli')

test('webhook signatures reject modified payloads and malformed signatures', () => {
  const body = Buffer.from('{"action":"opened"}')
  const signature = 'sha256=' + crypto.createHmac('sha256', 'secret').update(body).digest('hex')
  assert.equal(verifySignature(body, signature, 'secret'), true)
  assert.equal(verifySignature(Buffer.from('{}'), signature, 'secret'), false)
  assert.equal(verifySignature(body, 'sha256=x', 'secret'), false)
  assert.equal(verifySignature(body, signature, ''), false)
})

test('high security risk cannot be approved; incomplete coverage cannot be green', () => {
  assert.equal(decision({ intentScore: 100, securityRisk: 'HIGH' }), 'BLOCK')
  assert.equal(decision({ intentScore: 100, securityRisk: 'LOW' }, true), 'WARN')
  assert.equal(decision({ intentScore: 90, securityRisk: 'LOW' }), 'APPROVE')
  assert.equal(decision({ intentScore: 0, securityRisk: 'LOW' }, true, false), 'WARN')
  assert.equal(decision({ intentScore: 0, securityRisk: 'HIGH' }, true, false), 'BLOCK')
})

test('fixes must match exact right-side source lines within a single hunk', () => {
  const files = [{ filename: 'a.js', patch: '@@ -1,2 +1,2 @@\n-old\n+new\n keep\n@@ -10 +10 @@\n-last\n+next' }]
  const fix = { path: 'a.js', startLine: 1, endLine: 2, original: 'new\nkeep', replacement: 'better', reason: 'readability' }
  assert.deepEqual(verifiedFixes([fix], files), [fix])
  assert.equal(verifiedFixes([{ ...fix, original: 'old\nkeep' }], files).length, 0)
  assert.equal(verifiedFixes([{ ...fix, endLine: 10 }], files).length, 0)
  assert.equal(verifiedFixes([{ ...fix, path: 'missing.js' }], files).length, 0)
  assert.equal(inlineComments({ fixes: [fix] })[0].start_line, 1)
  assert.match(inlineComments({ fixes: [{ ...fix, replacement: '@decorator\nfunction()' }] })[0].body, /@decorator/)
})

test('AI output is validated and ungrounded fixes removed', async () => {
  process.env.OPENROUTER_API_KEY = 'test-placeholder'
  const { context, result } = demo()
  const reviewed = await analyze(context, async (_url, request) => {
    assert.equal(JSON.parse(request.body).messages[0].role, 'system')
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(result) } }] }) }
  })
  assert.equal(reviewed.fixes.length, 0)
  assert.equal(reviewed.rejectedFixes, 1)
  assert.equal(reviewed.testsStatus, 'NOT RUN')
  await assert.rejects(analyze(context, async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"intentScore":100}' } }] }) })), /Invalid AI/)
  await assert.rejects(analyze(context, async () => ({ ok: false, status: 429 })), /429/)
})

test('reports distinguish suggested tests from actual execution and sanitize terminal escapes', () => {
  const { context, result } = demo()
  result.summary = '\x1b[31m @everyone'
  const report = formatReport(result, context)
  assert.match(report, /NOT RUN by Pulse/)
  assert.doesNotMatch(report, /\x1b/)
  assert.doesNotMatch(report, /@everyone/)
})

test('oversized context is reduced and reported as a partial review', async () => {
  process.env.OPENROUTER_API_KEY = 'test-placeholder'
  const { context, result } = demo()
  context.files = [{ filename: 'large.js', patch: 'x'.repeat(60000) }]
  result.fixes = []
  const actual = await analyze(context, async (_url, request) => {
    const sent = JSON.parse(JSON.parse(request.body).messages[1].content)
    assert.ok(JSON.stringify(sent).length <= 24000)
    assert.equal(sent.incomplete, true)
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(result) } }] }) }
  })
  assert.equal(actual.decision, 'WARN')
  assert.match(formatReport(actual, context), /PARTIAL/)
})

test('explicit test execution records real passing and failing exit codes', () => {
  assert.equal(runTests(process.cwd(), [process.execPath, '-e', 'process.exit(0)']).passed, true)
  assert.equal(runTests(process.cwd(), [process.execPath, '-e', 'process.exit(7)']).passed, false)
  assert.throws(() => runTests(process.cwd(), []), /requires/)
})
