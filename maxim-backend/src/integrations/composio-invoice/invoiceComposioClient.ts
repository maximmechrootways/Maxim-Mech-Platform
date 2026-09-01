import { Composio } from '@composio/core'
import { env } from '../../config/env'
import dns from 'node:dns'

let invoiceComposioClient: Composio | null = null

export function getInvoiceComposioClient() {
    if (!env.COMPOSIO_INVOICE_API_KEY) {
        throw new Error('COMPOSIO_INVOICE_API_KEY is required')
    }
    if (!invoiceComposioClient) {
        if (env.COMPOSIO_FORCE_IPV4) {
            dns.setDefaultResultOrder('ipv4first')
        }
        invoiceComposioClient = new Composio({
            apiKey: env.COMPOSIO_INVOICE_API_KEY,
            toolkitVersions: { gmail: env.COMPOSIO_INVOICE_GMAIL_TOOLKIT_VERSION },
        })
    }
    return invoiceComposioClient
}

export function isInvoiceComposioConfigured() {
    return Boolean(
        env.COMPOSIO_INVOICE_API_KEY
        && env.COMPOSIO_INVOICE_CONNECTED_ACCOUNT_ID
        && env.COMPOSIO_INVOICE_USER_ID,
    )
}

export function resolveInvoiceInboxIdentity() {
    if (!env.COMPOSIO_INVOICE_CONNECTED_ACCOUNT_ID || !env.COMPOSIO_INVOICE_USER_ID) {
        throw new Error('COMPOSIO_INVOICE_CONNECTED_ACCOUNT_ID and COMPOSIO_INVOICE_USER_ID must be configured')
    }
    return {
        connectedAccountId: env.COMPOSIO_INVOICE_CONNECTED_ACCOUNT_ID,
        composioUserId: env.COMPOSIO_INVOICE_USER_ID,
    }
}
