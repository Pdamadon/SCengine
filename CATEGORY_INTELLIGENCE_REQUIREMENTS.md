# CATEGORY INTELLIGENCE SYSTEM REQUIREMENTS
# Version 1.0 - Phase 3.1 Implementation Guide

## 🎯 SYSTEM OVERVIEW

### Mission Statement
Create a modular, scalable Category Intelligence System that enables rapid addition of scrapers for any e-commerce site while preserving the rich data collection capabilities demonstrated by the Glasswing implementation. The system must save complete site intelligence, category hierarchies, and product relationships without breaking existing functionality.

### Core Objectives
- **Rapid Site Integration** - Add new e-commerce sites in under 30 minutes
- **Rich Data Preservation** - Maintain 4-level category hierarchy with relationships
- **Zero Breaking Changes** - Existing scraping workflows must continue to function
- **Distributed Processing** - Redis queue-based architecture for scalable scraping
- **Comprehensive Intelligence** - Capture site intelligence, navigation patterns, and product relationships

## 🏗️ ARCHITECTURAL REQUIREMENTS

### Modular Design Principles
- **Site Agnostic Core** - Intelligence system works with any e-commerce platform
- **Plugin Architecture** - Site-specific scrapers as pluggable modules
- **Intelligence Inheritance** - New sites inherit common e-commerce patterns
- **Graceful Fallbacks** - Universal scrapers when site-specific ones fail
- **Configuration Driven** - Platform behaviors defined in config, not code

### Required System Components

