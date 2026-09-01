"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInvoiceComposioClient = getInvoiceComposioClient;
exports.isInvoiceComposioConfigured = isInvoiceComposioConfigured;
exports.resolveInvoiceInboxIdentity = resolveInvoiceInboxIdentity;
const core_1 = require("@composio/core");
const env_1 = require("../../config/env");
const node_dns_1 = __importDefault(require("node:dns"));
let invoiceComposioClient = null;
function getInvoiceComposioClient() {
    if (!env_1.env.COMPOSIO_INVOICE_API_KEY) {
        throw new Error('COMPOSIO_INVOICE_API_KEY is required');
    }
    if (!invoiceComposioClient) {
        if (env_1.env.COMPOSIO_FORCE_IPV4) {
            node_dns_1.default.setDefaultResultOrder('ipv4first');
        }
        invoiceComposioClient = new core_1.Composio({
            apiKey: env_1.env.COMPOSIO_INVOICE_API_KEY,
            toolkitVersions: { gmail: env_1.env.COMPOSIO_INVOICE_GMAIL_TOOLKIT_VERSION },
        });
    }
    return invoiceComposioClient;
}
function isInvoiceComposioConfigured() {
    return Boolean(env_1.env.COMPOSIO_INVOICE_API_KEY
        && env_1.env.COMPOSIO_INVOICE_CONNECTED_ACCOUNT_ID
        && env_1.env.COMPOSIO_INVOICE_USER_ID);
}
function resolveInvoiceInboxIdentity() {
    if (!env_1.env.COMPOSIO_INVOICE_CONNECTED_ACCOUNT_ID || !env_1.env.COMPOSIO_INVOICE_USER_ID) {
        throw new Error('COMPOSIO_INVOICE_CONNECTED_ACCOUNT_ID and COMPOSIO_INVOICE_USER_ID must be configured');
    }
    return {
        connectedAccountId: env_1.env.COMPOSIO_INVOICE_CONNECTED_ACCOUNT_ID,
        composioUserId: env_1.env.COMPOSIO_INVOICE_USER_ID,
    };
}
