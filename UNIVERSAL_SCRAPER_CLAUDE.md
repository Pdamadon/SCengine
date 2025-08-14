# 🧠 UNIVERSAL SCRAPER IMPLEMENTATION GUIDE
## Complete Blueprint for Self-Learning Universal Scraper

**Version:** 1.0  
**Target Assistant:** Claude 3.5 Sonnet  
**Implementation Timeline:** 6 days  
**Quality Target:** Glasswing-level extraction on ANY website

---

## 🎯 PRIMARY MISSION

Build a self-learning universal scraper that progressively learns ANY website's structure through multiple attempts, achieving 90%+ data quality that matches our hand-crafted GlasswingScraper WITHOUT manual intervention.

### Core Principle: Progressive Enhancement Through Learning
The scraper doesn't need perfection on attempt 1. It learns, adapts, and improves with each attempt until it masters the site structure.

---

## 📊 QUALITY BENCHMARK (Glasswing Standard)

Your implementation MUST achieve this level of data extraction:

### Product Data Requirements:
```javascript
const GLASSWING_QUALITY_STANDARD = {
  // REQUIRED (40% of quality score)
  title: "Premium Cotton Shirt",
  price: "$29.99", 
  url: "https://site.com/product-1",
  description: "Comfortable cotton shirt with modern fit...",
  
  // ENHANCED (40% of quality score)
  description_html: "<div>Comfortable cotton shirt...</div>",
  images: [
    { src: "image1.jpg", alt: "Front view", width: 800, height: 600 }
  ],
  variants: [
    { 
      type: "size", 
      options: ["S", "M", "L"], 
      available: [true, true, false] 
    },
    { 
      type: "color", 
      options: ["Blue", "White"], 
      available: [true, true] 
    }
  ],
  availability: "in_stock",
  category_hierarchy: ["Clothing", "Men's", "Shirts", "Casual"],
  brand: "Brand Name",
  sku: "SHIRT-001",
  
  // ACTIONABLE (20% of quality score)
  actionable_selectors: {
    add_to_cart: "button.add-to-cart",
    size_selector: "select[name='size']",
    quantity_input: "input.quantity",
    color_selector: ".color-swatch"
  }
};
```

### Quality Scoring Formula:
```javascript
function calculateQualityScore(extractedData) {
  const weights = {
    required_fields: 0.4,    // title, price, url, description
    enhanced_fields: 0.4,    // images, variants, availability, category
    actionable_selectors: 0.2 // buttons, inputs for automation
  };
  
  // Score each category 0.0 to 1.0
  const requiredScore = scoreRequiredFields(extractedData);
  const enhancedScore = scoreEnhancedFields(extractedData);
  const actionableScore = scoreActionableSelectors(extractedData);
  
  return (requiredScore * weights.required_fields) +
         (enhancedScore * weights.enhanced_fields) +
         (actionableScore * weights.actionable_selectors);
}
```

---

## 🔄 THREE-ATTEMPT LEARNING PROGRESSION

### Attempt 1: Discovery & Basic Extraction (Target: 30-40% quality)
**Goal:** Understand site structure and extract basic data

**What to do:**
1. Use existing `SiteIntelligence.buildComprehensiveSiteIntelligence(url)`
2. Extract using generic selectors from `SelectorLibrary`
3. Apply basic fallbacks from `AdvancedFallbackSystem`
4. Store initial learning in `WorldModel`

**Expected Output:**
```javascript
{
  confidence: 0.35,
  products: [
    {
      title: "Product Name",
      price: "$29.99",
      url: "https://site.com/product-1"
      // Missing: description, images, variants, etc.
    }
  ],
  learning_progress: {
    navigation_mapped: true,
    basic_selectors_found: 15,
    platform_detected: "unknown",
    missing_elements: ["variants", "detailed_descriptions", "images"]
  }
}
```

### Attempt 2: Targeted Enhancement (Target: 60-70% quality)
**Goal:** Use learnings from Attempt 1 to focus on gaps

**What to do:**
1. Analyze gaps from Attempt 1
2. Use `IntelligentSelectorGenerator` to create better selectors
3. Run parallel experiments with different strategies
4. Apply cross-site learning patterns
5. Focus on specific missing elements

**Expected Output:**
```javascript
{
  confidence: 0.65,
  products: [
    {
      title: "Product Name",
      price: "$29.99",
      url: "https://site.com/product-1",
      description: "Product description extracted",
      images: ["image1.jpg", "image2.jpg"],
      category: "clothing/mens/shirts",
      sizes: ["S", "M", "L"]
      // Still missing: detailed variants, actionable selectors
    }
  ],
  learning_progress: {
    improved_selectors: 8,
    new_patterns_discovered: 5,
    variant_detection_partial: true,
    image_extraction_working: true
  }
}
```

