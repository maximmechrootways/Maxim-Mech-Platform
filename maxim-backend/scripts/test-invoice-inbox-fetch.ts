import dotenv from 'dotenv'
dotenv.config()

import { fetchUnreadInvoiceCandidateIds, fetchGmailMessageById } from '../src/integrations/composio-invoice/invoiceComposioGmailService'
import { isInvoiceComposioConfigured } from '../src/integrations/composio-invoice/invoiceComposioClient'

async function main() {
    console.log('configured:', isInvoiceComposioConfigured())
    const ids = await fetchUnreadInvoiceCandidateIds(10)
    console.log('candidate ids:', ids)
    if (ids[0]) {
        const msg = await fetchGmailMessageById(ids[0])
        console.log('first message:', {
            messageId: msg.messageId,
            subject: msg.subject,
            from: msg.from,
            attachmentCount: msg.attachments.length,
        })
    }
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
