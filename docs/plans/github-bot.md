# GitHub Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Claude Code into this repository as a GitHub App bot that triggers on `agent:task` issue labels and `@claude` mentions, and self-corrects when CI fails on `agent/*` branches.

**Architecture:** Two workflow files — `agent-dispatch.yml` handles issue label and mention triggers by calling `anthropics/claude-code-action` in headless (label) or interactive (mention) mode; `agent-self-correct.yml` triggers on `workflow_run` failure for `agent/**` branches, fetches the CI log, and calls the same action with a self-correction prompt. Both workflows authenticate via a custom GitHub App to produce stable, short-lived tokens. Task 1 is manual human setup with no code.

**Tech Stack:** `anthropics/claude-code-action` (pinned SHA), `actions/create-github-app-token@v1`, `actions/checkout@v4`, GitHub Actions `workflow_run` event, GitHub CLI (`gh`)

**Spec:** `docs/specs/github-bot.md`  
**Closes deferred items from:** `docs/plans/l2-foundation.md` — "Bot identity GitHub App creation" and "`agent.yml` dispatch workflow"

## Global Constraints

- `AGENTS.md` prohibits agents from modifying `.github/workflows/` — this plan is the explicit human instruction that authorises creating these two files
- No `>/dev/null 2>&1` — all failures must be visible
- FOSS-only tooling
- Conventional commits: `type(scope): message`
- `agent-dispatch.yml` and `agent-self-correct.yml` must both declare `environment: agent` so secrets are only injected into these workflows
- The `agent` GitHub Actions environment and all three secrets (`BOT_APP_ID`, `BOT_PRIVATE_KEY`, `ANTHROPIC_API_KEY`) must exist before the workflows will run — Task 1 creates them
- Replace `<PIN_SHA_HERE>` in both workflow files with the actual commit SHA of `anthropics/claude-code-action` before committing (see Task 2 Step 1)
- Replace `belastrijkdom-bot` in git identity lines with the actual app slug chosen during Task 1 if it differs

---

## File Map

```
Created:
  .github/workflows/agent-dispatch.yml     — issues.labeled + @claude mention trigger
  .github/workflows/agent-self-correct.yml — workflow_run failure trigger on agent/* branches

Modified:
  docs/agentic-platform.md                 — update bot identity section from "pending setup" to "configured"
```

---

## Task 1: Human setup — GitHub App, environment, branch protection

**Prerequisite for all other tasks. No code. Complete this before touching any files.**

- [ ] **Step 1: Create the GitHub App**

  Go to: GitHub → your account → Settings → Developer settings → GitHub Apps → New GitHub App

  Fill in:
  - **GitHub App name:** choose a slug, e.g. `belastrijkdom-bot` — this becomes the identity in every git commit, so pick something permanent
  - **Homepage URL:** `https://belastrijkdom.nl`
  - **Webhook:** uncheck "Active" — not needed

  Set **Repository permissions** (everything else leave as None):

  | Permission    | Level                                  |
  | ------------- | -------------------------------------- |
  | Contents      | Read and write                         |
  | Pull requests | Read and write                         |
  | Issues        | Read-only                              |
  | Actions       | Read-only                              |
  | Metadata      | Read-only (mandatory, always included) |

  Click "Create GitHub App". Note the **App ID** (numeric) shown on the app settings page — you'll need it in Step 4.

- [ ] **Step 2: Install the App on this repository only**

  Still on the app settings page: left sidebar → Install App → select the account → choose "Only select repositories" → select this repository → Install.

- [ ] **Step 3: Generate and download the private key**

  App settings page → scroll to "Private keys" → Generate a private key. A `.pem` file downloads automatically. Keep it open; you'll paste it into a GitHub secret in Step 4. Delete the local file after.