### Attempt 3: Deep Extraction & Mastery (Target: 90-95% quality)
**Goal:** Extract comprehensive data using refined understanding

**What to do:**
1. Apply all accumulated learning
2. Use multiple fallback strategies
3. Extract detailed variants and metadata
4. Generate actionable selectors for automation
5. Validate against full Glasswing schema

**Expected Output:**
```javascript
{
  confidence: 0.95,
  products: [
    // Full Glasswing-quality data as shown above
  ],
  learning_progress: {
    mastery_achieved: true,
    patterns_working: 23,
    extraction_complete: true,
    actionable_selectors_found: 6
  }
}
```

---

## 🏗️ EXISTING SYSTEM ARCHITECTURE (What You Have Available)

### ✅ Core Intelligence Components (USE THESE):

#### 1. SiteIntelligence (src/intelligence/SiteIntelligence.js)
```javascript
// Main orchestrator - already works!
const siteIntelligence = new SiteIntelligence(logger);
await siteIntelligence.initialize();

const intelligence = await siteIntelligence.buildComprehensiveSiteIntelligence(url, {
  forceRefresh: attempt > 0, // Refresh on subsequent attempts
  maxConcurrent: 4,
  maxSubcategories: 3
});

// Returns: navigation, exploration results, selectors, capabilities
```

#### 2. IntelligentSelectorGenerator (src/intelligence/IntelligentSelectorGenerator.js)
```javascript
// Smart selector creation - already works!
const generator = new IntelligentSelectorGenerator(logger);

const selectorResult = generator.generateOptimalSelector(element, {
  context: 'product_page',
  useWeighted: true
});

// Returns: { selector, confidence, strategy, metadata }
```

#### 3. AdvancedFallbackSystem (src/intelligence/AdvancedFallbackSystem.js)
```javascript
// Fallback strategies - already works with learning!
const fallbackSystem = new AdvancedFallbackSystem(logger);

// Has platform patterns for Shopify, WooCommerce, Magento, etc.
// Has visual similarity matching
// Has content-based semantic matching
// Already tracks success/failure rates!
```

#### 4. WorldModel (src/intelligence/WorldModel.js)
```javascript
// Persistent storage - already works!
const worldModel = new WorldModel(logger);

// Store learning
await worldModel.storeSelectorLibrary(domain, selectors);
await worldModel.storeURLPatterns(domain, patterns);

// Retrieve learning
const savedIntelligence = await worldModel.getSiteIntelligence(domain);
```

#### 5. ConcurrentExplorer (src/intelligence/ConcurrentExplorer.js)
```javascript
// Parallel exploration - already works!
// Explores multiple sections concurrently
// Uses all the above components
// Returns compiled exploration results
```

---

## 🆕 NEW COMPONENTS TO BUILD

### 1. LearningLoopOrchestrator.js (src/intelligence/learning/)
**Purpose:** Coordinates the 3-attempt learning progression

```javascript
class LearningLoopOrchestrator {
  constructor(logger) {
    this.logger = logger;
    this.siteIntelligence = new SiteIntelligence(logger);
    this.qualityTracker = new QualityProgressTracker(logger);
    this.schemaValidator = new SchemaQualityValidator(logger);
  }

  async orchestrateLearning(url, maxAttempts = 3) {
    const domain = new URL(url).hostname;
    let cumulativeLearning = await this.loadExistingLearning(domain);
    let qualityScore = 0;
    let attempt = 0;

    while (attempt < maxAttempts && qualityScore < 0.9) {
      attempt++;
      
      // Execute attempt with accumulated knowledge
      const attemptResult = await this.executeAttempt(
        url, 
        cumulativeLearning, 
        attempt
      );
      
      // Validate quality
      qualityScore = await this.schemaValidator.validateQuality(attemptResult);
      
      // Track progress
      await this.qualityTracker.recordProgress(
        domain, 
        attempt, 
        qualityScore, 
        attemptResult
      );
      
      // Learn from this attempt
      cumulativeLearning = await this.learnFromAttempt(
        cumulativeLearning,
        attemptResult,
        qualityScore
      );
      
      // Store progress
      await this.storeProgress(domain, attempt, cumulativeLearning);
      
      this.logger.info(`Attempt ${attempt} completed`, {
        domain,
        quality: qualityScore,
        improvements: this.identifyImprovements(attemptResult)
      });
    }

    return this.finalizeResults(cumulativeLearning, qualityScore);
  }

  async executeAttempt(url, learning, attemptNumber) {
    // Use existing SiteIntelligence with accumulated learning
    const options = {
      forceRefresh: attemptNumber > 1,
      previousLearning: learning,
      focusAreas: this.identifyFocusAreas(learning, attemptNumber)
    };

    return await this.siteIntelligence.buildComprehensiveSiteIntelligence(url, options);
  }
}
```

