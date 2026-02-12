/**
 * Metrics Collection Service
 * 
 * 검색 및 임베딩 성능 메트릭 수집
 * - 응답 시간
 * - 에러율
 * - 검색 모드 분포
 */

// 메트릭 저장소 (메모리 기반, 프로덕션에서는 Redis/TimescaleDB 권장)
interface MetricEntry {
    timestamp: number;
    value: number;
    labels: Record<string, string>;
}

interface MetricsStore {
    embedding_duration: MetricEntry[];
    embedding_errors: MetricEntry[];
    search_duration: MetricEntry[];
    search_mode: MetricEntry[];
    fallback_triggered: MetricEntry[];
    // Review Queue Metrics
    review_fixes: MetricEntry[];
    confidence_trend: MetricEntry[];
}

const metricsStore: MetricsStore = {
    embedding_duration: [],
    embedding_errors: [],
    search_duration: [],
    search_mode: [],
    fallback_triggered: [],
    review_fixes: [],
    confidence_trend: [],
};

// 메트릭 보존 기간 (1시간)
const RETENTION_MS = 60 * 60 * 1000;

/**
 * 오래된 메트릭 정리
 */
function cleanupOldMetrics(): void {
    const cutoff = Date.now() - RETENTION_MS;

    for (const key of Object.keys(metricsStore) as (keyof MetricsStore)[]) {
        metricsStore[key] = metricsStore[key].filter(m => m.timestamp > cutoff);
    }
}

/**
 * 메트릭 기록
 */
export function recordMetric(
    name: keyof MetricsStore,
    value: number,
    labels: Record<string, string> = {}
): void {
    metricsStore[name].push({
        timestamp: Date.now(),
        value,
        labels,
    });

    // 100개마다 정리
    if (metricsStore[name].length % 100 === 0) {
        cleanupOldMetrics();
    }
}

/**
 * 임베딩 메트릭 기록
 */
export function recordEmbeddingMetrics(
    duration: number,
    success: boolean,
    attempt: number
): void {
    recordMetric('embedding_duration', duration, { attempt: String(attempt) });

    if (!success) {
        recordMetric('embedding_errors', 1, { attempt: String(attempt) });
    }
}

/**
 * 검색 메트릭 기록
 */
export function recordSearchMetrics(
    duration: number,
    mode: 'ai_semantic' | 'keyword' | 'fallback_text',
    _resultCount: number
): void {
    recordMetric('search_duration', duration, { mode });
    recordMetric('search_mode', 1, { mode });

    if (mode === 'fallback_text') {
        recordMetric('fallback_triggered', 1, {});
    }
}

/**
 * 리뷰 메트릭 기록 (사람의 수정 발생 시)
 */
export function recordReviewMetric(
    field: string,
    confidenceBefore: number,
    wasChanged: boolean
): void {
    if (wasChanged) {
        recordMetric('review_fixes', 1, { field });
    }
    recordMetric('confidence_trend', confidenceBefore, { field, wasChanged: String(wasChanged) });
}

/**
 * 메트릭 통계 계산
 */
export function getMetricStats(name: keyof MetricsStore, windowMs: number = 300000): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
} {
    const cutoff = Date.now() - windowMs;
    const values = metricsStore[name]
        .filter(m => m.timestamp > cutoff)
        .map(m => m.value)
        .sort((a, b) => a - b);

    if (values.length === 0) {
        return { count: 0, sum: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;

    return {
        count: values.length,
        sum,
        avg: Math.round(avg * 100) / 100,
        min: values[0],
        max: values[values.length - 1],
        p50: values[Math.floor(values.length * 0.5)],
        p95: values[Math.floor(values.length * 0.95)],
        p99: values[Math.floor(values.length * 0.99)],
    };
}

/**
 * 라벨별 카운트 집계
 */
export function getMetricCountByLabel(
    name: keyof MetricsStore,
    labelKey: string,
    windowMs: number = 300000
): Record<string, number> {
    const cutoff = Date.now() - windowMs;
    const counts: Record<string, number> = {};

    for (const entry of metricsStore[name]) {
        if (entry.timestamp > cutoff) {
            const label = entry.labels[labelKey] || 'unknown';
            counts[label] = (counts[label] || 0) + 1;
        }
    }

    return counts;
}

/**
 * 전체 메트릭 요약 (Health Check / Dashboard용)
 */
export function getMetricsSummary(windowMs: number = 300000): {
    embedding: {
        duration: ReturnType<typeof getMetricStats>;
        errorCount: number;
        errorRate: number;
    };
    search: {
        duration: ReturnType<typeof getMetricStats>;
        modeDistribution: Record<string, number>;
        fallbackCount: number;
    };
} {
    const embeddingDuration = getMetricStats('embedding_duration', windowMs);
    const embeddingErrors = getMetricStats('embedding_errors', windowMs);
    const searchDuration = getMetricStats('search_duration', windowMs);
    const searchModes = getMetricCountByLabel('search_mode', 'mode', windowMs);
    const fallbackStats = getMetricStats('fallback_triggered', windowMs);

    const totalEmbeddings = embeddingDuration.count;
    const errorRate = totalEmbeddings > 0
        ? Math.round((embeddingErrors.count / totalEmbeddings) * 10000) / 100
        : 0;

    return {
        embedding: {
            duration: embeddingDuration,
            errorCount: embeddingErrors.count,
            errorRate,
        },
        search: {
            duration: searchDuration,
            modeDistribution: searchModes,
            fallbackCount: fallbackStats.count,
        },
    };
}

/**
 * 메트릭 리셋 (테스트용)
 */
export function resetMetrics(): void {
    for (const key of Object.keys(metricsStore) as (keyof MetricsStore)[]) {
        metricsStore[key] = [];
    }
}
