import 'dotenv/config'
import { test, expect, Page } from '@playwright/test'
import { assertSafeTestDatabaseTarget } from '../test-database-safety'

const MAILPIT_API = 'http://127.0.0.1:54324/api/v1'
const RETAILER_EMAIL = 'retailer@dukaanflow.test'
const DESK_EMAIL = 'desk@dukaanflow.test'

async function clearMailpit() {
  await fetch(`${MAILPIT_API}/messages`, { method: 'DELETE' }).catch(() => {})
  for (let i = 0; i < 20; i++) {
    const response = await fetch(`${MAILPIT_API}/messages`)
    const body = (await response.json()) as { total?: number }
    if (!body.total) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

async function getMagicLink(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT_API}/messages`)
    const body = (await res.json()) as {
      messages?: Array<{ ID: string; To?: Array<{ Address?: string }> }>
    }
    const msg = body.messages?.find((m) =>
      m.To?.some((t) => t.Address?.toLowerCase() === email.toLowerCase()),
    )
    if (msg) {
      const detail = await fetch(`${MAILPIT_API}/message/${msg.ID}`)
      const detailBody = (await detail.json()) as { HTML?: string; Text?: string }
      const content = detailBody.HTML ?? detailBody.Text ?? ''
      const match =
        content.match(/href="([^"]*\/auth\/callback[^"]*)"/i) ??
        content.match(/(http[s]?:\/\/[^\s<>"]*\/auth\/callback[^\s<>"]*)/i)
      if (match) return match[1].replace(/&amp;/g, '&')
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Magic link for ${email} did not arrive in Mailpit`)
}

async function loginAs(page: Page, email: string) {
  await page.goto('/login')
  await page.fill('[name="email"]', email)
  await page.click('[type="submit"]')
  await expect(page.getByText('Check your inbox')).toBeVisible({ timeout: 10_000 })
  const link = await getMagicLink(email)
  await page.goto(link)
}

test.describe('DukaanFlow Full End-to-End Order Workflow', () => {
  test.beforeAll(() => {
    assertSafeTestDatabaseTarget()
  })

  test.beforeEach(async () => {
    await clearMailpit()
  })

  test('Retailer journeys through catalogue, cart, AI assist, simulation submission, and order desk inspection', async ({
    page,
    browser,
  }) => {
    // 1. Retailer Login & Clean Cart
    await loginAs(page, RETAILER_EMAIL)
    await expect(page).toHaveURL(/\/retailer/)
    await expect(page.getByRole('heading', { name: 'Retailer Portal' })).toBeVisible()

    // Ensure cart starts clean
    await page.goto('/retailer/cart')
    const clearBtn = page.getByRole('button', { name: 'Clear cart' })
    if (await clearBtn.isVisible()) {
      await clearBtn.click()
      await expect(page.getByText('Your cart is empty')).toBeVisible()
    }
    await page.goto('/retailer')

    // 2. Catalogue Browsing & Verification
    await expect(page.getByTestId('catalogue-client')).toHaveAttribute('data-hydrated', 'true')
    await expect(page.getByText('Glucose biscuit, 75 g')).toBeVisible()

    // 3. AI Order Capture Modal
    const aiOrderBtn = page.getByTestId('ai-order-btn')
    await expect(aiOrderBtn).toBeVisible()
    await aiOrderBtn.click()

    await expect(page.getByTestId('ai-order-input')).toBeVisible()
    await page.fill('[data-testid="ai-order-input"]', '2 cases Glucose biscuit')
    await page.getByTestId('ai-parse-btn').click()

    // AI proposed mappings appear
    await expect(page.getByText('Proposed Product Mappings')).toBeVisible()
    await expect(page.getByTestId('ai-add-cart-btn')).toBeVisible()
    await page.getByTestId('ai-add-cart-btn').click()
    await expect(page.getByText(/Added \d+ items to your cart!/)).toBeVisible()

    // 4. Cart Review & Confirmation
    await page.goto('/retailer/cart')
    await expect(page.getByRole('heading', { name: 'Your cart', exact: true })).toBeVisible()

    // Confirm Cart for next stage
    const confirmBtn = page.getByTestId('confirm-cart')
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click()

    // 5. Simulation Order Submission
    await expect(page.getByTestId('submit-simulation-order-button')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('submit-simulation-order-button').click()

    // Banner confirming simulation order placed
    await expect(page.getByTestId('submitted-order-banner')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Simulation Order Created')).toBeVisible()

    const submittedOrderId = (await page.getByTestId('submitted-order-id').textContent())?.trim()
    expect(submittedOrderId).toBeTruthy()

    // 6. Order Desk Login & Inspection (in isolated browser context)
    const deskContext = await browser.newContext()
    const deskPage = await deskContext.newPage()
    await loginAs(deskPage, DESK_EMAIL)
    await expect(deskPage).toHaveURL(/\/order-desk/)
    await expect(deskPage.getByRole('heading', { name: 'Order Desk' })).toBeVisible()

    // Inspection: Simulation order is visible in queue with SIMULATED badge
    await expect(deskPage.getByText('SIMULATED').first()).toBeVisible()

    // Policy notice is present showing review is gated
    await expect(deskPage.getByRole('note')).toContainText('Order approvals and stock releases are currently disabled')

    // 7. Verify Commercial CSV Export Endpoint Works and Excludes Simulation Orders
    const exportResponse = await deskPage.request.get('/api/export/tally')
    expect(exportResponse.status()).toBe(200)
    const csvText = await exportResponse.text()
    expect(csvText).toContain('Order ID,Order Date,Retailer Email')

    // Critical assertion: The simulated order ID MUST NOT appear anywhere in the commercial export body
    expect(csvText).not.toContain(submittedOrderId!)

    await deskContext.close()
  })

  test('Retailer cannot access Order Desk and unauthenticated users cannot access CSV export', async ({
    page,
  }) => {
    // Unauthenticated access to /api/export/tally is rejected
    const unauthRes = await page.request.get('/api/export/tally')
    expect(unauthRes.status()).toBe(403)

    // Retailer cannot access Order Desk (403 forbidden)
    await loginAs(page, RETAILER_EMAIL)
    const response = await page.goto('/order-desk')
    expect(response?.status()).toBe(403)
  })
})
