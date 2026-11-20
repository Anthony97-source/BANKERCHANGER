# Observability Guide

BANKERCHANGER exports Prometheus metrics, structured logs, and Sentry error tracking for production monitoring.

## Prometheus Metrics

All metrics are exported via `GET /metrics` in Prometheus exposition format. This endpoint is internal-only and should not be exposed publicly.

### HTTP Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Duration of HTTP requests in seconds |
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Total number of HTTP requests |

**Histogram buckets:** 10ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s

### Database Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `db_query_duration_seconds` | Histogram | `operation` | Duration of database queries in seconds |

**Labels:** `operation` = `select`, `insert`, `update`, `delete`

**Histogram buckets:** 1ms, 5ms, 10ms, 50ms, 100ms, 500ms, 1s, 5s

### Cache Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `cache_hits_total` | Counter | — | Total Redis cache hits |
| `cache_misses_total` | Counter | — | Total Redis cache misses |

**Cache hit rate:** `rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))`

### WebSocket Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `websocket_active_connections` | Gauge | — | Currently active WebSocket connections |

### Cron Job Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `cron_sessions_deleted_total` | Counter | — | Expired user sessions deleted by cleanup cron |
| `cron_reset_tokens_deleted_total` | Counter | — | Expired password reset tokens deleted |
| `cron_notifications_soft_deleted_total` | Counter | — | Notification jobs soft-deleted |
| `cron_distributions_archived_total` | Counter | — | Failed distributions archived |

### Node.js Default Metrics

Default `prom-client` metrics are also collected, including:

- `nodejs_eventloop_lag_seconds` — Event loop lag
- `nodejs_active_handles_total` — Active handles
- `nodejs_heap_size_total_bytes` — Heap memory usage
- `process_cpu_seconds_total` — CPU usage

## Prometheus Scrape Configuration

```yaml
scrape_configs:
  - job_name: 'bankerchanger'
    scrape_interval: 15s
    static_configs:
      - targets: ['backend:3001']
    metrics_path: /metrics
```

## Structured Logging

