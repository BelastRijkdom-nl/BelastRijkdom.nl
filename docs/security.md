# Security Model

_Living document. Updated when the threat model or controls change._

**Last updated:** 2026-06-28

---

## Scope

This document covers the security model for the agentic CI/CD pipeline: the workflows that dispatch an AI agent to implement GitHub Issues and self-correct CI failures. It does not cover general web application security for the site itself.

---

## What we are protecting

| Asset                | Why it matters                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY`  | Billed credential; compromise means unauthorized API spend                                 |
| `BOT_PRIVATE_KEY`    | Signs installation tokens for `belastrijkdom-bot`; compromise allows impersonating the bot |
| `BOT_APP_ID`         | Low sensitivity on its own; listed for completeness                                        |
| Repository integrity | Agent pushes to branches and opens PRs; a compromised agent could introduce malicious code |
| GitHub token         | Short-lived installation token; scope limited to this repository                           |

---

## Trust boundaries

**Trusted inputs:** Issue content written by repository collaborators (OWNER, MEMBER, COLLABORATOR).

**Untrusted inputs:** All other text the agent reads — issue titles and bodies that may have been influenced by third parties, linked URLs, fetched web content, file contents not written by collaborators.

The agent operates in an inherently adversarial environment: it processes natural language that could contain embedded instructions. The controls below are designed so that even if the agent is manipulated, the blast radius is contained.

---

## Defense layers

### 1. Trigger gating

Agent workflows only fire when:

- The `agent:task` label is added to an issue (adding labels requires write access), or
- A comment containing `@claude` is posted by an OWNER, MEMBER, or COLLABORATOR.

External contributors cannot initiate agent runs. This is the first and most important control.

### 2. Secrets in a protected environment

`ANTHROPIC_API_KEY` and `BOT_PRIVATE_KEY` live in the `agent` GitHub Actions environment, not in repository secrets. Environment protection rules allow additional gates (required reviewers, deployment wait timers) to be added as the platform matures.

### 3. Minimal-scope bot identity

`belastrijkdom-bot` is a custom GitHub App with a narrow permission set: Contents (read/write), Pull Requests (read/write), Issues (read/write), Actions (read), Metadata (read). It cannot administer the repository, manage members, or access other repositories.

Tokens are installation tokens — short-lived (1 hour), generated per job, and automatically revoked at job end. No static credentials cross workflow boundaries.

### 4. Ephemeral runners

All agent jobs run on GitHub-hosted `ubuntu-latest` runners. The VM is provisioned fresh for each job and destroyed immediately after. An agent that is manipulated into corrupting its working environment affects only that job's VM.

### 5. Subprocess environment scrubbing

By default, `claude-code-action` scrubs secret environment variables (including `ANTHROPIC_API_KEY` and the GitHub token) from the environment passed to Bash subprocesses. Code that the agent executes via the Bash tool does not inherit these credentials.

### 6. Network egress monitoring (Harden-Runner)

Both agent workflows run `step-security/harden-runner` as their first step. This agent-level control monitors all outbound network connections at the VM level — including from the main Claude process, not only from Bash subprocesses.

Current policy: **audit mode** — all connections are logged to the StepSecurity dashboard. Once several runs have established a stable baseline of legitimate destinations, this will be tightened to **block mode** with an explicit allowlist (expected to include: the Anthropic API, GitHub APIs, the npm registry, and the action's own installation endpoints). After that, unexpected outbound calls are blocked regardless of what the agent attempts.

Pinned to SHA rather than a mutable tag to prevent supply-chain substitution of the security control itself.

### 7. Human merge gate

At the current platform level (L2), agents open pull requests but never merge them. All merges require a human decision. Branch protection on `main` enforces that CI must pass before a PR can be merged. This means a corrupted agent can produce a PR, but a human reviews the diff before anything reaches production.

---

## Agent operating constraints

The following constraints are also documented in `AGENTS.md` and enforced through CLAUDE.md. They are recorded here as security invariants:

- Agents push only to branches named `agent/issue-{N}`, never directly to `main`
- Agents do not merge pull requests
- Agents do not modify workflow files under `.github/workflows/`
- Agents do not modify `AGENTS.md` or `docs/agentic-platform.md`
- Agents do not add claim files marked `verified: true` without manual source confirmation
- Errors are never suppressed; all output is visible in CI logs

These constraints are implemented as prompt-level instructions. They are not hard technical enforcements. The merge gate (§7) is the backstop if prompt-level constraints are circumvented.

---

## What this model does not guarantee

- **Prompt-level constraints are not cryptographically enforced.** A sufficiently novel prompt injection could in principle cause the agent to violate them. The merge gate exists for this reason.
- **Audit mode does not block exfiltration.** Until Harden-Runner is moved to block mode, outbound traffic is logged but not prevented. The subprocess scrubbing (§5) limits what secrets are reachable, but the main process retains its credentials.
- **The bot token is reachable by the main process.** Subprocess scrubbing protects against code executed via the Bash tool, not against the agent itself using the token directly via the GitHub MCP tools it is given. The token's narrow scope (§3) limits what can be done with it.

---

## Review cadence

| Trigger                                    | Action                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Harden-Runner has 5+ successful agent runs | Review audit log; switch to `egress-policy: block` with confirmed allowlist        |
| New major version of `claude-code-action`  | Re-pin SHA; review changelog for permission model changes                          |
| Platform advances to L3                    | Re-evaluate merge gate; update this document                                       |
| Any unexpected agent behaviour             | Review Harden-Runner dashboard; check CI logs; file issue if pattern is concerning |