### 2. QualityProgressTracker.js (src/intelligence/learning/)
**Purpose:** Track quality improvements between attempts

```javascript
class QualityProgressTracker {
  constructor(logger) {
    this.logger = logger;
    this.progressHistory = new Map();
  }

  async recordProgress(domain, attempt, qualityScore, extractedData) {
    const progress = {
      attempt,
      quality: qualityScore,
      timestamp: new Date().toISOString(),
      improvements: this.calculateImprovements(domain, extractedData),
      gaps: this.identifyGaps(extractedData),
      patterns_learned: this.countPatternsLearned(extractedData)
    };

    // Store in memory
    if (!this.progressHistory.has(domain)) {
      this.progressHistory.set(domain, []);
    }
    this.progressHistory.get(domain).push(progress);

    return progress;
  }

  getProgressDelta(domain, currentAttempt) {
    const history = this.progressHistory.get(domain) || [];
    if (history.length < 2) return null;

    const current = history[currentAttempt - 1];
    const previous = history[currentAttempt - 2];

    return {
      quality_improvement: current.quality - previous.quality,
      new_patterns: current.patterns_learned - previous.patterns_learned,
      gaps_closed: previous.gaps.length - current.gaps.length
    };
  }
}
```

### 3. SchemaQualityValidator.js (src/intelligence/learning/)
**Purpose:** Validate extraction quality against Glasswing schema

```javascript
class SchemaQualityValidator {
  constructor(logger) {
    this.logger = logger;
    this.glasswingSchema = this.defineGlasswingSchema();
  }

  defineGlasswingSchema() {
    return {
      required: {
        title: { weight: 0.3, validator: (val) => val && val.length > 0 },
        price: { weight: 0.3, validator: (val) => val && /[\$€£]/.test(val) },
        url: { weight: 0.2, validator: (val) => val && val.startsWith('http') },
        description: { weight: 0.2, validator: (val) => val && val.length > 20 }
      },
      enhanced: {
        images: { weight: 0.25, validator: (val) => Array.isArray(val) && val.length > 0 },
        variants: { weight: 0.25, validator: (val) => Array.isArray(val) && val.length > 0 },
        availability: { weight: 0.2, validator: (val) => val && typeof val === 'string' },
        category_hierarchy: { weight: 0.15, validator: (val) => Array.isArray(val) && val.length > 0 },
        brand: { weight: 0.15, validator: (val) => val && val.length > 0 }
      },
      actionable: {
        add_to_cart: { weight: 0.4, validator: (val) => val && typeof val === 'string' },
        size_selector: { weight: 0.2, validator: (val) => val && typeof val === 'string' },
        quantity_input: { weight: 0.2, validator: (val) => val && typeof val === 'string' },
        color_selector: { weight: 0.2, validator: (val) => val && typeof val === 'string' }
      }
    };
  }

  async validateQuality(extractedData) {
    if (!extractedData.products || extractedData.products.length === 0) {
      return 0.0;
    }

    const product = extractedData.products[0]; // Validate first product
    let totalScore = 0;

    // Validate required fields (40% weight)
    const requiredScore = this.validateFieldGroup(product, this.glasswingSchema.required);
    totalScore += requiredScore * 0.4;

    // Validate enhanced fields (40% weight)  
    const enhancedScore = this.validateFieldGroup(product, this.glasswingSchema.enhanced);
    totalScore += enhancedScore * 0.4;

    // Validate actionable selectors (20% weight)
    const actionableScore = this.validateFieldGroup(
      extractedData.actionable_selectors || {}, 
      this.glasswingSchema.actionable
    );
    totalScore += actionableScore * 0.2;

    return totalScore;
  }

  validateFieldGroup(data, schema) {
    let groupScore = 0;
    let totalWeight = 0;

    for (const [field, config] of Object.entries(schema)) {
      totalWeight += config.weight;
      if (config.validator(data[field])) {
        groupScore += config.weight;
      }
    }

    return totalWeight > 0 ? groupScore / totalWeight : 0;
  }

  identifyMissingFields(extractedData) {
    const missing = [];
    const product = extractedData.products?.[0] || {};

    // Check all schema fields
    for (const [group, fields] of Object.entries(this.glasswingSchema)) {
      for (const [field, config] of Object.entries(fields)) {
        const dataToCheck = group === 'actionable' ? extractedData.actionable_selectors : product;
        if (!config.validator(dataToCheck?.[field])) {
          missing.push({ field, group, weight: config.weight });
        }
      }
    }

    return missing.sort((a, b) => b.weight - a.weight); // Sort by importance
  }
}
```