- [ ] **Step 4: Create the `agent` Actions environment and add secrets**

  Go to: Repository → Settings → Environments → New environment → name it `agent` → Configure environment.

  Under "Environment secrets", add all three (do NOT add these as repository secrets):

  | Secret name         | Value                                                                                                                    |
  | ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
  | `BOT_APP_ID`        | The numeric App ID from Step 1                                                                                           |
  | `BOT_PRIVATE_KEY`   | Full contents of the `.pem` file from Step 3 (including `-----BEGIN RSA PRIVATE KEY-----` header and footer)             |
  | `ANTHROPIC_API_KEY` | Your Anthropic API key — set a hard monthly spending cap in the [Anthropic console](https://console.anthropic.com) first |

  Delete the local `.pem` file now.

- [ ] **Step 5: Set branch ruleset on `main`**

  Go to: Repository → Settings → Rules → Rulesets → New ruleset → Branch ruleset.

  | Setting                                          | Value                                                                                                      |
  | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
  | Name                                             | `main protection`                                                                                          |
  | Enforcement status                               | Active                                                                                                     |
  | Target branches                                  | Add target → `refs/heads/main`                                                                             |
  | Require a pull request before merging            | ✓ — Required approvals: 0                                                                                  |
  | Require status checks to pass                    | ✓ → Add check → type `Build and test` → select it from the dropdown (it appears after at least one CI run) |
  | Require branches to be up to date before merging | ✓                                                                                                          |
  | Block force pushes                               | ✓                                                                                                          |
  | Restrict deletions                               | ✓                                                                                                          |
  | Bypass list                                      | **Leave empty — nobody bypasses, including the bot**                                                       |

  Save ruleset.

  > Note: "Build and test" is the `name:` of the `test` job in `.github/workflows/ci.yml`. If it doesn't appear in the dropdown yet, push a commit to trigger CI first, then come back and add it.

---

## Task 2: `agent-dispatch.yml`

**Files:**

- Create: `.github/workflows/agent-dispatch.yml`

**Interfaces:**

- Consumes: `agent` environment secrets (`BOT_APP_ID`, `BOT_PRIVATE_KEY`, `ANTHROPIC_API_KEY`) from Task 1
- Produces: agent runs triggered by `agent:task` label or `@claude` mention; bot commits appear as `belastrijkdom-bot[bot]` in git history

- [ ] **Step 1: Pin the `claude-code-action` SHA**

  Run this to get the current commit SHA of the action:

  ```bash
  gh api repos/anthropics/claude-code-action/commits/main --jq '.sha'
  ```

  Expected: a 40-character hex SHA, e.g. `a91c82817dd85bdf1f703fd1d56d18b1865cce3b`

  Keep this value — you'll use it as `anthropics/claude-code-action@<SHA>` in Step 2. Re-run this command any time you intentionally upgrade the action; never follow a tag blindly.

- [ ] **Step 2: Create `.github/workflows/agent-dispatch.yml`**

  Replace `<PIN_SHA_HERE>` with the SHA from Step 1. Replace `belastrijkdom-bot` with your actual app slug if it differs.

  ```yaml
  name: Agent Dispatch

  on:
    issues:
      types: [labeled]
    issue_comment:
      types: [created]
    pull_request_review_comment:
      types: [created]

  permissions:
    contents: read

  concurrency:
    group: agent-dispatch-${{ github.event.issue.number || github.event.pull_request.number }}
    cancel-in-progress: false

  jobs:
    dispatch:
      name: Dispatch agent
      runs-on: ubuntu-latest
      environment: agent
      if: >-
        (github.event_name == 'issues' && github.event.label.name == 'agent:task') ||
        (github.event_name == 'issue_comment' &&
        contains(github.event.comment.body, '@claude') &&
        contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'), github.event.comment.author_association)) ||
        (github.event_name == 'pull_request_review_comment' &&
        contains(github.event.comment.body, '@claude') &&
        contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'), github.event.comment.author_association))
      steps:
        - name: Generate GitHub App token
          id: app-token
          uses: actions/create-github-app-token@v1
          with:
            app-id: ${{ secrets.BOT_APP_ID }}
            private-key: ${{ secrets.BOT_PRIVATE_KEY }}

        - name: Checkout
          uses: actions/checkout@v4
          with:
            token: ${{ steps.app-token.outputs.token }}

        - name: Configure git identity
          run: |
            git config user.name "belastrijkdom-bot[bot]"
            git config user.email "${{ secrets.BOT_APP_ID }}+belastrijkdom-bot[bot]@users.noreply.github.com"

        - name: Set task prompt
          id: task
          run: |
            if [ "${{ github.event_name }}" = "issues" ]; then
              {
                echo 'prompt<<EOF_PROMPT'
                echo "Implement the task described in issue #${{ github.event.issue.number }}."
                echo ""
                echo "1. Create branch agent/issue-${{ github.event.issue.number }}"
                echo "2. Make the minimal change that satisfies the issue"
                echo "3. Run the full validation loop:"
                echo "     npm run build && npm test && npm run test:schema &&"
                echo "     npm run test:e2e && npm run lint &&"
                echo "     npm audit --audit-level=critical --omit=dev"
                echo "4. Fix any failures before proceeding — never suppress a check"
                echo "5. Open a PR: gh pr create referencing \"Closes #${{ github.event.issue.number }}\""
                echo 'EOF_PROMPT'
              } >> "$GITHUB_OUTPUT"
            else
              echo "prompt=" >> "$GITHUB_OUTPUT"
            fi

        - name: Run Claude agent
          uses: anthropics/claude-code-action@<PIN_SHA_HERE>
          with:
            anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
            github_token: ${{ steps.app-token.outputs.token }}
            system_prompt: |
              You are an automated agent for BelastRijkdom.nl. Always read AGENTS.md in full
              before taking any action. Never push directly to main. Never merge pull requests.
              Never modify files under .github/workflows/. Branch naming: agent/issue-{N}.
              All commits must use conventional commit format: type(scope): message.
            prompt: ${{ steps.task.outputs.prompt }}
  ```

- [ ] **Step 3: Verify the YAML parses correctly**

  ```bash
  python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/agent-dispatch.yml'))" && echo "OK"
  ```

  Expected: `OK` with no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add .github/workflows/agent-dispatch.yml
  git commit -m "ci(bot): add agent-dispatch workflow for issue label and @claude triggers"
  ```

- [ ] **Step 5: Smoke test — label trigger**

  Push to `main`, then on GitHub create a new issue titled "Bot smoke test — please close this". Apply the `agent:task` label. Go to Actions → Agent Dispatch — a run should appear within 30 seconds.

  Expected: the run starts and the `dispatch` job appears. If it fails at "Generate GitHub App token", the `agent` environment secrets are misconfigured — re-check Task 1 Step 4.

- [ ] **Step 6: Smoke test — @claude mention**

  On any open issue, post a comment: `@claude What files are in the src/ directory?`

  Expected: the Agent Dispatch workflow triggers and Claude responds in a comment. If the workflow does not trigger, check that your GitHub account has `OWNER`, `MEMBER`, or `COLLABORATOR` association on the repository.

---

## Task 3: `agent-self-correct.yml`

**Files:**

- Create: `.github/workflows/agent-self-correct.yml`

**Interfaces:**

- Consumes: `agent` environment secrets from Task 1; `anthropics/claude-code-action` SHA pinned in Task 2 Step 1
- Produces: automatic fix attempt pushed to an `agent/*` branch whenever the `CI` workflow fails on it; re-triggers CI

- [ ] **Step 1: Create `.github/workflows/agent-self-correct.yml`**

  Use the same SHA from Task 2 Step 1. Use the same app slug.

  ```yaml
  name: Agent Self-Correct

  on:
    workflow_run:
      workflows: ['CI']
      types: [completed]
      branches:
        - 'agent/**'

  permissions:
    contents: read

  concurrency:
    group: agent-self-correct-${{ github.event.workflow_run.head_branch }}
    cancel-in-progress: false

  jobs:
    self-correct:
      name: Self-correct CI failure
      runs-on: ubuntu-latest
      environment: agent
      if: github.event.workflow_run.conclusion == 'failure'
      steps:
        - name: Generate GitHub App token
          id: app-token
          uses: actions/create-github-app-token@v1
          with:
            app-id: ${{ secrets.BOT_APP_ID }}
            private-key: ${{ secrets.BOT_PRIVATE_KEY }}

        - name: Fetch CI failure log
          id: ci-log
          env:
            GH_TOKEN: ${{ steps.app-token.outputs.token }}
          run: |
            gh run view ${{ github.event.workflow_run.id }} --log-failed 2>&1 | head -300 > /tmp/ci-failure.log
            {
              echo 'log<<EOF_LOG'
              cat /tmp/ci-failure.log
              echo 'EOF_LOG'
            } >> "$GITHUB_OUTPUT"

        - name: Checkout failing branch
          uses: actions/checkout@v4
          with:
            ref: ${{ github.event.workflow_run.head_branch }}
            token: ${{ steps.app-token.outputs.token }}

        - name: Configure git identity
          run: |
            git config user.name "belastrijkdom-bot[bot]"
            git config user.email "${{ secrets.BOT_APP_ID }}+belastrijkdom-bot[bot]@users.noreply.github.com"

        - name: Run Claude self-correction
          uses: anthropics/claude-code-action@<PIN_SHA_HERE>
          with:
            anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
            github_token: ${{ steps.app-token.outputs.token }}
            system_prompt: |
              You are an automated agent for BelastRijkdom.nl. Always read AGENTS.md in full
              before taking any action. Never push directly to main. Never merge pull requests.
              Never modify files under .github/workflows/. Branch naming: agent/issue-{N}.
              All commits must use conventional commit format: type(scope): message.
            prompt: |
              CI failed on branch ${{ github.event.workflow_run.head_branch }}. Failure output:
              ---
              ${{ steps.ci-log.outputs.log }}
              ---

              Fix the root cause. Do not suppress the check. Push the fix to the same branch
              (${{ github.event.workflow_run.head_branch }}). Do not open a new PR — one already exists.
  ```

- [ ] **Step 2: Verify the YAML parses correctly**

  ```bash
  python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/agent-self-correct.yml'))" && echo "OK"
  ```

  Expected: `OK` with no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add .github/workflows/agent-self-correct.yml
  git commit -m "ci(bot): add agent-self-correct workflow for CI failure recovery"
  ```

- [ ] **Step 4: Smoke test — self-correction trigger**

  Create a branch with a deliberately broken file, push it, open a PR, and let CI fail:

  ```bash
  git checkout -b agent/issue-0
  echo "this is not valid js" > tests/unit/broken.test.js
  git add tests/unit/broken.test.js
  git commit -m "test: intentionally broken file to trigger self-correct"
  git push origin agent/issue-0
  gh pr create --title "Bot self-correct smoke test" --body "Delete this PR after testing." --head agent/issue-0
  ```

  Expected sequence:
  1. CI runs on the PR → fails on "Unit tests" step
  2. Agent Self-Correct workflow triggers (may take 1–2 minutes after CI completes)
  3. Claude fetches the log, pushes a fix to `agent/issue-0`, CI re-runs

  Clean up:

  ```bash
  gh pr close <PR number> --delete-branch
  ```

---

## Task 4: Update platform docs

**Files:**

- Modify: `docs/agentic-platform.md`

**Interfaces:**

- Consumes: actual app slug and permissions set in Task 1

- [ ] **Step 1: Update the bot identity section in `docs/agentic-platform.md`**

  Find the "Bot identity (pending setup)" section and replace it with the actual configuration. Substitute your real app slug and the exact permissions granted:

  ```markdown
  ## Bot identity

  A custom GitHub App (`belastrijkdom-bot`) with a permanent numeric App ID
  stored as `BOT_APP_ID` in the `agent` Actions environment.

  **Repository permissions:**

  - Contents: Read and write
  - Pull requests: Read and write
  - Issues: Read-only
  - Actions: Read-only
  - Metadata: Read-only

  Short-lived installation tokens (1 hour) generated via `actions/create-github-app-token`.
  Private key stored as `BOT_PRIVATE_KEY` in the `agent` Actions environment (not repo secrets).

  **Git identity (stable across all commits):**
  `{APP_ID}+belastrijkdom-bot[bot]@users.noreply.github.com`

  **Workflows using this identity:**

  - `.github/workflows/agent-dispatch.yml` — issue label and @claude mention triggers
  - `.github/workflows/agent-self-correct.yml` — CI failure self-correction on `agent/*` branches
  ```

  Also update the Stack table row:

  ```markdown
  | Bot identity | GitHub App (`belastrijkdom-bot`) | Scoped, short-lived tokens; `agent` Actions environment |
  ```

- [ ] **Step 2: Commit and push**

  ```bash
  git add docs/agentic-platform.md
  git commit -m "docs(meta): mark bot identity as configured, document dispatch and self-correct workflows"
  git push origin main
  ```

- [ ] **Step 3: Verify CI passes on main**

  Go to GitHub → Actions → CI. The run triggered by this push must pass all steps.

  Expected: all steps green. If lint fails, run `npm run lint -- --write` locally, commit the fix, and push again.
