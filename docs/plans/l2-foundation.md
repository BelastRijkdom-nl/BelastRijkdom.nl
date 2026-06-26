# L2 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate from the custom npm-scripts.js pipeline to Eleventy 3.x with bilingual NL/EN i18n, establish GitHub Actions CI + GitHub Pages deploy, and build the test oracle (Vitest + Playwright + AJV) that forms the L2 validation loop.

**Architecture:** Eleventy 3.x replaces the custom build pipeline; PostCSS runs as an Eleventy template format extension so no separate build step is needed; bilingual pages live in `src/nl/` and `src/en/` with Eleventy's built-in i18n plugin routing them to `/nl/…` and `/en/…`; a root `src/index.html` does a client-side language redirect; GitHub Actions handles CI + GitHub Pages deploy in a single workflow with job-level dependency; Vitest tests build output, Playwright covers E2E and axe accessibility, AJV validates claim JSON files.

**Tech Stack:** Eleventy 3.x, EleventyI18nPlugin (built-in), PostCSS 8 + postcss-import + postcss-preset-env, Nunjucks, Vitest 2.x, Playwright 1.x, axe-playwright 2.x, AJV 8 + ajv-formats, http-server (E2E serve), GitHub Actions

## Global Constraints

- Node 24.15.0 (per `.nvmrc`)
- `"type": "commonjs"` in `package.json` — all config files use `module.exports` / `require()`
- Build output: `dest/` (gitignored; deployed by CI only)
- No `>/dev/null 2>&1` — all failures must be visible
- FOSS-only tooling; flag any exception
- All CI steps must run locally with `act` (nektos/act)
- Bash-compatible scripts only

---

## File Map

```
Created:
  .eleventy.js
  src/index.html                          — root language redirect
  src/_data/site.json                     — global site data
  src/_data/claims/                       — claim JSON directory (populated in Task 6)
  src/_data/claims/vermogensongelijkheid-2023.json
  src/_includes/layouts/default.njk       — base HTML layout
  src/_includes/components/header.njk     — site header + language switcher
  src/_includes/components/footer.njk     — site footer
  src/nl/nl.11tydata.json                 — locale data for /nl/ pages
  src/nl/index.njk                        — Dutch home page
  src/en/en.11tydata.json                 — locale data for /en/ pages
  src/en/index.njk                        — English home page
  src/404.njk                             — 404 page (outputs to dest/404.html)
  src/static/css/components/header.css    — header styles (replaces src/components/header/)
  .github/workflows/ci.yml                — CI + deploy workflow
  .github/ISSUE_TEMPLATE/agent-task.yml   — structured issue template for agent tasks
  vitest.config.js
  playwright.config.js
  tests/unit/build.test.js
  tests/e2e/smoke.spec.js
  tests/schema/claim.schema.json
  tests/schema/validate.js
  AGENTS.md
  docs/agentic-platform.md

Modified:
  package.json                            — new scripts + deps
  src/static/css/all.css                  — update component import path
  .gitignore                              — add test artefacts

Deleted:
  npm-scripts.js
  src/pages/index.njk
  src/pages/404.njk
  src/pages/data.json
  src/layout/default.njk
  src/components/header/header.njk
  src/components/header/header.css
  src/components/footer/footer.njk
```

---

## Task 1: Eleventy baseline + CSS migration

**Files:**

- Create: `.eleventy.js`
- Create: `src/_data/site.json`
- Modify: `package.json`
- Modify: `src/static/css/all.css`
- Create: `src/static/css/components/header.css`
- Delete: `npm-scripts.js`, `src/pages/data.json`, `src/layout/default.njk`, `src/components/header/header.njk`, `src/components/header/header.css`, `src/components/footer/footer.njk`

**Interfaces:**

- Produces: `npm run build` outputs `dest/` via Eleventy; `npm start` starts the dev server

- [ ] **Step 1: Install Eleventy and new CSS dep; remove old deps**

```bash
npm install --save-dev @11ty/eleventy@^3.0.0 postcss-preset-env@^10.0.0 http-server@^14.1.1
npm uninstall chokidar gh-pages glob http-server nunjucks nunjucks-date-filter postcss-cssnext shell shelljs stmux
```

Expected: `package.json` devDependencies updated; no npm errors.

- [ ] **Step 2: Update `package.json` scripts**

Replace the entire `"scripts"` block in `package.json`:

```json
"scripts": {
  "build": "eleventy",
  "start": "eleventy --serve",
  "test": "vitest run",
  "test:e2e": "playwright test",
  "test:schema": "node tests/schema/validate.js",
  "lint": "prettier --check ."
},
```

Also remove `"postversion"` and `"deploy"` entries if present.

