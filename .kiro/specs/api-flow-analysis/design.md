# API to Bull Redis to Pipeline Orchestrator Flow Analysis Design

## Overview

This design document outlines the comprehensive analysis approach for mapping and reviewing the complete data flow in the AI Shopping Scraper system, from API endpoints through Bull Redis queues to pipeline orchestrator and strategy execution.

## Architecture

### Analysis Framework

The analysis will follow a layered approach examining six distinct architectural layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 1: API LAYER                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │   Routes        │ │   Controllers   │ │   Middleware    ││
│  │  - Universal    │ │  - Scraping     │ │  - Security     ││
│  │  - Jobs API     │ │  - Validation   │ │  - Monitoring   ││
│  │  - Queue Mgmt   │ │  - Error Hdlg   │ │  - Rate Limit   ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                  LAYER 2: QUEUE LAYER                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │  QueueManager   │ │   Bull.js       │ │   Redis         ││
│  │  - Job Creation │ │  - Priority     │ │  - Persistence  ││
│  │  - Monitoring   │ │  - Retry Logic  │ │  - Pub/Sub      ││
│  │  - Lifecycle    │ │  - Concurrency  │ │  - Clustering   ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                 LAYER 3: WORKER LAYER                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │ ScrapingWorker  │ │ JobService      │ │ Checkpoints     ││
│  │ - Job Processing│ │ - Status Mgmt   │ │ - Resume Logic  ││
│  │ - Progress      │ │ - Result Store  │ │ - Failure Rec   ││
│  │ - Error Hdlg    │ │ - Lifecycle     │ │ - State Mgmt    ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│              LAYER 4: ORCHESTRATOR LAYER                    │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │MasterOrchestrator│ │PipelineOrchest  │ │ ScraperCoord    ││
│  │ - API Interface │ │ - Unified Flow  │ │ - Legacy Flow   ││
│  │ - Job Tracking  │ │ - Filter Logic  │ │ - Fallback      ││
│  │ - Progress Rpt  │ │ - Stage Mgmt    │ │ - Simple Flow   ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│               LAYER 5: STRATEGY LAYER                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │  Navigation     │ │  Exploration    │ │  Collection     ││
│  │ - Site Mapping  │ │ - Subcategories │ │ - Pagination    ││
│  │ - Menu Extract  │ │ - Filter Logic  │ │ - Product URLs  ││
│  │ - Structure     │ │ - Recursive     │ │ - Variants      ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│               LAYER 6: EXTRACTION LAYER                     │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │ ExtractorIntel  │ │ BrowserManager  │ │ WorldModel      ││
│  │ - Product Data  │ │ - Browser Pool  │ │ - Data Storage  ││
│  │ - Intelligence  │ │ - Anti-Detection│ │ - ML Training   ││
│  │ - Fallbacks     │ │ - Resource Mgmt │ │ - Analytics     ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. API Layer Components

#### Routes (`src/routes/`)
- **universalScraping.js**: Main API entry point using MasterOrchestrator
- **scrapingJobs.js**: RESTful job management API
- **queueManagement.js**: Queue monitoring and control
- **scraping.js**: Legacy API (deprecated)

**Key Interfaces:**
```javascript
// Universal Scraping API
POST /api/universal/scrape
{
  url: string,
  options: {
    enableNavigation: boolean,
    enableCollection: boolean, 
    enableExtraction: boolean,
    maxProducts: number,
    timeout: number
  }
}

// Jobs API
POST /api/v1/scraping/jobs
{
  target_url: string,
  scraping_type: 'full_site' | 'category' | 'product' | 'navigation',
  priority: 'urgent' | 'high' | 'normal' | 'low',
  max_pages: number,
  options: object
}
```

#### Controllers (`src/controllers/`)
- **ScrapingController.js**: Handles job lifecycle, validation, and response formatting

#### Middleware (`src/middleware/`)
- **security.js**: Rate limiting, CORS, input validation
- **validation.js**: Joi-based request validation
- **monitoring.js**: Performance tracking and metrics

### 2. Queue Layer Components

#### QueueManager (`src/services/QueueManager.js`)
**Responsibilities:**
- Redis connection management
- Bull.js queue configuration
- Job priority handling
- Retry logic and backoff strategies
- Event emission for WebSocket/SSE

**Key Methods:**
```javascript
async addJob(queueName, jobType, jobData, options)
async removeJob(queueName, jobId)
async getJobStatus(queueName, jobId)
async getQueueStats(queueName)
```

**Queue Configuration:**
```javascript
{
  redis: { host, port, password, db },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  }
}
```

### 3. Worker Layer Components

#### ScrapingWorker (`src/workers/ScrapingWorker.js`)
**Responsibilities:**
- Job processing from Redis queue
- Progress reporting and status updates
- Error handling and retry coordination
- Result persistence

**Processing Flow:**
1. Receive job from Bull.js queue
2. Update job status to 'running'
3. Execute pipeline orchestrator
4. Report progress via job.progress()
5. Save results to database
6. Update final status

