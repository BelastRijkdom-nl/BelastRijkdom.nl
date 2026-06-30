import { existsSync, readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'

const claimsDir = resolve(import.meta.dirname, '../../src/_data/claims')

const RETRIES = 2
const RETRY_DELAY_MS = 1000
const TIMEOUT_MS = 15000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!existsSync(claimsDir)) {
  console.log('No claims directory; skipping.')
  process.exit(0)
}

const files = readdirSync(claimsDir).filter((f) => f.endsWith('.json'))

if (files.length === 0) {
  console.log('No claim files; skipping.')
  process.exit(0)
}

// Collect every source.url, tracking which file it came from.
const urls = []
for (const file of files) {
  const data = JSON.parse(readFileSync(join(claimsDir, file), 'utf8'))
  const url = data?.source?.url
  if (url) {
    urls.push({ file, url })
  }
}

if (urls.length === 0) {
  console.log('No source URLs found; skipping.')
  process.exit(0)
}

// Fetch a URL, retrying on network errors or 5xx responses. Returns the
// final status code (or null if every attempt threw).
async function fetchWithRetry(url) {
  let lastError = null

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAY_MS)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'BelastRijkdom-link-checker/1.0 (+https://BelastRijkdom.nl)',
        },
      })
      clearTimeout(timer)

      // Retry transient server errors; client errors (4xx) are definitive.
      if (res.status >= 500 && attempt < RETRIES) {
        lastError = `HTTP ${res.status}`
        continue
      }

      return { status: res.status, error: null }
    } catch (err) {
      clearTimeout(timer)
      lastError =
        err.name === 'AbortError'
          ? `timeout after ${TIMEOUT_MS}ms`
          : err.message
    }
  }

  return { status: null, error: lastError }
}

let failures = 0

for (const { file, url } of urls) {
  const { status, error } = await fetchWithRetry(url)

  if (status === null) {
    console.error(`FAIL  ${file}\n      ${url}\n      ${error}`)
    failures++
  } else if (status >= 400) {
    console.error(`FAIL  ${file}\n      ${url}\n      HTTP ${status}`)
    failures++
  } else {
    console.log(`OK    ${status}  ${url}`)
  }
}

if (failures > 0) {
  console.error(`\n${failures} link(s) failed.`)
  process.exit(1)
}

console.log(`\nAll ${urls.length} link(s) reachable.`)
