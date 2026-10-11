# Pulse — AI PR review and terminal suggestions

Pulse is a GitHub App and local command-line reviewer. It explains why a change matters, suggests exact code replacements, and helps developers simplify code before merging.

## What Pulse reviews

- **PR value:** the problem solved, beneficiaries, and alignment with explicitly linked issues (`Fixes #123`, `Closes #123`, or `Resolves #123` in the same repository).
- **Exact code fixes:** original lines, suggested replacement, and reasoning. Only replacements matching visible lines in the reviewed diff are published.
- **Simplification:** repeated logic and opportunities to reuse existing utilities, with behavior-preservation tradeoffs.
- **Dependencies:** opportunities to reuse existing packages or avoid unnecessary additions. These are AI recommendations, not a vulnerability scan.
- **Affected features:** potential callers, APIs and tests based on available context. Hypotheses should be labeled; this is not a complete dependency graph.
- **Tests:** regression-test recommendations marked NOT RUN. Existing GitHub Check results are reported separately. The CLI can execute a test command explicitly supplied by you.

## GitHub workflow

1. GitHub sends a PR opened, updated, reopened or ready-for-review webhook.
2. Pulse verifies the signature before processing it.
3. It paginates changed files, fetches policy from the PR's base commit, and collects selected source files, the root package manifest, explicit issue references and existing CI checks.
4. AI produces a structured review. Pulse validates the response and checks replacement lines against the actual diff.
5. Pulse posts a COMMENT review for the PR author, including inline GitHub suggestion blocks and instructions for viewing suggestions in a terminal.
6. A GitHub Check reports APPROVE, WARN or BLOCK. A stale analysis is cancelled; an analysis/publishing failure requires manual action.

GitHub suggestions require a human to accept them. Pulse does not automatically edit, execute AI-generated commands, approve a GitHub review, or merge a PR. A failed Check only prevents merging if repository rules require that Check.

| Condition | Decision |
| --- | --- |
| HIGH or CRITICAL security risk | BLOCK |
| Intent score below 50 when product intent is available | BLOCK |
| Partial diff coverage or missing product intent | WARN (unless BLOCK applies) |
| MEDIUM risk or intent score below 80 | WARN |
| Otherwise | APPROVE |

Intent scores are AI estimates, not measured probabilities or proof of security.

## CMD / terminal showcase

Run commands from the Pulse project folder. In Windows CMD, use cd /d followed by the quoted folder path first. Alternatively, invoke the full path to pulse.cmd, which switches to the correct directory automatically. A Cannot find module ...src/cli.js error means the command was run from the wrong directory. The CLI loads configuration from the Pulse installation folder.

Double-click **pulse.cmd** on Windows to open a terminal with an offline example. The window stays open so you can read the suggested code. Node.js must be on PATH.

From the Pulse directory:

```text
node src/cli.js --demo
node src/cli.js --help
node src/cli.js --local .
node src/cli.js --local "C:/path/to/project" --base main --output review.md
node src/cli.js --repo OWNER/REPO --pr 123
```

You can use `pulse.cmd` with the same options on Windows, or `npm run review --` followed by the options. The demo is illustrative, not a live review of your code.

Local review compares tracked working-tree changes (including staged changes) against HEAD by default, or the supplied base commit. Untracked files are excluded. Supported source/config files are reviewed; common secret filenames, binaries and unsupported files are excluded and mark coverage partial. Review your changes for secrets before sending them: filename filtering is not a secret scanner. Selected code is sent to OpenRouter.

Remote CLI review uses `GITHUB_TOKEN` when configured, or reuses the GitHub App ID and private key to obtain a short-lived installation token. The App must be installed on the target repository. It only displays the review; posting comments is handled by the installed GitHub App.

### Explicit local test execution

```text
node src/cli.js --local . --run-tests -- node --test
```

Inspect and trust the checkout first. This runs the executable and arguments you explicitly supplied, with no shell, a two-minute timeout and bounded captured output. It reports the actual exit result separately from AI suggestions. Tests run against your current code: proposed fixes are not applied. A failed/erroring test command makes the CLI exit nonzero.

For npm scripts on Windows, supply `node` and the absolute path to `npm-cli.js`, followed by `test`. Shell built-ins and `.cmd` launchers are not supported by this test runner. AI-suggested commands are display-only.

## Setup

### Updating an existing installation

You do not need to recreate or reinstall your GitHub App when updating Pulse.

