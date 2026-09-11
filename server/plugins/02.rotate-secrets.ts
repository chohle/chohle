// Key rotation pass. Only does anything while CHOHLE_SECRET_PREVIOUS is set:
// every stored secret still encrypted with a previous key (or in the legacy
// unversioned format) is rewritten with the current CHOHLE_SECRET. Normal
// boots without a previous key never touch the secrets. Runs after the
// migrations (00) and before the mail (03) and bank (04) sync workers.
import { hasPreviousSecret, secretIsAvailable } from '~~/server/utils/secrets'
import { rotateStoredSecrets } from '~~/server/utils/secretRotation'

export default defineNitroPlugin(() => {
  if (isDemo()) return
  if (!hasPreviousSecret()) return
  if (!secretIsAvailable()) {
    console.error(
      '[secrets] CHOHLE_SECRET_PREVIOUS is set but CHOHLE_SECRET is missing or too short'
    )
    return
  }

  const { checked, rotated, failed } = rotateStoredSecrets(useDb())
  console.log(`[secrets] key rotation: re-encrypted ${rotated} of ${checked} stored secret(s)`)
  if (failed) {
    console.error(
      `[secrets] ${failed} stored secret(s) match neither CHOHLE_SECRET nor CHOHLE_SECRET_PREVIOUS. Reconnect the affected mailboxes or bank connections.`
    )
  } else {
    console.log(
      '[secrets] every stored secret now uses the current CHOHLE_SECRET, you can remove CHOHLE_SECRET_PREVIOUS'
    )
  }
})
