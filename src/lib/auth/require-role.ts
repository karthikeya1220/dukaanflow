// Server-only: do not import this module in client components.
import { unauthorized, forbidden } from 'next/navigation'
import { getCurrentUserWithRole } from './session'
import type { UserRole } from '@/generated/prisma/enums'
import type { User } from '@supabase/supabase-js'

/** Use in Server Components. Throws a Next.js 401 or 403 interrupt. */
export async function requireRole(
  role: UserRole,
): Promise<{ user: User; role: UserRole }> {
  const result = await getCurrentUserWithRole()
  if (!result) unauthorized()
  if (result.role !== role) forbidden()
  return result
}
export type CheckRoleResult =
  | { ok: true; user: User; role: UserRole }
  | { ok: false; code: 'UNAUTHORIZED' | 'FORBIDDEN' }

/** Use in Server Actions. Returns a structured result instead of throwing. */
export async function checkRole(role: UserRole): Promise<CheckRoleResult> {
  const result = await getCurrentUserWithRole()
  if (!result) return { ok: false, code: 'UNAUTHORIZED' }
  if (result.role !== role) return { ok: false, code: 'FORBIDDEN' }
  return { ok: true, user: result.user, role: result.role }
}
