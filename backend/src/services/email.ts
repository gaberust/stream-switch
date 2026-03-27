import nodemailer from 'nodemailer'

function createTransport() {
  if (!process.env.SMTP_HOST) return null
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })
}

export function isSmtpConfigured(): boolean {
  return !!process.env.SMTP_HOST
}

const appUrl = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const from = () => process.env.SMTP_FROM ?? 'noreply@streamswitch.local'

export async function sendPasswordReset(to: string, token: string): Promise<void> {
  const transport = createTransport()
  if (!transport) throw new Error('SMTP not configured')
  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`
  await transport.sendMail({
    from: from(),
    to,
    subject: 'Reset your Stream Switch password',
    text: `Click the link below to reset your password:\n\n${link}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.`,
    html: `<p>Click the link below to reset your password:</p><p><a href="${link}">${link}</a></p><p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>`,
  })
}

export async function sendInvite(to: string, username: string, token: string): Promise<void> {
  const transport = createTransport()
  if (!transport) throw new Error('SMTP not configured')
  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`
  await transport.sendMail({
    from: from(),
    to,
    subject: "You've been invited to Stream Switch",
    text: `Hello ${username},\n\nYou've been invited to Stream Switch. Click the link below to set your password and activate your account:\n\n${link}\n\nThis link expires in 7 days.`,
    html: `<p>Hello ${username},</p><p>You've been invited to Stream Switch. Click the link below to set your password and activate your account:</p><p><a href="${link}">${link}</a></p><p>This link expires in 7 days.</p>`,
  })
}