- [ ] **Step 3: Create `.eleventy.js`**

```js
'use strict'

const path = require('path')
const postcss = require('postcss')
const postcssImport = require('postcss-import')
const postcssPresetEnv = require('postcss-preset-env')

const { EleventyI18nPlugin } = require('@11ty/eleventy')

module.exports = function (eleventyConfig) {
  // i18n: pages in src/nl/ → /nl/…, src/en/ → /en/…
  eleventyConfig.addPlugin(EleventyI18nPlugin, {
    defaultLanguage: 'nl',
    errorMode: 'allow-fallback',
  })

  // PostCSS: process only entry-point all.css; partials are resolved via @import
  eleventyConfig.addTemplateFormats('css')
  eleventyConfig.addExtension('css', {
    outputFileExtension: 'css',
    compile: async function (inputContent, inputPath) {
      if (path.basename(inputPath) !== 'all.css') return
      return async () => {
        const result = await postcss([
          postcssImport,
          postcssPresetEnv({
            stage: 2,
            features: { 'custom-media-queries': true },
          }),
        ]).process(inputContent, { from: inputPath })
        return result.css
      }
    },
  })

  // Passthrough: images, CNAME, root redirect
  eleventyConfig.addPassthroughCopy({ 'src/static/img': 'static/img' })
  eleventyConfig.addPassthroughCopy({ CNAME: 'CNAME' })
  eleventyConfig.addPassthroughCopy({ 'src/index.html': 'index.html' })

  return {
    templateFormats: ['njk', 'html', 'css'],
    htmlTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk',
    dir: {
      input: 'src',
      output: 'dest',
      includes: '_includes',
      data: '_data',
    },
  }
}
```

- [ ] **Step 4: Create `src/_data/site.json`**

```json
{
  "name": "Belast Rijkdom",
  "url": "https://belastrijkdom.nl"
}
```

- [ ] **Step 5: Create `src/static/css/components/header.css`** (empty, ready for styles)

```css
/* header component styles */
```

- [ ] **Step 6: Update `src/static/css/all.css`** (fix component import path)

Replace the file contents:

```css
@import 'common/1.variables.css';
@import 'common/2.base.css';
@import 'common/3.typography.css';
@import 'common/4.layout.css';

@import 'components/header.css';
```

- [ ] **Step 7: Delete files no longer needed**

```bash
rm npm-scripts.js
rm src/pages/data.json
rm src/layout/default.njk
rm src/components/header/header.njk
rm src/components/header/header.css
rm src/components/footer/footer.njk
rmdir src/components/header src/components/footer src/components src/layout
rmdir src/pages
```

- [ ] **Step 8: Verify build runs (no pages yet, just CSS + passthrough)**

```bash
npm run build
```

Expected output contains `[11ty] Wrote X files in…` with no errors. `dest/static/css/all.css` must exist and contain compiled CSS (custom media expanded, no `@import` statements).

```bash
grep '@import' dest/static/css/all.css
```

Expected: no output (all imports inlined by postcss-import).

```bash
grep 'custom-media' dest/static/css/all.css
```

Expected: no output (custom media queries expanded by postcss-preset-env).

- [ ] **Step 9: Commit**

```bash
git add .eleventy.js src/_data/site.json src/static/css/all.css src/static/css/components/header.css package.json package-lock.json
git rm npm-scripts.js src/pages/data.json src/layout/default.njk src/components/header/header.njk src/components/header/header.css src/components/footer/footer.njk
git commit -m "$(cat <<'EOF'
chore: Migrate from custom build pipeline to Eleventy 3.x

Replaces npm-scripts.js (chokidar/shelljs/nunjucks/postcss-cssnext)
with Eleventy. PostCSS runs as a template format extension.
postcss-cssnext replaced by postcss-preset-env.
EOF
)"
```

---

## Task 2: Bilingual i18n structure + templates

**Files:**

- Create: `src/_includes/layouts/default.njk`
- Create: `src/_includes/components/header.njk`
- Create: `src/_includes/components/footer.njk`
- Create: `src/nl/nl.11tydata.json`
- Create: `src/nl/index.njk`
- Create: `src/en/en.11tydata.json`
- Create: `src/en/index.njk`
- Create: `src/404.njk`
- Create: `src/index.html`
- Delete: `src/pages/index.njk`, `src/pages/404.njk`

**Interfaces:**

- Consumes: `.eleventy.js` EleventyI18nPlugin from Task 1
- Produces: `dest/nl/index.html`, `dest/en/index.html`, `dest/404.html`, `dest/index.html`; `locale_links` filter available in templates

- [ ] **Step 1: Create locale data file for Dutch**

