import { expect, test } from '@playwright/test'
import { checkA11y, injectAxe } from 'axe-playwright'

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
    const enLink = page.locator('a[hreflang="en"]').first()
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
    const nlLink = page.locator('a[hreflang="nl"]').first()
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
