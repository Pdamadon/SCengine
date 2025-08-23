# Checkpoint Validation System

## Overview

The checkpoint validation system provides comprehensive data validation for the checkpoint/resume functionality using Zod schemas and MongoDB JSON Schema validation. This ensures data integrity across Redis cache and MongoDB storage layers.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                      │
├─────────────────────────────────────────────────────────┤
│              CheckpointCacheService                       │
│         (Validation + Cache Operations)                   │
├─────────────────────────────────────────────────────────┤
│     Zod Validation          │    MongoDB Validation      │
│   (Runtime validation)       │   (Database constraints)   │
├─────────────────────────────────────────────────────────┤
│    RedisCacheManager         │      MongoDB Driver        │
│     (Fast cache)             │    (Durable storage)       │
└─────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Validation Schemas (`src/core/checkpoint/validation/`)

#### validationUtils.js
Common validation utilities and enums shared across schemas:

- **UUID Validation**: Ensures valid UUID v4 format
- **Timestamp Validation**: Date coercion and validation
- **Domain Validation**: Simple domain format checking
- **Priority Validation**: Integer range 1-10
- **Enums**: CheckpointStatus, QueryStatus, JobType, SessionStatus
- **Performance Timer**: Validation performance monitoring

#### checkpoint.schema.js
Main checkpoint data validation:

```javascript
const checkpoint = {
  checkpoint_id: uuidv4(),           // Required UUID
  site_domain: 'example.com',        // Required domain
  job_type: 'product_catalog',       // Enum: product_catalog, product_detail, etc.
  pipeline_step: 1-4,                // Integer 1-4
  pipeline_data: {                   // Flexible pipeline state
    urls_discovered: [],
    urls_processed: [],
    current_page: 1,
    pagination_state: {},
    extraction_results: []
  },
  status: 'active',                   // Enum: active, paused, completed, failed
  error_details: {},                  // Optional error information
  created_at: Date,                   // Required timestamp
  updated_at: Date,                   // Required timestamp
  expires_at: Date                    // Optional TTL
}
```

**Key Features:**
- Automatic TTL management (48 hours default)
- Pipeline step validation (1-4 range)
- Status tracking with state machine
- Error detail capture
- Age calculation utilities

#### userQuery.schema.js
User search query validation (for future functionality):

```javascript
const userQuery = {
  query_id: uuidv4(),
  user_id: 'optional',
  query_text: 'find red dress under $50',
  parsed_intent: {
    product_type: 'dress',
    attributes: { color: 'red' },
    price_range: { max: 5000 },  // In cents
    filters: {}
  },
  status: 'pending',               // Enum: pending, processing, completed, failed
  priority: 5,                     // 1-10 scale
  metadata: {},                    // Request metadata
  created_at: Date,
  updated_at: Date
}
```

**Key Features:**
- Query intent parsing
- Priority calculation
- Query validity checking (24h default)
- Metadata tracking

#### querySession.schema.js
Links user queries to checkpoint sessions:

```javascript
const querySession = {
  session_id: uuidv4(),
  query_id: uuidv4(),              // Reference to user_queries
  checkpoints: [{                  // Checkpoint references
    checkpoint_id: uuidv4(),
    site_domain: 'example.com',
    status: 'completed'
  }],
  sites_searched: [{                // Search metrics per site
    site_domain: 'example.com',
    products_found: 100,
    search_time_ms: 2500,
    cache_hit: false
  }],
  results: [],                      // Capped at 500 items
  performance_metrics: {
    total_time_ms: 5000,
    sites_queried: 3,
    products_evaluated: 300,
    cache_hits: 1,
    cache_ratio: 0.33
  },
  status: 'running',                // Enum: running, completed, failed, cancelled
  error_details: {},
  created_at: Date,
  updated_at: Date,
  expires_at: Date                  // 7 days default
}
```

**Key Features:**
- Result capping (500 items max)
- Performance metrics tracking
- Cache ratio calculation
- Session duration tracking
- Success rate calculation

### 2. CheckpointCacheService (`src/core/checkpoint/CheckpointCacheService.js`)

Facade for checkpoint-specific cache operations with integrated validation.

**Key Methods:**