`src/nl/nl.11tydata.json`:

```json
{
  "lang": "nl",
  "locale": "nl"
}
```

- [ ] **Step 2: Create locale data file for English**

`src/en/en.11tydata.json`:

```json
{
  "lang": "en",
  "locale": "en"
}
```

- [ ] **Step 3: Create base layout `src/_includes/layouts/default.njk`**

```njk
<!doctype html>
<html lang="{{ lang or 'nl' }}">
<head>
  <meta charset="utf-8">
  <title>{{ metaTitle }}</title>
  {% if metaDescription %}<meta name="description" content="{{ metaDescription }}">{% endif %}
  <meta name="format-detection" content="telephone=no"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  <link rel="stylesheet" href="/static/css/all.css">
  <link rel="icon" type="image/png" href="/static/img/icon/favicon-96x96.png" sizes="96x96" />
  <link rel="icon" type="image/svg+xml" href="/static/img/icon/favicon.svg" />
  <link rel="shortcut icon" href="/static/img/icon/favicon.ico" />
  <link rel="apple-touch-icon" sizes="180x180" href="/static/img/icon/apple-touch-icon.png" />
  <meta name="apple-mobile-web-app-title" content="{{ site.name }}" />
  <link rel="manifest" href="/static/img/icon/site.webmanifest" />
  {% for link in page.url | locale_links %}
  <link rel="alternate" hreflang="{{ link.lang }}" href="{{ link.url }}">
  {% endfor %}
</head>
<body{% if bodyClass %} class="{{ bodyClass }}"{% endif %}>
  <div class="layout__outer">
    <header class="layout__inner header">
      {%- block header %}
        {% include 'components/header.njk' %}
      {% endblock -%}
    </header>

    <main class="layout__inner">
      {%- block main %}{% endblock -%}
    </main>

    <footer class="layout__inner footer">
      {%- block footer %}
        {% include 'components/footer.njk' %}
      {% endblock -%}
    </footer>
  </div>
</body>
</html>
```

- [ ] **Step 4: Create header component `src/_includes/components/header.njk`**

```njk
<a href="{{ '/' | locale_url(lang) }}" class="header__brand">{{ site.name }}</a>
<nav class="lang-switcher" aria-label="Language">
  {% for link in page.url | locale_links %}
  <a href="{{ link.url }}" hreflang="{{ link.lang }}"{% if link.lang == lang %} aria-current="page"{% endif %}>{{ link.lang | upper }}</a>
  {% endfor %}
</nav>
```

- [ ] **Step 5: Create footer component `src/_includes/components/footer.njk`**

```njk
<p class="footer__copy">&copy; {{ '' | date('YYYY') }} {{ site.name }}</p>
```

Note: the `date` filter is no longer available (nunjucks-date-filter was removed). Replace the dynamic year with a static value for now — it will be wired via Eleventy shortcode in a later task:

```njk
<p class="footer__copy">&copy; 2026 {{ site.name }}</p>
```

- [ ] **Step 6: Create Dutch index page `src/nl/index.njk`**

```njk
---
layout: layouts/default.njk
metaTitle: Belast Rijkdom
metaDescription: De rijkdom groeit, maar wij worden armer. Belast extreme rijkdom in plaats van werk.
bodyClass: index
---

{% block main %}
<p style="margin-top: 10em; text-align: center; font-family: sans-serif; font-size: 1.4em;">
  <strong>Belast Rijkdom, niet werk.</strong>
</p>
{% endblock %}
```

- [ ] **Step 7: Create English index page `src/en/index.njk`**

```njk
---
layout: layouts/default.njk
metaTitle: Tax Wealth
metaDescription: Wealth grows, but we get poorer. Tax extreme wealth instead of labour.
bodyClass: index
---

{% block main %}
<p style="margin-top: 10em; text-align: center; font-family: sans-serif; font-size: 1.4em;">
  <strong>Tax wealth, not labour.</strong>
</p>
{% endblock %}
```

- [ ] **Step 8: Create 404 page `src/404.njk`**

```njk
---
layout: layouts/default.njk
metaTitle: Pagina niet gevonden / Page not found
permalink: /404.html
---

{% block main %}
<h1>404</h1>
<p>Pagina niet gevonden / Page not found</p>
<p><a href="/">Home</a></p>
{% endblock %}
```

- [ ] **Step 9: Create root language redirect `src/index.html`**

