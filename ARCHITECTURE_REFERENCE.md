# Complete System Architecture Reference
*API + Bull.js + Redis + MongoDB Flow Documentation*

**Last Updated:** 2025-08-21  
**Analysis Confidence:** High (Validated by Zen + Expert Review)  
**Strategic Goal:** Improve extraction success from 40% → 70% for 5-10 e-commerce sites

---

## Executive Summary

This system implements a **layered scraping platform** with HTTP API, queue-driven workers (Bull.js), Redis-backed caching/checkpointing, and MongoDB persistence. The architecture successfully balances simplicity with the resumable operations needed for web scraping at the 5-10 site scale.

**Core Business Alignment:** ✅ Well-engineered system appropriately scaled for business requirements  
**Architecture Score:** 8.5/10 - Production-ready with clear improvement path

---

## Complete Data Flow

```
API Request → ScrapingController → ScrapingJobService → QueueManager (Bull.js) 
   ↓
Redis Queue → ScrapingWorker → [Feature Flag Selection] → ScraperCoordinator/PipelineOrchestrator
   ↓  
NavigationMapperBrowserless → SubCategoryExplorer → ProductPaginator
   ↓
CheckpointManager (Redis Cache + MongoDB Persistence) → Results Storage
```

---

## Layer 1: API Layer

### ScrapingController (`src/controllers/ScrapingController.js`)
**Purpose:** HTTP request handling and validation  
**Key Methods:**
- `submitJob()` - Validates payload, checks rate limits, creates job
- `getJobStatus()` - Returns job progress and completion status  
- `getJobResults()` - Retrieves extracted data with format options
- `cancelJob()` - Cancels queued or running jobs
- `listJobs()` - Paginated job listing with filters

**Request Flow:**
1. **Validation** - URL format, scraping type, priority, max pages
2. **Rate Limiting** - IP-based limits (currently stub implementation)
3. **Job Creation** - UUID generation, correlation ID tracking
4. **Queue Submission** - Delegates to ScrapingJobService

**Collections Used:**
- `scraping_jobs` - Job metadata and status tracking
- `scraping_job_results` - Final extracted data storage

---

## Layer 2: Service Layer

### ScrapingJobService (`src/services/ScrapingJobService.js`)
**Purpose:** Business logic for job lifecycle management  
**Key Features:**
- **Job Estimation** - Duration calculation based on scraping type and pages
- **Priority Handling** - Urgent/high/normal/low with queue positioning
- **Status Management** - Real-time progress calculation for running jobs
- **Result Formatting** - JSON/CSV/XML output formats

**Database Schema:**
```javascript
// Job Record
{
  job_id: UUID,
  target_url: String,
  scraping_type: 'full_site|category|product|search',
  priority: 'urgent|high|normal|low',
  status: 'queued|running|completed|failed|cancelled',
  progress: Number(0-100),
  max_pages: Number,
  estimated_duration_ms: Number,
  retry_count: Number,
  error_details: String,
  created_at: Date,
  completed_at: Date
}
```

### QueueManager (`src/services/QueueManager.js`)
**Purpose:** Centralized Redis-based task queue using Bull.js  
**Configuration:**
- **Redis Connection** - Supports both REDIS_URL and individual settings
- **Queue Types** - `scraping` (default) and `scraping-urgent` (priority)
- **Retry Logic** - Exponential backoff with configurable attempts
- **Job Options** - TTL, removal policies, priority levels

**Priority System:**
```javascript
priorityLevels = {
  urgent: 1,    // Fastest processing
  high: 2,
  normal: 3,    // Default
  low: 4        // Lowest priority
}
```

---

## Layer 3: Worker Layer

### ScrapingWorker (`src/workers/ScrapingWorker.js`)
**Purpose:** Processes jobs from Redis queue with orchestrator selection  
**Feature Flag System:**
```javascript
// Environment-based orchestrator selection
USE_SCRAPER_COORDINATOR=true    // New architecture (default)
USE_SCRAPER_COORDINATOR=false   // Legacy PipelineOrchestrator
```