#### 1. Site Intelligence Discovery Engine
**Purpose**: Automatically analyze and understand e-commerce site structure
**Location**: `src/intelligence/` (existing system - enhance, don't replace)
**Requirements**:
- Detect platform type (Shopify, WooCommerce, Magento, Custom)
- Generate navigation maps for main menu, categories, filters
- Identify product selectors with reliability scoring
- Extract site capabilities (search, cart, checkout, variants)
- Cache intelligence with 7-day TTL for performance

#### 2. Category Hierarchy Extraction System
**Purpose**: Discover and map complete 4-level category structures
**Location**: `src/category-intelligence/` (new module)
**Requirements**:
- **Level 1**: Site/Domain (glasswingshop.com, gap.com)
- **Level 2**: Gender Demographics (mens, womens, kids, unisex)
- **Level 3**: Product Categories (boots, jackets, accessories)
- **Level 4**: Brands/Collections (specific product lines, designers)
- Preserve parent-child relationships and cross-references
- Generate canonical category IDs for deduplication
- Save complete category metadata (selectors, product counts, URLs)

#### 3. Redis Queue Orchestrator
**Purpose**: Coordinate distributed scraping with category awareness
**Location**: `src/scrapers/redis_product_queue_orchestrator.js` (existing - extend)
**Requirements**:
- Queue product scraping jobs with category context
- Distribute workload across multiple Redis workers
- Preserve category relationships in queued job data
- Support priority queuing for high-value categories
- Handle job failures with intelligent retry logic

#### 4. Multisite Scraper Factory
**Purpose**: Instantiate appropriate scrapers for any e-commerce site
**Location**: `src/multisite/core/ScraperFactory.js` (existing - extend)
**Requirements**:
- Detect platform and route to specialized scraper
- Fallback to Universal Scraper for unknown platforms
- Cache scraper instances for performance
- Support configuration-driven scraper selection
- Integrate with existing ScrapingWorker seamlessly

#### 5. World Model Populator Integration
**Purpose**: Save all discovered data to MongoDB with proper relationships
**Location**: `src/services/WorldModelPopulator.js` (existing - extend)
**Requirements**:
- Save site intelligence to `domains` collection
- Save category hierarchy to `categories` collection
- Save products with category relationships to `products` collection
- Maintain foreign key relationships across collections
- Update dashboard counters from populated data

### Database Integration Requirements

#### Enhanced MongoDB Schema Usage
Must utilize existing schema from `config/database/mongodb_schema.js`:

**Domains Collection** - Save complete site intelligence:
```javascript
{
  domain: "gap.com",
  platform: "custom",
  site_type: "ecommerce",
  intelligence_score: 85,
  capabilities: { can_extract_products: true, can_navigate_categories: true },
  selectors: { navigation: {...}, products: {...}, cart: {...} },
  navigation_map: { main_sections: [...], dropdown_menus: {...} },
  performance_metrics: { success_rate: 0.92, total_scrapes: 145 }
}
```

**Categories Collection** - Save 4-level hierarchy:
```javascript
{
  domain: "gap.com",
  category_path: "/browse/category/mens-jeans",
  category_name: "Men's Jeans",
  parent_category: "/browse/category/mens",
  subcategories: ["/browse/category/mens-jeans-skinny", "/browse/category/mens-jeans-straight"],
  product_count: 150,
  selectors: { category_link: "...", product_grid: "...", pagination: "..." },
  filters_available: [{ name: "Size", type: "size", options: ["28", "30", "32"] }]
}
```

**Products Collection** - Save with category relationships:
```javascript
{
  domain: "gap.com",
  product_id: "gap_12345",
  category: "/browse/category/mens-jeans",
  title: "Straight Fit Jeans",
  pricing: { current_price: 89.95, original_price: 119.95 },
  variants: [{ name: "Size", value: "32", price: 89.95 }],
  availability: { in_stock: true, stock_count: 15 }
}
```

## 🔄 WORKFLOW INTEGRATION REQUIREMENTS

### Phase 3.1 Implementation Flow

#### 1. Site Discovery & Intelligence Generation
```
1. User submits site for scraping (gap.com)
2. PlatformDetector analyzes site and detects platform
3. Intelligence system generates navigation maps and selectors
4. WorldModelPopulator saves site intelligence to domains collection
5. System returns "ready for category discovery" status
```

#### 2. Category Hierarchy Discovery
```
1. CategoryHierarchyExtractor analyzes site navigation
2. Discovers all category levels (site → demographics → products → brands)
3. Maps parent-child relationships and generates canonical IDs
4. WorldModelPopulator saves complete hierarchy to categories collection
5. System returns "ready for product discovery" status
```

#### 3. Distributed Product Discovery & Queuing
```
1. RedisProductQueueOrchestrator discovers product URLs using category intelligence
2. Queues individual product scraping jobs with category context
3. Each Redis job contains: product_url, category_path, site_intelligence
4. ScrapingWorkers process jobs using appropriate platform scrapers
5. WorldModelPopulator saves products with preserved category relationships
```

#### 4. Results Integration & Dashboard Updates
```
1. ScrapingWorker saveResults method integrates with WorldModelPopulator
2. Dashboard counters updated from WorldModelPopulator results
3. Site intelligence, categories, and products all properly linked
4. System ready for AI training data generation
```

### Backward Compatibility Requirements
- **Existing APIs** - All current scraping endpoints must continue to work
- **GlasswingScraper** - Must continue to work seamlessly within new architecture
- **Database Schema** - No breaking changes to existing collections
- **Configuration** - Existing environment variables must remain valid
- **Queue System** - Existing Redis queue patterns must be preserved

## 🎯 IMPLEMENTATION STANDARDS

### Code Quality Requirements
- **TypeScript** - All new code must use TypeScript
- **JSDoc** - Document all public APIs and complex logic
- **ESLint** - Follow existing project ESLint configuration
- **Test Coverage** - Minimum 80% coverage for new components
- **Error Handling** - Comprehensive error handling with graceful fallbacks

### Performance Requirements
- **Site Intelligence Generation** - < 30 seconds per new site
- **Category Discovery** - < 2 minutes for complete hierarchy
- **Product Queue Processing** - 500+ products/minute distributed processing
- **Database Operations** - < 200ms for individual saves, bulk operations supported
- **Memory Usage** - < 80% of allocated memory during peak processing

### Reliability Requirements
- **Circuit Breakers** - Prevent cascading failures across sites
- **Retry Logic** - Exponential backoff for transient failures
- **Fallback Mechanisms** - Universal scrapers when platform-specific ones fail
- **Health Monitoring** - All components must expose health endpoints
- **Graceful Degradation** - System continues operating if individual sites fail

## 🔒 SECURITY & COMPLIANCE

### Ethical Scraping Standards
- **robots.txt Compliance** - Always check and respect robots.txt files
- **Rate Limiting** - Never exceed 1 request/second per domain default
- **User Agent Rotation** - Use realistic browser user agent strings
- **Session Management** - Maintain realistic browsing sessions
- **Failure Response** - Back off immediately on 429, 403, 503 responses

### Data Privacy & Legal Compliance
- **No Personal Data** - Only extract factual product data (prices, availability, descriptions)
- **Copyright Respect** - No creative content extraction (reviews, images beyond URLs)
- **Terms of Service** - Automated checking against prohibited scraping patterns
- **GDPR Compliance** - No collection of personal identifiable information
- **Audit Logging** - All scraping activities logged with timestamps and sources

## 📊 SUCCESS METRICS

### System Performance Targets
- **Site Addition Time** - < 30 minutes from URL to first product scraped
- **Data Completeness** - 90%+ products have category relationships
- **System Reliability** - 99.9% uptime with graceful degradation
- **Processing Throughput** - 1000+ products/minute across all sites
- **Intelligence Accuracy** - 95%+ selector reliability after 24 hours

### Data Quality Metrics
- **Category Hierarchy Completeness** - All 4 levels discovered and mapped
- **Product Relationship Integrity** - 100% products linked to categories
- **Site Intelligence Coverage** - Navigation, selectors, capabilities fully mapped
- **Duplicate Prevention** - Canonical category system prevents duplicates
- **Data Freshness** - Intelligence updated within 7 days, products within 24 hours

## 🚀 ROLLOUT STRATEGY

### Phase 3.1 Implementation Phases

#### Week 1: Foundation Enhancement
- [ ] Extend WorldModelPopulator with site intelligence saving
- [ ] Enhance RedisProductQueueOrchestrator with category context
- [ ] Integrate ScrapingWorker with WorldModelPopulator
- [ ] Update dashboard to show new data sources

#### Week 2: Category Intelligence System
- [ ] Create CategoryHierarchyExtractor component
- [ ] Implement 4-level hierarchy discovery logic  
- [ ] Build canonical category ID system
- [ ] Test with Glasswing and Gap.com

#### Week 3: Multisite Integration Testing
- [ ] Test complete flow with 3 different e-commerce platforms
- [ ] Validate data relationships across all collections
- [ ] Performance test distributed queue processing
- [ ] Load test with 100+ concurrent sites

### Feature Flag Strategy
- `ENABLE_CATEGORY_INTELLIGENCE` - Toggle new category discovery
- `ENABLE_SITE_INTELLIGENCE_SAVING` - Toggle site intelligence persistence
- `ENABLE_DISTRIBUTED_PRODUCT_QUEUE` - Toggle Redis queue orchestration
- `ENABLE_MULTISITE_SCRAPERS` - Toggle multisite scraper factory

### Rollback Requirements
- **Database Migration Reversibility** - All schema changes must be reversible
- **Configuration Rollback** - Previous configurations must remain valid
- **Code Rollback** - Previous codebase must be deployable within 5 minutes
- **Data Preservation** - No data loss during rollbacks

## ⚠️ RISK MITIGATION

### Technical Risks
1. **Performance Degradation** - New intelligence generation slows existing scraping
   - **Mitigation**: Async intelligence generation, caching, performance monitoring
2. **Memory Leaks** - Intelligence caching consumes excessive memory
   - **Mitigation**: TTL-based cache eviction, memory monitoring, automatic restarts
3. **Database Performance** - Complex relationship queries slow down system
   - **Mitigation**: Proper indexing, query optimization, read replicas

### Business Risks
1. **Site Blocking** - Increased scraping triggers anti-bot measures
   - **Mitigation**: Respect rate limits, rotate proxies, graceful failure handling
2. **Legal Compliance** - Enhanced scraping violates terms of service
   - **Mitigation**: Automated ToS checking, ethical scraping patterns, legal review
3. **Data Quality Issues** - Complex relationships introduce data inconsistencies
   - **Mitigation**: ACID transactions, data validation, consistency checks

## 🎯 VALIDATION CHECKLIST

### Pre-Implementation Validation
- [ ] All existing tests pass without modification
- [ ] Performance benchmarks maintained for existing functionality  
- [ ] Security scanning shows no new vulnerabilities
- [ ] Backward compatibility validated with existing scrapers
- [ ] Database migration scripts tested and reversible

### Post-Implementation Validation
- [ ] New sites can be added in < 30 minutes end-to-end
- [ ] Category hierarchies correctly discovered and saved
- [ ] Product relationships maintained across distributed processing
- [ ] Dashboard accurately reflects new data sources
- [ ] System performance within SLA requirements

### Success Criteria
- [ ] **Glasswing scraper** - Continues to work identically within new system
- [ ] **Gap.com integration** - Complete site intelligence and products scraped
- [ ] **Third platform test** - At least one additional e-commerce platform working
- [ ] **Redis queue processing** - 500+ products/minute distributed processing
- [ ] **Data relationships** - 100% product-category relationships preserved

---

**⚠️ CRITICAL REMINDER**: This system must be built alongside existing functionality, never replacing it. All existing scraping workflows must continue to operate during and after implementation.

**🔄 COMPATIBILITY MANDATE**: The goal is extension, not replacement. Every component must be designed for seamless integration with the existing system architecture.

**📊 SUCCESS DEFINITION**: Success is measured by the ability to quickly add new e-commerce sites while preserving all existing functionality and data relationships.