This file is passed through as-is (configured in `.eleventy.js`). It redirects visitors to their preferred language:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Belast Rijkdom</title>
    <script>
      ;(function () {
        var lang = (navigator.language || navigator.userLanguage || 'nl').slice(
          0,
          2,
        )
        window.location.replace(lang === 'nl' ? '/nl/' : '/en/')
      })()
    </script>
    <noscript>
      <meta http-equiv="refresh" content="0;url=/nl/" />
    </noscript>
  </head>
  <body>
    <p><a href="/nl/">NL</a> | <a href="/en/">EN</a></p>
  </body>
</html>
```

- [ ] **Step 10: Delete old pages**

```bash
git rm src/pages/index.njk src/pages/404.njk
```

- [ ] **Step 11: Run build and verify output**

```bash
npm run build
```

Check that these files exist:

```bash
ls dest/nl/index.html dest/en/index.html dest/404.html dest/index.html
```

Expected: all four files present without error.

```bash
grep 'lang="nl"' dest/nl/index.html
grep 'lang="en"' dest/en/index.html
grep 'Belast Rijkdom, niet werk' dest/nl/index.html
grep 'Tax wealth, not labour' dest/en/index.html
```

Expected: each grep returns the matched line.

```bash
grep 'hreflang' dest/nl/index.html
```

Expected: two `<link rel="alternate">` elements (one for nl, one for en).

- [ ] **Step 12: Commit**

```bash
git add src/_includes src/nl src/en src/404.njk src/index.html
git commit -m "$(cat <<'EOF'
feat: Add bilingual Eleventy structure with NL/EN i18n

Adds /nl/ and /en/ URL prefixes via EleventyI18nPlugin.
Root / does a client-side language redirect.
Language switcher in header links between locale versions.
EOF
)"
```

---

## Task 3: GitHub Actions CI + GitHub Pages deploy

**Files:**

- Create: `.github/workflows/ci.yml`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: `npm run build`, `npm test`, `npm run test:schema`, `npm run test:e2e` from Tasks 1–2 and 4–6 (stubs those commands for now; CI will expand as tests are added)
- Produces: automated build + deploy on push to `main`; PR status checks

**Before starting:** Enable GitHub Pages in the repo settings: Settings → Pages → Source: "GitHub Actions". Do this once manually.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    name: Build and test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Unit tests
        run: npm test

      - name: Schema validation
        run: npm run test:schema

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: E2E tests
        run: npm run test:e2e

      - name: Dependency audit
        run: npm audit --audit-level=high

      - name: Upload pages artifact
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
        uses: actions/upload-pages-artifact@v3
        with:
          path: dest

  deploy:
    name: Deploy to GitHub Pages
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deploy
```

- [ ] **Step 2: Update `.gitignore`**

Append to the existing `.gitignore`:

```
# test artefacts
test-results/
playwright-report/
.playwright/
```

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/ci.yml .gitignore
git commit -m "$(cat <<'EOF'
chore: Add GitHub Actions CI + GitHub Pages deploy workflow

Single workflow: test job runs on all push/PR events;
deploy job runs only on main after test passes.
EOF
)"
git push origin main
```

- [ ] **Step 4: Verify CI on GitHub**

Open the repository on GitHub → Actions tab. The CI workflow must appear and the build+test steps must pass. (The `npm test` and `npm run test:e2e` steps will fail until Tasks 4–5 add Vitest and Playwright — expected at this point.)

Note the failure mode: the workflow must show a real error, not be silently skipped. If `npm test` exits with a non-zero code, the step fails visibly — that is correct behaviour.

---

## Task 4: Vitest unit tests

**Files:**

- Create: `vitest.config.js`
- Create: `tests/unit/build.test.js`

**Interfaces:**

- Consumes: `dest/` built by `npm run build` (tests read build output from disk)
- Produces: `npm test` exits 0 when build output is correct

- [ ] **Step 1: Install Vitest**

```bash
npm install --save-dev vitest@^2.0.0
```

- [ ] **Step 2: Create `vitest.config.js`**

```js
'use strict'

const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
  },
})
```

- [ ] **Step 3: Write the failing tests**

Create `tests/unit/build.test.js`:

```js
'use strict'

const { describe, it, expect } = require('vitest')
const { existsSync, readFileSync } = require('fs')
const { resolve } = require('path')

const dest = (p) => resolve(__dirname, '../../dest', p)
const read = (p) => readFileSync(dest(p), 'utf8')

describe('build output — required files', () => {
  it('dest/nl/index.html exists', () => {
    expect(existsSync(dest('nl/index.html'))).toBe(true)
  })

  it('dest/en/index.html exists', () => {
    expect(existsSync(dest('en/index.html'))).toBe(true)
  })

  it('dest/index.html exists (root redirect)', () => {
    expect(existsSync(dest('index.html'))).toBe(true)
  })

  it('dest/404.html exists', () => {
    expect(existsSync(dest('404.html'))).toBe(true)
  })

  it('dest/static/css/all.css exists', () => {
    expect(existsSync(dest('static/css/all.css'))).toBe(true)
  })

  it('dest/CNAME exists', () => {
    expect(existsSync(dest('CNAME'))).toBe(true)
  })
})

