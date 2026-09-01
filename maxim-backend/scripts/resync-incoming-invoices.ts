import dotenv from 'dotenv'
dotenv.config()
import { prisma } from '../src/lib/prisma'
import {
    pollUnreadInvoiceEmails,
    processIncomingInvoiceQueue,
    getIncomingInvoicePipelineStatus,
} from '../src/services/incomingInvoiceIngestionService'
import { isInvoiceComposioConfigured } from '../src/integrations/composio-invoice/invoiceComposioClient'

async function main() {
    if (!isInvoiceComposioConfigured()) {
        console.error('Composio invoice integration is not configured — cannot sync inbox.')
        process.exitCode = 1
        return
    }
    const retryFailed = process.argv.includes('--retry-failed')
    if (retryFailed) {
        const reset = await prisma.incomingInvoiceIngestionJob.updateMany({
            where: { status: { in: ['FAILED', 'RETRYING'] } },
            data: { status: 'PENDING', nextAttemptAt: new Date(), processingLockedAt: null, lastErrorMessage: null },
        })
        console.log(`reset ${reset.count} failed/retrying job(s) to pending`)
    }

    console.log('Polling inbox for unread invoice emails…')
    const poll = await pollUnreadInvoiceEmails()
    console.log('poll:', poll)

    console.log('Processing ingestion queue…')
    const processed = await processIncomingInvoiceQueue(25)
    console.log('processed:', processed)

    const status = await getIncomingInvoicePipelineStatus()
    console.log('pipeline status:', status)
}

main()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
