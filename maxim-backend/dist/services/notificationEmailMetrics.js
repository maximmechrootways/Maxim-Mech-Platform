"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationEmailMetrics = void 0;
const counters = {
    sent: 0,
    failed: 0,
    retried: 0,
    skipped: 0,
};
exports.notificationEmailMetrics = {
    increment(metric) {
        counters[metric] += 1;
    },
    snapshot() {
        return { ...counters };
    },
};
