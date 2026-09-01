import dotenv from 'dotenv'
dotenv.config()
import { prisma } from '../src/lib/prisma'
import { pollUnreadInvoiceEmails } from '../src/services/incomingInvoiceIngestionService'
import { isInvoiceComposioConfigured } from '../src/integrations/composio-invoice/invoiceComposioClient'

async function main() {
    console.log('composio configured:', isInvoiceComposioConfigured())
    console.log('anthropic set:', Boolean(process.env.ANTHROPIC_API_KEY))
    console.log('azure ocr set:', Boolean(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY))
    const poll = await pollUnreadInvoiceEmails()
    console.log('poll result:', poll)
    const jobs = await prisma.incomingInvoiceIngestionJob.findMany({ orderBy: { createdAt: 'desc' }, take: 5 })
    console.log('jobs:', jobs)
    const invoices = await prisma.incomingInvoice.findMany({ orderBy: { createdAt: 'desc' }, take: 5 })
    console.log('invoices:', invoices)
}

main().finally(() => prisma.$disconnect())