#### ScrapingJobService (`src/services/ScrapingJobService.js`)
**Responsibilities:**
- Job lifecycle management
- Database persistence
- Status tracking and reporting
- Result formatting and retrieval

### 4. Orchestrator Layer Components

#### MasterOrchestrator (`src/orchestration/MasterOrchestrator.js`)
**Purpose:** API interface wrapper around PipelineOrchestrator
- Job tracking and progress reporting
- State management for active/completed jobs
- API-compatible result formatting

#### PipelineOrchestrator (`src/core/PipelineOrchestrator.js`)
**Purpose:** Unified pipeline execution with flexible entry points

**Execution Modes:**
- `full_site`: Complete pipeline with filter detection
- `product`: Direct single product extraction  
- `category`: Category-level scraping with filters
- `navigation`: Navigation structure mapping only

**Pipeline Stages:**
1. **Navigation Discovery** → NavigationMapperBrowserless
2. **Subcategory Exploration** → SubCategoryExplorationStrategy
3. **Filter Detection** → FilterBasedExplorationStrategy
4. **Product Collection** → ProductPaginationStrategy
5. **Data Extraction** → ExtractorIntelligence

### 5. Strategy Layer Components

#### NavigationMapperBrowserless (`src/core/discovery/NavigationMapperBrowserless.js`)
**Purpose:** Discover initial site navigation structure
- Menu extraction and parsing
- Navigation hierarchy building
- Strategy selection (mega-menu, sidebar, etc.)

#### SubCategoryExplorationStrategy (`src/core/discovery/strategies/exploration/SubCategoryExplorationStrategy.js`)
**Purpose:** Recursive category traversal
- Depth-limited exploration
- Loop prevention with visited URL tracking
- Navigation path recording for ML

#### FilterBasedExplorationStrategy (`src/core/discovery/strategies/exploration/FilterBasedExplorationStrategy.js`)
**Purpose:** Filter-based product discovery
- Filter identification and interaction
- Product capture with filter combinations
- ML training data collection

#### ProductPaginationStrategy (`src/core/collection/strategies/ProductPaginationStrategy.js`)
**Purpose:** Product URL collection with pagination
- Multiple pagination pattern support
- Variant URL extraction
- Product metadata capture

## Data Models

### Job Data Model
```javascript
{
  job_id: string (UUID),
  target_url: string,
  scraping_type: enum,
  priority: enum,
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled',
  progress: number (0-100),
  
  // Configuration
  max_pages: number,
  options: object,
  
  // Metadata
  submitted_at: Date,
  started_at: Date,
  completed_at: Date,
  correlation_id: string,
  
  // Results
  results_summary: object,
  error_details: string
}
```

### Pipeline Result Model
```javascript
{
  success: boolean,
  jobId: string,
  targetUrl: string,
  scrapingType: string,
  
  // Stage Results
  navigationResults: {
    main_sections: Array,
    strategy: string,
    totalNavigationItems: number
  },
  
  collectionResults: {
    categories: Array,
    totalCategories: number,
    filterEnhanced: boolean
  },
  
  extractionResults: {
    products: Array,
    totalProducts: number
  },
  
  // Summary
  summary: {
    total_items: number,
    duration: number,
    status: string
  }
}
```

## Error Handling

### Error Propagation Strategy
1. **Strategy Level**: Catch and log, return partial results
2. **Orchestrator Level**: Aggregate errors, determine continuation
3. **Worker Level**: Update job status, implement retry logic
4. **Queue Level**: Handle job failures, apply backoff strategies
5. **API Level**: Format errors for client consumption

### Retry Logic
- **Queue Level**: Bull.js exponential backoff (3 attempts)
- **Strategy Level**: Individual strategy retry mechanisms
- **Browser Level**: Connection and navigation retries
- **Checkpoint Level**: Resume from last successful state

## Testing Strategy

### Unit Testing
- Individual strategy components
- Queue manager operations
- Controller request/response handling
- Data model validation

### Integration Testing
- End-to-end pipeline execution
- Queue to worker communication
- Database persistence operations
- API contract compliance

### Performance Testing
- Concurrent job processing
- Memory usage under load
- Queue throughput measurement
- Browser resource management

### Resilience Testing
- Network failure scenarios
- Database connection loss
- Redis unavailability
- Browser crash recovery

## Monitoring and Observability

### Metrics Collection
- **API Metrics**: Request rates, response times, error rates
- **Queue Metrics**: Job counts, processing times, failure rates
- **Pipeline Metrics**: Stage completion times, success rates
- **Resource Metrics**: Memory usage, CPU utilization, browser instances

### Logging Strategy
- **Structured Logging**: JSON format with correlation IDs
- **Log Levels**: DEBUG, INFO, WARN, ERROR with appropriate filtering
- **Context Preservation**: Request tracing through entire pipeline
- **Performance Logging**: Timing data for optimization

### Health Checks
- **API Health**: Endpoint availability and response time
- **Queue Health**: Redis connectivity and queue status
- **Worker Health**: Active job processing and resource usage
- **Database Health**: Connection status and query performance