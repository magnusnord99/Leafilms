import assert from 'node:assert/strict'
import test from 'node:test'
import type { User } from '@supabase/supabase-js'
import { requireAdminForClient } from '../lib/auth/admin'

type ProfileRow = {
  role: string
}

type FakeClientOptions = {
  user: User | null
  profile: ProfileRow | null
  authError?: Error | null
  profileError?: Error | null
}

function fakeClient(options: FakeClientOptions): Parameters<typeof requireAdminForClient>[0] {
  return {
    auth: {
      getUser: async () => ({
        data: { user: options.user },
        error: options.authError ?? null,
      }),
    },
    from: (table: string) => {
      assert.equal(table, 'profiles')

      return {
        select: (columns: string) => {
          assert.equal(columns, 'role')

          return {
            eq: (column: string, id: string) => {
              assert.equal(column, 'id')
              assert.equal(id, options.user?.id)

              return {
                single: async () => ({
                  data: options.profile,
                  error: options.profileError ?? null,
                }),
              }
            },
          }
        },
      }
    },
  } as Parameters<typeof requireAdminForClient>[0]
}

const adminUser = { id: 'admin-user', email: 'admin@example.no' } as User
const customerUser = { id: 'customer-user', email: 'kunde@example.no' } as User

test('requireAdminForClient returns 401 when there is no authenticated user', async () => {
  const result = await requireAdminForClient(fakeClient({ user: null, profile: null }))

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.response.status, 401)
    assert.deepEqual(await result.response.json(), { error: 'Ikke autentisert' })
  }
})

test('requireAdminForClient returns 403 for authenticated non-admin users', async () => {
  const result = await requireAdminForClient(
    fakeClient({ user: customerUser, profile: { role: 'customer' } })
  )

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.response.status, 403)
    assert.deepEqual(await result.response.json(), { error: 'Forbidden' })
  }
})

test('requireAdminForClient allows authenticated admin users', async () => {
  const result = await requireAdminForClient(
    fakeClient({ user: adminUser, profile: { role: 'admin' } })
  )

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.user.id, adminUser.id)
  }
})
