import 'dotenv/config'
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { assertSafeTestDatabaseTarget } from '../test-database-safety'

const MAILPIT_API = 'http://127.0.0.1:54324/api/v1'
const RETAILER_EMAIL = 'retailer@dukaanflow.test'
const DESK_EMAIL = 'desk@dukaanflow.test'
const SUPABASE_URL = 'http://127.0.0.1:54321'

// ── Helpers ──────────────────────────────────────────────────────────────────

const sessionCookies = new Map<
  string,
  Awaited<ReturnType<BrowserContext['cookies']>>
>()

async function clearMailpit() {
  await fetch(`${MAILPIT_API}/messages`, { method: 'DELETE' }).catch(() => {})
  for (let i = 0; i < 20; i++) {
    const response = await fetch(`${MAILPIT_API}/messages`)
    const body = (await response.json()) as { total?: number }
    if (!body.total) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Mailpit did not clear before the test started')
}

async function submitLoginForm(page: Page, email: string) {
  await page.goto('/login')
  await page.fill('[name="email"]', email)
  await page.click('[type="submit"]')
  await expect(page.getByText('Check your inbox')).toBeVisible({ timeout: 10_000 })
}

async function authUserExists(email: string): Promise<boolean> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?per_page=200`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  )
  if (!response.ok) throw new Error(`Auth user lookup failed: ${response.status}`)
  const body = (await response.json()) as {
    users?: Array<{ email?: string }>
  }
  return body.users?.some(
    (user) => user.email?.toLowerCase() === email.toLowerCase(),
  ) ?? false
}

async function getMagicLink(email: string): Promise<string> {
  // Poll Mailpit for up to 10 s
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
      // Extract the callback URL — Supabase embeds it as the href of the sign-in link.
      const match = content.match(/href="([^"]*\/auth\/callback[^"]*)"/i)
        ?? content.match(/(http[s]?:\/\/[^\s<>"]*\/auth\/callback[^\s<>"]*)/i)
      if (match) return match[1].replace(/&amp;/g, '&')
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`No magic link found for ${email} in Mailpit within 10 s`)
}

async function loginAs(
  page: Page,
  email: string,
  options: { fresh?: boolean } = {},
): Promise<string> {
  if (!options.fresh) {
    const cookies = sessionCookies.get(email)
    if (cookies) {
      await page.context().addCookies(cookies)
      await page.goto(email === RETAILER_EMAIL ? '/retailer' : '/order-desk')
      return ''
    }
  }
  await submitLoginForm(page, email)
  const link = await getMagicLink(email)
  await page.goto(link)
  sessionCookies.set(email, await page.context().cookies())
  return link
}

async function resetRetailerCart(page: Page) {
  assertSafeTestDatabaseTarget()
  await page.goto('/retailer/cart')
  const clearButton = page.getByRole('button', { name: 'Clear cart' })
  if (await clearButton.isVisible()) {
    await clearButton.click()
    await expect(page.getByText('Your cart is empty')).toBeVisible()
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('M1 Authentication & RBAC', () => {
  test.beforeEach(async () => {
    await clearMailpit()
  })

  test('Retailer login → lands on /retailer', async ({ page }) => {
    await loginAs(page, RETAILER_EMAIL)
    await expect(page).toHaveURL(/\/retailer/)
    await expect(page.getByRole('heading', { name: 'Retailer Portal' })).toBeVisible()
    await expect(page.getByText('SKU-BS-075')).toBeVisible()
    await expect(page.getByText('SKU-DT-1KG')).toBeVisible()
    await expect(page.getByText('SKU-TE-250')).toBeVisible()
  })

  test('Retailer catalogue displays pack, stock, price, and schemes', async ({ page }) => {
    await loginAs(page, RETAILER_EMAIL)

    await expect(page.getByText('₹8.10')).toBeVisible()
    await expect(page.getByText('96 pack')).toBeVisible()
    await expect(page.getByText('340 case')).toBeVisible()
    await expect(page.getByText('Buy 10 case and get 1 free')).toBeVisible()
    await expect(page.getByText('3.00% off from 5 case')).toBeVisible()
    await expect(page.getByText('unconfirmed').first()).toBeVisible()
  })

  test('Retailer catalogue searches by SKU and filters by stock and scheme', async ({
    page,
  }) => {
    await loginAs(page, RETAILER_EMAIL)

    await page.fill('#catalogue-search', 'SKU-TE-250')
    await page.selectOption('#catalogue-stock', 'out-of-stock')
    await page.click('button:has-text("Filter")')

    await expect(page).toHaveURL(/q=SKU-TE-250/)
    await expect(page.getByText('SKU-TE-250')).toBeVisible()
    await expect(page.getByText('SKU-BS-075')).not.toBeVisible()
    await expect(page.getByText('SKU-DT-1KG')).not.toBeVisible()

    await page.goto('/retailer?scheme=with-scheme')
    await expect(page.getByText('SKU-BS-075')).toBeVisible()
    await expect(page.getByText('SKU-DT-1KG')).toBeVisible()
    await expect(page.getByText('SKU-TE-250')).not.toBeVisible()
  })

  test('Order-desk login → lands on /order-desk', async ({ page }) => {
    await loginAs(page, DESK_EMAIL)
    await expect(page).toHaveURL(/\/order-desk/)
    await expect(page.getByRole('heading', { name: 'Order Desk' })).toBeVisible()
  })

  test('Cross-device PKCE failure → error page with reason=cross_device', async ({
    page,
    context,
  }) => {
    // Initiate login (stores PKCE verifier in this browser context)
    await submitLoginForm(page, RETAILER_EMAIL)
    const link = await getMagicLink(RETAILER_EMAIL)

    // Simulate cross-device: remove all Supabase cookies (no verifier)
    const allCookies = await context.cookies()
    const supabaseCookies = allCookies.filter((c) => c.name.startsWith('sb-'))
    for (const c of supabaseCookies) {
      await context.clearCookies({ name: c.name })
    }

    await page.goto(link)
    await expect(page).toHaveURL(/\/auth\/error/)
    const url = new URL(page.url())
    expect(url.searchParams.get('reason')).toBe('cross_device')
  })

  test('Retailer cannot access /order-desk', async ({ page }) => {
    await loginAs(page, RETAILER_EMAIL)
    await expect(page).toHaveURL(/\/retailer/)

    const response = await page.goto('/order-desk')
    expect(response?.status()).toBe(403)
  })

  test('Logged-in retailer is redirected away from /login', async ({ page }) => {
    await loginAs(page, RETAILER_EMAIL)
    await expect(page).toHaveURL(/\/retailer/)

    await page.goto('/login')
    await expect(page).toHaveURL(/\/retailer/)
  })

  test('Logged-in order-desk is redirected away from /login', async ({ page }) => {
    await loginAs(page, DESK_EMAIL)
    await expect(page).toHaveURL(/\/order-desk/)

    await page.goto('/login')
    await expect(page).toHaveURL(/\/order-desk/)
  })

  test('ORDER_DESK cannot access /retailer', async ({ page }) => {
    await loginAs(page, DESK_EMAIL)
    await expect(page).toHaveURL(/\/order-desk/)

    const response = await page.goto('/retailer')
    expect(response?.status()).toBe(403)
  })

  test('Logout clears session and redirects to /login', async ({ page }) => {
    await loginAs(page, RETAILER_EMAIL)
    await expect(page).toHaveURL(/\/retailer/)

    await page.click('[data-testid="logout-button"]')
    await expect(page).toHaveURL(/\/login/)

    // Navigating to a protected route now redirects back to /login
    await page.goto('/retailer')
    await expect(page).toHaveURL(/\/login/)
  })

  test('Order-desk logout clears session and redirects to /login', async ({ page }) => {
    await loginAs(page, DESK_EMAIL)
    await expect(page).toHaveURL(/\/order-desk/)

    await page.click('[data-testid="logout-button"]')
    await expect(page).toHaveURL(/\/login/)

    await page.goto('/order-desk')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/auth/callback without a code redirects to error page', async ({ page }) => {
    await page.goto('/auth/callback')
    await expect(page).toHaveURL(/\/auth\/error/)
    const url = new URL(page.url())
    expect(url.searchParams.get('reason')).toBe('no_code')
  })

  test('Reused magic link shows invalid or expired error', async ({ page }) => {
    // Submit the login form to get a magic link
    await submitLoginForm(page, DESK_EMAIL)
    const link = await getMagicLink(DESK_EMAIL)

    // First visit consumes the code and logs in
    await page.goto(link)
    await expect(page).toHaveURL(/\/order-desk/)

    // Second visit with the same link should fail.
    await page.goto(link)
    await expect(page).toHaveURL(/\/auth\/error/)
    const url = new URL(page.url())
    expect(url.searchParams.get('reason')).toBe('no_code')
  })

  test('Unregistered email shows generic message without sending mail', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[name="email"]', 'unknown@example.test')
    await page.click('[type="submit"]')
    await expect(
      page.getByText('If this email is registered, a link has been sent.'),
    ).toBeVisible({ timeout: 10_000 })

    // No magic link should appear in Mailpit for this unregistered email.
    // The generic message intentionally does not reveal whether the email exists.
    await expect(
      async () => {
        const res = await fetch(`${MAILPIT_API}/messages`)
        const body = (await res.json()) as {
          messages?: Array<{ To?: Array<{ Address?: string }> }>
        }
        const hasEmail = body.messages?.some((m) =>
          m.To?.some(
            (t) => t.Address?.toLowerCase() === 'unknown@example.test',
          ),
        )
        expect(hasEmail).toBe(false)
      },
    ).toPass({ timeout: 10_000 })
    await expect(await authUserExists('unknown@example.test')).toBe(false)
  })
})

test.describe('M3 Retailer cart UI', () => {
  test.beforeAll(() => {
    assertSafeTestDatabaseTarget()
  })

  test.beforeEach(async () => {
    await clearMailpit()
  })

  test('retailer can add, persist, update, and remove a cart line', async ({ page }) => {
    await loginAs(page, RETAILER_EMAIL, { fresh: true })
    await resetRetailerCart(page)
    await page.goto('/retailer')

    await expect(page.getByTestId('catalogue-client')).toHaveAttribute('data-hydrated', 'true')
    await page.fill('#quantity-SKU-BS-075', '10')
    await page.getByTestId('add-to-cart-SKU-BS-075').click()
    await expect(page.getByText('Glucose biscuit, 75 g')).toBeVisible()
    await expect(page.getByTestId('cart-link')).toContainText('Cart (1)')

    await page.goto('/retailer/cart')
    await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible()
    await expect(page.getByText('Buy 10 case and get 1 free')).toBeVisible()
    await expect(page.getByText('Free: 1')).toBeVisible()
    await expect(page.getByText('Provisional total', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('price basis is unconfirmed')).toBeVisible()

    await page.reload()
    await expect(page.getByText('Paid: 10')).toBeVisible()

    await page.fill('input[id^="cart-quantity-"]', '12')
    await page.getByRole('button', { name: 'Update quantity' }).click()
    await expect(page.getByText('Paid: 12')).toBeVisible()
    await expect(page.getByText('Free: 1')).toBeVisible()

    await page.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Your cart is empty')).toBeVisible()
  })

  test('empty cart and clear cart states are available', async ({ page }) => {
    await loginAs(page, RETAILER_EMAIL, { fresh: true })
    await resetRetailerCart(page)
    await expect(page.getByText('Your cart is empty')).toBeVisible()
    await page.getByRole('link', { name: 'Browse catalogue' }).click()
    await expect(page).toHaveURL(/\/retailer$/)

    await expect(page.getByTestId('catalogue-client')).toHaveAttribute('data-hydrated', 'true')
    await page.getByTestId('add-to-cart-SKU-DT-1KG').click()
    await expect(page.getByText(/added to cart\./)).toBeVisible()
    await page.goto('/retailer/cart')
    await expect(page.getByRole('button', { name: 'Clear cart' })).toBeVisible()
    await page.getByRole('button', { name: 'Clear cart' }).click()
    await expect(page.getByText('Your cart is empty')).toBeVisible()
  })

  test('zero-stock tea remains visible and cannot be confirmed', async ({ page }) => {
    await loginAs(page, RETAILER_EMAIL, { fresh: true })
    await resetRetailerCart(page)
    await page.goto('/retailer')
    await page.getByTestId('add-to-cart-SKU-TE-250').click()
    await expect(page.getByText(/added to cart\./)).toBeVisible()
    await page.goto('/retailer/cart')
    await expect(page.getByText('Out of stock')).toBeVisible()
    await expect(page.getByText(/Confirmation is unavailable/)).toBeVisible()
    await expect(page.getByTestId('confirm-cart')).toBeDisabled()
  })

  test('order desk and unauthenticated users cannot access the cart', async ({ page }) => {
    await loginAs(page, DESK_EMAIL, { fresh: true })
    const deskResponse = await page.goto('/retailer/cart')
    expect(deskResponse?.status()).toBe(403)

    await page.context().clearCookies()
    await page.goto('/retailer/cart')
    await expect(page).toHaveURL(/\/login/)
  })
})
