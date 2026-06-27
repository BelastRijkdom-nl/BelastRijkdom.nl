# GitHub Bot — Design Spec

Claude Code running as a GitHub App bot, wired into the L2 agentic golden path.

**Status:** Approved, pending implementation  
**Related:** `docs/agentic-platform.md`, `AGENTS.md`

---

## What this builds

Two GitHub Actions workflows that give Claude Code a bot identity in this repository:

1. **`agent-dispatch.yml`** — triggers Claude on `agent:task` issue labels and `@claude` mentions
2. **`agent-self-correct.yml`** — triggers Claude when CI fails on an `agent/*` branch

The bot uses a custom GitHub App (not a PAT, not Anthropic's official app) so tokens are scoped, short-lived, and the git audit trail is stable for the lifetime of the app.

---

## One-time human setup

### 1. Create the GitHub App

GitHub → Settings → Developer settings → GitHub Apps → New GitHub App.

**App name:** choose a slug (e.g. `belastrijkdom-bot`) — this becomes permanent and appears in the git log as `{APP_ID}+belastrijkdom-bot[bot]@users.noreply.github.com`.

**Permissions (repository, exact — grant nothing else):**

| Permission    | Level          |
| ------------- | -------------- |
| Contents      | Read and write |
| Pull requests | Read and write |
| Issues        | Read-only      |
| Actions       | Read-only      |
| Metadata      | Read-only      |

Do not grant: Checks, Administration, Secrets, Workflows, or any organisation-level permission.

**Webhook:** disable (not needed).

### 2. Install the App on this repository only

App settings → Install App → select this repository only.

### 3. Generate and download the private key

App settings → Private keys → Generate a private key. Store the `.pem` file securely; you will upload it as a secret and then delete the local copy.

### 4. Create the `agent` Actions environment

Repository → Settings → Environments → New environment → name it `agent`.

Add these three secrets to the `agent` environment (not to repository secrets):

| Secret              | Value                                                                   |
| ------------------- | ----------------------------------------------------------------------- |
| `BOT_APP_ID`        | Numeric App ID shown on the App's settings page                         |
| `BOT_PRIVATE_KEY`   | Contents of the downloaded `.pem` file                                  |
| `ANTHROPIC_API_KEY` | Anthropic API key with a hard spending cap set in the Anthropic console |

### 5. Set branch ruleset on `main`

Repository → Settings → Rules → Rulesets → New ruleset → Branch ruleset.

| Setting                                          | Value                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| Target                                           | `refs/heads/main`                                                           |
| Require a pull request before merging            | Yes — 0 required approvals (increase at L3)                                 |
| Required status checks                           | `Build and test` (the `test` job from the `CI` workflow) — mark as required |
| Require branches to be up to date before merging | Yes                                                                         |
| Block force pushes                               | Yes                                                                         |
| Restrict deletions                               | Yes                                                                         |
| Bypass list                                      | **Empty — nobody, including the bot**                                       |

The empty bypass list is the structural guarantee: Contents: Write on the App allows the bot to push to `agent/*` branches but branch protection prevents any direct push to `main`, regardless of what the agent attempts.

---

## Workflow: `agent-dispatch.yml`

### Triggers

| Event                                 | Filter                                    | Action               |
| ------------------------------------- | ----------------------------------------- | -------------------- |
| `issues.labeled`                      | `github.event.label.name == 'agent:task'` | Headless task run    |
| `issue_comment.created`               | comment body contains `@claude`           | Interactive response |
| `pull_request_review_comment.created` | comment body contains `@claude`           | Interactive response |

`@claude` mention triggers are gated on `github.event.comment.author_association ∈ {OWNER, MEMBER, COLLABORATOR}`. Comments from public users are ignored — this is the primary prompt-injection guard for the mention path.

### Job steps

1. `actions/create-github-app-token` — exchange `BOT_APP_ID` + `BOT_PRIVATE_KEY` for a short-lived installation token scoped to this repository
2. `actions/checkout` — check out using the installation token so git push is authenticated as the bot
3. Configure git identity (substitute the actual app slug chosen in setup step 1; `{BOT_APP_ID}` is `${{ secrets.BOT_APP_ID }}` in workflow YAML):
   ```
   git config user.name "belastrijkdom-bot[bot]"
   git config user.email "${{ secrets.BOT_APP_ID }}+belastrijkdom-bot[bot]@users.noreply.github.com"
   ```
4. `anthropics/claude-code-action` — pinned to a specific commit SHA (not a mutable tag)

### System prompt (both workflows share this)

```
You are an automated agent for BelastRijkdom.nl. Always read AGENTS.md in full
before taking any action. Never push directly to main. Never merge pull requests.
Never modify files under .github/workflows/. Branch naming: agent/issue-{N}.
All commits must use conventional commit format: type(scope): message.
```

### Task prompt (label trigger only — headless mode)

```
Implement the task described in issue #N.

1. Create branch agent/issue-N
2. Make the minimal change that satisfies the issue
3. Run the full validation loop:
     npm run build && npm test && npm run test:schema &&
     npm run test:e2e && npm audit --audit-level=critical --omit=dev
4. Fix any failures before proceeding — never suppress a check
5. Open a PR: gh pr create referencing "Closes #N"
```

The `@claude` mention path requires no explicit task prompt — `claude-code-action` reads the comment body automatically. The system prompt provides the guardrails.

---

## Workflow: `agent-self-correct.yml`

### Trigger

`workflow_run` — workflow: `"CI"`, types: `[completed]`, branches: `agent/**`  
Condition: `github.event.workflow_run.conclusion == 'failure'`

Concurrency group keyed on `github.event.workflow_run.head_branch` with `cancel-in-progress: false` (queues rather than cancels, so rapid CI failures don't race).

### Job steps

1. `actions/create-github-app-token` — same as dispatch workflow
2. Fetch the failing CI run log via GitHub API using the installation token; write to a temp file
3. `actions/checkout` — check out `github.event.workflow_run.head_branch` using the installation token
4. Configure git identity — same name and email as dispatch workflow
5. `anthropics/claude-code-action` — pinned to the same SHA as dispatch workflow

### Self-correction prompt

```
CI failed on branch {head_branch}. Failure output:
---
{fetched CI log}
---

Fix the root cause. Do not suppress the check. Push the fix to the same branch
({head_branch}). Do not open a new PR — one already exists.
```

---

## Security model

### Secret masking

GitHub Actions automatically masks exact secret values in log output (replaces with `***`). This covers `BOT_PRIVATE_KEY` and `ANTHROPIC_API_KEY` directly.

`actions/create-github-app-token` calls `::add-mask::` on the installation token it generates, so the derived token is also masked in all subsequent steps.

No workflow step dumps the environment (`env`, `printenv`). The CI log fetched for self-correction is written to a temp file, not echoed to stdout.

### Residual risk and mitigations

| Risk                                                      | Mitigation                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| Encoded/transformed secret variants not masked            | No env-dump steps; no base64 transformations of secrets          |
| Derived JWT (used to fetch installation token) not masked | Transient, never written to a log step                           |
| Installation token leaked                                 | Expires in 1 hour                                                |
| `ANTHROPIC_API_KEY` leaked                                | Hard spending cap in Anthropic console limits financial exposure |
| Supply chain (action tag mutated)                         | Both workflows pin `claude-code-action` to a specific commit SHA |
| Secrets accessible to unrelated workflows                 | Secrets live in the `agent` environment, not repo-level secrets  |

### Prompt injection

| Attack surface                                          | Guard                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Public user crafts malicious issue body (label trigger) | `agent:task` label requires write access to apply — public users cannot trigger it |
| Public user posts malicious `@claude` comment           | `author_association` check gates mentions to OWNER / MEMBER / COLLABORATOR         |
| Agent tries to push to `main`                           | Branch ruleset blocks it at the platform level regardless of prompt instructions   |
| Agent tries to modify `.github/workflows/`              | System prompt forbids it; App has no `Workflows` permission                        |

---

## Git identity stability

The bot's git identity is derived from two permanent values:

- `user.name`: hardcoded string in the workflow YAML
- `user.email`: `{BOT_APP_ID}+{slug}[bot]@users.noreply.github.com` where `BOT_APP_ID` is the permanent numeric App ID

The identity is identical across every commit the bot makes — first run, tenth self-correction, weeks later — as long as the GitHub App is not replaced. Commits appear in the GitHub UI attributed to the App installation with a bot avatar, visually distinct from human commits.

---

## What this does not cover

- Auto-merge (L2 → L3 unlock condition — human decides on merge at L2)
- Scheduled / signal-driven task generation (L3 feature)
- Multiple parallel agent PRs (L2 mature target, not in scope here)
- Per-PR token cost reporting — the `claude` CLI emits usage stats (`input_tokens`, `output_tokens`, cache hits) in `--output-format stream-json`. A post-processing step in each workflow could capture these and post a PR comment with the cost. ~20–30 lines of YAML, ~1 hour to implement. Deferred; spending cap + Anthropic usage dashboard covers cost control for now.
