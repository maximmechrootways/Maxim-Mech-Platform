import { Composio } from '@composio/core'
import { env } from '../../config/env'
import dns from 'node:dns'

let composioClient: Composio | null = null

export function getComposioClient() {
    if (!env.COMPOSIO_API_KEY) {
        throw new Error('COMPOSIO_API_KEY is required')
    }
    if (!composioClient) {
        if (env.COMPOSIO_FORCE_IPV4) {
            dns.setDefaultResultOrder('ipv4first')
        }
        composioClient = new Composio({
            apiKey: env.COMPOSIO_API_KEY,
            toolkitVersions: { gmail: env.COMPOSIO_GMAIL_TOOLKIT_VERSION },
        })
    }
    return composioClient
}
