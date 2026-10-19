import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

let transport: Transporter | null | undefined

/** The sender of every message the harness delivers. */
const FROM = 'Platform Test Harness <harness@localhost>'

export interface HarnessMail {
  to: string
  subject: string
  text: string
}

/**
 * The harness's one mail transport, from HARNESS_SMTP_URL: Mailpit from
 * compose.yaml (`smtp://localhost:1025`) on a developer's machine, so every
 * message can be read at http://localhost:8025 and none leaves it. Null
 * without it, or when it is `off`: messages are then only recorded (in test
 * mode) and logged.
 */
export function harnessMailTransport(): Transporter | null {
  if (transport === undefined) {
    const url = process.env.HARNESS_SMTP_URL
    transport = url && url !== 'off' ? nodemailer.createTransport(url) : null
  }
  return transport
}

/**
 * Sends one message through the transport, when there is one. Messages carry
 * single-use links and codes, so neither the message nor the error is logged:
 * only its code. In test mode the recorder is the delivery the tests read, so a
 * failed send only warns; otherwise it fails, as a real mailer would.
 */
export async function sendHarnessMail(mail: HarnessMail): Promise<void> {
  const smtp = harnessMailTransport()
  if (!smtp) return
  // The error itself stays here: it may name the recipient.
  const code = await smtp.sendMail({ from: FROM, ...mail }).then(
    () => null,
    (error: { code?: unknown }) => String(error.code ?? 'unknown')
  )
  if (code === null) return
  if (process.env.HARNESS_TEST_MODE === '1') {
    console.warn(`[harness mailer] not sent (${code}): is Mailpit running? (docker compose up -d)`)
    return
  }
  throw new Error(`harness mailer: not sent (${code})`)
}
