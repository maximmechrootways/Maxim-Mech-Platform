"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getComposioClient = getComposioClient;
const core_1 = require("@composio/core");
const env_1 = require("../../config/env");
const node_dns_1 = __importDefault(require("node:dns"));
let composioClient = null;
function getComposioClient() {
    if (!env_1.env.COMPOSIO_API_KEY) {
        throw new Error('COMPOSIO_API_KEY is required');
    }
    if (!composioClient) {
        if (env_1.env.COMPOSIO_FORCE_IPV4) {
            node_dns_1.default.setDefaultResultOrder('ipv4first');
        }
        composioClient = new core_1.Composio({
            apiKey: env_1.env.COMPOSIO_API_KEY,
            toolkitVersions: { gmail: env_1.env.COMPOSIO_GMAIL_TOOLKIT_VERSION },
        });
    }
    return composioClient;
}
