/**
 * Metrics Collection System
 * Prometheus-compatible metrics for performance monitoring
 * Supports custom metrics and automated performance tracking
 */

class MetricsCollector {
  constructor() {
    this.metrics = new Map();
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.summaries = new Map();

    // Initialize default metrics
    this.initializeDefaultMetrics();
  }

  /**
   * Initialize default system and application metrics
   */
  initializeDefaultMetrics() {
    // HTTP request metrics
    this.createCounter('http_requests_total', 'Total HTTP requests', ['method', 'status_code', 'endpoint']);
    this.createHistogram('http_request_duration_ms', 'HTTP request duration in milliseconds', ['method', 'endpoint']);
    this.createGauge('http_active_requests', 'Currently active HTTP requests');

    // Scraping metrics
    this.createCounter('scraping_requests_total', 'Total scraping requests', ['status', 'site_domain']);
    this.createHistogram('scraping_duration_ms', 'Scraping operation duration in milliseconds', ['site_domain']);
    this.createGauge('scraping_active_requests', 'Currently active scraping requests');
    this.createCounter('products_scraped_total', 'Total products scraped', ['site_domain', 'category']);

    // Job management metrics
    this.createCounter('scraping_jobs_submitted', 'Total scraping jobs submitted', ['type', 'priority']);
    this.createCounter('scraping_jobs_created', 'Total scraping jobs created', ['type', 'priority']);
    this.createCounter('scraping_jobs_cancelled', 'Total scraping jobs cancelled', ['status']);
    this.createCounter('scraping_jobs_completed', 'Total scraping jobs completed', ['type', 'status']);
    this.createCounter('scraping_results_downloaded', 'Total scraping results downloaded', ['format', 'status']);
    this.createGauge('scraping_jobs_queue_size', 'Number of jobs in queue', ['priority']);

    // Security and validation metrics
    this.createCounter('security_violations', 'Security violations detected', ['type']);
    this.createCounter('validation_failures', 'Request validation failures', ['type']);
    this.createCounter('validation_success', 'Successful request validations', ['type']);
    this.createCounter('rate_limit_exceeded', 'Rate limit violations', ['type']);
    this.createCounter('suspicious_requests', 'Suspicious requests detected', ['type']);
    this.createCounter('suspicious_ips', 'Suspicious IPs blocked', ['type']);
    this.createCounter('unauthorized_admin_access', 'Unauthorized admin access attempts');

    // Database metrics
    this.createCounter('database_operations_total', 'Total database operations', ['operation', 'collection']);
    this.createHistogram('database_operation_duration_ms', 'Database operation duration in milliseconds', ['operation', 'collection']);
    this.createGauge('database_connection_pool_active', 'Active database connections');
    this.createGauge('database_connection_pool_idle', 'Idle database connections');

    // Site discovery metrics
    this.createCounter('site_discovery_requests_total', 'Total site discovery requests', ['search_engine']);
    this.createHistogram('site_discovery_duration_ms', 'Site discovery duration in milliseconds', ['search_engine']);
    this.createCounter('sites_discovered_total', 'Total sites discovered', ['search_engine']);

    // System metrics
    this.createGauge('memory_usage_bytes', 'Memory usage in bytes', ['type']);
    this.createGauge('cpu_usage_percent', 'CPU usage percentage');
    this.createCounter('errors_total', 'Total errors', ['error_type', 'component']);
    this.createGauge('health_check_status', 'Health check status (1=healthy, 0=unhealthy)', ['check_name']);

    // Queue metrics
    this.createGauge('queue_size', 'Number of items in queue', ['queue_name']);
    this.createCounter('queue_processed_total', 'Total queue items processed', ['queue_name', 'status']);
    this.createHistogram('queue_processing_duration_ms', 'Queue item processing duration', ['queue_name']);

    // Extended queue metrics
    this.createCounter('queue_jobs_added', 'Total jobs added to queue', ['queue', 'type', 'priority']);
    this.createCounter('queue_jobs_removed', 'Total jobs removed from queue', ['queue', 'reason']);
    this.createCounter('queue_jobs_completed', 'Total jobs completed from queue', ['queue', 'status']);
    this.createCounter('queue_jobs_failed', 'Total jobs failed from queue', ['queue', 'attempt']);
    this.createCounter('queue_jobs_stalled', 'Total jobs stalled in queue', ['queue']);
    this.createGauge('queue_jobs_waiting', 'Jobs waiting in queue', ['queue']);
    this.createGauge('queue_jobs_active', 'Jobs active in queue', ['queue']);
    this.createGauge('queue_jobs_completed', 'Jobs completed in queue', ['queue']);
    this.createGauge('queue_jobs_failed', 'Jobs failed in queue', ['queue']);
    this.createHistogram('queue_job_duration', 'Job processing duration in queue', ['queue']);

    // Worker metrics
    this.createGauge('scraping_worker_active_jobs', 'Active scraping jobs in worker');

    // WebSocket metrics
    this.createGauge('websocket_connections_active', 'Active WebSocket connections');
    this.createGauge('websocket_job_subscriptions', 'WebSocket job subscriptions');
    this.createCounter('websocket_messages_sent_total', 'Total WebSocket messages sent');
    this.createCounter('websocket_messages_received_total', 'Total WebSocket messages received');
    this.createCounter('websocket_connections_total', 'Total WebSocket connection attempts', ['status']);

    // Start collecting system metrics
    this.startSystemMetricsCollection();
  }

