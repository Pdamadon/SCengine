# Product Catalog Discovery System Requirements

## Overview
Transform the existing navigation system into a comprehensive Product Catalog Discovery System that systematically maps site hierarchy AND collects ALL product links with pagination handling.

## Business Requirements

### Primary Goal
Enable queries like "Price difference for Patagonia jacket at REI vs Nordstrom?" by having complete product catalogs pre-mapped for instant targeted scraping.

### Success Criteria
- Map complete site hierarchy (3-4 levels deep)
- Identify and collect ALL product URLs from category pages
- Handle pagination (infinite scroll, load more, see all)
- Store navigation structure in MongoDB navigation_maps collection
- Store product catalogs in MongoDB products collection
- Maintain <200ms query performance per SCRAPING_REQUIREMENTS.md
- Backward compatible with existing navigation workflows

## Technical Requirements

### Core Components to Build

#### 1. ProductCatalogStrategy
- **File:** `src/intelligence/navigation/strategies/ProductCatalogStrategy.js`
- **Purpose:** Detect product-rich pages and collect product URLs
- **Extends:** NavigationStrategy base class
- **Key Methods:**
  - `analyzePageForProducts(page)` - URL patterns, price indicators, add-to-cart buttons
  - `collectProductURLs(page)` - Extract all product links from page
  - `calculateConfidence(data)` - Score product page likelihood

#### 2. Enhanced NavigationTreeBuilder
- **File:** `src/intelligence/navigation/NavigationTreeBuilder.js`
- **Modification:** `exploreNode()` method enhancement
- **New Functionality:**
  - Call ProductCatalogStrategy on each visited page
  - Collect product URLs when product-rich page detected
  - Maintain separation between navigation structure and product catalog
  - Preserve backward compatibility

#### 3. PaginationHandler
- **File:** `src/intelligence/navigation/PaginationHandler.js`
- **Purpose:** Handle all pagination types for complete product collection
- **Pagination Types:**
  - Traditional (Next/Previous buttons)
  - Load More/See All buttons
  - Infinite scroll detection and simulation
  - AJAX-loaded content handling

#### 4. ProductCatalogCache
- **File:** `src/cache/ProductCatalogCache.js`
- **Purpose:** MongoDB integration for products collection
- **Features:**
  - Bulk product URL insertion (batch size: 1000)
  - Product URL deduplication
  - Navigation context preservation
  - Performance optimization

#### 5. NavigationCacheSingleton
- **File:** `src/cache/NavigationCacheSingleton.js`
- **Purpose:** Singleton pattern for navigation cache
- **Pattern:** Mirror SelectorCacheSingleton implementation

### Performance Requirements

#### Memory Management
- Stream products to MongoDB in batches of 1000
- Clear in-memory buffers after each batch
- Implement scroll-and-flush pattern for infinite scroll
- Circuit breaker for memory-intensive operations

#### Rate Limiting
- Respect robots.txt and site-specific rate limits
- Configurable delays between page visits
- Exponential backoff for failed requests

#### Timeout Handling
- Page navigation timeout: 15 seconds
- Pagination interaction timeout: 30 seconds
- Maximum products per page: 1000 (configurable)

### Data Storage Requirements

#### MongoDB Schema Alignment
```javascript
// products collection
{
  _id: ObjectId,
  url: String,
  title: String,
  domain: String,
  navigationPath: String,
  categoryContext: String,
  discoveredAt: Date,
  navPathHashes: [ObjectId], // References to navigation_nodes
  productMetadata: {
    hasPrice: Boolean,
    hasAddToCart: Boolean,
    imageCount: Number
  }
}

// navigation_maps collection (existing schema)
{
  _id: ObjectId,
  domain: String,
  navigation_type: String,
  structure: Object,
  lastUpdated: Date
}
```

#### Data Integrity
- Product URL deduplication across pagination
- Navigation-product relationship consistency
- Atomic operations for bulk insertions
- Rollback capability for failed operations

