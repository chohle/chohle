// Warns before SPA navigation and tab close/reload while a form has
// unsaved edits. `confirmLeave` decides if SPA nav may continue; tab
// close goes through the browser's native beforeunload (custom message
// is ignored by modern browsers).
export function useDirtyGuard(isDirty: () => boolean, confirmLeave: () => Promise<boolean>) {
  if (import.meta.client) {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty()) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    onScopeDispose(() => window.removeEventListener('beforeunload', onBeforeUnload))
  }

  onBeforeRouteLeave(async () => {
    if (!isDirty()) return true
    return await confirmLeave()
  })
}