  /**
   * Counter metrics (always increasing)
   */
  createCounter(name, help, labels = []) {
    this.counters.set(name, {
      name,
      help,
      labels,
      type: 'counter',
      values: new Map(),
    });
  }

  incrementCounter(name, labels = {}, value = 1) {
    const counter = this.counters.get(name);
    if (!counter) {
      throw new Error(`Counter '${name}' not found`);
    }

    const labelKey = this.serializeLabels(labels);
    const currentValue = counter.values.get(labelKey) || 0;
    counter.values.set(labelKey, currentValue + value);
  }

  /**
   * Gauge metrics (can go up or down)
   */
  createGauge(name, help, labels = []) {
    this.gauges.set(name, {
      name,
      help,
      labels,
      type: 'gauge',
      values: new Map(),
    });
  }

  setGauge(name, value, labels = {}) {
    const gauge = this.gauges.get(name);
    if (!gauge) {
      throw new Error(`Gauge '${name}' not found`);
    }

    const labelKey = this.serializeLabels(labels);
    gauge.values.set(labelKey, value);
  }

  incrementGauge(name, value = 1, labels = {}) {
    const gauge = this.gauges.get(name);
    if (!gauge) {
      throw new Error(`Gauge '${name}' not found`);
    }

    const labelKey = this.serializeLabels(labels);
    const currentValue = gauge.values.get(labelKey) || 0;
    gauge.values.set(labelKey, currentValue + value);
  }

  decrementGauge(name, value = 1, labels = {}) {
    this.incrementGauge(name, -value, labels);
  }

