function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

export function buildNotificationEmail(input: {
    title: string
    message: string
    ctaUrl?: string
}) {
    const subject = `New notification: ${input.title}`
    const text = `${input.message}\n\nPlease check your account for full details.`
    const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>${escapeHtml(input.title)}</h2>
      <p>${escapeHtml(input.message)}</p>
      <p>Please check your account for full details.</p>
    </div>
  `
    return { subject, text, html }
}