### 4. SelfLearningUniversalScraper.js (src/scrapers/)
**Purpose:** Main scraper that orchestrates the learning process

```javascript
const { chromium } = require('playwright');
const LearningLoopOrchestrator = require('../intelligence/learning/LearningLoopOrchestrator');
const { createDomainRateLimiter } = require('../utils/rateLimiter');

class SelfLearningUniversalScraper {
  constructor(logger, url, jobData, options = {}) {
    this.logger = logger;
    this.baseUrl = url;
    this.jobData = jobData;
    this.options = options;
    this.domain = this.extractDomain(url);
    
    // Initialize learning orchestrator
    this.learningOrchestrator = new LearningLoopOrchestrator(logger);
    
    // Initialize rate limiter
    this.rateLimiter = createDomainRateLimiter(this.domain);
    this.rateLimiter.configure({
      baseDelay: 3000,
      minDelay: 2000,
      maxDelay: 8000
    });
  }

  async scrape(progressCallback) {
    const maxAttempts = this.jobData.max_attempts || 3;
    const targetQuality = this.jobData.target_quality || 0.9;

    this.logger.info('Starting self-learning universal scraper', {
      url: this.baseUrl,
      domain: this.domain,
      maxAttempts,
      targetQuality
    });

    try {
      // Progress callback for attempt start
      if (progressCallback) {
        progressCallback(10, 'Initializing self-learning scraper...');
      }

      // Execute learning loop
      const results = await this.learningOrchestrator.orchestrateLearning(
        this.baseUrl,
        maxAttempts,
        targetQuality,
        progressCallback
      );

      // Format results
      const formattedResults = this.formatResults(results);

      if (progressCallback) {
        progressCallback(100, `Learning complete: ${(results.finalQuality * 100).toFixed(1)}% quality`);
      }

      this.logger.info('Self-learning scraper completed', {
        domain: this.domain,
        finalQuality: results.finalQuality,
        attemptsUsed: results.attemptsUsed,
        patternsLearned: results.patternsLearned
      });

      return formattedResults;

    } catch (error) {
      this.logger.error('Self-learning scraper failed:', error);
      throw error;
    }
  }

  formatResults(learningResults) {
    return {
      url: this.baseUrl,
      platform: 'universal_learned',
      scrapingType: this.jobData.scraping_type,
      startedAt: learningResults.startedAt,
      completedAt: new Date().toISOString(),
      
      // Main product data
      products: learningResults.products || [],
      
      // Learning metadata
      learning: {
        attempts_used: learningResults.attemptsUsed,
        final_quality: learningResults.finalQuality,
        patterns_learned: learningResults.patternsLearned,
        improvements_per_attempt: learningResults.qualityProgression
      },
      
      // Summary for compatibility
      summary: {
        pagesScraped: 1,
        productsFound: learningResults.products?.length || 0,
        successRate: learningResults.finalQuality,
        platform: 'universal_learned',
        intelligence_used: true,
        self_learning: true
      }
    };
  }

  extractDomain(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch (error) {
      return url.toLowerCase();
    }
  }
}

module.exports = SelfLearningUniversalScraper;
```

---

## 🔧 ENHANCEMENT REQUIREMENTS FOR EXISTING FILES

### Enhance AdvancedFallbackSystem.js
**Add learning persistence methods:**

```javascript
// Add these methods to existing AdvancedFallbackSystem class:

async persistLearning(domain, learningData) {
  // Store successful patterns in WorldModel
  const patterns = {
    successful_selectors: this.learningData.successfulPatterns,
    failed_patterns: this.learningData.failedPatterns,
    strategy_success_rates: this.performanceMetrics.strategySuccessRates,
    context_success_rates: this.learningData.contextSuccessRates
  };
  
  await this.worldModel.storeLearningPatterns(domain, patterns);
}

async loadExistingLearning(domain) {
  // Load patterns from WorldModel
  const patterns = await this.worldModel.getLearningPatterns(domain);
  if (patterns) {
    this.learningData.successfulPatterns = new Map(patterns.successful_selectors);
    this.learningData.failedPatterns = new Map(patterns.failed_patterns);
    this.performanceMetrics.strategySuccessRates = patterns.strategy_success_rates || {};
  }
}

async applyCrossSiteLearning(domain, elementType) {
  // Get patterns from similar sites
  const similarPatterns = await this.worldModel.getCrossSitePatterns(domain, elementType);
  
  // Generate fallbacks based on cross-site patterns
  return this.generateFallbacksFromPatterns(similarPatterns);
}
```

