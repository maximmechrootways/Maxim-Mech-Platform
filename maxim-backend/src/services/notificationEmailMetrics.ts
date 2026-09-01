type MetricName = 'sent' | 'failed' | 'retried' | 'skipped'

const counters: Record<MetricName, number> = {
    sent: 0,
    failed: 0,
    retried: 0,
    skipped: 0,
}

export const notificationEmailMetrics = {
    increment(metric: MetricName) {
        counters[metric] += 1
    },
    snapshot() {
        return { ...counters }
    },
}
