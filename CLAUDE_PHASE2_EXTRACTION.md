# Claude Development Guidelines - Phase 2: Product Extraction Engine

## 🎯 PRIMARY DIRECTIVE FOR PHASE 2
**This document provides specific guidelines for implementing the Product Data Extraction Engine.**

Always refer to these guidelines when working on extraction-related code. This supplements the main CLAUDE.md file with Phase 2 specific requirements.

## 📚 REQUIRED REFERENCE DOCUMENTS
When implementing Phase 2, you MUST also consult:
1. **INTELLIGENCE_INTEGRATION_PLAN.md** - Details on integrating existing intelligence services
2. **PHASE2_ENHANCED_PLAN.md** - Enhanced implementation with learning concepts
3. **SCRAPING_REQUIREMENTS.md** - Compliance and industry standards

## 📋 Phase 2 Context & Current State

### What We're Building
A comprehensive product extraction system that:
- Extracts ALL product data fields (title, price, variants, images, descriptions, etc.)
- Learns and stores working selectors for quick re-scraping
- Supports both generic platforms (Shopify, WooCommerce) AND custom retailer platforms
- Enables real-time price/availability checks using stored strategies
- Integrates with our existing MongoDB and Redis infrastructure

### Current Infrastructure (DO NOT BREAK)
- ✅ **MongoDB**: Domain-centric schema with extraction_strategy fields
- ✅ **Redis**: Performance caching layer (separate from MongoDB)
- ✅ **WorldModel**: Dual storage (MongoDB + Redis) with extraction methods
- ✅ **UniversalProductExtractor**: Base extraction class (needs platform enhancement)
- ✅ **ProductExtractorPool**: Parallel extraction workers
- ✅ **Bull.js Queue**: Task management system