### Enhance WorldModel.js
**Add cross-site pattern queries:**

```javascript
// Add these methods to existing WorldModel class:

async storeLearningPatterns(domain, patterns) {
  const key = `learning_patterns:${domain}`;
  const data = {
    domain,
    patterns,
    created_at: new Date().toISOString(),
    last_updated: new Date().toISOString()
  };

  // Store in Redis with 30-day TTL
  if (this.cache.connected && this.cache.redis) {
    await this.cache.redis.setex(key, 30 * 24 * 60 * 60, JSON.stringify(data));
  }
}

async getLearningPatterns(domain) {
  const key = `learning_patterns:${domain}`;
  
  if (this.cache.connected && this.cache.redis) {
    const cached = await this.cache.redis.get(key);
    if (cached) {
      return JSON.parse(cached).patterns;
    }
  }
  
  return null;
}

async getCrossSitePatterns(domain, elementType) {
  // Get patterns from sites in same sector
  const sectorSites = await this.getSitesBySector(domain);
  const patterns = [];
  
  for (const site of sectorSites) {
    const sitePatterns = await this.getLearningPatterns(site);
    if (sitePatterns && sitePatterns[elementType]) {
      patterns.push(...sitePatterns[elementType]);
    }
  }
  
  return patterns;
}
```

---

## 📋 IMPLEMENTATION CHECKLIST

### Day 1: Foundation
- [ ] Create `src/intelligence/learning/` directory
- [ ] Implement `LearningLoopOrchestrator.js`
- [ ] Implement `QualityProgressTracker.js`
- [ ] Implement `SchemaQualityValidator.js`

### Day 2: Core Scraper
- [ ] Implement `SelfLearningUniversalScraper.js`
- [ ] Enhance `AdvancedFallbackSystem.js` with persistence
- [ ] Enhance `WorldModel.js` with cross-site queries

### Day 3: Integration
- [ ] Update `ScrapingWorker.js` to use new scraper
- [ ] Update `ScraperFactory.js` to route to learning scraper
- [ ] Test basic learning loop

### Day 4: Advanced Features
- [ ] Create `ParallelExperimentRunner.js`
- [ ] Add experiment strategies (CSS, XPath, Semantic, etc.)
- [ ] Implement result merging logic

### Day 5: Testing
- [ ] Test on 5 different website types
- [ ] Validate quality progression (0.3 → 0.6 → 0.9)
- [ ] Measure learning effectiveness

### Day 6: Cleanup & Optimization
- [ ] Remove duplicate scrapers (6 parallel scraper files)
- [ ] Add comprehensive logging
- [ ] Performance optimization

---

## 🚨 CRITICAL REQUIREMENTS

1. **NEVER break existing GlasswingScraper** - it's the quality benchmark
2. **Always use rate limiting** - respect the implemented AdaptiveRateLimiter
3. **Store ALL learning** - persist patterns for reuse
4. **Progress reporting** - use progressCallback for real-time updates
5. **Error handling** - graceful degradation if learning fails
6. **Memory management** - clean up browser resources
7. **Compliance** - follow SCRAPING_REQUIREMENTS.md standards

---

## 🎯 SUCCESS VALIDATION

Your implementation is successful when:

✅ **Quality Progression:** Attempt 1 (30%) → Attempt 2 (60%) → Attempt 3 (90%)  
✅ **Data Completeness:** All Glasswing schema fields extracted  
✅ **Learning Persistence:** Patterns stored and reused across sessions  
✅ **Performance:** < 5 minutes per site, all 3 attempts  
✅ **Reliability:** Works on at least 8/10 test sites  
✅ **Integration:** Works with existing job queue system  

---

## 📞 SUPPORT REFERENCES

- **Existing Intelligence:** `src/intelligence/` (all files are working and tested)
- **Quality Benchmark:** `src/scrapers/GlasswingScraper.js` 
- **Rate Limiting:** `src/utils/rateLimiter.js`
- **Worker Integration:** `src/workers/ScrapingWorker.js`
- **Data Storage:** `src/intelligence/WorldModel.js`

**Remember:** You have 80% of what you need. Build the 20% that orchestrates learning!

---

*This document is your complete blueprint. Follow it exactly and you'll build a scraper that learns ANY website automatically.*