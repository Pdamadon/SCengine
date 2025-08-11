# SCRAPING SYSTEM REQUIREMENTS & INDUSTRY STANDARDS
# Version 1.0 - Must be consulted before ANY code changes

## 🎯 CORE PRINCIPLES

### System Reliability (99.9% uptime target)
- **Graceful degradation** - System continues operating with reduced functionality if components fail
- **Circuit breaker pattern** - Prevent cascading failures across services
- **Bulkhead isolation** - Isolate different scraping domains to prevent cross-contamination
- **Retry with exponential backoff** - Handle transient failures intelligently
- **Health checks** - All services must expose /health endpoints

### Data Integrity & Quality
- **ACID compliance** - All database transactions must be atomic, consistent, isolated, durable
- **Data validation** - Multi-layer validation (input, business logic, output)
- **Idempotency** - All operations must be safely retryable without side effects
- **Audit logging** - All data changes must be tracked with timestamps and source
- **Consistency checks** - Regular validation of data integrity across collections

### Performance & Scalability Standards
- **Response time SLAs** - API responses < 200ms, scraping requests < 5 minutes
- **Throughput requirements** - Handle 1000+ concurrent requests
- **Resource limits** - Memory usage < 80%, CPU usage < 70% sustained
- **Connection pooling** - Efficient database and HTTP connection management
- **Caching strategy** - Multi-layer caching with appropriate TTLs

## 🔒 SECURITY & COMPLIANCE

### Web Scraping Ethics & Legal Compliance
- **robots.txt compliance** - Always check and respect robots.txt files
- **Rate limiting respect** - Never exceed reasonable request rates (default: 1 req/sec per domain)
- **User-Agent identification** - Always identify as legitimate research/comparison service
- **Terms of Service compliance** - Automated checking against prohibited scraping patterns
- **GDPR/CCPA compliance** - No personal data collection without explicit consent
- **Copyright respect** - Only extract factual data (prices, availability), not creative content

### Anti-Detection & Ethical Practices
- **Rotate user agents** - Use realistic browser user agent strings
- **Respect HTTP status codes** - Honor 429 (rate limit), 403 (forbidden), 503 (service unavailable)
- **Session management** - Maintain realistic browsing sessions
- **Delay patterns** - Human-like delays between requests (2-10 seconds)
- **Proxy rotation** - Use residential proxies ethically and legally
- **Failure handling** - Back off immediately on repeated failures

### Data Security
- **Encryption at rest** - All sensitive data encrypted in database
- **Encryption in transit** - HTTPS/TLS for all network communications  
- **Access controls** - Role-based access to sensitive operations
- **API authentication** - JWT tokens with appropriate expiration
- **Input sanitization** - Prevent injection attacks on all inputs
- **Secrets management** - Use environment variables/vault for sensitive configuration

## 🏗️ ARCHITECTURAL REQUIREMENTS

### Microservices Design Patterns
- **Single Responsibility Principle** - Each service has one clear purpose
- **API-first design** - All communication through well-defined APIs
- **Database per service** - Each service owns its data
- **Stateless services** - No server-side session state
- **Event-driven architecture** - Use events for async communication between services

### Observability & Monitoring
- **Structured logging** - JSON format with correlation IDs
- **Distributed tracing** - Track requests across service boundaries
- **Metrics collection** - Prometheus-compatible metrics
- **Error tracking** - Centralized error collection and alerting
- **Performance monitoring** - APM tool integration (New Relic, DataDog, etc.)

### Deployment & Operations
- **12-Factor App compliance** - Config in environment, stateless processes, etc.
- **Container-ready** - Docker containers with proper health checks
- **Zero-downtime deployments** - Blue-green or rolling deployment strategies
- **Database migrations** - Versioned, reversible schema changes
- **Configuration management** - Environment-specific configs without code changes

## 🧪 TESTING & QUALITY ASSURANCE

### Testing Strategy (Minimum Requirements)
- **Unit test coverage** - Minimum 80% code coverage
- **Integration tests** - Test service boundaries and database interactions
- **Contract tests** - API contract validation between services
- **Load tests** - Validate performance under expected load
- **Chaos engineering** - Test system resilience to failures
- **Security tests** - Automated vulnerability scanning

### Code Quality Standards  
- **ESLint configuration** - Enforced coding standards
- **Type safety** - TypeScript for all new code
- **Code reviews** - All changes require peer review
- **Static analysis** - Automated code quality checking
- **Dependency scanning** - Regular security vulnerability checks
- **Documentation** - JSDoc for all public APIs

## 📊 DATA STANDARDS & FORMATS

### Data Schema Requirements
- **JSON Schema validation** - All data structures must have formal schemas
- **Backward compatibility** - Schema changes must not break existing consumers
- **Data normalization** - Consistent formats for prices, dates, URLs, etc.
- **Metadata standards** - All records include created_at, updated_at, version fields
- **Relationship integrity** - Foreign key relationships properly maintained

### API Standards
- **RESTful design** - Follow REST principles for resource-based APIs
- **HTTP status codes** - Proper use of 2xx, 4xx, 5xx status codes
- **Content negotiation** - Support JSON, XML where appropriate
- **Versioning strategy** - API versioning in headers or URL path
- **Rate limiting** - Standard rate limiting headers and responses
- **CORS configuration** - Proper cross-origin resource sharing setup

## 🔄 ERROR HANDLING & RESILIENCE