```javascript
// Store checkpoint with validation
await cacheService.set(checkpointId, data)

// Retrieve and validate
const checkpoint = await cacheService.get(checkpointId)

// Update with validation
await cacheService.update(checkpointId, updates)

// Batch operations
await cacheService.setMultiple(checkpoints)
const results = await cacheService.getMultiple(ids)

// Utility methods
await cacheService.exists(checkpointId)
await cacheService.delete(checkpointId)
await cacheService.clearAll()
```

**Features:**
- Automatic validation on all operations
- Corrupted data detection and cleanup
- Oversized payload handling
- TTL management
- Statistics tracking

### 3. MongoDB Validation

MongoDB JSON Schema validation ensures database-level constraints:

```javascript
// Applied at collection creation
db.createCollection('checkpoints', {
  validator: {
    $jsonSchema: mongoCheckpointSchema
  }
})
```

This provides:
- Type enforcement
- Required field validation
- Pattern matching (UUID format)
- Range constraints
- Enum validation

## Usage Examples

### Basic Checkpoint Operations

```javascript
const CheckpointCacheService = require('./src/core/checkpoint/CheckpointCacheService');
const { createCheckpoint } = require('./src/core/checkpoint/validation/checkpoint.schema');
const logger = require('./src/utils/logger');

// Initialize service
const cacheService = new CheckpointCacheService(logger);
await cacheService.initialize();

// Create and store checkpoint
const checkpoint = createCheckpoint({
  checkpoint_id: uuidv4(),
  site_domain: 'example.com',
  pipeline_step: 2,
  pipeline_data: {
    urls_discovered: ['/product1', '/product2'],
    urls_processed: ['/product1'],
    current_page: 1,
    pagination_state: { hasNext: true },
    extraction_results: []
  }
});

await cacheService.set(checkpoint.checkpoint_id, checkpoint);

// Retrieve and update
const retrieved = await cacheService.get(checkpoint.checkpoint_id);
if (retrieved) {
  await cacheService.update(checkpoint.checkpoint_id, {
    pipeline_step: 3,
    status: 'completed'
  });
}
```

### Batch Operations

```javascript
// Store multiple checkpoints
const checkpoints = [
  createCheckpoint({ checkpoint_id: uuidv4(), site_domain: 'site1.com' }),
  createCheckpoint({ checkpoint_id: uuidv4(), site_domain: 'site2.com' })
];

await cacheService.setMultiple(checkpoints);

// Retrieve multiple
const ids = checkpoints.map(cp => cp.checkpoint_id);
const results = await cacheService.getMultiple(ids);
```

### Error Handling

```javascript
try {
  // Invalid data will be rejected
  await cacheService.set('invalid-id', {
    checkpoint_id: 'not-a-uuid',
    invalid_field: true
  });
} catch (error) {
  console.error('Validation failed:', error.message);
}

// Corrupted data is automatically cleaned
const checkpoint = await cacheService.get(checkpointId);
if (!checkpoint) {
  // Either doesn't exist or was corrupted and cleaned
}
```

## Configuration

### Environment Variables

```bash
# Checkpoint cache configuration
CHECKPOINT_MAX_PAYLOAD_SIZE=524288    # Max size in bytes (default: 512KB)
CHECKPOINT_CACHE_COMPRESS=false       # Enable compression (default: false)
CACHE_CHECKPOINT_DELETE_ON_ERROR=true # Delete corrupted data (default: true)

# Redis configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=secret

# Test environment
NODE_ENV=test                         # Enables silent logging in tests
LOG_SILENT=true                        # Alternative to NODE_ENV=test
```

### TTL Configuration

Default TTL values:
- Checkpoints: 48 hours
- User Queries: 24 hours validity check
- Query Sessions: 7 days

## Performance Considerations

### Validation Performance

The validation system includes performance monitoring:

```javascript
const timer = new ValidationTimer(5); // 5ms threshold

// Measure validation
const result = timer.measure(
  () => validateCheckpoint(data),
  'checkpoint-validation'
);

// Get statistics
const stats = timer.getStats();
console.log(`Average: ${stats.average}ms, Max: ${stats.max}ms`);
```

Target performance:
- Checkpoint validation: < 5ms average
- Batch operations: Linear scaling
- Cache operations: < 10ms for Redis

