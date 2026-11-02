import 'dotenv/config'
import { test, expect, type BrowserContext, type Page } from '@playwright/test'

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

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('M1 Authentication & RBAC', () => {
  test.beforeEach(async () => {
    await clearMailpit()
  })

  test('Retailer login → lands on /retailer', async ({ page }) => {
    await loginAs(page, RETAILER_EMAIL)
    await expect(page).toHaveURL(/\/retailer/)
    await expect(page.getByRole('heading', { name: 'Retailer Portal' })).toBeVisible()
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
