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

const values = new Map<string, JsonValue>([
  [testTheme.id, JSON.parse(JSON.stringify(testTheme)) as JsonValue]
])

const repository: ThemeRepository = {
  async findById(id) {
    return values.get(id) ?? null
  },
  async list() {
    return [...values.values()]
  },
  async save(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('Harness repository expected a serialized Theme Definition object.')
    }

    const id = value.id
    if (typeof id !== 'string' || !id) {
      throw new TypeError('Harness repository expected a Theme Definition id.')
    }

    values.set(id, value)
  },
  async delete(id) {
    values.delete(id)
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
  provideThemeRepository({
    getThemeRepository: () => repository
  })

  provideThemeActorContext({
    getActorContext: actorForCurrentRequest
  })

  provideThemeAuthorization(authorization)
})
