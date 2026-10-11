const { test } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { createApp } = require('../src/index')

test('webhook rejects unsigned input, validates metadata and deduplicates signed PR events', async () => {
  process.env.GITHUB_WEBHOOK_SECRET = 'test-secret'
  let processed = 0
  const server = createApp(async () => { processed++ }).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const url = `http://127.0.0.1:${server.address().port}/webhook`
  const payload = { action: 'opened', installation: { id: 1 }, repository: { owner: { login: 'owner' }, name: 'repo' },
    pull_request: { number: 1, head: { sha: 'a'.repeat(40) } } }
  const post = (value, signed = true) => {
    const body = JSON.stringify(value)
    return fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'x-github-event': 'pull_request',
      ...(signed ? { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', 'test-secret').update(body).digest('hex') } : {}) } })
  }
  try {
    assert.equal((await post(payload, false)).status, 401)
    assert.equal((await post({ action: 'opened' })).status, 400)
    assert.equal((await post(payload)).status, 202)
    assert.equal((await (await post(payload)).json()).duplicate, true)
    assert.equal(processed, 1)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
