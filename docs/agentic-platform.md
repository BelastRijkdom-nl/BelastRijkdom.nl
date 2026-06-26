# Agentic Platform Architecture

_Living document. Updated when the platform level or architecture changes._

**Last updated:** 2026-06-26
**Current level:** L2 — agents open PRs; human decides on merge

---

## Levels

| Level  | Description                                                            | Unlock condition                                                    |
| ------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| L1     | Human approves every diff                                              | (starting point)                                                    |
| **L2** | **Agents open PRs; human verifies behaviour, not lines**               | Validation oracle trustworthy enough that green CI ≈ correct change |
| L3     | Agents generate their own work from signals; review is exception-based | >50% of merged PRs require no human decision                        |
| L4     | Fully autonomous within deterministic guardrails                       | Guardrails proven reliable; rollback pipeline exists                |

---

## Stack

| Layer        | Tool                          | Notes                                  |
| ------------ | ----------------------------- | -------------------------------------- |
| SSG          | Eleventy 3.x                  | Nunjucks templates, PostCSS transforms |
| i18n         | EleventyI18nPlugin (built-in) | /nl/ and /en/ URL prefixes             |
| CSS          | PostCSS + postcss-preset-env  | Custom media queries polyfilled        |
| Hosting      | GitHub Pages                  | Free tier; deploy via Actions          |
| CI           | GitHub Actions                | Free tier (~2 000 min/month)           |
| Unit tests   | Vitest 2.x                    | Tests build output correctness         |
| E2E + a11y   | Playwright + axe-playwright   | Runs against built dest/               |
| Schema       | AJV 8 + ajv-formats           | Validates src/\_data/claims/\*.json    |
| Bot identity | GitHub App (TBD)              | Scoped, short-lived tokens; not a PAT  |

---

## Validation oracle

The oracle is the set of checks that must all pass before a change is
merged. "Checks are green" must mean "the change is correct" for the
categories of changes agents make.

| Check                  | Tool           | Gate                  |
| ---------------------- | -------------- | --------------------- |
| Build succeeds         | Eleventy       | Hard fail             |
| Build output structure | Vitest         | Hard fail             |
| Claim schema           | AJV            | Hard fail             |
| E2E smoke              | Playwright     | Hard fail             |
| Accessibility          | axe-playwright | Hard fail             |
| Dependency audit       | npm audit      | High+ severity = fail |

**Flake policy:** any test that fails non-deterministically twice in a row
gets an issue filed automatically. Target flake rate: <1%.

---

## Agent dispatch golden path (L2)

```
GitHub Issue (label: agent:task)
  → agent reads issue + AGENTS.md
  → creates branch agent/issue-{N}
  → makes minimal change
  → runs full validation loop locally
  → opens PR (references issue)
  → CI runs validation loop
  → human reviews aggregate result
  → human merges (or requests changes)
```

Auto-merge target: enabled once the test suite covers the categories of
changes agents make with a flake rate <1%.

---

## Bot identity (pending setup)

A GitHub App (not a PAT) with these permissions:

- Contents: Write
- Pull requests: Write
- Checks: Write
- Issues: Read
- Metadata: Read

Short-lived installation tokens (1 hour) generated via JWT.
Private key stored in GitHub Secrets (`BOT_APP_ID`, `BOT_PRIVATE_KEY`).

Setup steps (one-time, done by a human):

1. GitHub → Settings → Developer settings → GitHub Apps → New GitHub App
2. Set permissions as above
3. Generate and download private key
4. Install app on this repository
5. Add `BOT_APP_ID` and `BOT_PRIVATE_KEY` to repository secrets

---

## Metrics to watch

| Metric                      | Target                  | Where measured              |
| --------------------------- | ----------------------- | --------------------------- |
| CI run duration             | < 5 min                 | GitHub Actions              |
| Test flake rate             | < 1%                    | Manual; automate in L3      |
| Time: issue → first PR      | Baseline TBD            | GitHub timestamps           |
| Human review time per merge | Baseline TBD            | GitHub timestamps           |
| Agent-loop convergence rate | Baseline TBD            | CI pass/fail ratio          |
| Parallel PRs in flight      | 1 (L2) → 3+ (L2 mature) | GitHub                      |
| Change-failure-rate         | < 5%                    | Revert count / total merges |

---

## What unlocks the next level

**L2 → L3:**

- Auto-merge enabled (branch protection: all checks must pass)
- Agents generate work from signals (broken links, outdated sources)
- Flake rate confirmed <1% over 50+ CI runs

**L3 → L4:**

- Signal-to-PR pipeline runs without manual trigger
- Guardrails codified and tested
- Rollback pipeline exists and has been exercised
