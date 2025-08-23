# Checkpoint System Architecture

## Overview
The checkpoint system provides fault-tolerant, resumable scraping capabilities by tracking pipeline progress and enabling recovery from failures.

## Architecture Decision

### Database Technology: MongoDB (Raw Driver) + Zod
After critical analysis using the Zen challenge tool, we chose:
- **MongoDB raw driver** over Mongoose ODM
- **Zod** for runtime validation
- **MongoDB JSON Schema** for database-level validation

#### Rationale:
1. **Consistency**: Entire codebase already uses raw MongoDB driver
2. **Performance**: No ODM overhead, direct database operations
3. **Flexibility**: Raw driver provides better control for atomic operations
4. **Validation**: Zod offers superior TypeScript integration and runtime safety
5. **Simplicity**: Avoids unnecessary abstraction layer

### Storage Strategy: Hybrid Approach
- **Redis**: Fast, ephemeral progress tracking (48-hour TTL)
- **MongoDB**: Durable checkpoint recovery and user query support

## Data Model

### Three-Collection Architecture
Designed to support both internal checkpoints and future user queries:

```javascript
// 1. checkpoints collection (internal)
{
  _id: ObjectId,
  checkpoint_id: String,      // UUID
  site_domain: String,         // e.g., "glasswingshop.com"
  job_type: String,           // "product_catalog" | "product_detail"
  pipeline_step: Number,      // 1-4
  pipeline_data: {
    urls_discovered: Array,
    urls_processed: Array,
    current_page: Number,
    pagination_state: Object,
    extraction_results: Array
  },
  status: String,             // "active" | "completed" | "failed"
  created_at: Date,
  updated_at: Date,
  expires_at: Date           // TTL index
}

// 2. user_queries collection (external)
{
  _id: ObjectId,
  query_id: String,           // UUID
  user_id: String,
  query_text: String,         // "find cheapest red dress under $50"
  parsed_intent: {
    product_type: String,
    attributes: Object,
    price_range: Object
  },
  status: String,
  created_at: Date,
  updated_at: Date
}

// 3. query_sessions collection (linking)
{
  _id: ObjectId,
  session_id: String,         // UUID
  query_id: String,           // Reference to user_queries
  checkpoint_ids: Array,      // Associated checkpoints
  sites_searched: Array,
  results: Array,
  created_at: Date,
  completed_at: Date
}
```

## Implementation Phases

### Phase 1: Foundation (Week 1)
1. **Day 1**: Architecture setup and Redis namespace
2. **Day 2**: MongoDB schemas and Zod validation
3. **Day 3**: CheckpointManager implementation
4. **Day 4**: Feature flag integration
5. **Day 5**: Begin pipeline refactoring

### Phase 2: Integration (Week 2)
- Refactor 4-step pipeline components
- Add checkpoint hooks to each step
- Implement recovery logic

### Phase 3: User Query Support (Future)
- Query parsing and intent extraction
- Session management
- Result aggregation

## Key Design Decisions

### 1. Atomic Operations
Using MongoDB's atomic operators for race-safe updates:
```javascript
await collection.findOneAndUpdate(
  { checkpoint_id },
  { 
    $inc: { 'pipeline_data.urls_processed': 1 },
    $set: { updated_at: new Date() }
  },
  { returnDocument: 'after' }
);
```

### 2. TTL Strategy
- Redis: 48-hour TTL for active checkpoints
- MongoDB: 48-hour TTL via expires_at index
- Completed checkpoints archived for analysis

### 3. Feature Flag Rollout
```javascript
if (process.env.ENABLE_CHECKPOINTS === 'true') {
  await checkpointManager.save(state);
}
```

### 4. Validation Layers
1. **API Level**: Zod schemas for input validation
2. **Database Level**: MongoDB JSON Schema for data integrity
3. **Runtime**: TypeScript interfaces for type safety

## Performance Considerations

### Optimization Strategies
1. **Batch Operations**: Group checkpoint updates
2. **Lazy Loading**: Only load necessary checkpoint data
3. **Index Strategy**:
   - Compound index on (site_domain, job_type, status)
   - TTL index on expires_at
   - Single index on checkpoint_id

### Expected Performance
- Checkpoint save: < 50ms (Redis), < 100ms (MongoDB)
- Recovery lookup: < 20ms (Redis), < 50ms (MongoDB)
- Minimal impact on scraping performance (< 2% overhead)

## Error Handling

### Failure Scenarios
1. **Redis Unavailable**: Fallback to MongoDB-only mode
2. **MongoDB Unavailable**: Graceful degradation, continue without checkpoints
3. **Partial Failures**: Transaction rollback, maintain consistency

### Recovery Process
```javascript
// 1. Check Redis for recent checkpoint
const redisCheckpoint = await redis.get(checkpointKey);

// 2. If not found, check MongoDB
const mongoCheckpoint = await db.collection('checkpoints')
  .findOne({ checkpoint_id, status: 'active' });

// 3. Resume from last known state
if (checkpoint) {
  await pipeline.resume(checkpoint.pipeline_data);
}
```

## Testing Strategy

### Unit Tests
- CheckpointManager methods
- Validation schemas
- Atomic operations

### Integration Tests
- Redis/MongoDB interaction
- Recovery scenarios
- TTL expiration

### System Tests
- End-to-end checkpoint/resume
- Performance benchmarks
- Failure recovery

## Migration Path

### Rollout Plan
1. Deploy with feature flag disabled
2. Test with select sites
3. Monitor performance metrics
4. Gradual rollout to all sites
5. Enable user query support

### Rollback Strategy
- Feature flag allows instant disable
- No breaking changes to existing code
- Checkpoint data can be safely ignored

## Future Enhancements

### Planned Features
1. **Checkpoint Analytics**: Track recovery patterns
2. **Smart Resume**: Predict optimal resume points
3. **Distributed Checkpoints**: Multi-instance coordination
4. **Query Optimization**: Learn from user patterns

### User Query Integration
- Natural language processing for queries
- Multi-site result aggregation
- Personalized search preferences
- Historical query tracking

## Compliance & Security

### Data Privacy
- No PII in checkpoints
- User queries anonymized
- Automatic data expiration

### Rate Limiting
- Checkpoint updates throttled
- Prevents database overload
- Configurable per-site limits

## Monitoring & Observability

### Key Metrics
- Checkpoint creation rate
- Recovery success rate
- Storage utilization
- Query response times

### Alerting Thresholds
- Recovery failure rate > 5%
- Checkpoint save latency > 200ms
- Storage usage > 80%

## Conclusion

This checkpoint system architecture provides a robust foundation for fault-tolerant scraping while preparing for future user query capabilities. The hybrid storage approach balances performance and durability, while the three-collection design supports both internal operations and external user interactions.