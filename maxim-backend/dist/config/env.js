"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
exports.getPublicAppUrl = getPublicAppUrl;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.env = {
    COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY || '',
    COMPOSIO_GMAIL_AUTH_CONFIG_ID: process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID || '',
    COMPOSIO_WEBHOOK_SECRET: process.env.COMPOSIO_WEBHOOK_SECRET || '',
    COMPOSIO_WEBHOOK_TOLERANCE_SECONDS: Number(process.env.COMPOSIO_WEBHOOK_TOLERANCE_SECONDS || 300),
    COMPOSIO_CALLBACK_URL: process.env.COMPOSIO_CALLBACK_URL || '',
    COMPOSIO_SENDER_USER_ID: process.env.COMPOSIO_SENDER_USER_ID || '',
    COMPOSIO_SENDER_CONNECTED_ACCOUNT_ID: process.env.COMPOSIO_SENDER_CONNECTED_ACCOUNT_ID || '',
    COMPOSIO_GMAIL_TOOLKIT_VERSION: process.env.COMPOSIO_GMAIL_TOOLKIT_VERSION || '20260316_00',
    COMPOSIO_FORCE_IPV4: process.env.COMPOSIO_FORCE_IPV4 !== 'false',
    EMAIL_FROM: process.env.EMAIL_FROM || '',
    NOTIFICATION_EMAIL_ENABLED: process.env.NOTIFICATION_EMAIL_ENABLED !== 'false',
    NOTIFICATION_EMAIL_POLL_INTERVAL_MS: Number(process.env.NOTIFICATION_EMAIL_POLL_INTERVAL_MS || 3000),
    NOTIFICATION_EMAIL_LOCK_TTL_MS: Number(process.env.NOTIFICATION_EMAIL_LOCK_TTL_MS || 120000),
    NOTIFICATION_EMAIL_MAX_ATTEMPTS: Number(process.env.NOTIFICATION_EMAIL_MAX_ATTEMPTS || 5),
    NOTIFICATION_EMAIL_BACKOFF_BASE_MS: Number(process.env.NOTIFICATION_EMAIL_BACKOFF_BASE_MS || 2000),
    // Isolated Composio project for accounting@maximmech.com invoice inbox (separate from notification sender).
    COMPOSIO_INVOICE_API_KEY: process.env.COMPOSIO_INVOICE_API_KEY || '',
    COMPOSIO_INVOICE_GMAIL_AUTH_CONFIG_ID: process.env.COMPOSIO_INVOICE_GMAIL_AUTH_CONFIG_ID || '',
    COMPOSIO_INVOICE_CONNECTED_ACCOUNT_ID: process.env.COMPOSIO_INVOICE_CONNECTED_ACCOUNT_ID || '',
    COMPOSIO_INVOICE_USER_ID: process.env.COMPOSIO_INVOICE_USER_ID || 'maxim-invoice-inbox',
    COMPOSIO_INVOICE_WEBHOOK_SECRET: process.env.COMPOSIO_INVOICE_WEBHOOK_SECRET || '',
    COMPOSIO_INVOICE_GMAIL_TOOLKIT_VERSION: process.env.COMPOSIO_INVOICE_GMAIL_TOOLKIT_VERSION || process.env.COMPOSIO_GMAIL_TOOLKIT_VERSION || '20260316_00',
    COMPOSIO_INVOICE_PROCESSED_LABEL: process.env.COMPOSIO_INVOICE_PROCESSED_LABEL || 'Maxim/Processed',
    COMPOSIO_INVOICE_OUTGOING_PROCESSED_LABEL: process.env.COMPOSIO_INVOICE_OUTGOING_PROCESSED_LABEL || 'Maxim/OutgoingProcessed',
    COMPOSIO_INVOICE_OUTGOING_SENDER: process.env.COMPOSIO_INVOICE_OUTGOING_SENDER || 'accounting@maximmech.com',
    COMPOSIO_INVOICE_ENABLED: process.env.COMPOSIO_INVOICE_ENABLED !== 'false',
    INCOMING_INVOICE_POLL_INTERVAL_MS: Number(process.env.INCOMING_INVOICE_POLL_INTERVAL_MS || 5000),
    INCOMING_INVOICE_LOCK_TTL_MS: Number(process.env.INCOMING_INVOICE_LOCK_TTL_MS || 300000),
    INCOMING_INVOICE_MAX_ATTEMPTS: Number(process.env.INCOMING_INVOICE_MAX_ATTEMPTS || 5),
    INCOMING_INVOICE_BACKOFF_BASE_MS: Number(process.env.INCOMING_INVOICE_BACKOFF_BASE_MS || 5000),
    INCOMING_INVOICE_SYNC_POLL_MS: Number(process.env.INCOMING_INVOICE_SYNC_POLL_MS || 300000),
    OUTGOING_INVOICE_POLL_INTERVAL_MS: Number(process.env.OUTGOING_INVOICE_POLL_INTERVAL_MS || 5000),
    OUTGOING_INVOICE_LOCK_TTL_MS: Number(process.env.OUTGOING_INVOICE_LOCK_TTL_MS || 300000),
    OUTGOING_INVOICE_MAX_ATTEMPTS: Number(process.env.OUTGOING_INVOICE_MAX_ATTEMPTS || 5),
    OUTGOING_INVOICE_BACKOFF_BASE_MS: Number(process.env.OUTGOING_INVOICE_BACKOFF_BASE_MS || 5000),
    OUTGOING_INVOICE_SYNC_POLL_MS: Number(process.env.OUTGOING_INVOICE_SYNC_POLL_MS || 300000),
    OUTGOING_INVOICE_REMINDER_INTERVAL_MS: Number(process.env.OUTGOING_INVOICE_REMINDER_INTERVAL_MS || 86400000),
    OUTGOING_INVOICE_REMINDER_RECIPIENTS: process.env.OUTGOING_INVOICE_REMINDER_RECIPIENTS || '',
    FRONTEND_URL: process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:5173',
    /** Public site URL for links in outbound emails (defaults to production when FRONTEND_URL is local). */
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || '',
};
const DEFAULT_PUBLIC_APP_URL = 'https://maximmech.com';
function normalizeAppOrigin(url) {
    return url.replace(/\/$/, '');
}
function isLocalAppUrl(url) {
    return /localhost|127\.0\.0\.1/i.test(url);
}
/** App origin for user-facing email links — never localhost when emailing real users. */
function getPublicAppUrl() {
    const explicit = exports.env.PUBLIC_APP_URL.trim();
    if (explicit)
        return normalizeAppOrigin(explicit);
    const frontend = normalizeAppOrigin(exports.env.FRONTEND_URL);
    if (frontend && !isLocalAppUrl(frontend))
        return frontend;
    return DEFAULT_PUBLIC_APP_URL;
}