### What's Missing (MUST IMPLEMENT)
- ❌ Custom platform detection (Gap, Macy's, Nordstrom, REI, etc.)
- ❌ PlatformDetector service for dynamic platform identification  
- ❌ SelectorDiscovery for automatic selector learning
- ❌ DataValidator for quality assurance
- ❌ Integration between extractor and queue system
- ❌ MongoDB storage pipeline after extraction
- ❌ Intelligence service integration (see INTELLIGENCE_INTEGRATION_PLAN.md)

## 🏗️ Platform Detection Requirements

### CRITICAL: Custom Platform Support
Major retailers use custom platforms that MUST be detected:

```javascript
// Required platform patterns to implement:
const customPlatforms = {
  'gap.com': {
    type: 'custom',
    tech: 'React-based',
    challenges: ['dynamic pricing', 'size/color matrix'],
    selectors: {
      // Must discover these through testing
      title: '.product-title--wrapper h1, .pdp-mfe-1rvsyjk',
      price: '.product-price__highlight, .pdp-pricing',
      // etc...
    }
  },
  'macys.com': {
    type: 'custom',
    tech: 'Legacy + modern hybrid',
    challenges: ['complex navigation', 'multiple price formats']
  },
  'nordstrom.com': {
    type: 'custom', 
    tech: 'SSR with API-driven updates',
    challenges: ['member pricing', 'dynamic inventory']
  },
  'rei.com': {
    type: 'custom',
    tech: 'Vue.js frontend',
    challenges: ['member pricing', 'outlet items']
  }
}
```

### Platform Detection Strategy
1. **First**: Check domain against known platforms
2. **Second**: Analyze page structure for platform indicators
3. **Third**: Look for platform-specific JavaScript objects
4. **Fourth**: Fall back to learned patterns from MongoDB
5. **Fifth**: Use generic extraction with SelectorDiscovery

## 🔍 Selector Discovery Requirements

### Selector Learning Process
When encountering unknown selectors:
1. Analyze page structure for semantic patterns
2. Generate multiple selector candidates
3. Test each candidate's reliability
4. Score based on: specificity, uniqueness, stability
5. Store successful patterns in MongoDB

### Selector Fallback Chain
```javascript
// Required fallback order:
const selectorChain = [
  'platformSpecific',      // Known platform selectors
  'domainLearned',         // Previously learned for this domain
  'semanticSelectors',     // Based on HTML semantics (itemprop, etc.)
  'structuralPatterns',    // Common structural patterns
  'textPatterns',          // Text-based detection
  'metaTags',             // OpenGraph, meta tags
  'jsonLd'                // Structured data
];
```

## 📊 Data Validation Requirements

### Required Field Validation
```javascript
const requiredFields = {
  title: {
    required: true,
    minLength: 2,
    maxLength: 500
  },
  price: {
    required: true,
    type: 'number',
    min: 0,
    format: 'cents' // Store as integer cents
  },
  availability: {
    required: true,
    enum: ['in_stock', 'out_of_stock', 'limited', 'unknown']
  },
  images: {
    required: true,
    minCount: 1,
    validateUrls: true
  },
  source_url: {
    required: true,
    format: 'url'
  },
  domain: {
    required: true
  }
};
```

### Quality Scoring
- **90-100%**: All required + most optional fields
- **70-89%**: All required fields present
- **50-69%**: Missing some required fields
- **Below 50%**: Reject and retry with different strategy

## 🔄 Extraction Strategy Storage

### Strategy Structure for Quick Checks
```javascript
const extractionStrategy = {
  quick_check: {
    price: {
      selector: '.price-now',
      alternatives: ['.sale-price', '.current-price'],
      last_success: Date,
      success_rate: 0.95
    },
    availability: {
      selector: '.in-stock-message',
      success_indicators: ['in stock', 'available'],
      failure_indicators: ['sold out', 'unavailable']
    }
  },
  full_extraction: {
    // Complete selector map for all fields
  },
  platform_hints: {
    platform: 'custom_gap',
    requires_js: true,
    wait_for_selectors: ['.product-loaded']
  }
};
```

## 🚀 Integration Requirements

### ScrapingWorker Integration
```javascript
// Required flow in ScrapingWorker:
async processProductJob(job) {
  // 1. Initialize extractor with domain config
  const extractor = new UniversalProductExtractor(logger, worldModel);
  
  // 2. Check for existing extraction strategy
  const strategy = await worldModel.getExtractionStrategy(domain, url);
  
  // 3. Use quick check if available and recent
  if (strategy?.quick_check && job.type === 'price_update') {
    return await extractor.quickCheck(url, strategy, domain);
  }
  
  // 4. Full extraction with platform detection
  const product = await extractor.extractProduct(url, domain);
  
  // 5. Validate extracted data
  const validated = await validator.validateProduct(product);
  
  // 6. Store in MongoDB with strategy
  await worldModel.storeProduct(domain, validated);
  
  // 7. Update extraction strategy with successful selectors
  await worldModel.updateExtractionStrategy(domain, product.extraction_strategy);
}
```

### MongoDB Storage Pipeline
1. Validate product data
2. Generate product_id if not present
3. Map to domain-centric schema
4. Store with domain field
5. Update category relationships
6. Record extraction strategy
7. Update domain intelligence score

## ⚠️ Critical Implementation Rules

### DO NOT:
- Break existing MongoDB schema structure
- Modify Redis caching logic
- Change WorldModel's dual storage pattern
- Remove domain field from any collection
- Skip validation before storage
- Store prices as floats (use integer cents)
- Ignore platform-specific quirks

### ALWAYS:
- Test with real retailer sites before considering complete
- Store successful selectors for future use
- Include domain field in all MongoDB documents
- Validate data before storage
- Use extraction strategies for quick checks
- Handle platform-specific edge cases
- Maintain backward compatibility

## 🎯 Success Criteria

### Extraction Success Metrics
- ✅ 95%+ success rate on known platforms
- ✅ 90%+ success rate on custom platforms
- ✅ < 5 seconds per product extraction
- ✅ 100% platform detection accuracy for Gap, Macy's, Nordstrom, REI
- ✅ Automatic selector learning improves success over time

### Data Quality Metrics
- ✅ 100% of products have required fields
- ✅ 90%+ products score above 70% quality
- ✅ Price accuracy within $0.01
- ✅ Image URLs are valid and accessible
- ✅ Variants correctly associated

### Performance Metrics
- ✅ Quick check < 1 second
- ✅ Full extraction < 5 seconds
- ✅ Parallel extraction: 500+ products/minute
- ✅ MongoDB storage < 100ms per product

## 📝 Testing Requirements

### Required Test Coverage
1. **Platform Detection**: Test each custom platform
2. **Selector Discovery**: Test learning on unknown site
3. **Data Validation**: Test with invalid/incomplete data
4. **Quick Check**: Verify speed and accuracy
5. **Integration**: Full pipeline test with queue

### Test Sites Priority
1. **gap.com** - React, dynamic pricing
2. **macys.com** - Complex navigation
3. **nordstrom.com** - SSR, member pricing
4. **rei.com** - Vue.js, outlet items
5. **Random Shopify** - Generic platform test

## 🔧 Development Workflow

### Implementation Order
1. **Update UniversalProductExtractor** with custom platforms
2. **Create PlatformDetector** service
3. **Create SelectorDiscovery** system
4. **Create DataValidator** with quality scoring
5. **Integrate with ScrapingWorker**
6. **Connect MongoDB storage pipeline**
7. **Test with priority sites**
8. **Performance optimization**

### Code Review Checklist
- [ ] Platform detection includes all required retailers
- [ ] Selectors are learned and stored
- [ ] Data validation prevents bad data storage
- [ ] Quick checks use stored strategies
- [ ] MongoDB documents include domain field
- [ ] Integration doesn't break existing code
- [ ] Tests cover all platforms
- [ ] Performance meets targets

## 🚨 Common Pitfalls to Avoid

1. **Platform Detection**: Don't assume Shopify/WooCommerce only
2. **Price Storage**: Always store as integer cents, not float dollars
3. **Selector Reliability**: Don't trust first successful selector
4. **Domain Field**: Never forget domain field in MongoDB docs
5. **Quick Checks**: Don't run full extraction when quick check suffices
6. **Validation**: Don't store unvalidated data
7. **Platform Learning**: Don't overwrite good selectors with bad ones

## 📚 Reference Files

Key files to understand before implementing:
- `src/extraction/UniversalProductExtractor.js` - Base extractor
- `src/intelligence/WorldModel.js` - Storage interface
- `config/database/mongodb_schema.js` - Schema structure
- `src/intelligence/extraction/ProductExtractorPool.js` - Parallel processing
- `SCRAPING_REQUIREMENTS.md` - Compliance requirements

---

**Remember**: The goal is to build a robust, learning extraction system that handles both generic and custom platforms while maintaining high success rates and data quality.