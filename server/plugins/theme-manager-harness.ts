import type {
  JsonValue,
  ThemeActorContext,
  ThemeAuthorizationRequest,
  ThemeDefinition,
  ThemeRepository
} from '@nuxt4-layers/theme-manager/contracts'

const actor: ThemeActorContext = {
  actorId: 'test-user',
  groupIds: ['test-group'],
  organisationIds: ['test-organisation']
}

const state = (value: string) => ({
  default: value,
  hover: value,
  active: value,
  selected: value,
  visited: value,
  disabled: value,
  shadow: '0 4px 14px rgb(0 0 0 / 0.18)'
})

const testTheme: ThemeDefinition = {
  id: 'test-theme',
  name: 'Harness Test Theme',
  description: 'Seeded by the integration harness to exercise Theme Manager runtime application.',
  version: '1.0.0',
  schemaVersion: '1',
  ownership: {
    ownerType: 'user',
    ownerId: actor.actorId!
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

const authorization = {
  async isAllowed(request: ThemeAuthorizationRequest) {
    return request.actor.actorId === actor.actorId
  }
}

export default defineNitroPlugin(() => {
  provideThemeRepository({
    getThemeRepository: () => repository
  })

  provideThemeActorContext({
    getActorContext: async () => actor
  })

  provideThemeAuthorization(authorization)
})
