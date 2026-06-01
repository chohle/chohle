// Dev-only smoke test: sends one message so we can confirm it lands in Mailpit.
export default defineEventHandler(async () => {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const info = await getMailer().sendMail({
    from: 'chohle <no-reply@chohle.local>',
    to: 'owner@chohle.local',
    subject: 'Mailpit test from chohle',
    text: 'If you can read this in Mailpit, the SMTP pipe works.'
  })

  return { messageId: info.messageId, accepted: info.accepted }
})
