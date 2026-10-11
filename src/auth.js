const fs = require('node:fs')
const path = require('node:path')
const jwt = require('jsonwebtoken')
const { Octokit } = require('@octokit/rest')

function appClient() {
  if (!process.env.GITHUB_APP_ID || !process.env.GITHUB_PRIVATE_KEY_PATH) {
    throw new Error('Configure GITHUB_TOKEN or the existing GitHub App ID and private key in Pulse .env')
  }
  const keyPath = path.resolve(__dirname, '..', process.env.GITHUB_PRIVATE_KEY_PATH)
  const key = fs.readFileSync(keyPath, 'utf8').replace(/\\n/g, '\n').trim()
  const now = Math.floor(Date.now() / 1000)
  const token = jwt.sign({ iat: now - 60, exp: now + 500, iss: process.env.GITHUB_APP_ID }, key, { algorithm: 'RS256' })
  return new Octokit({ auth: token, request: { timeout: 30000 } })
}

async function repositoryClient(owner, repo) {
  if (process.env.GITHUB_TOKEN) return new Octokit({ auth: process.env.GITHUB_TOKEN, request: { timeout: 30000 } })
  const app = appClient()
  const { data: installation } = await app.rest.apps.getRepoInstallation({ owner, repo })
  const { data } = await app.rest.apps.createInstallationAccessToken({ installation_id: installation.id })
  return new Octokit({ auth: data.token, request: { timeout: 30000 } })
}

module.exports = { repositoryClient }