describe('build output — CSS', () => {
  it('CSS has no remaining @import statements', () => {
    expect(read('static/css/all.css')).not.toContain('@import')
  })

  it('CSS has no @custom-media declarations', () => {
    expect(read('static/css/all.css')).not.toContain('@custom-media')
  })
})

describe('build output — NL page', () => {
  it('html element has lang=nl', () => {
    expect(read('nl/index.html')).toContain('lang="nl"')
  })

  it('contains Dutch tagline', () => {
    expect(read('nl/index.html')).toContain('Belast Rijkdom, niet werk')
  })

  it('has hreflang alternate for EN', () => {
    expect(read('nl/index.html')).toContain('hreflang="en"')
  })
})

describe('build output — EN page', () => {
  it('html element has lang=en', () => {
    expect(read('en/index.html')).toContain('lang="en"')
  })

  it('contains English tagline', () => {
    expect(read('en/index.html')).toContain('Tax wealth, not labour')
  })

  it('has hreflang alternate for NL', () => {
    expect(read('en/index.html')).toContain('hreflang="nl"')
  })
})
```

- [ ] **Step 4: Run tests expecting failure (before build)**

```bash
npm run build && npm test
```

Expected: all tests pass after a successful build. If any test fails, the build output does not match the expected structure — fix the template or config before continuing.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.js tests/unit/build.test.js package.json package-lock.json
git commit -m "$(cat <<'EOF'
test: Add Vitest unit tests for build output correctness
EOF
)"
```

---

## Task 5: Playwright E2E + axe accessibility

**Files:**

- Create: `playwright.config.js`
- Create: `tests/e2e/smoke.spec.js`

**Interfaces:**

- Consumes: `dest/` (built by `npm run build`); http-server serves it on port 4000
- Produces: `npm run test:e2e` passes with browser smoke tests and zero axe violations

- [ ] **Step 1: Install Playwright and axe-playwright**

```bash
npm install --save-dev @playwright/test@^1.45.0 axe-playwright@^2.0.0
npx playwright install chromium
```

- [ ] **Step 2: Create `playwright.config.js`**

```js
'use strict'

const { defineConfig, devices } = require('@playwright/test')

module.exports = defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:4000',
  },
  webServer: {
    command: 'npx http-server dest -p 4000 -c-1 --silent',
    port: 4000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
})
```

- [ ] **Step 3: Write the failing E2E tests**

Create `tests/e2e/smoke.spec.js`:

```js
'use strict'

const { test, expect } = require('@playwright/test')
const { injectAxe, checkA11y } = require('axe-playwright')

test.describe('Dutch site (/nl/)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/nl/')
    await injectAxe(page)
  })

  test('page title', async ({ page }) => {
    await expect(page).toHaveTitle('Belast Rijkdom')
  })

  test('Dutch tagline visible', async ({ page }) => {
    await expect(page.locator('strong').first()).toContainText(
      'Belast Rijkdom, niet werk',
    )
  })

  test('html lang attribute is nl', async ({ page }) => {
    const lang = await page.locator('html').getAttribute('lang')
    expect(lang).toBe('nl')
  })

  test('language switcher links to /en/', async ({ page }) => {
    const enLink = page.locator('[hreflang="en"]').first()
    await expect(enLink).toBeVisible()
    await expect(enLink).toHaveAttribute('href', /\/en\//)
  })

  test('no axe accessibility violations', async ({ page }) => {
    await checkA11y(page, undefined, {
      detailedReport: true,
      detailedReportOptions: { html: true },
    })
  })
})

test.describe('English site (/en/)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/')
    await injectAxe(page)
  })

  test('page title', async ({ page }) => {
    await expect(page).toHaveTitle('Tax Wealth')
  })

  test('English tagline visible', async ({ page }) => {
    await expect(page.locator('strong').first()).toContainText(
      'Tax wealth, not labour',
    )
  })

  test('html lang attribute is en', async ({ page }) => {
    const lang = await page.locator('html').getAttribute('lang')
    expect(lang).toBe('en')
  })

  test('language switcher links to /nl/', async ({ page }) => {
    const nlLink = page.locator('[hreflang="nl"]').first()
    await expect(nlLink).toBeVisible()
    await expect(nlLink).toHaveAttribute('href', /\/nl\//)
  })

  test('no axe accessibility violations', async ({ page }) => {
    await checkA11y(page, undefined, {
      detailedReport: true,
      detailedReportOptions: { html: true },
    })
  })
})

test.describe('Root redirect', () => {
  test('root / returns 2xx or 3xx (not an error)', async ({ page }) => {
    const response = await page.goto('/')
    expect(response.status()).toBeLessThan(400)
  })
})
```

