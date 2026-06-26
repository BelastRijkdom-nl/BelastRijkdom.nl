# CLAUDE.md — BelastRijkdom.nl

Context and rules for Claude Code working in this repository. Read before taking any action.

## What this repo is

BelastRijkdom.nl is a Netherlands-focused activist site arguing for shifting taxation from labour onto wealth. It is simultaneously a testbed for agentic software engineering (L1→L4). See `docs/agentic-platform.md` for the platform architecture and current level.

## Engineering rules

- Never use `superpowers` in a folder name for docs, specs, designs, or implementation plans.
- **Spec and plan filenames do not include a date prefix.** Save them as `docs/specs/<topic>.md` and `docs/plans/<topic>.md`, not `docs/specs/YYYY-MM-DD-<topic>.md`. The superpowers skill suggests dated filenames — ignore that convention here.
- `"type": "commonjs"` in `package.json` — all JS config and script files use `module.exports` / `require()`, never `import`/`export`.
- No `>/dev/null 2>&1` — failures must be visible.
- FOSS-only tooling. Flag any exception explicitly.
- **Conventional commits:** use the format `type(scope): message`. Valid types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `ci`, `security`. Include a scope when it makes sense — use a topic scope (e.g. `build`, `i18n`, `content`, `a11y`, `deps`). Omit the scope only when no single topic fits.
- **Merge via rebase + fast-forward only.** Never create merge commits. Before merging a feature branch: `git rebase main`, then `git checkout main && git merge --ff-only <branch>`.

## Validation loop

Before opening any PR, all of these must pass:

```bash
npm run build           # Eleventy → dest/
npm test                # Vitest unit tests (reads dest/)
npm run test:schema     # AJV claim schema validation
npm run test:e2e        # Playwright E2E + axe accessibility
npm run lint            # Prettier
npm audit --audit-level=critical --omit=dev
```

## Content rules

Every economic or policy figure on the site must have a corresponding file in `src/_data/claims/` that passes `npm run test:schema`. No unsourced numbers in templates or prose. Use `verified: false` until the source URL has been manually confirmed.

## Key docs

- `AGENTS.md` — agent steering (what agents may/must-not do)
- `docs/agentic-platform.md` — platform architecture, levels, metrics
- `docs/plans/` — implementation plans for completed and in-progress work