1. Put the updated source on the computer or hosting service running Pulse. Pushing to GitHub alone does not restart a local server or ngrok tunnel.
2. Restore your existing `.env` and GitHub App private-key file on that host. These files are deliberately excluded from Git and are not included when cloning this repository.
3. Keep the existing App ID, private key and webhook secret. Add **Issues: Read-only** to the App permissions and approve the update to enable linked-issue context.
4. Run `npm ci`, then `node src/index.js` from the Pulse folder. Stop the previous Pulse process first if it already uses port 3000.
5. Start your existing ngrok tunnel to port 3000, or use your deployed HTTPS service. Verify that the GitHub App webhook URL points to its `/webhook` endpoint.
6. Open or update a test PR. Check the App's **Advanced → Recent Deliveries** page, then look for the Pulse review and Check on the PR.

If startup reports **Missing configuration**, restore the missing environment settings before retrying. An ngrok **ERR_NGROK_3200** response means the tunnel is offline.

To see example output immediately without credentials, run `node src/cli.js --demo` or double-click `pulse.cmd`. This is an offline example, not a live AI review or a running GitHub webhook server.

### First-time setup

Use Node.js 20 or newer and npm.

```text
npm ci
```

Copy `.env.example` to `.env`, then configure:

```dotenv
PORT=3000
GITHUB_APP_ID=your_app_id
GITHUB_WEBHOOK_SECRET=your_webhook_secret
GITHUB_PRIVATE_KEY_PATH=./private-key.pem
OPENROUTER_API_KEY=your_openrouter_key
PULSE_MODEL=openai/gpt-4.1-mini
# Only needed for remote CLI reviews:
GITHUB_TOKEN=
PULSE_LICENSE_ENFORCEMENT=false
```

Choose an available OpenRouter model with reliable JSON/code-review support via `PULSE_MODEL`. The default is GPT-4.1 mini with a strict JSON schema; availability depends on your provider account. Local live reviews need only the OpenRouter settings. The offline demo needs no secrets or installed dependencies.

Create a GitHub App with:

- Pull requests: Read & Write
- Checks: Read & Write
- Contents: Read
- Issues: Read (for linked issue context)
- Subscription: Pull request

Install it on the repositories you want reviewed. Download its private key and configure the webhook URL as `https://YOUR-HOST/webhook`. Use the same webhook secret in GitHub and `.env`. For development, run `ngrok http 3000` and use its HTTPS URL.

Add `PRODUCT_INTENT.md` (or `PRODUCT_INTENT.MD`) to the **target repository's base branch**:

```markdown
# Product Intent
- Prefer simple, readable solutions.
- Avoid dependencies unless they provide clear value.
- Protect user data.
- Keep each PR focused on one problem.
```

Start the server:

```text
npm start
```

Development, tests and optional compiled output:

```text
npm run dev
npm test
npm run build
node dist/index.js
```

The source implementation is CommonJS JavaScript. The build copies JavaScript into `dist` using TypeScript's allowJs mode; there is no second server implementation.

## Limits and reliability

- PR patches have a 100,000-character total budget. Missing/truncated patches mark coverage partial and cannot produce APPROVE.
- Before sending a review, Pulse reduces the combined context to 24,000 characters for compatibility with smaller models. Removed context is marked partial and cannot produce APPROVE. JSON response mode is requested; malformed responses still fail closed.
- Surrounding context is selective: up to seven files, with per-file limits. This is not a whole-repository analysis or security certification.
- Invalid model responses fail the review rather than produce a fabricated low-risk score.
- Code fixes must match exact right-side diff lines within a single hunk. Unverifiable fixes are omitted.
- The app uses an in-memory, one-hour deduplication window and processes reviews after acknowledging the webhook. Restart recovery, durable jobs and cross-instance deduplication are future work. Redeliver failed webhooks when needed.
- The server does not execute PR code. CI evidence comes from GitHub checks; Pulse does not independently attest what those checks tested.
- No editor UI or automatic patch application is included. Review and accept replacements in GitHub; use the terminal to inspect recommendations.

## Optional runtime license enforcement

Set `PULSE_LICENSE_ENFORCEMENT=true`, `PULSE_LICENSE_KEY`, and `PULSE_LICENSE_KEY_SHA256` to enable the existing server startup guard. The hash is the SHA-256 of the exact trimmed key. Invalid configuration prevents server startup.

## Structure

```text
src/index.js       GitHub webhook server and authentication
src/review.js      AI analysis, validation, formatting and suggestion checks
src/github.js      Repository context and GitHub review publishing
src/cli.js         Local/remote terminal reviews and explicit test execution
pulse.cmd          Windows terminal demo / command launcher
test/              Automated regression tests
```

## Roadmap

- Durable review queue and retries
- Dependency vulnerability scanning
- Broader caller/test discovery
- Permission-checked override command
- Optional editor UI and reviewed patch application

## Contributing and license

See CONTRIBUTING.md for the issue, admin assignment and pull-request workflow.

Copyright (c) 2026 Harsh Mahadik. This repository is proprietary and All Rights Reserved; see LICENSE.