- [ ] **Step 4: Build then run E2E tests**

```bash
npm run build && npm run test:e2e
```

Expected: all tests pass. If axe reports violations, fix the template markup before committing. Common initial violations to fix:

- Missing `<nav aria-label>` on language switcher (already present in Task 2's header template)
- Missing `<main>` landmark (present in layout)
- Low colour contrast: check `--colorOffBlack: #446` against white background; if contrast fails, adjust the variable in `src/static/css/common/1.variables.css`

- [ ] **Step 5: Commit**

```bash
git add playwright.config.js tests/e2e/smoke.spec.js package.json package-lock.json
git commit -m "$(cat <<'EOF'
test: Add Playwright E2E + axe accessibility tests

Smoke-tests both locale routes and checks for zero axe violations.
Serves built dest/ via http-server on port 4000.
EOF
)"
```

---

## Task 6: Claim content schema + AJV validation

**Files:**

- Create: `tests/schema/claim.schema.json`
- Create: `tests/schema/validate.js`
- Create: `src/_data/claims/` (directory)
- Create: `src/_data/claims/vermogensongelijkheid-2023.json`

**Interfaces:**

- Produces: `npm run test:schema` exits 0 if all files in `src/_data/claims/*.json` are valid; exits 1 with per-file error output otherwise

- [ ] **Step 1: Install AJV**

```bash
npm install --save-dev ajv@^8.0.0 ajv-formats@^3.0.0
```

- [ ] **Step 2: Write the failing schema validator**

Create `tests/schema/validate.js`:

```js
'use strict'

const fs = require('fs')
const path = require('path')
const Ajv = require('ajv')
const addFormats = require('ajv-formats')

const ajv = new Ajv({ strict: true, allErrors: true })
addFormats(ajv)

const schemaPath = path.resolve(__dirname, 'claim.schema.json')
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
const validate = ajv.compile(schema)

const claimsDir = path.resolve(__dirname, '../../src/_data/claims')

if (!fs.existsSync(claimsDir)) {
  console.log('No claims directory; skipping.')
  process.exit(0)
}

const files = fs.readdirSync(claimsDir).filter((f) => f.endsWith('.json'))

if (files.length === 0) {
  console.log('No claim files; skipping.')
  process.exit(0)
}

let failures = 0

for (const file of files) {
  const filePath = path.join(claimsDir, file)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))

  if (!validate(data)) {
    console.error(`FAIL  ${file}`)
    for (const err of validate.errors) {
      console.error(`      ${err.instancePath || '(root)'} — ${err.message}`)
    }
    failures++
  } else {
    console.log(`OK    ${file}`)
  }
}

if (failures > 0) {
  console.error(`\n${failures} claim file(s) failed validation.`)
  process.exit(1)
}

console.log(`\nAll ${files.length} claim(s) valid.`)
```

- [ ] **Step 3: Run validator expecting "skipping" output**

```bash
npm run test:schema
```

Expected output: `No claims directory; skipping.` — exits 0.

- [ ] **Step 4: Create `tests/schema/claim.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": [
    "id",
    "claim",
    "value",
    "unit",
    "source",
    "verified",
    "lastChecked"
  ],
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^[a-z0-9-]+$",
      "description": "Kebab-case slug, unique across all claims"
    },
    "claim": {
      "type": "object",
      "required": ["nl", "en"],
      "additionalProperties": false,
      "properties": {
        "nl": { "type": "string", "minLength": 10 },
        "en": { "type": "string", "minLength": 10 }
      }
    },
    "value": { "type": "number" },
    "unit": { "type": "string", "minLength": 1 },
    "source": {
      "type": "object",
      "required": ["name", "url", "accessed", "type"],
      "additionalProperties": false,
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "url": { "type": "string", "format": "uri" },
        "accessed": { "type": "string", "format": "date" },
        "type": {
          "type": "string",
          "enum": ["primary", "secondary", "model-estimate"]
        }
      }
    },
    "verified": { "type": "boolean" },
    "lastChecked": { "type": "string", "format": "date" }
  }
}
```

- [ ] **Step 5: Add a sample claim file to validate**

Create `src/_data/claims/vermogensongelijkheid-2023.json`:

```json
{
  "id": "vermogensongelijkheid-2023",
  "claim": {
    "nl": "De rijkste 1% bezit meer dan een kwart van al het vermogen in Nederland.",
    "en": "The richest 1% owns more than a quarter of all wealth in the Netherlands."
  },
  "value": 0.26,
  "unit": "fraction-of-total-wealth",
  "source": {
    "name": "CBS Vermogensstatistiek 2022",
    "url": "https://www.cbs.nl/nl-nl/cijfers/detail/85064NED",
    "accessed": "2026-06-26",
    "type": "primary"
  },
  "verified": false,
  "lastChecked": "2026-06-26"
}
```

Note: `verified: false` because the CBS URL has not been manually confirmed. Change to `true` after verifying the source URL is live and the figure is accurate.

- [ ] **Step 6: Run validator expecting OK output**

```bash
npm run test:schema
```

Expected output:

```
OK    vermogensongelijkheid-2023.json

All 1 claim(s) valid.
```

- [ ] **Step 7: Verify schema rejects invalid data**

```bash
node -e "
const fs = require('fs')
fs.writeFileSync('/tmp/bad-claim.json', JSON.stringify({ id: 'bad' }))
"
node -e "
const Ajv = require('ajv')
const addFormats = require('ajv-formats')
const ajv = new Ajv({ strict: true, allErrors: true })
addFormats(ajv)
const schema = JSON.parse(require('fs').readFileSync('tests/schema/claim.schema.json', 'utf8'))
const validate = ajv.compile(schema)
const data = { id: 'bad' }
console.log('Valid:', validate(data))
console.log('Errors:', JSON.stringify(validate.errors, null, 2))
"
```

Expected: `Valid: false` with errors listing the missing required fields.

- [ ] **Step 8: Commit**

```bash
git add tests/schema/ src/_data/claims/ package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat: Add AJV claim schema validation + first claim data file

All files in src/_data/claims/*.json must pass the schema on every CI run.
verified:false marks claims pending manual source confirmation.
EOF
)"
```

---

## Task 7: AGENTS.md + agentic platform docs + issue template

**Files:**

- Create: `AGENTS.md`
- Create: `docs/agentic-platform.md`
- Create: `.github/ISSUE_TEMPLATE/agent-task.yml`

**Interfaces:**

- Produces: agents have a steering document; platform architecture is documented; structured issue template routes agent tasks

- [ ] **Step 1: Create `AGENTS.md`**

````markdown
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
npm audit --audit-level=high
```
````

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

````

- [ ] **Step 2: Create `docs/agentic-platform.md`**

```markdown
# Agentic Platform Architecture

_Living document. Updated when the platform level or architecture changes._

**Last updated:** 2026-06-26
**Current level:** L2 — agents open PRs; human decides on merge

---

## Levels

| Level | Description | Unlock condition |
|-------|-------------|-----------------|
| L1 | Human approves every diff | (starting point) |
| **L2** | **Agents open PRs; human verifies behaviour, not lines** | Validation oracle trustworthy enough that green CI ≈ correct change |
| L3 | Agents generate their own work from signals; review is exception-based | >50% of merged PRs require no human decision |
| L4 | Fully autonomous within deterministic guardrails | Guardrails proven reliable; rollback pipeline exists |

---

## Stack

| Layer | Tool | Notes |
|-------|------|-------|
| SSG | Eleventy 3.x | Nunjucks templates, PostCSS transforms |
| i18n | EleventyI18nPlugin (built-in) | /nl/ and /en/ URL prefixes |
| CSS | PostCSS + postcss-preset-env | Custom media queries polyfilled |
| Hosting | GitHub Pages | Free tier; deploy via Actions |
| CI | GitHub Actions | Free tier (~2 000 min/month) |
| Unit tests | Vitest 2.x | Tests build output correctness |
| E2E + a11y | Playwright + axe-playwright | Runs against built dest/ |
| Schema | AJV 8 + ajv-formats | Validates src/_data/claims/*.json |
| Bot identity | GitHub App (TBD) | Scoped, short-lived tokens; not a PAT |

---

## Validation oracle

The oracle is the set of checks that must all pass before a change is
merged. "Checks are green" must mean "the change is correct" for the
categories of changes agents make.

| Check | Tool | Gate |
|-------|------|------|
| Build succeeds | Eleventy | Hard fail |
| Build output structure | Vitest | Hard fail |
| Claim schema | AJV | Hard fail |
| E2E smoke | Playwright | Hard fail |
| Accessibility | axe-playwright | Hard fail |
| Dependency audit | npm audit | High+ severity = fail |

**Flake policy:** any test that fails non-deterministically twice in a row
gets an issue filed automatically. Target flake rate: <1%.

---

## Agent dispatch golden path (L2)

````

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

| Metric | Target | Where measured |
|--------|--------|----------------|
| CI run duration | < 5 min | GitHub Actions |
| Test flake rate | < 1% | Manual; automate in L3 |
| Time: issue → first PR | Baseline TBD | GitHub timestamps |
| Human review time per merge | Baseline TBD | GitHub timestamps |
| Agent-loop convergence rate | Baseline TBD | CI pass/fail ratio |
| Parallel PRs in flight | 1 (L2) → 3+ (L2 mature) | GitHub |
| Change-failure-rate | < 5% | Revert count / total merges |

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
```

- [ ] **Step 3: Create `.github/ISSUE_TEMPLATE/agent-task.yml`**

```yaml
name: Agent task
description: A structured task for an AI agent to execute
labels: ['agent:task']
body:
  - type: markdown
    attributes:
      value: |
        Fill in all sections. The agent reads this issue verbatim — vague
        requirements produce vague PRs.

  - type: textarea
    id: goal
    attributes:
      label: Goal
      description: One sentence. What should exist or work after this task is done?
      placeholder: 'Add an English translation of the privacy page at /en/privacy/.'
    validations:
      required: true

  - type: textarea
    id: acceptance
    attributes:
      label: Acceptance criteria
      description: |
        Numbered list of verifiable conditions. Each item must be checkable
        by running the validation loop or inspecting build output.
      placeholder: |
        1. `dest/en/privacy/index.html` exists after `npm run build`
        2. The page has `lang="en"` on the html element
        3. `npm run test:e2e` passes
    validations:
      required: true

  - type: textarea
    id: files
    attributes:
      label: Files to touch
      description: List the files the agent should create or modify.
      placeholder: |
        Create: src/en/privacy.njk
        Modify: (none)
    validations:
      required: false

  - type: textarea
    id: constraints
    attributes:
      label: Constraints
      description: Anything the agent must not do, or edge cases to avoid.
      placeholder: 'Do not add unsourced figures. Keep the same layout as the NL version.'
    validations:
      required: false

  - type: checkboxes
    id: checklist
    attributes:
      label: Agent pre-flight checklist
      options:
        - label: I have read AGENTS.md
          required: true
        - label: All acceptance criteria are verifiable by the validation loop
          required: true
```

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/agentic-platform.md .github/ISSUE_TEMPLATE/agent-task.yml
git commit -m "$(cat <<'EOF'
docs: Add AGENTS.md, agentic platform architecture doc, agent issue template

Establishes the agent steering contract (what agents may/must-not do),
documents the L2 platform architecture and metrics, and provides a
structured issue template for dispatching agent tasks.
EOF
)"
```

- [ ] **Step 5: Push and verify full CI on GitHub**

```bash
git push origin main
```

Open GitHub → Actions. The CI workflow must pass all steps. Verify:

- Build step: green
- Unit tests: green
- Schema validation: green (1 claim valid)
- E2E tests: green (all locale routes pass, no axe violations)
- Dependency audit: green

If any step is red, fix it before declaring the plan complete.

---

## Self-review against spec

**Spec coverage check:**

| Spec requirement                   | Task                                     |
| ---------------------------------- | ---------------------------------------- |
| Migrate to Eleventy                | Task 1                                   |
| Bilingual /nl/ /en/ URLs           | Task 2                                   |
| Language switcher                  | Task 2                                   |
| Root redirect (JS, no server)      | Task 2                                   |
| GitHub Actions CI                  | Task 3                                   |
| GitHub Pages deploy                | Task 3                                   |
| Real test suite (unit + E2E)       | Tasks 4–5                                |
| Flake rate as first-class metric   | docs/agentic-platform.md                 |
| Content/data schema validation     | Task 6                                   |
| Accessibility checks (axe)         | Task 5                                   |
| Dependency scanning                | Task 3 (npm audit in CI)                 |
| Structured failure for agent retry | AGENTS.md                                |
| Non-human bot identity             | docs/agentic-platform.md (pending setup) |
| AGENTS.md                          | Task 7                                   |
| docs/agentic-platform.md           | Task 7                                   |
| Agent dispatch golden path         | Task 7 + AGENTS.md                       |
| Fix broken deploy script           | Task 1 (replaced entirely)               |
| Fix postcss-cssnext deprecation    | Task 1                                   |

**Not in this plan (deferred to next plan):**

- Lighthouse CI performance budgets
- Visual regression baseline
- Link checker (lychee)
- cspell spell/style checking
- Auto-merge branch protection rule (enable after oracle proves reliable)
- Bot identity GitHub App creation (documented, not automated — requires manual setup)
- `agent.yml` dispatch workflow (requires bot credentials)
