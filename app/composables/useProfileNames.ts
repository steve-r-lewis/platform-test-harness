import type { DisplayName, LookupPurpose } from '@nuxt4-layers/profile/contracts'
import { DISCLOSURE_MAX_SUBJECTS } from '@nuxt4-layers/profile/contracts'

/**
 * Display names from Profile, batched: every name a page asks for in the
 * same tick, for the same group context and purpose, goes in one
 * `/api/profile/display-names` request, so a member list costs one lookup
 * against Profile's rate limit. Answers are cached for the page's life in the
 * browser. Runs in the browser only: Profile's answers depend on the viewer,
 * and must never be shared between requests on the server.
 */
interface Batch { ids: Set<string>, waiters: Map<string, ((name: DisplayName) => void)[]> }

const HIDDEN: DisplayName = { kind: 'hidden' }
const cache = new Map<string, DisplayName>()
const batches = new Map<string, Batch>()

export function useProfileNames() {
  const profile = useProfile()

  async function flush(key: string, groupId: string | null, purpose: LookupPurpose) {
    const batch = batches.get(key)!
    batches.delete(key)
    const ids = [...batch.ids]
    for (let start = 0; start < ids.length; start += DISCLOSURE_MAX_SUBJECTS) {
      const chunk = ids.slice(start, start + DISCLOSURE_MAX_SUBJECTS)
      let answers: { subjectId: string, displayName: DisplayName }[] = []
      try {
        answers = await profile.displayNames(chunk, purpose, groupId)
      } catch {
        // Unavailable or rate-limited: show the neutral fallback, and ask again on the next page.
      }
      const found = new Map(answers.map(answer => [answer.subjectId, answer.displayName]))
      for (const id of chunk) {
        const name = found.get(id) ?? HIDDEN
        if (found.has(id)) cache.set(`${key}|${id}`, name)
        for (const resolve of batch.waiters.get(id) ?? []) resolve(name)
      }
    }
  }

  /** The display name of one identity, as the signed-in viewer may see it. */
  function displayName(identityId: string, groupId: string | null, purpose: LookupPurpose): Promise<DisplayName> {
    const key = `${groupId ?? '-'}|${purpose}`
    const cached = cache.get(`${key}|${identityId}`)
    if (cached) return Promise.resolve(cached)
    let batch = batches.get(key)
    if (!batch) {
      batch = { ids: new Set(), waiters: new Map() }
      batches.set(key, batch)
      setTimeout(() => flush(key, groupId, purpose), 0)
    }
    batch.ids.add(identityId)
    return new Promise((resolve) => {
      batch!.waiters.set(identityId, [...(batch!.waiters.get(identityId) ?? []), resolve])
    })
  }

  return { displayName }
}
