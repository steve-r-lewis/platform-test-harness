import type pg from 'pg'
import {
  completeThemeVocabulary
} from '@nuxt4-layers/theme-manager/contracts'
import type {
  JsonValue,
  ThemeActorContext,
  ThemeAuthorizationRequest,
  ThemeDefinition,
  ThemeRepository
} from '@nuxt4-layers/theme-manager/contracts'

// The seeded Theme's owner. Signed-in actors are principal ids from Authentication.
const seedOwnerId = 'test-user'

const anonymous: ThemeActorContext = { actorId: null, groupIds: [], organisationIds: [] }

const state = (value: string) => ({
  default: value,
  hover: value,
  active: value,
  selected: value,
  visited: value,
  disabled: value,
  shadow: '0 4px 14px rgb(0 0 0 / 0.18)'
})

const sparseTestTheme: ThemeDefinition = {
  id: 'test-theme',
  name: 'Harness Test Theme',
  description: 'Seeded by the integration harness to exercise Theme Manager runtime application.',
  version: '1.0.0',
  schemaVersion: '1',
  ownership: {
    ownerType: 'user',
    ownerId: seedOwnerId
  },
  visibility: 'private',
  lifecycle: 'draft',
  presentation: {
    colour: {},
    typography: {},
    spacing: {},
    radii: {},
    effects: {},
    responsive: {},
    assets: {}
  },
  modes: {
    light: {
      'fill-primary': state('#7c3aed'),
      'pen-primary': state('#ffffff')
    },
    dark: {
      'fill-primary': state('#a78bfa'),
      'pen-primary': state('#1e1b4b')
    }
  }
}

const testTheme = completeThemeVocabulary(sparseTestTheme)

/**
 * Theme storage adapter (harness-only): one JSONB row per Theme in the same
 * disposable database as Authentication. The table is created on first use and
 * the seeded Theme inserted if absent. Theme Manager validates every value it
 * reads, so the adapter stores and returns JSON only.
 */
function postgresThemeRepository(pool: pg.Pool): ThemeRepository {
  const ready = (async () => {
    await pool.query('create table if not exists harness_themes (id text primary key, value jsonb not null)')
    await pool.query('insert into harness_themes (id, value) values ($1, $2) on conflict (id) do nothing', [testTheme.id, JSON.stringify(testTheme)])
  })()

  return {
    async findById(id) {
      await ready
      const { rows } = await pool.query<{ value: JsonValue }>('select value from harness_themes where id = $1', [id])
      return rows[0]?.value ?? null
    },
    async list() {
      await ready
      const { rows } = await pool.query<{ value: JsonValue }>('select value from harness_themes order by id')
      return rows.map(row => row.value)
    },
    async save(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.id !== 'string' || !value.id) {
        throw new TypeError('Harness repository expected a serialized Theme Definition object with an id.')
      }
      await ready
      await pool.query('insert into harness_themes (id, value) values ($1, $2) on conflict (id) do update set value = excluded.value', [value.id, JSON.stringify(value)])
    },
    async delete(id) {
      await ready
      await pool.query('delete from harness_themes where id = $1', [id])
    }
  }
}

/**
 * Identity adapter (harness-only): Authentication publishes who has signed in;
 * Theme Manager receives an opaque actor. A principal below the required
 * assurance level (for example password only, before the second factor) is
 * anonymous here. No groups or organisations until an Identity layer exists.
 */
async function actorForCurrentRequest(): Promise<ThemeActorContext> {
  let event
  try {
    event = useEvent()
  } catch {
    return anonymous // outside a request: fail closed
  }
  try {
    // Throws 401 when signed out and 403 below the policy's required level.
    const principal = await requireAuthenticatedPrincipal(event)
    return { actorId: principal.principalId, groupIds: [], organisationIds: [] }
  } catch {
    return anonymous
  }
}

/**
 * Interim Authorization adapter until an Authorization layer is composed:
 * anyone may read and use Themes; only signed-in actors may change them.
 */
const anonymousActions = new Set(['theme.read', 'theme.use'])
const authorization = {
  async isAllowed(request: ThemeAuthorizationRequest) {
    if (request.actor.actorId) return true
    return anonymousActions.has(request.action)
  }
}

export default defineNitroPlugin(() => {
  // Without a database Theme Manager runs stand-alone: the built-in default Theme
  // applies and nothing can be created or edited.
  const pool = harnessDatabase()
  if (pool) {
    const repository = postgresThemeRepository(pool)
    provideThemeRepository({
      getThemeRepository: () => repository
    })
  }

  provideThemeActorContext({
    getActorContext: actorForCurrentRequest
  })

  provideThemeAuthorization(authorization)
})
