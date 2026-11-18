/** Download recovery codes as a plain-text file (GitHub-style). */
export function downloadRecoveryCodes(codes: string[], email?: string) {
  const header = [
    'Maxim Mechanical — Two-factor recovery codes',
    email ? `Account: ${email}` : null,
    `Generated: ${new Date().toISOString()}`,
    '',
    'Keep these codes in a safe place. Each code can be used once.',
    'Do not share them. They will not be emailed to you.',
    '',
  ]
    .filter(Boolean)
    .join('\n')
  const body = codes.map((c) => c).join('\n')
  const blob = new Blob([`${header}\n${body}\n`], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'maxim-2fa-recovery-codes.txt'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const PENDING_2FA_TOKEN_KEY = 'mm_2fa_pending_token'
export const PENDING_2FA_PURPOSE_KEY = 'mm_2fa_pending_purpose'
