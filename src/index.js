// Copyright (c) 2026 Harsh Mahadik. All rights reserved.
const express = require('express')
const fs = require('node:fs')
const crypto = require('node:crypto')
const jwt = require('jsonwebtoken')
const { Octokit } = require('@octokit/rest')
const { verifySignature } = require('./review')
const { reviewPR } = require('./github')
require('dotenv').config()

function checkLicense() {
  if (process.env.PULSE_LICENSE_ENFORCEMENT !== 'true') return
  const key = process.env.PULSE_LICENSE_KEY?.trim()
  const hash = process.env.PULSE_LICENSE_KEY_SHA256?.trim().toLowerCase()
  if (!key || !/^[a-f0-9]{64}$/.test(hash || '') ||
      !crypto.timingSafeEqual(crypto.createHash('sha256').update(key).digest(), Buffer.from(hash, 'hex'))) {
    throw new Error('Invalid runtime license configuration')
  }
}

function createApp(processEvent) {
  const app = express()
  const deliveries = new Map()
  app.get('/', (_req, res) => res.json({ status: 'Pulse is running', features: ['PR value', 'code fixes', 'simplification', 'dependencies', 'impact', 'test suggestions', 'terminal review'] }))
  app.post('/webhook', express.raw({ type: 'application/json', limit: '2mb' }), (req, res) => {
    if (!Buffer.isBuffer(req.body) || !verifySignature(req.body, req.headers['x-hub-signature-256'], process.env.GITHUB_WEBHOOK_SECRET)) {
      return res.status(401).json({ error: 'Invalid webhook signature' })
    }
    let payload
    try { payload = JSON.parse(req.body.toString('utf8')) } catch { return res.status(400).json({ error: 'Invalid JSON' }) }
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'Invalid payload' })
    if (req.headers['x-github-event'] !== 'pull_request' || !['opened', 'synchronize', 'reopened', 'ready_for_review'].includes(payload.action)) {
      return res.json({ processed: false })
    }
    if (!payload.installation?.id || !payload.repository?.owner?.login || !payload.repository?.name ||
        !Number.isInteger(payload.pull_request?.number) || !/^[a-f0-9]{40}$/.test(payload.pull_request?.head?.sha || '')) {
      return res.status(400).json({ error: 'Missing PR metadata' })
    }
    const key = `${payload.repository.owner.login}/${payload.repository.name}/${payload.pull_request.number}/${payload.pull_request.head.sha}`
    const now = Date.now()
    for (const [id, entry] of deliveries) if (entry.done && now - entry.time > 3600000) deliveries.delete(id)
    if (deliveries.has(key)) return res.json({ duplicate: true })
    if (deliveries.size >= 1000) return res.status(503).json({ error: 'Review capacity reached; retry later' })
    deliveries.set(key, { time: now, done: false })
    res.status(202).json({ received: true })
    Promise.resolve().then(() => processEvent(payload)).then(() => deliveries.set(key, { time: Date.now(), done: true })).catch(error => {
      deliveries.delete(key)
      console.error('Pulse review failed:', error.message)
    })
  })
  return app
}

async function processEvent(payload) {
  const privateKey = fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH, 'utf8').replace(/\\n/g, '\n').trim()
  const now = Math.floor(Date.now() / 1000)
  const token = jwt.sign({ iat: now - 60, exp: now + 500, iss: process.env.GITHUB_APP_ID }, privateKey, { algorithm: 'RS256' })
  const appApi = new Octokit({ auth: token, request: { timeout: 30000 } })
  const { data } = await appApi.rest.apps.createInstallationAccessToken({ installation_id: payload.installation.id })
  return reviewPR(new Octokit({ auth: data.token, request: { timeout: 30000 } }), payload.repository.owner.login,
    payload.repository.name, payload.pull_request.number, payload.pull_request.head.sha)
}

if (require.main === module) {
  checkLicense()
  for (const key of ['GITHUB_WEBHOOK_SECRET', 'GITHUB_APP_ID', 'GITHUB_PRIVATE_KEY_PATH', 'OPENROUTER_API_KEY']) {
    if (!process.env[key]) throw new Error(`Missing configuration: ${key}`)
  }
  createApp(processEvent).listen(process.env.PORT || 3000, () => console.log('Pulse PR reviewer is ready'))
}
module.exports = { createApp, checkLicense }