### Payload Size Management

Large payloads are handled gracefully:

1. **Size Check**: Payloads over MAX_PAYLOAD_SIZE are detected
2. **Minimal Storage**: Only essential fields stored for oversized data
3. **Marker Flag**: `_oversized: true` indicates reduced data
4. **Future Enhancement**: Compression support via CHECKPOINT_CACHE_COMPRESS

### Memory vs Redis

The system automatically falls back to memory cache when Redis is unavailable, except for checkpoints which require Redis (noFallback: true).

## Testing

### Unit Tests

```bash
# Run validation schema tests
npm test -- tests/unit/validation/

# Specific test files
npm test -- tests/unit/validation/checkpoint.schema.test.js
npm test -- tests/unit/checkpoint/CheckpointCacheService.test.js
```

### Integration Tests

```bash
# Requires Redis running
redis-server

# Run integration tests
REDIS_HOST=localhost npm test -- tests/integration/checkpoint/

# With coverage
REDIS_HOST=localhost npm test -- tests/integration/checkpoint/ --coverage
```

### Test Coverage

Current coverage targets:
- Validation schemas: 100%
- CheckpointCacheService: 95%+
- Integration flows: 80%+

## Migration Guide

### From Non-Validated Checkpoints

1. **Identify existing checkpoints** in Redis/MongoDB
2. **Run validation** on existing data:
   ```javascript
   const validated = validateCheckpoint(existingData);
   ```
3. **Handle validation errors** - either fix or remove invalid data
4. **Apply MongoDB schema** to enforce future compliance

### Schema Evolution

When updating schemas:

1. **Version the schema** (e.g., algorithm_version field)
2. **Support backward compatibility** with partial schemas
3. **Run migration scripts** to update existing data
4. **Update MongoDB validators** after data migration

## Troubleshooting

### Common Issues

#### 1. Stack Overflow in Logger
**Symptom**: RangeError: Maximum call stack size exceeded
**Cause**: Logger property naming collision
**Fix**: Internal winston logger renamed to `winstonLogger`

#### 2. Redis Connection Failed
**Symptom**: Tests fail with "Redis not connected"
**Cause**: Missing REDIS_HOST environment variable
**Fix**: Set `REDIS_HOST=localhost` or ensure Redis is running

#### 3. Validation Errors
**Symptom**: "Invalid UUID v4 format" or similar
**Cause**: Incorrect data format
**Fix**: Use factory functions like `createCheckpoint()`

#### 4. Oversized Payloads
**Symptom**: `_oversized: true` in retrieved data
**Cause**: Payload exceeds MAX_PAYLOAD_SIZE
**Fix**: Increase limit or enable compression

### Debug Tips

1. **Enable verbose logging**:
   ```bash
   LOG_LEVEL=debug npm start
   ```

2. **Check validation errors**:
   ```javascript
   try {
     validateCheckpoint(data);
   } catch (error) {
     console.log(error.errors); // Zod error details
   }
   ```

3. **Monitor cache statistics**:
   ```javascript
   const stats = cacheService.getStats();
   console.log(stats);
   ```

## Future Enhancements

### Planned Features

1. **Compression Support**
   - gzip/snappy for large payloads
   - Automatic compression based on size
   - Transparent decompression

2. **Advanced Validation**
   - Custom validators per site
   - Business rule validation
   - Cross-field dependencies

3. **Performance Optimization**
   - Validation result caching
   - Lazy validation for reads
   - Batch validation optimization

4. **Monitoring Integration**
   - Prometheus metrics
   - Validation error rates
   - Performance dashboards

### API Stability

The validation API is considered stable for:
- Core checkpoint operations
- Basic CRUD functionality
- Schema structure

Subject to change:
- Query/session schemas (future functionality)
- Performance utilities
- Internal implementation details

## References

- [Zod Documentation](https://zod.dev/)
- [MongoDB JSON Schema](https://docs.mongodb.com/manual/reference/operator/query/jsonSchema/)
- [Redis Best Practices](https://redis.io/topics/data-types)
- Project Requirements: `SCRAPING_REQUIREMENTS.md`
- Roadmap: `ROADMAP_DETAILED.md`