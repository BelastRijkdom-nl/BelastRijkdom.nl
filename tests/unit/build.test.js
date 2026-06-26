import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const dest = (p) => resolve(import.meta.dirname, '../../dest', p)
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