**Key Capabilities:**
- **Checkpoint Integration** - Resumable operations via CheckpointManager
- **Progress Reporting** - Real-time job status updates to MongoDB
- **Error Handling** - Retry logic with exponential backoff
- **Metrics Tracking** - Success rates, processing time, item counts

**Worker Process Flow:**
1. Listen to Redis queue via Bull.js
2. Route to orchestrator based on feature flag
3. Execute scraping with checkpoint support
4. Update job status and save results
5. Emit metrics for monitoring

---

## Layer 4: Core Scraping Logic

### ScraperCoordinator (`src/core/ScraperCoordinator.js`) - **NEW ARCHITECTURE**
**Purpose:** Orchestrates the complete 4-step scraping pipeline  
**Specialized Modules:**
1. **NavigationMapperBrowserless** - Discovers initial site navigation
2. **SubCategoryExplorationStrategy** - Recursively explores subcategories  
3. **ProductPaginationStrategy** - Extracts products with pagination
4. **BrowserManager** - Manages browser lifecycle and anti-detection

**Configuration Options:**
```javascript
{
  saveToDatabase: true,
  parallelCategories: 3,              // Concurrent category processing
  maxPagesPerCategory: 20,           // Pagination limit
  maxProductsPerCategory: 500,       // Product extraction limit
  sampleCategories: null             // Testing mode limitation
}
```

### PipelineOrchestrator (`src/core/PipelineOrchestrator.js`) - **LEGACY**
**Purpose:** Original 3-stage pipeline implementation  
**Stages:**
1. **Navigation Discovery** - Site structure mapping
2. **URL Collection** - Product URL gathering  
3. **Product Extraction** - Detailed product data extraction

**Note:** Being phased out in favor of ScraperCoordinator

---

## Layer 5: Persistence & Caching

### CheckpointManager (`src/core/checkpoint/CheckpointManager.js`)
**Purpose:** Dual-storage system for resumable operations  
**Architecture Pattern:** Write-through cache with selective MongoDB persistence

**Storage Strategy:**
- **Redis (Fast Path)** - 48-hour TTL for active operations
- **MongoDB (Durable)** - 7-day TTL for recovery and history
- **Fallback Logic** - Redis → MongoDB → Redis restore on cache miss

**Feature Flags:**
```bash
ENABLE_CHECKPOINTS=true                    # Enable checkpoint system
CHECKPOINT_SYNC_TO_MONGODB=true           # MongoDB persistence
CHECKPOINT_MONGODB_TTL_DAYS=7             # MongoDB retention
```

**Checkpoint Schema:**
```javascript
{
  checkpoint_id: UUID,
  job_id: String,
  site_domain: String,
  status: 'ACTIVE|COMPLETED|FAILED',
  pipeline_step: Number(1-4),
  pipeline_data: {
    urls_discovered: Array,
    urls_processed: Array,
    current_page: Number,
    pagination_state: Object,
    extraction_results: Array
  },
  created_at: Date,
  expires_at: Date
}
```

### MongoDB Collections

**Core Business Collections:**
- `scraping_jobs` - Job lifecycle and status
- `scraping_job_results` - Extracted data storage
- `checkpoints` - Resumable operation state
- `products` - Product catalog (with multi-category support)
- `categories` - Category hierarchy
- `navigation_maps` - Site navigation patterns

**Database Optimization:**
- **Connection Pooling** - 5-50 connections based on load
- **Indexes** - Compound indexes for job lookup, TTL indexes for cleanup
- **Performance Targets** - Sub-100ms query performance goals
- **Write Concerns** - Majority write with journaling for consistency

### Redis Configuration

**Usage Patterns:**
- **Job Queues** - Bull.js queue storage
- **Checkpoint Cache** - Fast checkpoint access (48h TTL)
- **Rate Limiting** - IP-based request throttling (planned)

**Namespaces:**
```javascript
// Cache namespaces
checkpoint: {
  ttl: 172800,        // 48 hours
  noFallback: true    // Prevents stale in-memory cache
}
```

---

## Browser & Anti-Detection Layer

