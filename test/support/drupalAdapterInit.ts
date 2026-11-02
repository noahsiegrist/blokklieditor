// No import of 'vue' here: the specs mock it with a factory that imports this
// file, which would deadlock.

export const GRAPHQL_DELAY_MS = 100

export type GraphqlCall = {
  name: string
  startedAt: number
  finishedAt: number | null
}

const responses: Record<string, unknown> = {
  pbConfig: {
    data: {
      clipboards: [],
      currentUser: null,
      features: [],
      allTypes: [
        {
          id: 'text',
          label: 'Text',
          description: null,
          allowReusable: true,
          isTranslatable: true,
          permissions: [],
        },
      ],
      fieldConfig: [],
      editableFieldConfig: [],
      droppableFieldConfig: [],
      urlPrefixes: [],
      entityTypeConfig: [],
    },
  },
  pbEntityConfig: { data: { config: { linkPath: '/node/1' } } },
}

let calls: GraphqlCall[] = []

/**
 * Stand-ins for the Nuxt auto-imports of the adapter: every GraphQL query
 * answers after GRAPHQL_DELAY_MS.
 */
export const graphqlMocks = {
  useGraphqlQuery: (name: string) => {
    const call: GraphqlCall = { name, startedAt: Date.now(), finishedAt: null }
    calls.push(call)
    return new Promise((resolve) => {
      setTimeout(() => {
        call.finishedAt = Date.now()
        resolve(responses[name])
      }, GRAPHQL_DELAY_MS)
    })
  },
  useGraphqlMutation: () => Promise.reject(new Error('not mocked')),
  useRoute: () => ({}),
  useRouter: () => ({}),
}

export async function createAdapterInitHarness() {
  const { default: factory } =
    await import('../../src/modules/drupal/runtime/adapter/index')
  calls = []
  const start = Date.now()
  const context = {
    value: {
      entityType: 'node',
      entityBundle: 'page',
      entityUuid: 'uuid-1',
      language: 'en',
    },
  }
  return {
    calls,
    init: () => factory(context as never),
    elapsed: () => Date.now() - start,
  }
}