BANKERCHANGER uses [Pino](https://getpino.io/) for structured JSON logging.

**Log levels:** `trace`, `debug`, `info`, `warn`, `error`, `fatal`

**Log fields per request:**

- `req.method` — HTTP method
- `req.url` — Request URL
- `res.statusCode` — Response status
- `responseTime` — Request duration in ms

## Error Tracking

[Sentry](https://sentry.io/) is used for unhandled exception and rejection tracking.

**Configuration:** Set `SENTRY_DSN` in environment variables. Sentry is initialized on startup and captures:

- Unhandled promise rejections
- Uncaught exceptions
- Errors passed to `next(err)` in Express

## Alerting Recommendations

| Alert | PromQL | Threshold |
|-------|--------|-----------|
| High error rate | `rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m])` | > 5% |
| Slow requests | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))` | > 2s |
| Low cache hit rate | `rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))` | < 50% |
| DB query latency | `histogram_quantile(0.95, rate(db_query_duration_seconds_bucket[5m]))` | > 500ms |
| WebSocket overload | `websocket_active_connections` | > 1000 |
| Indexer queue overflow | `indexer_queue_depth` | > 8000 for 60s |
| Indexer ledger lag | `indexer_ledger_lag` | > 1000 for 5m |

### Indexer Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `indexer_queue_overflow_total` | Counter | — | Total events dropped due to WebSocket event broadcast queue overflow |
| `indexer_queue_depth` | Gauge | — | Current queued events awaiting broadcast in indexer |
| `indexer_ledger_lag` | Gauge | — | Difference between latest network ledger and last processed ledger |
| `indexer_db_pool_size` | Gauge | — | Total PostgreSQL connections in indexer connection pool |
| `indexer_db_pool_idle` | Gauge | — | Idle PostgreSQL connections in indexer connection pool |

## Grafana Dashboard

A ready-to-import Grafana dashboard is provided below. It uses the `bankerchanger` Prometheus job (see [Prometheus Scrape Configuration](#prometheus-scrape-configuration)) and the metrics documented above.

**Panels:**

- Request rate — `sum(rate(http_requests_total{job="bankerchanger"}[5m]))`
- Latency p50/p95/p99 — `histogram_quantile(0.5|0.95|0.99, sum(rate(http_request_duration_seconds_bucket{job="bankerchanger"}[5m])) by (le))`
- Error rate — `sum(rate(http_requests_total{job="bankerchanger",status_code=~"5.."}[5m])) / sum(rate(http_requests_total{job="bankerchanger"}[5m]))`
- Cache hit rate — `rate(cache_hits_total{job="bankerchanger"}[5m]) / (rate(cache_hits_total{job="bankerchanger"}[5m]) + rate(cache_misses_total{job="bankerchanger"}[5m]))`
- DB connections — `indexer_db_pool_size{job="bankerchanger"}` and `indexer_db_pool_idle{job="bankerchanger"}`
- Indexer lag — `indexer_ledger_lag{job="bankerchanger"}`

### Import Instructions

1. In Grafana, go to **Dashboards → New → Import**.
2. Paste the JSON below (or upload it as a file) and click **Load**.
3. Select your Prometheus data source (the one scraping the `bankerchanger` job) as the data source for all panels.
4. Click **Import**.

### Dashboard JSON

```json
{
  "title": "BANKERCHANGER Platform Monitoring",
  "uid": "bankerchanger-platform",
  "tags": ["bankerchanger", "prometheus"],
  "timezone": "browser",
  "schemaVersion": 39,
  "version": 1,
  "refresh": "30s",
  "time": { "from": "now-6h", "to": "now" },
  "templating": {
    "list": [
      {
        "name": "datasource",
        "label": "Prometheus",
        "type": "datasource",
        "query": "prometheus",
        "current": { "text": "Prometheus", "value": "Prometheus" }
      }
    ]
  },
  "panels": [
    {
      "id": 1,
      "type": "timeseries",
      "title": "Request Rate",
      "datasource": { "type": "prometheus", "uid": "${datasource}" },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
      "fieldConfig": { "defaults": { "unit": "reqps" }, "overrides": [] },
      "targets": [
        {
          "refId": "A",
          "expr": "sum(rate(http_requests_total{job=\"bankerchanger\"}[5m]))",
          "legendFormat": "requests/s"
        }
      ]
    },
    {
      "id": 2,
      "type": "timeseries",
      "title": "Latency p50 / p95 / p99",
      "datasource": { "type": "prometheus", "uid": "${datasource}" },
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
      "fieldConfig": { "defaults": { "unit": "s" }, "overrides": [] },
      "targets": [
        {
          "refId": "A",
          "expr": "histogram_quantile(0.5, sum(rate(http_request_duration_seconds_bucket{job=\"bankerchanger\"}[5m])) by (le))",
          "legendFormat": "p50"
        },
        {
          "refId": "B",
          "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job=\"bankerchanger\"}[5m])) by (le))",
          "legendFormat": "p95"
        },
        {
          "refId": "C",
          "expr": "histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{job=\"bankerchanger\"}[5m])) by (le))",
          "legendFormat": "p99"
        }
      ]
    },
    {
      "id": 3,
      "type": "timeseries",
      "title": "Error Rate (5xx)",
      "datasource": { "type": "prometheus", "uid": "${datasource}" },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 8 },
      "fieldConfig": {
        "defaults": {
          "unit": "percentunit",
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "green", "value": null },
              { "color": "red", "value": 0.05 }
            ]
          }
        },
        "overrides": []
      },
      "targets": [
        {
          "refId": "A",
          "expr": "sum(rate(http_requests_total{job=\"bankerchanger\",status_code=~\"5..\"}[5m])) / sum(rate(http_requests_total{job=\"bankerchanger\"}[5m]))",
          "legendFormat": "5xx rate"
        }
      ]
    },
    {
      "id": 4,
      "type": "timeseries",
      "title": "Cache Hit Rate",
      "datasource": { "type": "prometheus", "uid": "${datasource}" },
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 8 },
      "fieldConfig": { "defaults": { "unit": "percentunit" }, "overrides": [] },
      "targets": [
        {
          "refId": "A",
          "expr": "rate(cache_hits_total{job=\"bankerchanger\"}[5m]) / (rate(cache_hits_total{job=\"bankerchanger\"}[5m]) + rate(cache_misses_total{job=\"bankerchanger\"}[5m]))",
          "legendFormat": "hit rate"
        }
      ]
    },
    {
      "id": 5,
      "type": "timeseries",
      "title": "DB Connections (Indexer Pool)",
      "datasource": { "type": "prometheus", "uid": "${datasource}" },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 16 },
      "fieldConfig": { "defaults": { "unit": "short" }, "overrides": [] },
      "targets": [
        {
          "refId": "A",
          "expr": "indexer_db_pool_size{job=\"bankerchanger\"}",
          "legendFormat": "total"
        },
        {
          "refId": "B",
          "expr": "indexer_db_pool_idle{job=\"bankerchanger\"}",
          "legendFormat": "idle"
        }
      ]
    },
    {
      "id": 6,
      "type": "timeseries",
      "title": "Indexer Ledger Lag",
      "datasource": { "type": "prometheus", "uid": "${datasource}" },
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 16 },
      "fieldConfig": {
        "defaults": {
          "unit": "short",
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "green", "value": null },
              { "color": "red", "value": 1000 }
            ]
          }
        },
        "overrides": []
      },
      "targets": [
        {
          "refId": "A",
          "expr": "indexer_ledger_lag{job=\"bankerchanger\"}",
          "legendFormat": "ledger lag"
        }
      ]
    }
  ]
}
```

## Prometheus Alert Rules

Save the rules below to a file (e.g. `prometheus/rules/bankerchanger.yml`) and reference it from `rule_files` in your Prometheus configuration. All rules target the `bankerchanger` job and the metrics documented above.

```yaml
groups:
  - name: bankerchanger-platform
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{job="bankerchanger",status_code=~"5.."}[5m]))
            / sum(rate(http_requests_total{job="bankerchanger"}[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High 5xx error rate on BANKERCHANGER"
          description: "5xx error rate is {{ $value | humanizePercentage }} over the last 5m (threshold 5%)."

      - alert: SlowResponses
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket{job="bankerchanger"}[5m])) by (le)
          ) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow HTTP responses on BANKERCHANGER"
          description: "p95 request latency is {{ $value }}s over the last 5m (threshold 2s)."

      - alert: IndexerLagHigh
        expr: indexer_ledger_lag{job="bankerchanger"} > 600
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Indexer ledger lag exceeds 10 minutes"
          description: "Indexer ledger lag is {{ $value }}s (threshold 600s / 10m)."
```

> **Note:** `indexer_ledger_lag` is expressed in seconds of ledger close time. If your deployment instead exposes the last processed ledger close time (e.g. `indexer_last_processed_ledger_close_time`), use `time() - indexer_last_processed_ledger_close_time{job="bankerchanger"} > 600` as the alert expression.