### BrowserManager Integration
**Supported Backends:**
- **Local Playwright** - Default for development
- **Browserless.io** - Cloud browser service for production
- **HyperBrowser** - Advanced anti-detection service

**Anti-Detection Features:**
- **Proxy Integration** - BrightData residential/datacenter proxies
- **User Agent Rotation** - Randomized browser fingerprints
- **Stealth Mode** - rebrowser-playwright for advanced bypass
- **CAPTCHA Handling** - Automated detection and alerts

**Cost Tracking:**
```javascript
// Built-in cost monitoring
costTracker: {
  minutes: Number,
  sessions: Number,
  calculateCost(): Number
}
```

---

## Strategic Assessment

### Architectural Strengths ✅

1. **Business Alignment** - Designed for 40% → 70% extraction success at 5-10 site scale
2. **Modular Design** - Clean separation between API, queue, worker, and scraping modules
3. **Resumable Operations** - CheckpointManager enables recovery from failures
4. **Horizontal Scaling** - Bull.js queues support multiple worker instances
5. **Feature Flag System** - Gradual migration between orchestrators
6. **Comprehensive Logging** - Structured logging with correlation IDs throughout

### Performance Characteristics 📊

**Current Metrics:**
- **Extraction Success** - Currently 40%, targeting 70%
- **Processing Time** - 38-90 seconds per site
- **Database Performance** - Sub-100ms query targets with proper indexing
- **Queue Throughput** - Configurable concurrency (default: 3 jobs)
- **Memory Usage** - ~500MB per scraping run

**Scalability Factors:**
- **Database** - MongoDB with connection pooling (5-50 connections)
- **Cache** - Redis with 48-hour TTL for active operations
- **Concurrency** - Configurable parallel processing
- **Workers** - Horizontal scaling via multiple worker processes

### Strategic Improvement Opportunities 🎯

**HIGH PRIORITY (Immediate):**

1. **Schema-Document Consistency** ⚠️
   - **Issue**: Product documents use different units (dollars vs cents) than MongoDB schema
   - **Location**: `src/cache/ProductCatalogCache.js` lines 118-131
   - **Fix**: Add schema adapter layer converting prices to integer cents
   - **Impact**: Prevents data corruption and ensures analytics accuracy

2. **API Security Implementation** 🔒
   - **Issue**: No authentication or rate limiting implemented
   - **Location**: `src/controllers/ScrapingController.js` line 436-442 (stub implementation)
   - **Fix**: Add JWT/API-key auth + Redis-backed rate limiting
   - **Impact**: Prevents abuse and financial exposure via proxy costs

3. **Collection Name Mismatch** 📝
   - **Issue**: SelectorLearningCache uses 'selectors' vs schema's 'selector_libraries'
   - **Location**: `src/cache/SelectorLearningCache.js` line 33
   - **Fix**: Update collection name and fix import path
   - **Impact**: Enables pattern learning and caching functionality

**MEDIUM PRIORITY (Strategic):**

4. **Orchestrator Consolidation** 🔄
   - **Issue**: Dual orchestration paths (PipelineOrchestrator vs ScraperCoordinator)
   - **Recommendation**: Unify behind common interface with capability matrix
   - **Impact**: Reduces maintenance burden and prevents feature drift

5. **Checkpoint Consistency Guards** 🛡️
   - **Enhancement**: Add version counters and consistency checks between Redis/MongoDB
   - **Impact**: Prevents state divergence and improves resume reliability

**LOW PRIORITY (Future):**

6. **Runtime Feature Flags** ⚙️
   - **Enhancement**: Replace environment variables with database-driven feature flags
   - **Impact**: Enables safer gradual rollouts and A/B testing

---

## Environment Configuration

### Required Environment Variables

**Database Connections:**
```bash
MONGODB_URL=mongodb://localhost:27017        # MongoDB connection
REDIS_URL=redis://localhost:6379            # Redis connection (optional)
REDIS_HOST=localhost                         # Individual Redis settings
REDIS_PORT=6379
REDIS_PASSWORD=                              # Optional Redis auth
```