  /**
   * Histogram metrics (for measuring distributions)
   */
  createHistogram(name, help, labels = [], buckets = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]) {
    this.histograms.set(name, {
      name,
      help,
      labels,
      type: 'histogram',
      buckets,
      values: new Map(), // Will store bucket counts and sum/count
    });
  }

  observeHistogram(name, value, labels = {}) {
    const histogram = this.histograms.get(name);
    if (!histogram) {
      throw new Error(`Histogram '${name}' not found`);
    }

    const labelKey = this.serializeLabels(labels);

    if (!histogram.values.has(labelKey)) {
      histogram.values.set(labelKey, {
        buckets: new Map(histogram.buckets.map(bucket => [bucket, 0])),
        sum: 0,
        count: 0,
      });
    }

    const histogramValue = histogram.values.get(labelKey);
    histogramValue.sum += value;
    histogramValue.count += 1;

    // Increment bucket counters
    for (const bucket of histogram.buckets) {
      if (value <= bucket) {
        histogramValue.buckets.set(bucket, histogramValue.buckets.get(bucket) + 1);
      }
    }
  }

  /**
   * Time a function execution
   */
  timeFunction(metricName, fn, labels = {}) {
    const startTime = Date.now();

    const result = fn();

    if (result instanceof Promise) {
      return result.finally(() => {
        const duration = Date.now() - startTime;
        this.observeHistogram(metricName, duration, labels);
      });
    } else {
      const duration = Date.now() - startTime;
      this.observeHistogram(metricName, duration, labels);
      return result;
    }
  }

  /**
   * Decorator for timing methods
   */
  timed(metricName, labels = {}) {
    return (target, propertyName, descriptor) => {
      const method = descriptor.value;

      descriptor.value = function(...args) {
        return this.timeFunction(metricName, () => method.apply(this, args), labels);
      };

      return descriptor;
    };
  }

  /**
   * HTTP request tracking
   */
  trackHttpRequest(method, endpoint, statusCode, duration) {
    this.incrementCounter('http_requests_total', {
      method,
      status_code: statusCode.toString(),
      endpoint,
    });

    this.observeHistogram('http_request_duration_ms', duration, {
      method,
      endpoint,
    });
  }

  /**
   * Scraping operation tracking
   */
  trackScrapingOperation(siteDomain, status, duration, productsFound = 0, category = '') {
    this.incrementCounter('scraping_requests_total', {
      status,
      site_domain: siteDomain,
    });

    this.observeHistogram('scraping_duration_ms', duration, {
      site_domain: siteDomain,
    });

    if (productsFound > 0) {
      this.incrementCounter('products_scraped_total', {
        site_domain: siteDomain,
        category,
      }, productsFound);
    }
  }

  /**
   * Database operation tracking
   */
  trackDatabaseOperation(operation, collection, duration) {
    this.incrementCounter('database_operations_total', {
      operation,
      collection,
    });

    this.observeHistogram('database_operation_duration_ms', duration, {
      operation,
      collection,
    });
  }

  /**
   * Error tracking
   */
  trackError(errorType, component) {
    this.incrementCounter('errors_total', {
      error_type: errorType,
      component,
    });
  }

  /**
   * Queue operations tracking
   */
  trackQueueOperation(queueName, status, duration) {
    this.incrementCounter('queue_processed_total', {
      queue_name: queueName,
      status,
    });

    this.observeHistogram('queue_processing_duration_ms', duration, {
      queue_name: queueName,
    });
  }

  updateQueueSize(queueName, size) {
    this.setGauge('queue_size', size, { queue_name: queueName });
  }

  /**
   * System metrics collection
   */
  startSystemMetricsCollection() {
    // Collect system metrics every 30 seconds
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Initial collection
    this.collectSystemMetrics();
  }

  collectSystemMetrics() {
    // Memory metrics
    const memUsage = process.memoryUsage();
    this.setGauge('memory_usage_bytes', memUsage.heapUsed, { type: 'heap_used' });
    this.setGauge('memory_usage_bytes', memUsage.heapTotal, { type: 'heap_total' });
    this.setGauge('memory_usage_bytes', memUsage.rss, { type: 'rss' });
    this.setGauge('memory_usage_bytes', memUsage.external, { type: 'external' });

    // CPU usage (simplified - would need more sophisticated measurement in production)
    const cpuUsage = process.cpuUsage();
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
    this.setGauge('cpu_usage_percent', cpuPercent);
  }

  /**
   * Health check status updates
   */
  updateHealthCheckStatus(checkName, status) {
    this.setGauge('health_check_status', status === 'healthy' || status === 'pass' ? 1 : 0, {
      check_name: checkName,
    });
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics() {
    let output = '';

    // Export counters
    for (const [name, counter] of this.counters) {
      output += `# HELP ${name} ${counter.help}\n`;
      output += `# TYPE ${name} counter\n`;

      for (const [labelKey, value] of counter.values) {
        const labels = labelKey ? `{${labelKey}}` : '';
        output += `${name}${labels} ${value}\n`;
      }
      output += '\n';
    }

    // Export gauges
    for (const [name, gauge] of this.gauges) {
      output += `# HELP ${name} ${gauge.help}\n`;
      output += `# TYPE ${name} gauge\n`;

      for (const [labelKey, value] of gauge.values) {
        const labels = labelKey ? `{${labelKey}}` : '';
        output += `${name}${labels} ${value}\n`;
      }
      output += '\n';
    }

    // Export histograms
    for (const [name, histogram] of this.histograms) {
      output += `# HELP ${name} ${histogram.help}\n`;
      output += `# TYPE ${name} histogram\n`;

      for (const [labelKey, histValue] of histogram.values) {
        const baseLabels = labelKey ? labelKey : '';

        // Export buckets
        for (const [bucket, count] of histValue.buckets) {
          const bucketLabels = baseLabels ? `${baseLabels},le="${bucket}"` : `le="${bucket}"`;
          output += `${name}_bucket{${bucketLabels}} ${count}\n`;
        }

        // Export sum and count
        const labels = baseLabels ? `{${baseLabels}}` : '';
        output += `${name}_sum${labels} ${histValue.sum}\n`;
        output += `${name}_count${labels} ${histValue.count}\n`;
      }
      output += '\n';
    }

    return output;
  }

  /**
   * Export metrics as JSON
   */
  exportJsonMetrics() {
    return {
      counters: this.serializeMetricType(this.counters),
      gauges: this.serializeMetricType(this.gauges),
      histograms: this.serializeHistograms(),
      collected_at: new Date().toISOString(),
    };
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    const totalCounters = Array.from(this.counters.values())
      .reduce((sum, counter) => sum + Array.from(counter.values.values()).reduce((a, b) => a + b, 0), 0);

    const activeGauges = Array.from(this.gauges.values())
      .reduce((sum, gauge) => sum + gauge.values.size, 0);

    const totalHistogramObservations = Array.from(this.histograms.values())
      .reduce((sum, histogram) => {
        return sum + Array.from(histogram.values.values())
          .reduce((histSum, histValue) => histSum + histValue.count, 0);
      }, 0);

    return {
      metrics: {
        counters: this.counters.size,
        gauges: this.gauges.size,
        histograms: this.histograms.size,
      },
      data_points: {
        counter_total: totalCounters,
        active_gauges: activeGauges,
        histogram_observations: totalHistogramObservations,
      },
      system: {
        memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        uptime_seconds: Math.round(process.uptime()),
      },
    };
  }

  /**
   * Utility methods
   */
  serializeLabels(labels) {
    return Object.keys(labels)
      .sort()
      .map(key => `${key}="${labels[key]}"`)
      .join(',');
  }

  serializeMetricType(metricMap) {
    const result = {};
    for (const [name, metric] of metricMap) {
      result[name] = {
        help: metric.help,
        type: metric.type,
        values: Object.fromEntries(metric.values),
      };
    }
    return result;
  }

  serializeHistograms() {
    const result = {};
    for (const [name, histogram] of this.histograms) {
      result[name] = {
        help: histogram.help,
        type: 'histogram',
        values: {},
      };

      for (const [labelKey, histValue] of histogram.values) {
        result[name].values[labelKey || 'default'] = {
          buckets: Object.fromEntries(histValue.buckets),
          sum: histValue.sum,
          count: histValue.count,
        };
      }
    }
    return result;
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset() {
    for (const counter of this.counters.values()) {
      counter.values.clear();
    }

    for (const gauge of this.gauges.values()) {
      gauge.values.clear();
    }

    for (const histogram of this.histograms.values()) {
      histogram.values.clear();
    }
  }
}

// Create singleton metrics instance
const metrics = new MetricsCollector();

module.exports = {
  MetricsCollector,
  metrics,
};
