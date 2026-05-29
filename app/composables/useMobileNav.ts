// Shared open-state for the mobile sidebar drawer. The hamburger button in
// AppTopbar toggles it; AppSidebar reads it for its slide-in class; the
// layout's backdrop closes it on click.

const isOpen = ref(false)

export function useMobileNav() {
  const route = useRoute()

  // Auto-close when navigating, so tapping a nav link slides the drawer away.
  watch(() => route.fullPath, () => {
    if (isOpen.value) isOpen.value = false
  })

  return {
    isOpen,
    open() { isOpen.value = true },
    close() { isOpen.value = false },
    toggle() { isOpen.value = !isOpen.value }
  }
}
