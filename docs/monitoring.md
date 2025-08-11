# Monitoring Infrastructure Documentation

## Overview

The AI Shopping Scraper implements comprehensive monitoring infrastructure that provides real-time insights into system performance, health, and operations. This monitoring system follows industry standards and supports integration with popular monitoring platforms.

## Components

### 1. Structured Logging (`src/utils/logger.js`)

**Features:**
- JSON-structured logs for easy parsing and analysis
- Correlation ID tracking for request tracing
- Multiple log levels (debug, info, warn, error)
- Automatic log rotation and retention
- Performance timing utilities
- Scraping-specific log events

**Configuration:**
```javascript
// Log levels: debug, info, warn, error
LOG_LEVEL=info

// Environment affects log output
NODE_ENV=production  // Only warn+ to console
NODE_ENV=development // Debug+ to console
```

**Log Files:**
- `logs/combined.log` - All log entries
- `logs/error.log` - Error level only
- `logs/scraping.log` - Scraping operations
- `logs/performance.log` - Performance metrics
- `logs/exceptions.log` - Uncaught exceptions
- `logs/rejections.log` - Unhandled promise rejections

**Usage Examples:**
```javascript
const { logger } = require('../utils/logger');

// Basic logging with correlation ID
logger.info('OPERATION_STARTED', {
  operation: 'scraping',
  site_url: 'example.com'
}, correlationId);

// Performance timing
logger.startTimer('database_query', correlationId);
// ... perform operation
logger.endTimer('database_query', correlationId, { 
  collection: 'products',
  query_type: 'find'
});

// Scraping-specific events
logger.scrapingStarted(requestId, siteUrl, { priority: 'high' });
logger.scrapingCompleted(requestId, siteUrl, {
  products_found: 150,
  processing_time_ms: 2500
});
```

### 2. Metrics Collection (`src/utils/metrics.js`)

**Prometheus-Compatible Metrics:**
- **Counters**: Always increasing values (requests, errors, operations)
- **Gauges**: Current state values (active connections, memory usage)
- **Histograms**: Distribution measurements (response times, payload sizes)

**Default Metrics:**
- `http_requests_total` - Total HTTP requests by method/status/endpoint
- `http_request_duration_ms` - Request duration distribution
- `scraping_requests_total` - Scraping operations by status/domain
- `scraping_duration_ms` - Scraping operation duration
- `database_operations_total` - Database operations by type/collection
- `memory_usage_bytes` - Memory usage by type
- `errors_total` - Errors by type/component
- `queue_size` - Queue depth by queue name

**Usage Examples:**
```javascript
const { metrics } = require('../utils/metrics');

// Track counters
metrics.incrementCounter('api_requests_total', {
  method: 'POST',
  endpoint: '/scraping/request'
});

// Set gauge values
metrics.setGauge('active_scrapers', 5);

// Record histogram observations
metrics.observeHistogram('response_time_ms', 150, {
  endpoint: '/api/products'
});

// Time function execution
const result = await metrics.timeFunction('database_query', async () => {
  return await database.find({ category: 'electronics' });
}, { collection: 'products' });
```

### 3. Health Checks (`src/middleware/healthCheck.js`)

**Comprehensive Health Monitoring:**
- Memory usage and thresholds
- Database connectivity with ping tests
- System uptime and performance
- Component-specific health checks
- Target response time: < 50ms

**Health Check Endpoint:**
```bash
GET /health

Response:
{
  "status": "healthy",
  "timestamp": "2025-08-11T10:30:00.000Z",
  "uptime": 86400,
  "response_time_ms": 24.5,
  "checks": {
    "memory": {
      "name": "Memory Usage",
      "status": "pass",
      "heap_used_mb": 45,
      "heap_usage_percent": 60
    },
    "database": {
      "name": "Database Connectivity",
      "status": "pass",
      "connection_pool": "healthy",
      "ping_time_ms": 5.2
    }
  }
}
```

### 4. Performance Monitoring (`src/middleware/monitoring.js`)

**Automatic Request Tracking:**
- Response time measurement
- Slow request detection (>200ms threshold)
- Error rate monitoring
- Resource utilization tracking

**Security Monitoring:**
- Suspicious request pattern detection
- Rate limiting enforcement
- Input validation monitoring
- Security event logging

**Database Operation Monitoring:**
- Query performance tracking
- Slow query detection (>100ms threshold)
- Connection pool monitoring
- Error tracking with context

### 5. Monitoring Routes (`src/routes/monitoring.js`)

**Available Endpoints:**

#### `/health`
System health check with detailed component status.

#### `/metrics`
Prometheus-compatible metrics export:
```bash
# Prometheus format
GET /metrics

# JSON format
GET /metrics?format=json
```