**Feature Flags:**
```bash
USE_SCRAPER_COORDINATOR=true                 # Orchestrator selection
ENABLE_CHECKPOINTS=true                      # Checkpoint system
CHECKPOINT_SYNC_TO_MONGODB=true             # MongoDB persistence
```

**Browser & Proxy:**
```bash
BROWSERLESS_TOKEN=                           # Browserless.io API key
BROWSERLESS_ENDPOINT=wss://production-sfo.browserless.io
BRIGHTDATA_USERNAME=                         # Proxy credentials
BRIGHTDATA_PASSWORD=
```

**API Configuration:**
```bash
PORT=3000                                    # Server port
LOG_LEVEL=info                              # Logging verbosity
NODE_ENV=development                         # Environment mode
```

---

## Operational Monitoring

### Key Metrics to Track

**Business Metrics:**
- **Extraction Success Rate** - Current: 40%, Target: 70%
- **Sites Processed Per Day** - Target: ~10 runs across 5-10 sites
- **Data Quality Score** - URL validity, product completeness

**Technical Metrics:**
- **Queue Depth** - Jobs waiting vs processing capacity
- **Worker Utilization** - Active jobs vs configured concurrency
- **Checkpoint Recovery Rate** - Successful resume operations
- **Database Performance** - Query latency, connection pool usage

**Cost Metrics:**
- **Browserless Usage** - Minutes consumed per month
- **Proxy Costs** - BrightData session usage
- **Infrastructure Costs** - MongoDB/Redis hosting

### Health Check Endpoints

```
GET /health                    # Basic server health
GET /api/v1/monitoring/status  # Detailed system status
GET /metrics                   # Prometheus-compatible metrics
```

---

## Development & Deployment

### Local Development Setup
```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env

# Start MongoDB and Redis locally
docker-compose up -d

# Run server with worker
USE_SCRAPER_COORDINATOR=true ENABLE_CHECKPOINTS=true npm start
```

### Testing Strategy
```bash
# Run specific test suites
npm run test:glasswing         # NavigationMapperBrowserless tests
npm run test:queue             # Queue system tests
npm run test:checkpoint        # Checkpoint system tests

# End-to-end API testing
node test_api_e2e.js
```

### Production Deployment Considerations

1. **Separate Worker Processes** - Run API and workers on different instances
2. **Database Scaling** - Use MongoDB Atlas or similar managed service
3. **Redis Clustering** - Implement Redis cluster for high availability
4. **Load Balancing** - Multiple API instances behind load balancer
5. **Monitoring** - Prometheus + Grafana for metrics visualization

---

## Quick Reference Commands

### Queue Management
```bash
# Start worker process
npm run queue:worker

# Monitor queue status
npm run queue:status

# Clear failed jobs
npm run queue:clean
```

### Database Operations
```bash
# Run migrations
npm run db:migrate

# Backup data
npm run db:backup

# View collection stats
npm run db:stats
```

### Testing & Validation
```bash
# Test NavigationMapperBrowserless
node tests/active/navigation/test_glasswing_navigation.js

# Validate checkpoint system
node tests/active/checkpoint/test_checkpoint_integration.js

# Run end-to-end test
node test_api_e2e.js
```

---

## Troubleshooting Guide

### Common Issues

**Jobs Stuck in Queue:**
- Check Redis connection: `redis-cli ping`
- Verify worker process is running
- Check queue concurrency settings

**Checkpoint Failures:**
- Verify MongoDB connection and permissions
- Check Redis memory usage and TTL settings
- Review checkpoint validation errors in logs

**Extraction Rate Below Target:**
- Review NavigationMapperBrowserless success rates
- Check for anti-bot detection issues
- Validate selector patterns for target sites

**High Resource Usage:**
- Monitor browser instance lifecycle
- Check for memory leaks in worker processes
- Review database query performance

### Log Analysis
```bash
# Filter by correlation ID
grep "correlation_id:abc123" logs/app.log

# Monitor job progress
grep "SCRAPING_JOB" logs/app.log | tail -f

# Check checkpoint operations
grep "CheckpointManager" logs/app.log
```

---

*This document serves as the definitive reference for the complete system architecture. Keep it updated as the system evolves toward the 70% extraction success target.*