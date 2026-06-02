import ConfirmDialog from '~/components/ConfirmDialog.vue'

export interface ConfirmOptions {
  /** Dialog heading. Defaults to a generic "Delete?" prompt. */
  title?: string
  /** Body copy. Defaults to "This can't be undone." */
  description?: string
  /** Label for the confirming action. Defaults to "Delete". */
  confirmLabel?: string
  /** Label for the dismissing action. Defaults to "Cancel". */
  cancelLabel?: string
}

/**
 * Promise-based confirmation prompt. Resolves `true` when the user confirms
 * and `false` when they cancel or dismiss the dialog, so call sites read as:
 *
 *   if (!(await confirm())) return
 *   await $fetch(...)
 */
export function useConfirm() {
  const overlay = useOverlay()
  return (options: ConfirmOptions = {}): Promise<boolean> => {
    const instance = overlay.create(ConfirmDialog, { props: options, destroyOnClose: true })
    return instance.open().result.then((value) => value === true)
  }
}