#### `/monitoring/summary`
High-level monitoring dashboard data:
```bash
GET /monitoring/summary

Response:
{
  "metrics": {
    "counters": 12,
    "gauges": 8,
    "histograms": 15
  },
  "data_points": {
    "counter_total": 1250,
    "active_gauges": 8,
    "histogram_observations": 2500
  },
  "recent_errors": {
    "ScrapingError": 3,
    "DatabaseError": 1
  },
  "system": {
    "memory_usage_mb": 125,
    "uptime_seconds": 86400
  }
}
```

#### `/monitoring/logs`
Recent log entries for debugging:
```bash
# Last 50 lines, all levels
GET /monitoring/logs

# Last 100 error-level logs
GET /monitoring/logs?lines=100&level=error
```

#### `/monitoring/status`
Monitoring system status and configuration.

#### `/monitoring/config`
Current monitoring configuration details.

## Integration Examples

### Express App Integration

```javascript
const express = require('express');
const { requestLogging } = require('./src/utils/logger');
const { 
  performanceMonitoring,
  errorTracking,
  validationMonitoring
} = require('./src/middleware/monitoring');
const monitoringRoutes = require('./src/routes/monitoring');

const app = express();

// Core monitoring middleware
app.use(requestLogging);           // Request/response logging
app.use(performanceMonitoring()); // Performance tracking
app.use(validationMonitoring());  // Security monitoring

// Your API routes here
app.use('/api', apiRoutes);

// Monitoring endpoints
app.use('/', monitoringRoutes);

// Error handling (must be last)
app.use(errorTracking());
```

### Database Operations

```javascript
const { monitorDatabaseOperation } = require('./src/middleware/monitoring');

class ProductService {
  async findProducts(query) {
    const monitoredFind = monitorDatabaseOperation('find', 'products', 
      this.database.find.bind(this.database)
    );
    
    return await monitoredFind(query);
  }
}
```

### Scraping Operations

```javascript
const { monitorScrapingOperation } = require('./src/middleware/monitoring');

class WebScraper {
  @monitorScrapingOperation('example.com')
  async scrapeProducts(requestData) {
    // Scraping implementation
    return {
      products_found: 150,
      categories_found: 5,
      processing_time_ms: 2500
    };
  }
}
```

## Monitoring Dashboards

### Grafana Integration

The system exports Prometheus-compatible metrics that can be visualized in Grafana:

1. **HTTP Request Dashboard**:
   - Request rate and response time
   - Error rate by endpoint
   - Top slow endpoints

2. **Scraping Operations Dashboard**:
   - Scraping success/failure rates
   - Products scraped per hour
   - Site performance comparison

3. **System Resources Dashboard**:
   - Memory usage trends
   - CPU utilization
   - Database connection pool status

### Alerts Configuration

Recommended alerts:
- High error rate (>5% over 5 minutes)
- Slow response times (>500ms p95 over 10 minutes)
- Memory usage (>80% for 5 minutes)
- Database connectivity failures
- Scraping operation failures (>20% over 15 minutes)

## Performance Standards

The monitoring system is designed to meet these performance targets:

- **Health checks**: < 50ms response time
- **Metrics collection**: < 30ms overhead per request
- **Log processing**: < 10ms per log entry
- **Memory overhead**: < 50MB for monitoring components
- **Storage**: Log rotation to maintain < 1GB total

## Troubleshooting

### Common Issues

1. **High log volume**:
   - Adjust LOG_LEVEL to reduce verbosity
   - Increase log rotation frequency
   - Filter noisy endpoints from logging

2. **Metrics memory usage**:
   - Reset metrics periodically in long-running processes
   - Limit histogram bucket counts
   - Use sampling for high-volume metrics

3. **Slow health checks**:
   - Optimize database ping queries
   - Reduce health check timeout values
   - Cache non-critical health check results

### Monitoring Commands

```bash
# Check system health
npm run health

# View current metrics
npm run metrics

# Get monitoring summary
npm run monitoring

# View recent logs
curl "http://localhost:3000/monitoring/logs?lines=100&level=error"

# Check monitoring configuration
curl "http://localhost:3000/monitoring/config"
```

## Security Considerations

- Log files may contain sensitive information - ensure proper access controls
- Metrics endpoints should be secured in production
- Correlation IDs help with security incident investigation
- Rate limiting protects against abuse of monitoring endpoints
- Suspicious request patterns are automatically detected and logged

## Future Enhancements

- Integration with external APM tools (New Relic, DataDog)
- Advanced anomaly detection
- Automated alert management
- Custom dashboard generation
- Real-time monitoring WebSocket endpoints
- Integration with cloud monitoring services (CloudWatch, Azure Monitor)