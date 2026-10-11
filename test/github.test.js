const { test } = require('node:test')
const assert = require('node:assert/strict')
const { collectContext, reviewPR } = require('../src/github')
const { demo } = require('../src/cli')

function fixture() {
  const calls = { reviews: [], checks: [], reads: [] }
  const pr = { changed_files: 1, head: { sha: 'a'.repeat(40) }, base: { sha: 'b'.repeat(40) }, title: 'Fix lookup', body: 'Fixes #12' }
  const files = [{ filename: 'src/users.js', patch: '@@ -10 +10 @@\n-old\n+let user = users.filter(u => u.id === id)[0]' }]
  const api = { rest: {
    pulls: { get: async () => ({ data: pr }), listFiles: 'files', createReview: async x => { calls.reviews.push(x) } },
    repos: { getContent: async x => { calls.reads.push(x); return { data: { encoding: 'base64', size: 10, content: Buffer.from('Keep it simple').toString('base64') } } } },
    issues: { get: async () => ({ data: { title: 'Lookup bug', body: 'Missing users should return undefined' } }) },
    checks: { listForRef: 'checks', create: async () => ({ data: { id: 1 } }), update: async x => { calls.checks.push(x) } }
  }, paginate: async method => method === 'files' ? files : [{ name: 'tests', status: 'completed', conclusion: 'success' }] }
  return { api, pr, calls }
}

test('repository policy uses base SHA and linked issues and CI enter context', async () => {
  const { api, calls } = fixture()
  const context = await collectContext(api, 'owner', 'repo', 1)
  assert.equal(calls.reads[0].ref, 'b'.repeat(40))
  assert.equal(context.issues[0].number, 12)
  assert.match(context.checks[0], /not executed by Pulse/)
})

test('review publishes verified inline suggestion on exact reviewed commit', async () => {
  const { api, calls } = fixture()
  const previous = global.fetch
  process.env.OPENROUTER_API_KEY = 'test-placeholder'
  global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(demo().result) } }] }) })
  try {
    await reviewPR(api, 'owner', 'repo', 1)
    assert.equal(calls.reviews.length, 1)
    assert.equal(calls.reviews[0].commit_id, 'a'.repeat(40))
    assert.equal(calls.reviews[0].comments[0].line, 10)
    assert.match(calls.reviews[0].comments[0].body, /```suggestion/)
    assert.equal(calls.checks.at(-1).conclusion, 'success')
  } finally { global.fetch = previous }
})

test('stale webhook does not publish and AI failure requires action', async () => {
  const { api, calls } = fixture()
  assert.deepEqual(await reviewPR(api, 'owner', 'repo', 1, 'c'.repeat(40)), { skipped: true })
  const previous = global.fetch
  global.fetch = async () => { throw new Error('network failure') }
  try {
    await assert.rejects(reviewPR(api, 'owner', 'repo', 1), /network failure/)
    assert.equal(calls.reviews.length, 0)
    assert.equal(calls.checks.at(-1).conclusion, 'action_required')
  } finally { global.fetch = previous }
})
