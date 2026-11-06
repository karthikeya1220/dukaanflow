'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const otpSchema = z.object({ email: z.email() })

export async function sendMagicLink(
  _prev: unknown,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = otpSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }
  const siteUrl = process.env.SITE_URL
  if (!siteUrl) throw new Error('SITE_URL is not configured')

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  })

  if (error) {
    // Generic message — avoids user enumeration
    return {
      ok: false,
      error: 'If this email is registered, a link has been sent.',
    }
  }
  return { ok: true }
}

export async function signOut(): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()
  } catch {
    // Remote session may already be revoked (e.g. re-login elsewhere). Logout
    // must still complete locally: clearing cookies happens in createClient's
    // cookie handling and redirect below. Never block logout on provider errors.
  }
  redirect('/login')
}
