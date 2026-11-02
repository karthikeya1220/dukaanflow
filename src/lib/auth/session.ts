// Server-only: do not import this module in client components.
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/db'
import type { User } from '@supabase/supabase-js'
import type { UserRole } from '@/generated/prisma/enums'

export async function getServerUser(): Promise<User | null> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return null
    return user
  } catch {
    return null
  }
}
export async function resolveRole(
  authSubject: string,
): Promise<UserRole | null> {
  try {
    const record = await prisma.user.findUnique({
      where: { authSubject },
      select: { role: true },
    })
    return record?.role ?? null
  } catch {
    return null
  }
}

export async function getCurrentUserWithRole(): Promise<{
  user: User
  role: UserRole
} | null> {
  const user = await getServerUser()
  if (!user) return null
  const role = await resolveRole(user.id)
  if (!role) return null
  return { user, role }
}
