// Shared pending-triage count, so the sidebar badge and the /triage page stay
// in sync. The page updates it from its own list fetch and after each action;
// the sidebar seeds it once on mount.
export function useTriageCount() {
  const count = useState('triage-count', () => 0)

  async function refresh() {
    try {
      const r = await $fetch<{ count: number }>('/api/triage/count')
      count.value = r.count
    } catch {
      // Leave the badge as-is on a transient failure rather than flicker to 0.
    }
  }

  return { count, refresh }
}