### Error Classification & Handling
- **Transient errors** - Network timeouts, temporary service unavailable (retry with backoff)
- **Permanent errors** - 404, authentication failures, malformed data (don't retry)
- **Rate limit errors** - 429 status codes (respect retry-after headers)
- **Business logic errors** - Invalid product data, category mismatches (log and continue)
- **System errors** - Database connection failures, memory issues (alert and failover)

### Resilience Patterns (REQUIRED)
- **Circuit breaker** - Prevent cascading failures
- **Bulkhead** - Isolate different types of work
- **Timeout** - All external calls must have timeouts
- **Retry** - Exponential backoff with jitter
- **Fallback** - Graceful degradation when services fail

## 📈 PERFORMANCE BENCHMARKS

### Response Time Requirements
- **Health checks** - < 50ms
- **Simple API queries** - < 200ms  
- **Complex queries** - < 1000ms
- **Scraping requests** - < 5 minutes end-to-end
- **Batch operations** - Progress updates every 30 seconds

### Throughput Requirements  
- **API requests** - 1000+ RPS sustained
- **Concurrent scraping** - 100+ sites simultaneously
- **Database operations** - 10,000+ queries/second
- **Queue processing** - 500+ messages/second
- **Data ingestion** - 1000+ products/minute

### Resource Utilization Limits
- **Memory usage** - < 80% of allocated memory
- **CPU usage** - < 70% sustained load
- **Disk I/O** - < 80% utilization
- **Network bandwidth** - < 70% of available
- **Database connections** - < 80% of connection pool

## ⚠️ FAILURE SCENARIOS & MITIGATION

### Expected Failure Modes
1. **Site structure changes** - Selectors become invalid
   - Mitigation: Automatic selector fallback chains, visual similarity matching
2. **Anti-bot detection** - Sites block scraping attempts  
   - Mitigation: Proxy rotation, request delay variation, CAPTCHA handling
3. **Database performance degradation** - High query latency
   - Mitigation: Read replicas, query optimization, caching layers
4. **Memory leaks** - Long-running processes consume increasing memory
   - Mitigation: Regular process restarts, memory monitoring, garbage collection tuning
5. **Network partitions** - Services cannot communicate
   - Mitigation: Event sourcing, eventual consistency, offline queue processing

### Recovery Procedures
- **Automatic restarts** - Services auto-restart on critical failures
- **Data backup/restore** - Automated daily backups with tested restore procedures
- **Rollback procedures** - Ability to revert to previous version within 5 minutes
- **Manual intervention** - Clear escalation procedures for human intervention
- **Disaster recovery** - Multi-region deployment with failover capability

## 🎯 COMPLIANCE CHECKLIST (Use before ANY deployment)

### Pre-Deployment Validation
- [ ] All tests pass (unit, integration, load, security)
- [ ] Performance benchmarks met
- [ ] Security scan passed
- [ ] Error handling tested for all identified failure modes  
- [ ] Monitoring and alerting configured
- [ ] Database migration tested and reversible
- [ ] API documentation updated
- [ ] Legal/ethical compliance verified
- [ ] Backup and recovery procedures tested
- [ ] Rollback procedure documented and tested

### Post-Deployment Monitoring (First 24 Hours)
- [ ] All health checks green
- [ ] Error rates within acceptable thresholds
- [ ] Performance metrics within SLA
- [ ] No security alerts triggered
- [ ] Data quality validation passed
- [ ] User feedback/issues tracked
- [ ] System resources within limits
- [ ] No cascading failures detected

## 📋 CURRENT SYSTEM INTEGRATION REQUIREMENTS

### Existing System Compatibility
- **Backward compatibility** - All changes must work with existing CategoryAwareParallelScraper
- **Database schema evolution** - New collections/fields must not break existing WorldModelPopulator
- **API compatibility** - Existing scraping workflows must continue to function
- **Configuration preservation** - Existing environment variables and config must remain valid

### Integration Points That Must Be Preserved
- **MongoDB collections** - products, categories, domains must remain accessible
- **Scraping workflows** - Existing parallel scraping must continue to work
- **Site intelligence** - Current NavigationMapper and SiteIntelligence integration
- **Category hierarchy** - Multi-category system already implemented

### Migration Strategy Requirements
- **Zero downtime** - System must remain operational during all upgrades
- **Feature flags** - New functionality must be toggleable for safe rollout
- **Rollback capability** - Any change must be reversible within 5 minutes
- **Data preservation** - No existing data loss during schema changes
- **Performance maintenance** - New features must not degrade existing performance

---

**⚠️ CRITICAL REMINDER**: This document must be consulted and requirements verified before making ANY code changes. Non-compliance may result in system instability, legal issues, or data integrity problems.

**📝 UPDATE REQUIREMENT**: This document must be updated whenever new requirements are identified or standards change. All updates require peer review.

**🔄 REVIEW SCHEDULE**: This document must be reviewed and updated quarterly to ensure continued relevance and compliance with evolving industry standards.

## 🔍 IMPLEMENTATION VALIDATION

Before implementing any feature, ask yourself:

1. **Reliability**: How does this fail gracefully? What's the fallback?
2. **Security**: Is this ethically compliant? Are we respecting site policies?
3. **Performance**: Will this meet our SLA requirements under load?
4. **Quality**: Is this testable? How will we validate it works correctly?
5. **Compatibility**: Does this break existing functionality? How do we migrate safely?

If you cannot answer all 5 questions confidently, the feature needs more design work before implementation.