### Error Handling Requirements

#### Failure Isolation
- Navigation discovery failures: Log, skip branch, continue with siblings
- Product collection failures: Enqueue retry, continue navigation
- Pagination timeouts: Save partial results, mark for retry
- MongoDB failures: Retry with exponential backoff

#### Recovery Mechanisms
- Retry queue for failed product collections
- Checkpoint system for large pagination sequences
- State recovery for interrupted crawls
- Graceful degradation when components fail

## Integration Requirements

### Backward Compatibility
- All existing navigation workflows must continue functioning
- No breaking changes to NavigationStrategy interface
- Existing NavigationMapper APIs preserved
- Configuration backward compatibility

### Configuration System
```javascript
const productCatalogConfig = {
  enabled: true,
  maxProductsPerPage: 1000,
  paginationTimeout: 30000,
  productDetectionMinimum: 3,
  enableInfiniteScroll: true,
  enableLoadMoreButtons: true,
  batchSize: 1000,
  crawlMode: 'parallel', // 'sequential' | 'parallel'
  retryAttempts: 3,
  retryDelay: 5000
};
```

### Pipeline Integration
- Add ProductCatalogStrategy to NavigationDiscoveryPipeline
- Maintain strategy execution order
- Preserve existing strategy configurations
- Support strategy enable/disable flags

## Testing Requirements

### Unit Testing
- ProductCatalogStrategy product detection accuracy
- PaginationHandler all pagination types
- ProductCatalogCache MongoDB operations
- NavigationTreeBuilder enhanced functionality

### Integration Testing
- End-to-end tests on major e-commerce sites (REI, Nordstrom, Gap)
- Performance testing with large catalogs (10k+ products)
- MongoDB storage efficiency validation
- Memory usage monitoring under load

### Validation Criteria
- Product detection accuracy: >95%
- False positive rate: <5%
- Pagination completeness: >95% of available products
- Performance overhead: <50% increase in navigation time
- Memory usage: <2GB for 10k product catalog

## Compliance Requirements

### Legal & Ethical
- Respect robots.txt directives
- Implement rate limiting per SCRAPING_REQUIREMENTS.md
- No violation of site terms of service
- Privacy-compliant data handling

### Security
- No exposure of sensitive data in logs
- Secure MongoDB connection handling
- Input validation for all scraped data
- XSS prevention in stored URLs

## Deployment Requirements

### Feature Flags
- ProductCatalogStrategy enable/disable
- Pagination handling enable/disable
- MongoDB storage enable/disable
- Individual strategy toggles

### Monitoring
- Product collection success rates
- Pagination handling performance
- MongoDB storage metrics
- Memory usage tracking
- Error rate monitoring

### Rollback Strategy
- Component-level rollback capability
- Configuration rollback
- Data rollback for failed migrations
- Emergency disable switches

## Dependencies

### External Dependencies
- MongoDB 4.4+ for storage
- Playwright for browser automation
- Redis for caching (existing)
- Node.js environment (existing)

### Internal Dependencies
- NavigationStrategy base class
- NavigationDiscoveryPipeline
- NavigationTreeBuilder
- SelectorLearningCache pattern
- MongoDB schema from mongodb-schema.js

## Success Metrics

### Functional Metrics
- Sites successfully mapped: Target 100%
- Product URLs discovered per site: Target >90% completeness
- Navigation hierarchy depth: Target 3-4 levels
- Pagination handling success: Target >95%

### Performance Metrics
- Average products discovered per minute: Target >1000
- MongoDB query response time: <200ms per requirement
- Memory usage per 1000 products: <100MB
- Navigation + product discovery time: <2x baseline

### Quality Metrics
- Product URL accuracy: >99% valid URLs
- Navigation-product relationship accuracy: >99%
- Data consistency across runs: >99%
- Error recovery success rate: >90%