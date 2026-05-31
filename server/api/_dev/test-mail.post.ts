// Dev-only smoke test: sends one message so we can confirm it lands in Mailpit.
export default defineEventHandler(async () => {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const info = await getMailer().sendMail({
    from: 'batze <no-reply@batze.local>',
    to: 'owner@batze.local',
    subject: 'Mailpit test from batze',
    text: 'If you can read this in Mailpit, the SMTP pipe works.'
  })

  return { messageId: info.messageId, accepted: info.accepted }
})
