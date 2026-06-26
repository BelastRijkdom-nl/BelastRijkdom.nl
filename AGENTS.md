# AGENTS.md — BelastRijkdom.nl Agentic Platform

Read this file in full before taking any action in this repository.

## What this repo is

BelastRijkdom.nl is a Netherlands-focused activist site arguing for shifting
taxation from labour onto wealth. It is simultaneously a testbed for agentic
software engineering, progressing through four levels of autonomous operation
(L1 → L4). See `docs/agentic-platform.md` for the full architecture.

**Current level: L2.** Agents may open PRs and run the validation loop.
A human decides on merge.

---

## Engineering rules

- Never use `superpowers` in a folder name for docs, specs, designs, or implementation plans.
- **Spec and plan filenames do not include a date prefix.** Save them as `docs/specs/<topic>.md` and `docs/plans/<topic>.md`, not `docs/specs/YYYY-MM-DD-<topic>.md`.
- `"type": "commonjs"` — all JS files use `module.exports` / `require()`, never `import`/`export`.
- No `>/dev/null 2>&1` — failures must be visible.
- FOSS-only tooling. Flag any exception explicitly.
- **Conventional commits:** use the format `type(scope): message`. Valid types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `ci`, `security`. Include a scope when it makes sense (e.g. `build`, `i18n`, `content`, `a11y`, `deps`). Omit only when no single topic fits.
- **Merge via rebase + fast-forward only.** Never create merge commits. Before merging: `git rebase main`, then `git checkout main && git merge --ff-only <branch>`.

---

## What agents may do

- Create feature branches (naming: `agent/issue-{number}`)
- Open pull requests referencing the triggering issue
- Add and modify files in `src/`, `tests/`, `docs/`
- Add structured claim files to `src/_data/claims/`
- Fix failing tests and CI checks

## What agents must not do

- Push directly to `main`
- Merge pull requests (human decision at L2)
- Add claim files with `verified: true` unless the source URL has been
  manually confirmed live and the figure matches
- Modify `.github/workflows/` without explicit human instruction
- Modify `AGENTS.md` or `docs/agentic-platform.md` without explicit
  human instruction
- Suppress output or swallow errors (no `>/dev/null 2>&1`)

---

## Starting a task

1. Read the linked GitHub issue for requirements
2. Create a branch: `git checkout -b agent/issue-{number}`
3. Make the minimal change that satisfies the issue
4. Run the full validation loop (see below) — all checks must pass
5. Open a PR: `gh pr create --title "…" --body "Closes #N\n\n…"`

## Validation loop (must all pass before opening a PR)

```bash
npm run build           # Eleventy build → dest/
npm test                # Vitest unit tests (reads dest/)
npm run test:schema     # AJV schema validation of src/_data/claims/*.json
npm run test:e2e        # Playwright E2E + axe (serves dest/ on port 4000)
npm audit --audit-level=critical --omit=dev
```

## Self-correction on CI failure

CI failure output is structured. On failure:

1. Identify the failing step and file from CI logs
2. Fix the root cause — do not suppress the check
3. Push to the same branch to re-trigger CI

## Content rules

Every economic or policy claim on the site must have a corresponding entry
in `src/_data/claims/`. Claim files must:

- Pass `npm run test:schema`
- Use `verified: false` when the source URL has not been manually confirmed
- Cite primary sources wherever possible (CBS, CPB, DNB, Belastingdienst,
  peer-reviewed work)
- Include both `nl` and `en` claim text of at least 10 characters each

## Commit format

```
type: short description (max 72 chars)

Closes #N
```

Types: `feat`, `fix`, `content`, `test`, `docs`, `chore`

## Branch naming

`agent/issue-{number}` — e.g. `agent/issue-42`
