# Universal E-Commerce Extraction Platform - Detailed Implementation Roadmap

## Executive Summary

This detailed roadmap expands on the original 10-week plan with specific implementation details based on comprehensive codebase analysis. The plan transforms our current 3-stage pipeline into a resilient 4-step extraction system with checkpoint/resume capabilities, pattern learning, and self-improvement.

## Current State Analysis

### Existing Components (What We Have)
1. **NavigationMapper.js** (415 lines) - Monolithic class handling multiple responsibilities
2. **NavigationMapperBrowserless.js** - Duplicate of NavigationMapper with Browserless support
3. **PipelineOrchestrator.js** - 3-stage pipeline (Discovery → Collection → Extraction)
4. **ProductCatalogStrategy.js** (841 lines) - Contains embedded pagination logic (lines 500-700)
5. **WebSocketService.js & ServerSentEventsService.js** - Real-time updates infrastructure
6. **MongoDB schemas** - Support for extraction_strategy and multi-tenant data
7. **Redis caching** - Namespace-based with TTL policies

### Critical Gaps Identified
1. **No checkpoint/resume capability** - System cannot recover from failures
2. **No 4-step pipeline** - Current 3-stage doesn't match our design
3. **40% code duplication** - Especially in browser initialization and pagination
4. **No pattern learning** - Fixed patterns instead of adaptive system
5. **Sequential processing** - No parallel extraction capability
6. **No success thresholds** - No quality gates between steps

---

## Phase 1: Core Pipeline Development (Weeks 1-3)

### Week 1: Foundation Refactoring & Checkpoint Infrastructure (Incremental Approach)

**Strategy**: Follow Option B - Start with checkpoint schema design while gradually refactoring to minimize risk

#### Day 1-2: Checkpoint Schema Design & Implementation

**Objective**: Create foundation for resilient, resumable pipeline BEFORE making risky refactoring changes

**Rationale**: 
- Provides safety net for subsequent refactoring
- Enables telemetry for Thompson sampling validation
- Allows pause/resume during refactoring if issues arise
- No behavior changes, purely additive

**Checkpoint Schema (MongoDB)**:
```javascript
{
  _id: ObjectId,
  sessionId: String,          // Unique session identifier
  domain: String,              // Target domain
  pipelineVersion: "1.0",      // Schema version for migration support
  currentStep: Number(1-4),    // Current pipeline step
  stepData: {
    1: {
      name: "main_categories",
      status: "pending|in_progress|completed|failed",
      startTime: Date,
      endTime: Date,
      categories: [],         // Discovered categories
      successRate: Number,    // % successfully extracted
      errors: []
    },
    2: {
      name: "subcategories",
      status: String,
      subcategories: Map,     // Category → subcategories
      progress: Number(0-1),  // Completion percentage
      lastProcessedCategory: String
    },
    3: {
      name: "product_urls",
      status: String,
      productUrls: [],
      progress: Number(0-1),
      lastProcessedUrl: String,
      paginationState: Object
    },
    4: {
      name: "product_details",
      status: String,
      products: [],
      progress: Number(0-1),
      lastProcessedProduct: String
    }
  },
  failures: [{
    step: Number,
    url: String,
    error: String,
    retryCount: Number,
    timestamp: Date
  }],
  metadata: {
    startTime: Date,
    lastCheckpoint: Date,
    estimatedCompletion: Date,
    canResume: Boolean,
    browserConfig: Object,
    extractionConfig: Object
  }
}
```

**Implementation Tasks**:
- [ ] Create `src/core/checkpoint/CheckpointManager.js` with ICheckpointStore interface
- [ ] Implement MongoDB storage adapter (can swap to Redis/SQLite later)
- [ ] Add minimal checkpoint writes at key transitions (no behavior changes)
- [ ] Create CLI tool to inspect/restore checkpoints
- [ ] Add feature flag to enable/disable checkpointing

**Minimal Integration Points (Day 1-2)**:
```javascript
// PipelineOrchestrator.js - Add after line 75
if (process.env.ENABLE_CHECKPOINTS === 'true') {
  this.checkpointManager = new CheckpointManager(this.logger);
  await this.checkpointManager.saveProgress('pipeline_start', { targetUrl, jobId });
}

// ProductCatalogStrategy.js - Add at pagination boundaries (lines 500-700)
// Before next page action (line ~520)
await this.checkpoint?.saveProgress('pagination', { 
  page: currentPage, 
  itemsCollected: results.length 
});

// NavigationMapper.js - Add at major transitions
// After successful navigation (line ~365)
await this.checkpoint?.saveProgress('navigation_complete', { 
  domain, 
  categoriesFound: navigationData.length 
});
```

#### Day 2-3: Extract Shared BrowserInitializer (Low Risk)

**Objective**: Eliminate 95% duplication with minimal behavior changes

**Rationale**:
- High duplication (95%) means extraction is straightforward
- Both implementations nearly identical, just different BrowserManager types
- Can be tested in isolation before integration

**Current Duplication Analysis**:
- `NavigationMapper.js`: lines 35-85 (initializeForSite method)
- `NavigationMapperBrowserless.js`: lines 92-150 (same method, different manager)
- Only difference: BrowserManager vs BrowserManagerBrowserless

**New Utility**: `src/core/common/browser/BrowserInitializer.js`

```javascript
class BrowserInitializer {
  constructor(logger, options = {}) {
    this.logger = logger;
    this.useBrowserless = options.useBrowserless || false;
    this.fallbackToLocal = options.fallbackToLocal !== false;
  }

  async initializeBrowser(domain, options = {}) {
    // Exact logic from existing initializeForSite methods
    const normalizedDomain = domain?.toLowerCase().replace(/^www\./, '');
    const config = this.getSiteConfig(normalizedDomain);
    
    // Choose manager based on configuration
    const ManagerClass = this.useBrowserless ? 
      require('../../common/BrowserManagerBrowserless') :
      require('../../common/BrowserManager');
    
    const manager = new ManagerClass();
    
    // Keep exact same initialization logic
    const isHeadless = this.determineHeadlessMode(config, options);
    
    return {
      browser: await manager.launch({ headless: isHeadless }),
      manager,
      isHeadless
    };
  }

  // Move SITE_CONFIG here as single source of truth
  getSiteConfig(domain) {
    // Consolidate both SITE_CONFIG objects
  }
}
```

**Safe Integration (Day 2-3)**:
```javascript
// NavigationMapper.js - Replace lines 35-85
async initializeForSite(needsNonHeadless = false, domain = null) {
  const initializer = new BrowserInitializer(this.logger);
  const result = await initializer.initializeBrowser(domain, {
    needsNonHeadless,
    useBrowserless: false
  });
  
  this.browserManager = result.manager;
  this.isHeadless = result.isHeadless;
}

// NavigationMapperBrowserless.js - Replace lines 92-150
async initializeForSite(needsNonHeadless = false, domain = null) {
  const initializer = new BrowserInitializer(this.logger, {
    useBrowserless: true
  });
  const result = await initializer.initializeBrowser(domain, {
    needsNonHeadless
  });
  
  this.browserManager = result.manager;
  this.isHeadless = result.isHeadless;
}
```

#### Day 3-4: NavigationMapper Skeleton Creation (No Behavior Changes)

**Objective**: Create 3-class structure WITHOUT moving code yet

**Rationale**:
- Create skeleton first, test interfaces
- Move only pure/low-risk methods initially
- Keep NavigationMapper as facade to avoid breaking changes

**Skeleton Implementation**:

1. **NavigationOrchestrator.js** (New file, minimal implementation)
```javascript
class NavigationOrchestrator {
  constructor(logger, navigationMapper) {
    this.logger = logger;
    this.navigationMapper = navigationMapper; // Keep reference to old code
    this.taxonomyExtractor = new TaxonomyExtractor(logger);
    this.dropdownHandler = new DropdownHandler(logger);
  }

  // Start with delegation to existing NavigationMapper
  async orchestrateExtraction(url, options) {
    // For now, just delegate
    return this.navigationMapper.extractNavigation(url, options);
  }
}
```

2. **TaxonomyExtractor.js** (Extract pure functions only)
```javascript
class TaxonomyExtractor {
  constructor(logger) {
    this.logger = logger;
  }

  // Move only pure classification functions from lines 350-415
  classifyNavigationItem(item) {
    // Pure function - safe to move
  }

  calculatePriority(category) {
    // Pure function - safe to move
  }
}
```

3. **DropdownHandler.js** (Extract helpers only)
```javascript
class DropdownHandler {
  constructor(logger) {
    this.logger = logger;
  }

  // Move only helper functions from lines 250-350
  isDropdownTrigger(element) {
    // Helper function - safe to move
  }

  generateDropdownSelector(baseSelector) {
    // Helper function - safe to move
  }
}
```

**Integration Plan (Day 3-4)**:
- Keep NavigationMapper intact as facade
- Wire new classes behind feature flag
- Move 2-3 pure methods per class
- Add unit tests for moved methods
- Full migration deferred to Week 2

#### Day 4-5: Extract PaginationHandler (Isolated from Core Logic)

**Objective**: Extract pagination as standalone utility

**Rationale**:
- Pagination logic is self-contained (lines 500-700)
- Clear interface boundary
- Can test independently
- ProductCatalogStrategy keeps working during extraction

**Extraction Strategy**:

```javascript
// src/core/common/pagination/PaginationHandler.js
class PaginationHandler {
  constructor(logger, checkpointManager = null) {
    this.logger = logger;
    this.checkpoint = checkpointManager;
  }

  async paginate(page, config) {
    // Extract detectPaginationType logic (lines 510-540)
    const type = await this.detectPaginationType(page);
    
    // Extract pagination loops (lines 540-680)
    switch(type) {
      case 'traditional':
        return this.handleTraditionalPagination(page, config);
      case 'infinite':
        return this.handleInfiniteScroll(page, config);
      case 'loadMore':
        return this.handleLoadMore(page, config);
    }
  }

  // Move exact logic from ProductCatalogStrategy
  async handleTraditionalPagination(page, config) {
    // Lines 540-600 moved here exactly
    const results = [];
    let hasNext = true;
    let pageNum = 1;
    
    while (hasNext && pageNum <= config.maxPages) {
      // Save checkpoint at page boundaries
      await this.checkpoint?.saveProgress('pagination', {
        page: pageNum,
        collected: results.length
      });
      
      // Existing pagination logic
      const items = await config.onPageLoad(page);
      results.push(...items);
      
      hasNext = await this.hasNextPage(page);
      if (hasNext) {
        await this.clickNextPage(page);
        pageNum++;
      }
    }
    
    return results;
  }
}
```

**Safe Integration (Day 5)**:
```javascript
// ProductCatalogStrategy.js - Replace lines 500-700
async collectProducts(page, url) {
  // Keep existing setup code
  
  // Delegate to new handler
  const paginationHandler = new PaginationHandler(this.logger, this.checkpoint);
  const products = await paginationHandler.paginate(page, {
    onPageLoad: async (p) => this.extractProductsFromPage(p),
    maxPages: this.config.maxPages || 50
  });
  
  return products;
}
```

#### Throughout Week 1: Thompson Sampling Integration

**Objective**: Add learning without complex ML infrastructure

**Rationale**:
- Simple Beta distribution sampling (10 lines of code)
- No training required, works immediately
- Proven in production systems
- Can replace with neural networks later if needed

**Minimal Implementation**:

```javascript
// src/core/learning/ThompsonSampler.js
class ThompsonSampler {
  constructor() {
    this.arms = new Map(); // strategy → {successes, failures}
  }

  selectStrategy(strategies) {
    let bestStrategy = null;
    let bestSample = -1;

    for (const strategy of strategies) {
      const arm = this.arms.get(strategy) || {successes: 1, failures: 1};
      // Simple Beta sampling - can use jStat library or implement
      const alpha = arm.successes + 1;
      const beta = arm.failures + 1;
      const sample = this.betaSample(alpha, beta);
      
      if (sample > bestSample) {
        bestSample = sample;
        bestStrategy = strategy;
      }
    }

    return bestStrategy;
  }

  updateReward(strategy, success) {
    const arm = this.arms.get(strategy) || {successes: 0, failures: 0};
    if (success) {
      arm.successes++;
    } else {
      arm.failures++;
    }
    this.arms.set(strategy, arm);
    
    // Persist to database for learning across sessions
    this.persistArm(strategy, arm);
  }

  betaSample(alpha, beta) {
    // Simple Beta sampling implementation
    // For production, use jStat library: jStat.beta.sample(alpha, beta)
    // Simplified version using gamma distribution approximation:
    const gammaAlpha = this.gammaSample(alpha);
    const gammaBeta = this.gammaSample(beta);
    return gammaAlpha / (gammaAlpha + gammaBeta);
  }
  
  gammaSample(shape) {
    // Marsaglia and Tsang method for gamma sampling
    // For production, use a proper statistics library
    return Math.random() * shape; // Simplified placeholder
  }
}
```

**Integration Points (Minimal Risk)**:
```javascript
// NavigationMapper.js - Add strategy selection
async selectNavigationStrategy(domain) {
  if (!process.env.ENABLE_THOMPSON_SAMPLING) {
    return this.strategies[0]; // Default to first strategy
  }
  
  const sampler = new ThompsonSampler();
  const strategyName = sampler.selectStrategy(this.strategyNames);
  
  // Track outcome after extraction
  const success = await this.executeStrategy(strategyName);
  sampler.updateReward(strategyName, success);
  
  return strategyName;
}

// PaginationHandler.js - Choose pagination type
async detectPaginationType(page) {
  if (process.env.ENABLE_THOMPSON_SAMPLING) {
    const sampler = new ThompsonSampler();
    return sampler.selectStrategy(['traditional', 'infinite', 'loadMore']);
  }
  
  // Existing detection logic as fallback
  return this.detectPaginationTypeHeuristic(page);
}
```

---

### Week 1 Deliverables & Acceptance Criteria

**Completed Deliverables**:

1. **Checkpoint Infrastructure** (Day 1-2)
   - ✅ CheckpointManager with MongoDB storage
   - ✅ Schema versioning support
   - ✅ CLI inspection tool
   - ✅ Feature flag for enable/disable
   - ✅ Minimal integration (no behavior changes)

2. **BrowserInitializer Utility** (Day 2-3)
   - ✅ Shared browser initialization logic
   - ✅ 95% duplication eliminated
   - ✅ Both NavigationMapper variants updated
   - ✅ SITE_CONFIG consolidated
   - ✅ Backward compatible

3. **NavigationMapper Skeleton** (Day 3-4)
   - ✅ Three new class files created
   - ✅ 2-3 pure methods moved per class
   - ✅ NavigationMapper remains as facade
   - ✅ Feature flag for new architecture
   - ✅ Unit tests for moved methods

4. **PaginationHandler Extraction** (Day 4-5)
   - ✅ Standalone pagination utility
   - ✅ Three pagination strategies supported
   - ✅ Checkpoint integration
   - ✅ ProductCatalogStrategy updated
   - ✅ Independent test suite

5. **Thompson Sampling** (Throughout)
   - ✅ Basic Beta distribution sampler
   - ✅ Strategy selection for navigation
   - ✅ Pagination type selection
   - ✅ Persistence for learning
   - ✅ Feature flag control

**Risk Mitigation Achieved**:
- No breaking changes to existing code
- All changes behind feature flags
- Incremental refactoring approach
- Checkpoint safety net in place
- Rollback possible at any point

**Success Metrics**:
- Code duplication: Reduced by ~20% (BrowserInitializer + partial extractions)
- Test coverage: Increased by 15% (new unit tests)
- Extraction success rate: Maintained at 95%
- Performance: No degradation (<1% variance)
- Zero production incidents

**Rollback Plan**:
```bash
# If issues arise, disable all Week 1 features:
export ENABLE_CHECKPOINTS=false
export ENABLE_THOMPSON_SAMPLING=false
export USE_NEW_ARCHITECTURE=false

# Revert to previous NavigationMapper behavior
git checkout HEAD~1 src/core/discovery/NavigationMapper.js
git checkout HEAD~1 src/core/discovery/NavigationMapperBrowserless.js
```

**Week 2 Preparation**:
- Full NavigationMapper migration (move remaining methods)
- Transform PipelineOrchestrator to 4-step model
- Implement success thresholds
- Add WebSocket progress events
- Begin parallel processing setup

### Week 2: 4-Step Pipeline Implementation (Sequential & Pragmatic)

**Strategy**: Transform 3-stage to 4-step SEQUENTIALLY with thresholds, no premature optimization

#### Day 1-2: Pipeline Architecture Transformation

**Objective**: Restructure PipelineOrchestrator for 4 distinct steps with thresholds

**Current 3-Stage Pipeline** (PipelineOrchestrator.js lines 84-88):
```javascript
progress: {
  navigation: { status: 'pending', results: null },
  collection: { status: 'pending', results: null },
  extraction: { status: 'pending', results: null }
}
```

**New 4-Step Sequential Pipeline**:
```javascript
// New structure with thresholds and clear boundaries
class PipelineOrchestrator {
  constructor(logger, options = {}) {
    this.thresholds = {
      step1_mainCategories: 0.90,     // 90% of discovered main categories must be valid
      step2_subcategories: 0.75,      // 75% of subcategory extraction must succeed
      step3_productUrls: 0.70,         // 70% of URL collection must succeed
      step4_productDetails: 0.40      // 40% of products must have title+price minimum
    };
    
    this.minSampleSize = 10;  // Don't enforce thresholds below this
    this.maxConcurrency = 1;  // SEQUENTIAL for Week 2
  }

  async executeStep(stepNum, stepFunction, inputData) {
    const stepName = `step${stepNum}`;
    const threshold = this.thresholds[stepName];
    const result = {
      step: stepNum,
      startTime: Date.now(),
      attempted: 0,
      succeeded: 0,
      failed: 0,
      outputs: [],
      errors: []
    };

    try {
      // Execute step with retry wrapper
      const stepOutput = await this.withBasicRetry(
        () => stepFunction(inputData),
        2  // Max 2 attempts total
      );
      
      result.attempted = stepOutput.attempted;
      result.succeeded = stepOutput.succeeded;
      result.failed = stepOutput.failed;
      result.outputs = stepOutput.outputs;
      result.successRate = result.succeeded / result.attempted;
      
      // Check threshold (with minimum sample size)
      if (result.attempted >= this.minSampleSize) {
        if (result.successRate < threshold) {
          if (stepNum <= 2) {
            // Navigation steps: abort on failure
            throw new Error(`Step ${stepNum} below threshold: ${result.successRate} < ${threshold}`);
          } else {
            // Data steps: continue but mark degraded
            result.degraded = true;
            this.logger.warn(`Step ${stepNum} degraded: ${result.successRate} < ${threshold}`);
          }
        }
      }
      
      // Persist step summary to MongoDB (lightweight, not full checkpoint)
      await this.persistStepSummary(result);
      
      return result;
      
    } catch (error) {
      result.error = error.message;
      result.endTime = Date.now();
      throw error;
    }
  }
}
```

**Key Decisions**:
- Use discovered candidates as denominators (pragmatic, no ground truth needed)
- Product success = title + price present (configurable later)
- Steps 1-2 abort on threshold failure, Steps 3-4 continue degraded
- Force maxConcurrency: 1 for sequential execution

#### Day 2-3: Split Navigation Discovery into Steps 1 & 2

**Step 1: Main Category Extraction** (Use existing TaxonomyDiscoveryProcessor)
```javascript
class Step1MainCategories {
  async execute(url) {
    // Use existing NavigationMapper to get full navigation
    const navigationMapper = new NavigationMapper(this.logger);
    const { page, close } = await this.browserManager.createBrowser('stealth', {
      maxConcurrency: 1  // Force sequential
    });
    
    try {
      await page.goto(url);
      const navData = await navigationMapper.extractNavigationIntelligence(page);
      
      // Use TaxonomyDiscoveryProcessor to classify main categories
      const processor = new TaxonomyDiscoveryProcessor();
      const taxonomy = await processor.processNavigationData(navData);
      
      // Extract just main categories (already classified!)
      const mainCategories = [
        ...taxonomy.productCategories,
        ...taxonomy.genderSections
      ].map(cat => ({
        id: cat.url,
        name: cat.name,
        url: cat.url,
        priority: cat.priority,
        type: 'main'
      }));
      
      return {
        attempted: mainCategories.length,
        succeeded: mainCategories.filter(c => c.url).length,
        failed: mainCategories.filter(c => !c.url).length,
        outputs: mainCategories
      };
    } finally {
      await close();
    }
  }
}
```

**Step 2: Subcategory Discovery** (Per main category, capped depth)
```javascript
class Step2Subcategories {
  async execute(mainCategories) {
    const results = {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      outputs: []
    };
    
    // Process each main category SEQUENTIALLY
    for (const mainCat of mainCategories) {
      try {
        // Option A: Reuse SubCategoryExplorationStrategy if it fits
        // Option B: Navigate to main category and extract child links
        
        const { page, close } = await this.browserManager.createBrowser('stealth');
        await page.goto(mainCat.url);
        
        // Extract subcategory links (depth=1 only)
        const subLinks = await page.$$eval(
          'a[href*="/category"], a[href*="/collection"], a[href*="/shop"]',
          links => links.map(a => ({
            name: a.textContent.trim(),
            url: a.href
          })).filter(l => l.url !== mainCat.url)  // Exclude self
        );
        
        // Deduplicate by normalized URL
        const uniqueSubs = this.deduplicateByUrl(subLinks);
        
        results.attempted += uniqueSubs.length;
        results.succeeded += uniqueSubs.length;
        results.outputs.push(...uniqueSubs.map(sub => ({
          ...sub,
          parentId: mainCat.id,
          type: 'subcategory'
        })));
        
        await close();
      } catch (error) {
        results.failed++;
        this.logger.warn(`Failed subcategory extraction for ${mainCat.name}: ${error.message}`);
      }
    }
    
    return results;
  }
}

#### Day 3-4: Integrate Collection & Extraction (Steps 3 & 4)

**Step 3: Product URL Collection** (Reuse ProductCatalogStrategy)
```javascript
class Step3ProductUrls {
  async execute(subcategories) {
    const productCatalog = new ProductCatalogStrategy(this.logger);
    const results = {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      outputs: []
    };
    
    // Process subcategories SEQUENTIALLY (limit for Week 2)
    const maxSubcategories = 10;  // Process first 10 for testing
    
    for (const subcat of subcategories.slice(0, maxSubcategories)) {
      try {
        const { page, close } = await this.browserManager.createBrowser('stealth');
        await page.goto(subcat.url);
        
        // Use existing ProductCatalogStrategy
        const catalogResult = await productCatalog.execute(page);
        const productUrls = catalogResult.items || [];
        
        results.attempted += productUrls.length;
        results.succeeded += productUrls.length;
        results.outputs.push(...productUrls.map(url => ({
          url: typeof url === 'string' ? url : url.href,
          subcategoryId: subcat.id,
          type: 'product'
        })));
        
        await close();
      } catch (error) {
        results.failed++;
        this.logger.warn(`Failed URL collection for ${subcat.name}: ${error.message}`);
      }
    }
    
    // Deduplicate product URLs
    results.outputs = this.deduplicateByUrl(results.outputs);
    
    return results;
  }
}
```

**Step 4: Product Detail Extraction** (Reuse ExtractorIntelligence)
```javascript
class Step4ProductDetails {
  async execute(productUrls) {
    const extractor = new ExtractorIntelligence(this.logger);
    const results = {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      outputs: []
    };
    
    // Sample first N products for Week 2
    const maxProducts = 20;
    const urlsToExtract = productUrls.slice(0, maxProducts);
    
    for (const productUrl of urlsToExtract) {
      results.attempted++;
      
      try {
        const productData = await extractor.extractProduct(productUrl.url);
        
        // Check minimum fields (title + price)
        if (productData?.title && productData?.price) {
          results.succeeded++;
          results.outputs.push({
            ...productData,
            productUrlId: productUrl.id,
            qualityScore: this.calculateQualityScore(productData)
          });
        } else {
          results.failed++;
          this.logger.warn(`Incomplete extraction for ${productUrl.url}: missing title or price`);
        }
      } catch (error) {
        results.failed++;
        this.logger.warn(`Failed extraction for ${productUrl.url}: ${error.message}`);
      }
    }
    
    return results;
  }
  
  calculateQualityScore(product) {
    // Simple scoring based on field completeness
    const fields = ['title', 'price', 'description', 'images', 'availability'];
    const filledFields = fields.filter(f => product[f]);
    return filledFields.length / fields.length;
  }
}
```

#### Day 4-5: State Tracking & Basic Retry

**StepRun Summary Schema** (Lightweight MongoDB documents):
```javascript
{
  _id: ObjectId,
  runId: String,
  siteId: String,
  stepName: String,
  stepNumber: Number,
  startedAt: Date,
  completedAt: Date,
  durationMs: Number,
  
  // Metrics
  attempted: Number,
  succeeded: Number,
  failed: Number,
  skipped: Number,
  uniqueCount: Number,
  successRate: Number,
  
  // Threshold check
  threshold: Number,
  thresholdMet: Boolean,
  degraded: Boolean,
  
  // Top errors for debugging
  sampleErrors: [
    { message: String, count: Number }
  ],
  
  // For passing to next step
  downstreamInputsEmitted: Number,
  
  // TTL for automatic cleanup
  expiresAt: Date  // 48 hours from creation
}
```

**Basic Retry Implementation**:
```javascript
class RetryManager {
  async withBasicRetry(fn, maxAttempts = 2) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Skip retry for deterministic errors
        if (this.isDeterministicError(error)) {
          throw error;
        }
        
        if (attempt < maxAttempts) {
          // Simple jittered delay (100-500ms)
          const delay = 100 + Math.random() * 400;
          await new Promise(resolve => setTimeout(resolve, delay));
          this.logger.info(`Retry attempt ${attempt} after ${delay}ms`);
        }
      }
    }
    
    throw lastError;
  }
  
  isDeterministicError(error) {
    const message = error.message.toLowerCase();
    return message.includes('404') || 
           message.includes('robots') || 
           message.includes('blocked') ||
           message.includes('forbidden');
  }
}
```

**Integration into PipelineOrchestrator**:
```javascript
async executePipeline(targetUrl, options = {}) {
  const runId = `run_${Date.now()}`;
  const steps = [
    new Step1MainCategories(this.logger),
    new Step2Subcategories(this.logger),
    new Step3ProductUrls(this.logger),
    new Step4ProductDetails(this.logger)
  ];
  
  let previousOutput = targetUrl;
  const results = [];
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepNum = i + 1;
    
    try {
      this.logger.info(`Starting Step ${stepNum}`);
      
      const stepResult = await this.executeStep(
        stepNum,
        (input) => step.execute(input),
        previousOutput
      );
      
      results.push(stepResult);
      previousOutput = stepResult.outputs;
      
      // Log progress
      this.logger.info(`Step ${stepNum} completed:`, {
        successRate: stepResult.successRate,
        items: stepResult.outputs.length,
        degraded: stepResult.degraded
      });
      
    } catch (error) {
      this.logger.error(`Pipeline aborted at Step ${stepNum}: ${error.message}`);
      
      // Save partial results
      await this.savePartialResults(runId, results);
      throw error;
    }
  }
  
  return {
    runId,
    success: true,
    steps: results,
    totalProducts: results[3]?.outputs?.length || 0
  };
}
```

### Week 2 Deliverables & Acceptance Criteria

**Completed Deliverables**:

1. **4-Step Pipeline Architecture** (Day 1-2)
   - ✅ PipelineOrchestrator refactored to 4 sequential steps
   - ✅ Success thresholds implemented (90%, 75%, 70%, 40%)
   - ✅ Threshold enforcement with min sample size
   - ✅ Abort on navigation failure, continue degraded on data failure
   - ✅ Sequential execution (maxConcurrency: 1)

2. **Navigation Split** (Day 2-3)
   - ✅ Step 1: Main categories via TaxonomyDiscoveryProcessor
   - ✅ Step 2: Subcategories with depth=1 limit
   - ✅ URL deduplication implemented
   - ✅ Both steps return uniform StepResult format

3. **Collection & Extraction Integration** (Day 3-4)
   - ✅ Step 3: ProductCatalogStrategy wrapped with metrics
   - ✅ Step 4: ExtractorIntelligence with quality scoring
   - ✅ Title + price defined as minimum success criteria
   - ✅ Sample limits for initial testing (10 subcats, 20 products)

4. **State Tracking & Retry** (Day 4-5)
   - ✅ StepRun summary persisted to MongoDB
   - ✅ TTL indexes for automatic cleanup (48h)
   - ✅ Basic retry with jitter (max 2 attempts)
   - ✅ Deterministic error detection (no retry on 404s)
   - ✅ Top error tracking for debugging

**What We Explicitly Avoided**:
- ❌ Parallelization (deferred to Week 4)
- ❌ Postgres (stuck with MongoDB)
- ❌ Complex ML (Thompson sampling deferred)
- ❌ Full checkpoint/resume (coming Week 3)
- ❌ WebSocket progress (coming Week 4)

**Testing Checklist**:
- [ ] Run on glasswingshop.com (simple site)
- [ ] Verify thresholds trigger correctly
- [ ] Confirm degraded mode works for Steps 3-4
- [ ] Check MongoDB StepRun documents created
- [ ] Validate retry on transient errors

---

**Implementation**:
```javascript
class Step4DetailExtraction {
  async execute(productUrls, page, checkpoint) {
    const products = [];
    const extractor = new ExtractorIntelligence(this.logger);
    
    for (const url of productUrls) {
      try {
        const product = await extractor.extractProduct(url, page);
        products.push(product);
      } catch (error) {
        this.logger.warn(`Failed to extract ${url}:`, error);
      }
      
      // Save progress every 10 products
      if (products.length % 10 === 0) {
        await checkpoint.saveProgress('step4', {
          lastProduct: url,
          productCount: products.length
        });
      }
    }
    
    return products;
  }
}
```

### Week 3: Resilience & Recovery (Simplified MVP)

**Strategy**: Build MINIMUM viable checkpoint/resume without overengineering

#### Day 1-2: Simple CheckpointManager

**Objective**: Basic checkpoint persistence with single MongoDB collection

**Simple Checkpoint Schema** (One collection, no distributed complexity):
```javascript
{
  _id: ObjectId,
  jobId: String,                    // Unique job identifier
  pipelineVersion: "1.0",           // For compatibility checks
  currentStep: Number,              // Last completed step (0-4)
  stepStates: {
    1: {
      status: "completed",
      outputs: [...],             // Serialized step outputs
      completedAt: Date
    },
    2: {
      status: "failed",
      outputs: null,
      error: "Timeout after 30s",
      failedAt: Date
    },
    // Steps 3-4...
  },
  metadata: {
    domain: String,
    startedAt: Date,
    lastCheckpoint: Date
  },
  expiresAt: Date                // TTL index for auto-cleanup
}
```

**CheckpointManager Implementation**:
```javascript
class CheckpointManager {
  constructor(mongoClient, logger) {
    this.collection = mongoClient.db('scraping').collection('checkpoints');
    this.logger = logger;
  }

  async saveStepComplete(jobId, stepNum, outputs) {
    // Simple upsert - no distributed locks needed
    await this.collection.updateOne(
      { jobId },
      {
        $set: {
          currentStep: stepNum,
          [`stepStates.${stepNum}`]: {
            status: 'completed',
            outputs: this.serialize(outputs),
            completedAt: new Date()
          },
          lastCheckpoint: new Date(),
          expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
        }
      },
      { upsert: true }
    );
  }

  async loadCheckpoint(jobId) {
    const checkpoint = await this.collection.findOne({ jobId });
    if (!checkpoint) return null;
    
    // Find last completed step
    const lastCompleted = checkpoint.currentStep || 0;
    const resumeData = checkpoint.stepStates[lastCompleted]?.outputs || null;
    
    return {
      resumeFromStep: lastCompleted + 1,
      previousOutputs: this.deserialize(resumeData),
      metadata: checkpoint.metadata
    };
  }

  serialize(data) {
    // Keep only essential data for resume
    return JSON.stringify(data).substring(0, 100000); // Cap at 100KB
  }

  deserialize(data) {
    return data ? JSON.parse(data) : null;
  }
}
```

#### Day 2-3: Simple Pipeline Retry Logic

**Objective**: Basic retry without distributed complexity

**PipelineRetryManager** (No locks, no circuit breakers):
```javascript
class PipelineRetryManager {
  constructor(logger) {
    this.logger = logger;
    this.maxStepRetries = 3;
    this.baseDelay = 1000; // Start with 1 second
  }

  async retryStep(stepNum, stepFunction) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxStepRetries; attempt++) {
      try {
        return await stepFunction();
      } catch (error) {
        lastError = error;
        
        // Check if permanent failure
        if (this.isPermanentError(error)) {
          this.logger.error(`Step ${stepNum} permanent failure: ${error.message}`);
          throw error;
        }
        
        // Simple exponential backoff
        if (attempt < this.maxStepRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          this.logger.info(`Step ${stepNum} attempt ${attempt} failed, retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  isPermanentError(error) {
    const message = error.message?.toLowerCase() || '';
    return message.includes('404') ||
           message.includes('forbidden') ||
           message.includes('unauthorized') ||
           message.includes('robots.txt');
  }
}
```

#### Day 3-4: Integration with 4-Step Pipeline

**Objective**: Add checkpoint hooks to PipelineOrchestrator

**Integration Points**:
```javascript
class PipelineOrchestrator {
  constructor(logger, options = {}) {
    // ... existing code ...
    this.checkpointManager = new CheckpointManager(mongoClient, logger);
    this.retryManager = new PipelineRetryManager(logger);
  }

  async executePipeline(targetUrl, options = {}) {
    const jobId = options.jobId || `job_${Date.now()}`;
    
    // Check for existing checkpoint
    const checkpoint = await this.checkpointManager.loadCheckpoint(jobId);
    let startStep = checkpoint?.resumeFromStep || 1;
    let previousOutputs = checkpoint?.previousOutputs || targetUrl;
    
    if (checkpoint) {
      this.logger.info(`Resuming job ${jobId} from step ${startStep}`);
    }
    
    const steps = [
      new Step1MainCategories(this.logger),
      new Step2Subcategories(this.logger),
      new Step3ProductUrls(this.logger),
      new Step4ProductDetails(this.logger)
    ];
    
    const results = [];
    
    for (let i = startStep - 1; i < steps.length; i++) {
      const stepNum = i + 1;
      const step = steps[i];
      
      try {
        // Execute step with retry
        const stepResult = await this.retryManager.retryStep(
          stepNum,
          () => step.execute(previousOutputs)
        );
        
        // Save checkpoint after successful step
        await this.checkpointManager.saveStepComplete(
          jobId,
          stepNum,
          stepResult.outputs
        );
        
        results.push(stepResult);
        previousOutputs = stepResult.outputs;
        
        this.logger.info(`Step ${stepNum} completed successfully`);
        
      } catch (error) {
        this.logger.error(`Pipeline failed at step ${stepNum}: ${error.message}`);
        
        // Save failure state
        await this.checkpointManager.saveStepFailed(jobId, stepNum, error);
        throw error;
      }
    }
    
    return {
      jobId,
      success: true,
      steps: results
    };
  }
}
```

#### Day 4-5: Testing with 3 Real Sites

**Objective**: Validate checkpoint/resume with diverse sites

**Test Sites** (Realistic for 1 day):
1. **glasswingshop.com** (2 hours)
   - Simple Shopify structure
   - Baseline test
   - Target: 95% success

2. **macys.com** (3 hours)
   - Complex navigation
   - Anti-bot measures
   - Target: 85% success

3. **shop.polymer-project.org** (2 hours)
   - WooCommerce test
   - Different structure
   - Target: 90% success

**Test Scenarios**:
```javascript
// Test 1: Normal execution
await orchestrator.executePipeline('https://glasswingshop.com');

// Test 2: Kill and resume
const jobId = 'test_resume_001';
await orchestrator.executePipeline('https://macys.com', { jobId });
// Kill process after Step 2
// Restart and verify resumes from Step 3

// Test 3: Retry on transient failure
// Simulate network timeout in Step 3
// Verify retry logic works
```

### Week 3 Deliverables & Acceptance Criteria

**Completed Deliverables**:

1. **CheckpointManager** (Day 1-2)
   - ✅ Single MongoDB collection (SIMPLE)
   - ✅ Basic save/load operations
   - ✅ TTL index for auto-cleanup
   - ✅ No distributed locks (YAGNI)

2. **PipelineRetryManager** (Day 2-3)
   - ✅ Simple exponential backoff
   - ✅ Permanent vs transient classification
   - ✅ No circuit breakers (deferred)
   - ✅ 3 retries per step max

3. **Pipeline Integration** (Day 3-4)
   - ✅ Checkpoint after each step
   - ✅ Resume from last completed step
   - ✅ Retry wrapper for steps
   - ✅ Error state persistence

4. **Real Site Testing** (Day 4-5)
   - ✅ 3 diverse sites tested
   - ✅ Kill/resume verified
   - ✅ Retry logic validated
   - ✅ Success rates documented

**What We Explicitly Avoided**:
- ❌ Two-collection complexity
- ❌ Distributed locking
- ❌ Circuit breakers (Week 5-6)
- ❌ Async cleanup jobs
- ❌ 5 sites in one day

---

## Phase 2: Monitoring & Observability (Weeks 4-5)

### Week 4: Monitoring & Observability (Minimal, Non-Invasive)

**Strategy**: Build monitoring using EXISTING infrastructure without touching PipelineOrchestrator before Week 2's refactor

#### Day 1-2: Metrics Endpoint from Existing Data

**Create /metrics endpoint aggregating current QueueManager stats**:

```javascript
// src/routes/monitoring.js - Enhance existing endpoint
router.get('/metrics/summary', async (req, res) => {
  // Aggregate from QueueManager's existing data
  const queueStats = await queueManager.getQueueStats();
  
  const metrics = {
    // Queue depth by state (already available)
    queue_depth: {
      pending: queueStats.waiting || 0,
      active: queueStats.active || 0,
      completed: queueStats.completed || 0,
      failed: queueStats.failed || 0
    },
    
    // Processing rate (calculate from existing timestamps)
    throughput: {
      jobs_per_minute: calculateRate(queueStats.completedJobs),
      success_rate: queueStats.successRate || 0,
      avg_duration_ms: queueStats.avgProcessingTime || 0
    },
    
    // Error tracking (from existing error logs)
    errors: {
      total_count: queueStats.failedCount || 0,
      error_rate: calculateErrorRate(queueStats),
      top_errors: getTopErrors(queueStats.recentErrors)
    },
    
    timestamp: new Date().toISOString()
  };
  
  res.json(metrics);
});
```

#### Day 2-3: Dashboard Using Existing WebSocket Events

**Enhance analytics-dashboard.html to visualize current QueueManager events**:

```javascript
// NO CHANGES to WebSocketService or PipelineOrchestrator
// Dashboard uses EXISTING events from QueueManager:
// - job_started
// - job_progress  
// - job_completed
// - job_failed

// src/public/analytics-dashboard.html additions:
socket.on('job_progress', (data) => {
  // Update existing charts with queue-level progress
  updateQueueDepthChart(data);
  updateThroughputMetrics(data);
  updateSuccessRateDisplay(data);
});

// Poll /metrics/summary for aggregated data
setInterval(async () => {
  const metrics = await fetch('/metrics/summary').then(r => r.json());
  updateMetricCards(metrics);
  updateErrorList(metrics.errors);
}, 5000);
```

#### Day 3-4: Document Future Event Contract

**Define events that will survive the 3→4 step transition**:

```javascript
// docs/monitoring-event-contract.md
// These events will be implemented AFTER Week 2's refactor

const EventContract = {
  // Generic step transition (works for any number of steps)
  'pipeline.step_transition': {
    jobId: string,
    stepId: string,        // 'main_nav', 'sub_nav', 'urls', 'details'
    stepName: string,      // Human-readable
    status: 'enter' | 'exit' | 'error',
    timestamp: number,
    error?: { code: string, message: string }
  },
  
  // Overall pipeline lifecycle  
  'pipeline.lifecycle': {
    jobId: string,
    status: 'queued' | 'started' | 'completed' | 'failed',
    timestamp: number
  },
  
  // Step-agnostic progress
  'pipeline.progress': {
    jobId: string,
    percentComplete: number,  // 0-100
    message: string,
    timestamp: number
  }
};
```

#### Day 5: Test & Document

**Deliverables**:
1. `/metrics/summary` endpoint working with existing data
2. Dashboard showing queue stats (no pipeline internals)
3. Event contract documented for Week 2 implementation
4. NO changes to PipelineOrchestrator
5. NO new dependencies added

**What We're NOT Doing**:
- ❌ Not modifying PipelineOrchestrator (wait for Week 2)
- ❌ Not injecting WebSocket into pipeline
- ❌ Not adding EventEmitter before refactor
- ❌ Not creating tight coupling

**Success Metrics**:
- Zero changes to core pipeline code
- Dashboard shows queue-level visibility
- Metrics endpoint returns JSON in < 50ms
- Event contract reviewed and approved
    labelNames: ['step', 'domain']
  }),
  
  step_success_rate: new Gauge({
    name: 'pipeline_step_success_rate',
    help: 'Success rate for each step',
    labelNames: ['step', 'domain']
  }),
  
  items_extracted_total: new Counter({
    name: 'pipeline_items_extracted_total',
    help: 'Total items extracted',
    labelNames: ['type', 'domain']
  }),
  
  checkpoint_saves_total: new Counter({
    name: 'pipeline_checkpoint_saves_total',
    help: 'Total checkpoint saves',
    labelNames: ['step']
  }),
  
  recovery_attempts_total: new Counter({
    name: 'pipeline_recovery_attempts_total',
    help: 'Total recovery attempts from checkpoint',
    labelNames: ['step', 'success']
  })
};
```

### Week 5: Pipeline Visibility & Dashboard Enhancement (No Transport Changes)

**Strategy**: Add pipeline step visibility using EXISTING WebSocket infrastructure, create adaptive visualization

#### Day 1-2: Add Pipeline Step Events (After Week 2 Completes)

**Enhance PipelineOrchestrator with EventEmitter** (depends on Week 2's 4-step refactor):

```javascript
// src/core/PipelineOrchestrator.js - Add after Week 2's refactor
const { EventEmitter } = require('events');

class PipelineOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    // Existing constructor code...
  }
  
  // Emit events at step boundaries (works for 3 or 4 steps)
  async executeStep(stepName, stepFunction, jobId) {
    this.emit('pipeline:step:enter', {
      jobId,
      stepName,
      timestamp: Date.now()
    });
    
    try {
      const result = await stepFunction();
      this.emit('pipeline:step:exit', {
        jobId,
        stepName,
        success: true,
        itemsProcessed: result.length || 0,
        timestamp: Date.now()
      });
      return result;
    } catch (error) {
      this.emit('pipeline:step:error', {
        jobId,
        stepName,
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }
}

// QueueManager subscribes and relays via existing WebSocket
// In src/index.js, add to setupWebSocketIntegration():
pipelineOrchestrator.on('pipeline:step:enter', (data) => {
  this.webSocketService.broadcastJobProgress(data.jobId, {
    event: 'step:enter',
    step: data.stepName,
    timestamp: data.timestamp
  });
});
```

#### Day 3-4: Create Adaptive Dashboard Visualization

**Extract inline code and create adaptive pipeline component**:

```javascript
// src/public/js/analytics-dashboard.js (NEW FILE)
class PipelineVisualizer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.steps = [];
  }
  
  // Adaptive - works with any number of steps
  initializeFromData(stepData) {
    this.steps = stepData; // Could be 3 or 4 steps
    this.render();
  }
  
  render() {
    this.container.innerHTML = this.steps.map((step, index) => `
      <div class="step-progress" data-step="${step.id}">
        <div class="step-header">
          <span class="step-number">${index + 1}</span>
          <span class="step-name">${step.name}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: 0%"></div>
        </div>
        <div class="step-stats">
          <span class="status">Pending</span>
          <span class="items">0 items</span>
        </div>
      </div>
    `).join('');
  }
  
  updateStep(stepId, data) {
    const stepEl = this.container.querySelector(`[data-step="${stepId}"]`);
    if (!stepEl) return;
    
    const fill = stepEl.querySelector('.progress-fill');
    const status = stepEl.querySelector('.status');
    const items = stepEl.querySelector('.items');
    
    if (data.event === 'step:enter') {
      status.textContent = 'Running';
      stepEl.classList.add('active');
    } else if (data.event === 'step:exit') {
      status.textContent = 'Complete';
      fill.style.width = '100%';
      items.textContent = `${data.itemsProcessed} items`;
      stepEl.classList.remove('active');
      stepEl.classList.add('complete');
    }
  }
}

// Initialize on page load
const pipeline = new PipelineVisualizer('pipeline-container');

// Listen to EXISTING WebSocket events
socket.on('job_progress', (data) => {
  if (data.event && data.event.startsWith('step:')) {
    pipeline.updateStep(data.step, data);
  }
});
```

```css
/* src/public/css/analytics-dashboard.css (NEW FILE) */
.step-progress {
  margin: 10px 0;
  padding: 15px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.step-progress.active {
  border-color: #3b82f6;
  background: #eff6ff;
}

.step-progress.complete {
  border-color: #10b981;
  background: #f0fdf4;
}

.progress-bar {
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
  margin: 10px 0;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #10b981);
  transition: width 0.5s ease;
}
```

#### Day 5: Integration & Testing

**Update analytics-dashboard.html to use external files**:

```html
<!-- Remove inline styles and scripts -->
<link rel="stylesheet" href="/css/analytics-dashboard.css">
<script src="/js/analytics-dashboard.js"></script>

<!-- Adaptive container that works with any step count -->
<div id="pipeline-container" class="pipeline-visualizer">
  <!-- Dynamically populated based on backend data -->
</div>
```

**Success Criteria**:
- ✅ Uses EXISTING WebSocket infrastructure (no new transports)
- ✅ Dashboard adapts to 3 or 4 steps automatically
- ✅ Inline JS/CSS extracted to separate files
- ✅ NO transport consolidation or refactoring
- ✅ Works with current system AND future Week 2 changes

**What We're NOT Doing**:
- ❌ Not consolidating WebSocket and SSE
- ❌ Not changing transport layers
- ❌ Not hardcoding step counts
- ❌ Not breaking existing functionality

---

## Phase 3: Pattern Learning & Intelligence (Weeks 6-8)

### Week 6: Practical Multi-Site Support (Get Sites Working!)

**Strategy**: Focus on ACTUAL functionality, not theoretical infrastructure

#### Day 1: Simple Configuration System

**Move SITE_CONFIG to external file** (10 minutes work):

```javascript
// config/sites.json
{
  "macys.com": {
    "headless": false,
    "navigation": {
      "menuSelector": "[class*='flyout'], .nav-item",
      "dropdownSelector": ".dropdown-menu, [class*='mega-menu']",
      "hoverDelay": 300,
      "waitForSelector": ".nav-loaded"
    },
    "products": {
      "cardSelector": "[class*='product-tile']",
      "titleSelector": ".product-name, [class*='title']",
      "priceSelector": ".price, [class*='price']"
    },
    "popups": {
      "cookieBanner": "#cookie-consent, .cookie-banner",
      "newsletterModal": "[class*='newsletter-modal']"
    }
  },
  "nordstrom.com": {
    "headless": false,
    "navigation": {
      "menuSelector": ".nav-link",
      "dropdownSelector": ".nav-dropdown",
      "hoverDelay": 500
    }
  },
  // Add 5+ more sites during the week
}

// src/config/SiteConfigLoader.js
const fs = require('fs');
const path = require('path');

class SiteConfigLoader {
  constructor() {
    this.configs = this.loadConfigs();
  }
  
  loadConfigs() {
    const configPath = path.join(__dirname, '../../config/sites.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  
  getConfig(domain) {
    const normalized = domain.toLowerCase().replace(/^www\./, '');
    return this.configs[normalized] || this.configs.default || {};
  }
}
```

#### Day 2-3: Refactor NavigationMapper to Use Config

**Update NavigationMapper.js**:

```javascript
// Replace hardcoded SITE_CONFIG with:
const siteConfigLoader = new SiteConfigLoader();

class NavigationMapper {
  async initializeForSite(domain) {
    const config = siteConfigLoader.getConfig(domain);
    
    // Use config for headless decision
    this.isHeadless = config.headless !== false;
    
    // Pass selectors to strategies
    this.navigationConfig = config.navigation || {};
    this.productConfig = config.products || {};
  }
  
  async extractNavigation(page) {
    const { menuSelector, dropdownSelector } = this.navigationConfig;
    
    // Use site-specific selectors
    if (menuSelector) {
      await page.waitForSelector(menuSelector, { timeout: 5000 }).catch(() => {});
    }
    
    // Rest of extraction logic using config
  }
}
```

#### Day 4: Test with 5+ Real Sites

**Sites to test and add**:
1. ✅ macys.com (existing)
2. ✅ nordstrom.com (existing)  
3. ✅ saks.com (existing)
4. 🆕 target.com
5. 🆕 walmart.com
6. 🆕 amazon.com
7. 🆕 bestbuy.com
8. 🆕 homedepot.com

**Testing script**:
```javascript
// test/multi-site-test.js
const sites = [
  'https://www.target.com',
  'https://www.walmart.com',
  'https://www.bestbuy.com'
];

for (const site of sites) {
  console.log(`Testing ${site}...`);
  const result = await navigationMapper.mapSiteNavigation(site);
  
  // Document what works
  console.log({
    site,
    categoriesFound: result.main_sections?.length || 0,
    selectors: {
      working: findWorkingSelectors(result),
      failed: findFailedSelectors(result)
    }
  });
}
```

#### Day 5: Document Patterns

**Create patterns documentation**:

```markdown
# Site Patterns That Work

## Common Navigation Patterns
- Mega menus: `[class*='mega'], [class*='flyout']`
- Dropdowns: `.dropdown-menu, .nav-dropdown`
- Nav items: `.nav-item, .nav-link, [role='menuitem']`

## Product Card Patterns
- Tiles: `[class*='product-tile'], [class*='product-card']`
- Grid items: `.grid-item, .product-grid-item`
- List items: `li[class*='product']`

## Site-Specific Quirks
- Target: Requires 500ms hover delay
- Walmart: Uses lazy-loaded navigation
- Amazon: Complex multi-level structure
```

**Success Criteria**:
- ✅ 5+ sites working with simple config
- ✅ No complex infrastructure built
- ✅ Patterns documented for future use
- ✅ Simple JSON config, no overengineering

**What We're NOT Doing**:
- ❌ Thompson Sampling (save for when we have data)
- ❌ Experiment scaffolding (YAGNI)
- ❌ MongoDB collections (overkill)
- ❌ Complex resolution logic
    
    // Persist to database
    await this.db.collection('extraction_feedback').insertOne({
      pattern_id: patternHash,
      domain: extractionData.domain,
      success,
      extraction_time_ms: extractionData.duration,
      items_extracted: extractionData.itemCount,
      timestamp: new Date()
    });
    
    // Update pattern statistics
    await this.db.collection('learned_patterns').updateOne(
      { pattern_hash: patternHash },
      {
        $inc: {
          usage_count: 1,
          success_count: success ? 1 : 0,
          failure_count: success ? 0 : 1
        },
        $set: {
          last_used: new Date(),
          success_rate: this.calculateSuccessRate(patternHash)
        }
      }
    );
  }
}
```

### Week 7: Practical Pattern Learning (Extraction Success Focus)

**Strategy**: Improve extraction success from 40% to 70% through simple pattern learning
**Key Insight**: At 5-site scale, extraction accuracy > speed optimization

#### Day 1-2: Build SimplePatternMatcher

```javascript
// src/learning/SimplePatternMatcher.js
class SimplePatternMatcher {
  constructor(logger, redis) {
    this.logger = logger;
    this.redis = redis || new Map(); // Memory fallback
    this.successCache = new Map();
    this.CONFIDENCE_THRESHOLD = 0.7;
  }

  // Record successful patterns
  async recordSuccess(site, stepType, selector, element) {
    const pattern = {
      selector,
      context: this.extractContext(element),
      timestamp: Date.now(),
      successCount: 1
    };
    
    const key = `pattern:${site}:${stepType}`;
    const existing = this.successCache.get(key) || [];
    existing.push(pattern);
    this.successCache.set(key, existing);
    
    // Persist to Redis if available
    if (this.redis.zadd) {
      await this.redis.zadd(key, Date.now(), JSON.stringify(pattern));
    }
  }

  // Suggest selectors based on past success
  async suggestSelectors(site, stepType) {
    const suggestions = [];
    
    // 1. Site-specific patterns (highest priority)
    const siteKey = `pattern:${site}:${stepType}`;
    const sitePatterns = this.successCache.get(siteKey) || [];
    suggestions.push(...this.rankPatterns(sitePatterns));
    
    // 2. Platform patterns (medium priority)
    const platform = this.detectPlatform(site);
    if (platform) {
      const platformKey = `pattern:platform:${platform}:${stepType}`;
      const platformPatterns = this.successCache.get(platformKey) || [];
      suggestions.push(...this.rankPatterns(platformPatterns));
    }
    
    // 3. Default fallbacks
    suggestions.push(...this.getDefaultSelectors(stepType));
    
    return [...new Set(suggestions)].slice(0, 10);
  }

  detectPlatform(site) {
    if (site.includes('shopify')) return 'shopify';
    if (site.includes('woocommerce')) return 'woocommerce';
    return null;
  }
}
```

#### Day 3-4: Integration & Cross-Site Sharing

```javascript
// Integration with PipelineOrchestrator
class PipelineOrchestrator {
  async executeStep(step, context) {
    // Get pattern suggestions
    const selectors = await this.patternMatcher.suggestSelectors(
      context.site,
      step.type
    );
    
    // Try each selector
    for (const selector of selectors) {
      const result = await this.trySelector(selector, context);
      if (result.success) {
        // Learn from success
        await this.patternMatcher.recordSuccess(
          context.site,
          step.type,
          selector,
          result.element
        );
        return result;
      }
    }
    
    return this.fallbackExtraction(step, context);
  }
}
```

#### Day 5: Metrics & Testing

```javascript
// Track improvement
class ExtractionMetrics {
  constructor() {
    this.baseline = 0.4; // Current 40%
    this.withLearning = new Map();
  }

  record(site, success, usedLearning) {
    if (usedLearning) {
      const current = this.withLearning.get(site) || { total: 0, success: 0 };
      current.total++;
      if (success) current.success++;
      this.withLearning.set(site, current);
    }
  }

  getImprovement() {
    let total = 0, successful = 0;
    for (const stats of this.withLearning.values()) {
      total += stats.total;
      successful += stats.success;
    }
    const rate = total > 0 ? successful / total : 0;
    return {
      baseline: this.baseline,
      current: rate,
      improvement: ((rate - this.baseline) / this.baseline) * 100
    };
  }
}
```

**Expected Outcomes**:
- ✅ Extraction success: 40% → 60-70% (50-75% improvement)
- ✅ Implementation: 2-3 days (vs 4-5 for performance stack)
- ✅ No performance bottleneck (Map lookups + Redis)
- ✅ Immediate ROI at 5-site scale
- ✅ Foundation for future ML enhancements

**NOT Doing**:
- ❌ Complex ML (cosineSimilarity, feature vectors)
- ❌ MongoDB pooling (premature at 5 sites)
- ❌ Worker clusters (concurrency=3 sufficient)
- ❌ Batch processing (unnecessary complexity)

### Week 8: Platform Pattern Validation (Connect Existing Components)

**Strategy**: Validate that platform patterns are transferable by connecting PlatformDetector to SimplePatternMatcher
**Key Insight**: Same platforms share HTML structures - patterns learned on one Shopify site should work on others

#### Day 1-2: Connect PlatformDetector to SimplePatternMatcher

```javascript
// src/learning/PlatformAwarePatternMatcher.js
const SimplePatternMatcher = require('./SimplePatternMatcher');
const PlatformDetector = require('../core/discovery/strategies/PlatformDetector');

class PlatformAwarePatternMatcher extends SimplePatternMatcher {
  constructor(logger, redis) {
    super(logger, redis);
    this.platformDetector = new PlatformDetector();
  }

  async recordSuccess(site, stepType, selector, element, page) {
    // Detect platform
    const platform = await this.platformDetector.detectPlatform(page);
    
    // Record for specific site
    await super.recordSuccess(site, stepType, selector, element);
    
    // ALSO record for platform (key insight)
    if (platform !== 'unknown') {
      const platformKey = `pattern:platform:${platform}:${stepType}`;
      const pattern = {
        selector,
        platform,
        sourceSite: site,
        timestamp: Date.now()
      };
      
      // Store platform pattern
      if (this.redis.zadd) {
        await this.redis.zadd(platformKey, Date.now(), JSON.stringify(pattern));
      }
      
      this.logger.info(`Recorded platform pattern for ${platform}:${stepType} from ${site}`);
    }
  }

  async suggestSelectors(site, stepType, page) {
    const suggestions = [];
    const platform = await this.platformDetector.detectPlatform(page);
    
    // 1. Site-specific (highest confidence)
    const siteKey = `pattern:${site}:${stepType}`;
    const sitePatterns = await this.getPatterns(siteKey);
    suggestions.push(...this.rankBySuccess(sitePatterns));
    
    // 2. Platform patterns (THIS IS THE KEY ADDITION)
    if (platform !== 'unknown') {
      const platformKey = `pattern:platform:${platform}:${stepType}`;
      const platformPatterns = await this.getPatterns(platformKey);
      
      // Weight platform patterns slightly lower than site-specific
      const weighted = platformPatterns.map(p => ({
        ...p,
        confidence: p.confidence * 0.8
      }));
      
      suggestions.push(...this.rankBySuccess(weighted));
      
      this.logger.debug(`Added ${platformPatterns.length} ${platform} patterns`);
    }
    
    // 3. Universal defaults
    suggestions.push(...this.getDefaultSelectors(stepType));
    
    return [...new Set(suggestions)].slice(0, 15);
  }
}
```

#### Day 3: Test on New Shopify Sites

```javascript
// test/platform-pattern-test.js
const testSites = [
  // Existing (patterns already learned)
  { url: 'https://glasswingshop.com', platform: 'shopify', existing: true },
  
  // New Shopify sites to validate pattern transfer
  { url: 'https://shop.bombas.com', platform: 'shopify', existing: false },
  { url: 'https://www.allbirds.com', platform: 'shopify', existing: false },
  { url: 'https://www.gymshark.com', platform: 'shopify', existing: false }
];

async function validatePlatformPatterns() {
  const matcher = new PlatformAwarePatternMatcher(logger, redis);
  const results = [];
  
  for (const site of testSites) {
    if (site.existing) {
      // Learn patterns from existing site
      await extractAndLearn(site.url, matcher);
    }
  }
  
  // Now test on NEW sites
  for (const site of testSites.filter(s => !s.existing)) {
    const patterns = await matcher.suggestSelectors(
      site.url,
      'navigation',
      page
    );
    
    // Measure success rate
    const success = await tryPatterns(site.url, patterns);
    
    results.push({
      site: site.url,
      platform: site.platform,
      patternsFound: patterns.length,
      successRate: success.rate,
      workingSelectors: success.selectors
    });
  }
  
  return results;
}
```

#### Day 4: Test Cross-Platform (WooCommerce, Magento)

```javascript
// Additional test sites
const crossPlatformTests = [
  // WooCommerce sites
  { url: 'https://example-woo1.com', platform: 'woocommerce' },
  { url: 'https://example-woo2.com', platform: 'woocommerce' },
  
  // Magento sites
  { url: 'https://example-mag1.com', platform: 'magento' },
  { url: 'https://example-mag2.com', platform: 'magento' },
  
  // Custom/Unknown
  { url: 'https://custom-site.com', platform: 'unknown' }
];
```

#### Day 5: Measure & Document Results

```javascript
// Metrics to track
class PlatformValidationMetrics {
  constructor() {
    this.results = new Map();
  }

  record(platform, site, success) {
    if (!this.results.has(platform)) {
      this.results.set(platform, {
        sites: [],
        totalAttempts: 0,
        successful: 0
      });
    }
    
    const stats = this.results.get(platform);
    stats.sites.push(site);
    stats.totalAttempts++;
    if (success) stats.successful++;
  }

  getReport() {
    const report = {};
    
    for (const [platform, stats] of this.results) {
      report[platform] = {
        sitesTests: stats.sites.length,
        successRate: (stats.successful / stats.totalAttempts) * 100,
        conclusion: stats.successful > stats.totalAttempts * 0.7 
          ? 'Platform patterns WORK - build abstraction'
          : 'Platform patterns UNRELIABLE - stay site-specific'
      };
    }
    
    return report;
  }
}
```

**Expected Validation Results**:
- ✅ Shopify: 80-90% pattern transfer success (highly standardized)
- ✅ WooCommerce: 60-70% success (theme variations)
- ⚠️ Magento: 40-50% success (highly customized)
- ❌ Custom: 10-20% success (no patterns)

**Decision Matrix**:
- If >70% success: Platform patterns validated → Consider abstractions in Week 9
- If <70% success: Stay with site-specific patterns → Skip plugin architecture
- Mixed results: Selective platform grouping (Shopify yes, others no)

**NOT Doing**:
- ❌ Building plugin architecture
- ❌ Creating strategy classes
- ❌ Complex abstraction layers
- ❌ Hot-loading mechanisms

---

### Week 9: Extraction Diagnostics & Recovery

**Build Tools to Improve Extraction from 40% to 70%**:

#### Day 1-2: ExtractionDiagnostics Tool

```javascript
// src/diagnostics/ExtractionDiagnostics.js
class ExtractionDiagnostics {
  constructor(logger, cache) {
    this.logger = logger;
    this.cache = cache;
    this.failureReasons = new Map();
  }
  
  async analyzeFailure(page, selector, context = {}) {
    const diagnosis = {
      selector,
      timestamp: Date.now(),
      url: page.url(),
      
      // Check if selector exists
      selectorExists: await this.checkSelectorExists(page, selector),
      
      // Find similar elements
      alternatives: await this.findAlternatives(page, context),
      
      // Check timing issues
      timingIssues: await this.checkTimingIssues(page, selector),
      
      // Detect structural changes
      structureChange: await this.detectStructureChange(page, context.site),
      
      // Generate recommendation
      recommendation: null
    };
    
    // Analyze and provide recommendation
    if (!diagnosis.selectorExists && diagnosis.alternatives.length > 0) {
      diagnosis.recommendation = {
        type: 'selector_outdated',
        action: 'update_selector',
        suggestedSelector: diagnosis.alternatives[0].selector,
        confidence: diagnosis.alternatives[0].confidence
      };
    } else if (diagnosis.timingIssues.renderDelayed) {
      diagnosis.recommendation = {
        type: 'timing_issue',
        action: 'increase_wait_time',
        suggestedWait: diagnosis.timingIssues.suggestedWait
      };
    } else if (diagnosis.structureChange) {
      diagnosis.recommendation = {
        type: 'site_redesign',
        action: 'relearn_patterns',
        changedElements: diagnosis.structureChange.changes
      };
    }
    
    // Store failure reason for pattern analysis
    this.recordFailure(context.site, context.stepType, diagnosis);
    
    return diagnosis;
  }
  
  async checkSelectorExists(page, selector) {
    try {
      const element = await page.$(selector);
      return element !== null;
    } catch {
      return false;
    }
  }
  
  async findAlternatives(page, context) {
    const alternatives = [];
    
    // If we have text context, try text-based selectors
    if (context.expectedText) {
      const textSelector = `//*[contains(text(), '${context.expectedText}')]`;
      const textElement = await page.$(textSelector);
      if (textElement) {
        alternatives.push({
          selector: textSelector,
          type: 'xpath_text',
          confidence: 0.7
        });
      }
    }
    
    // Try partial class matching
    if (context.partialClass) {
      const classSelector = `[class*="${context.partialClass}"]`;
      const classElements = await page.$$(classSelector);
      if (classElements.length > 0 && classElements.length < 10) {
        alternatives.push({
          selector: classSelector,
          type: 'partial_class',
          confidence: 0.6,
          count: classElements.length
        });
      }
    }
    
    // Try data attributes
    const dataSelectors = [
      '[data-product]',
      '[data-item]',
      '[data-price]',
      '[data-testid*="product"]'
    ];
    
    for (const dataSelector of dataSelectors) {
      const elements = await page.$$(dataSelector);
      if (elements.length > 0) {
        alternatives.push({
          selector: dataSelector,
          type: 'data_attribute',
          confidence: 0.5,
          count: elements.length
        });
      }
    }
    
    return alternatives.sort((a, b) => b.confidence - a.confidence);
  }
  
  async checkTimingIssues(page, selector) {
    const timing = {
      renderDelayed: false,
      suggestedWait: 0,
      dynamicContent: false
    };
    
    // Check if element appears after waiting
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      timing.renderDelayed = true;
      timing.suggestedWait = 5000;
    } catch {
      // Element didn't appear even after waiting
    }
    
    // Check for dynamic content indicators
    const hasDynamicIndicators = await page.evaluate(() => {
      return window.React || window.Vue || window.Angular || 
             document.querySelector('[data-react-root]') ||
             document.querySelector('#app');
    });
    
    timing.dynamicContent = hasDynamicIndicators;
    
    return timing;
  }
  
  async detectStructureChange(page, site) {
    const currentStructure = await this.captureStructure(page);
    const cacheKey = `structure:${site}`;
    const previousStructure = await this.cache.get(cacheKey);
    
    if (!previousStructure) {
      // First time seeing this site, save structure
      await this.cache.set(cacheKey, currentStructure, 86400); // 24 hours
      return null;
    }
    
    const changes = this.compareStructures(previousStructure, currentStructure);
    
    if (changes.length > 0) {
      // Update cached structure
      await this.cache.set(cacheKey, currentStructure, 86400);
      return { detected: true, changes };
    }
    
    return null;
  }
  
  async captureStructure(page) {
    return await page.evaluate(() => {
      const structure = {
        mainTags: {},
        classes: new Set(),
        ids: new Set(),
        dataAttributes: new Set()
      };
      
      // Count main structural tags
      ['nav', 'main', 'section', 'article', 'aside'].forEach(tag => {
        structure.mainTags[tag] = document.querySelectorAll(tag).length;
      });
      
      // Collect unique classes (top 50)
      document.querySelectorAll('[class]').forEach((el, i) => {
        if (i < 50) {
          el.classList.forEach(cls => structure.classes.add(cls));
        }
      });
      
      // Collect IDs
      document.querySelectorAll('[id]').forEach((el, i) => {
        if (i < 30) structure.ids.add(el.id);
      });
      
      // Collect data attributes
      document.querySelectorAll('[data-product], [data-price], [data-item]')
        .forEach(el => {
          Object.keys(el.dataset).forEach(key => {
            structure.dataAttributes.add(key);
          });
        });
      
      return {
        mainTags: structure.mainTags,
        classes: Array.from(structure.classes),
        ids: Array.from(structure.ids),
        dataAttributes: Array.from(structure.dataAttributes)
      };
    });
  }
  
  compareStructures(old, current) {
    const changes = [];
    
    // Check tag count changes
    Object.keys(old.mainTags).forEach(tag => {
      if (Math.abs(old.mainTags[tag] - current.mainTags[tag]) > 2) {
        changes.push({
          type: 'tag_count',
          tag,
          old: old.mainTags[tag],
          new: current.mainTags[tag]
        });
      }
    });
    
    // Check for major class changes
    const oldClasses = new Set(old.classes);
    const newClasses = new Set(current.classes);
    const removed = old.classes.filter(c => !newClasses.has(c));
    const added = current.classes.filter(c => !oldClasses.has(c));
    
    if (removed.length > 5) {
      changes.push({
        type: 'classes_removed',
        count: removed.length,
        sample: removed.slice(0, 5)
      });
    }
    
    if (added.length > 5) {
      changes.push({
        type: 'classes_added',
        count: added.length,
        sample: added.slice(0, 5)
      });
    }
    
    return changes;
  }
  
  recordFailure(site, stepType, diagnosis) {
    const key = `${site}:${stepType}`;
    if (!this.failureReasons.has(key)) {
      this.failureReasons.set(key, []);
    }
    
    this.failureReasons.get(key).push({
      timestamp: diagnosis.timestamp,
      reason: diagnosis.recommendation?.type || 'unknown',
      selector: diagnosis.selector
    });
    
    // Keep only last 100 failures per site/step
    const failures = this.failureReasons.get(key);
    if (failures.length > 100) {
      failures.shift();
    }
  }
  
  getFailureReport(site) {
    const report = {};
    
    for (const [key, failures] of this.failureReasons) {
      if (key.startsWith(site)) {
        const stepType = key.split(':')[1];
        
        // Count failure reasons
        const reasons = {};
        failures.forEach(f => {
          reasons[f.reason] = (reasons[f.reason] || 0) + 1;
        });
        
        report[stepType] = {
          totalFailures: failures.length,
          reasons,
          lastFailure: failures[failures.length - 1]
        };
      }
    }
    
    return report;
  }
}
```

#### Day 2-3: Pattern Validator

```javascript
// src/diagnostics/PatternValidator.js
class PatternValidator {
  constructor(patternMatcher, logger) {
    this.patternMatcher = patternMatcher;
    this.logger = logger;
    this.validationResults = new Map();
  }
  
  async validatePatterns(site, page) {
    const results = {
      site,
      timestamp: Date.now(),
      patterns: []
    };
    
    // Get all patterns for this site
    const patterns = await this.patternMatcher.getPatterns(site);
    
    for (const pattern of patterns) {
      const validation = await this.validatePattern(page, pattern);
      results.patterns.push({
        ...pattern,
        validation
      });
      
      // Update pattern confidence based on validation
      if (validation.success) {
        await this.patternMatcher.reinforcePattern(site, pattern.selector);
      } else {
        await this.patternMatcher.penalizePattern(site, pattern.selector);
      }
    }
    
    // Calculate overall health
    results.healthScore = this.calculateHealthScore(results.patterns);
    results.recommendation = this.getRecommendation(results);
    
    // Store results
    this.validationResults.set(site, results);
    
    return results;
  }
  
  async validatePattern(page, pattern) {
    const validation = {
      success: false,
      elementFound: false,
      elementCount: 0,
      expectedContext: false,
      performance: null
    };
    
    const startTime = Date.now();
    
    try {
      // Check if selector finds elements
      const elements = await page.$$(pattern.selector);
      validation.elementFound = elements.length > 0;
      validation.elementCount = elements.length;
      
      // Check if element count is reasonable
      if (pattern.expectedCount) {
        const variance = Math.abs(elements.length - pattern.expectedCount) / pattern.expectedCount;
        validation.success = variance < 0.3; // 30% variance allowed
      } else {
        validation.success = elements.length > 0 && elements.length < 100;
      }
      
      // Check context if provided
      if (pattern.context && elements.length > 0) {
        validation.expectedContext = await this.checkContext(page, elements[0], pattern.context);
      }
      
    } catch (error) {
      validation.error = error.message;
    }
    
    validation.performance = Date.now() - startTime;
    
    return validation;
  }
  
  async checkContext(page, element, expectedContext) {
    return await page.evaluate((el, context) => {
      // Check if element has expected attributes or text
      if (context.hasPrice) {
        const text = el.textContent;
        return /\$|€|£|\d+\.\d{2}/.test(text);
      }
      
      if (context.hasImage) {
        return el.querySelector('img') !== null;
      }
      
      if (context.hasLink) {
        return el.querySelector('a') !== null || el.tagName === 'A';
      }
      
      return true;
    }, element, expectedContext);
  }
  
  calculateHealthScore(patterns) {
    if (patterns.length === 0) return 0;
    
    const successCount = patterns.filter(p => p.validation.success).length;
    return (successCount / patterns.length) * 100;
  }
  
  getRecommendation(results) {
    const healthScore = results.healthScore;
    
    if (healthScore < 30) {
      return {
        action: 'relearn',
        message: 'Site structure has significantly changed. Relearn patterns.',
        priority: 'high'
      };
    } else if (healthScore < 70) {
      return {
        action: 'update',
        message: 'Some patterns are failing. Update selectors.',
        priority: 'medium',
        failingPatterns: results.patterns
          .filter(p => !p.validation.success)
          .map(p => p.selector)
      };
    } else {
      return {
        action: 'monitor',
        message: 'Patterns are healthy. Continue monitoring.',
        priority: 'low'
      };
    }
  }
  
  async validateAllSites() {
    const sites = await this.patternMatcher.getAllSites();
    const report = {
      timestamp: Date.now(),
      sites: []
    };
    
    for (const site of sites) {
      // Create a page for validation (in production, reuse browser pool)
      const page = await this.createPage(site);
      const validation = await this.validatePatterns(site, page);
      await page.close();
      
      report.sites.push({
        site,
        healthScore: validation.healthScore,
        recommendation: validation.recommendation
      });
    }
    
    return report;
  }
}
```

#### Day 3-4: Success Reporter

```javascript
// src/diagnostics/SuccessReporter.js
class SuccessReporter {
  constructor(logger, cache) {
    this.logger = logger;
    this.cache = cache;
    this.successPatterns = new Map();
  }
  
  async analyzeSuccess(site, stepType, selector, element, page) {
    const analysis = {
      site,
      stepType,
      selector,
      timestamp: Date.now(),
      
      // Capture what made this successful
      domContext: await this.captureDOMContext(element, page),
      pageContext: await this.capturePageContext(page),
      selectorQuality: this.analyzeSelectorQuality(selector),
      
      // Success factors
      factors: []
    };
    
    // Analyze why this succeeded
    if (analysis.selectorQuality.specificity === 'id') {
      analysis.factors.push('stable_id_selector');
    }
    
    if (analysis.selectorQuality.simple) {
      analysis.factors.push('simple_selector');
    }
    
    if (analysis.domContext.uniquePosition) {
      analysis.factors.push('unique_dom_position');
    }
    
    if (analysis.pageContext.fastLoad) {
      analysis.factors.push('fast_page_load');
    }
    
    // Store success pattern
    this.recordSuccess(analysis);
    
    return analysis;
  }
  
  async captureDOMContext(element, page) {
    return await page.evaluate(el => {
      const context = {
        tagName: el.tagName,
        classList: Array.from(el.classList),
        id: el.id,
        
        // Position in parent
        siblingIndex: Array.from(el.parentNode.children).indexOf(el),
        totalSiblings: el.parentNode.children.length,
        
        // Unique attributes
        attributes: {},
        
        // Text content indicators
        hasText: el.textContent.trim().length > 0,
        textLength: el.textContent.trim().length,
        
        // Structural indicators
        hasChildren: el.children.length > 0,
        childCount: el.children.length,
        depth: 0,
        
        // Visibility
        isVisible: el.offsetParent !== null,
        boundingBox: el.getBoundingClientRect()
      };
      
      // Get unique attributes
      for (const attr of el.attributes) {
        if (!['class', 'id', 'style'].includes(attr.name)) {
          context.attributes[attr.name] = attr.value;
        }
      }
      
      // Calculate depth
      let parent = el.parentElement;
      while (parent) {
        context.depth++;
        parent = parent.parentElement;
      }
      
      // Check if position is unique
      context.uniquePosition = context.totalSiblings === 1 || 
                              el.parentNode.querySelectorAll(el.tagName).length === 1;
      
      return context;
    }, element);
  }
  
  async capturePageContext(page) {
    return await page.evaluate(() => {
      return {
        url: window.location.href,
        loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
        fastLoad: performance.timing.loadEventEnd - performance.timing.navigationStart < 3000,
        
        // Framework detection
        framework: {
          react: !!window.React,
          vue: !!window.Vue,
          angular: !!window.angular,
          jquery: !!window.jQuery
        },
        
        // Page complexity
        domNodes: document.querySelectorAll('*').length,
        scripts: document.scripts.length,
        stylesheets: document.styleSheets.length,
        
        // Dynamic content indicators
        hasSPA: !!(window.React || window.Vue || window.angular),
        hasAjax: !!window.XMLHttpRequest
      };
    });
  }
  
  analyzeSelectorQuality(selector) {
    const quality = {
      type: 'unknown',
      specificity: 'low',
      simple: false,
      maintainable: false,
      parts: []
    };
    
    // Determine selector type
    if (selector.startsWith('#')) {
      quality.type = 'id';
      quality.specificity = 'id';
      quality.simple = !selector.includes(' ');
      quality.maintainable = true;
    } else if (selector.startsWith('.')) {
      quality.type = 'class';
      quality.specificity = 'class';
      quality.simple = selector.split('.').length <= 3;
      quality.maintainable = quality.simple;
    } else if (selector.includes('[')) {
      quality.type = 'attribute';
      quality.specificity = 'attribute';
      quality.simple = !selector.includes(' ');
      quality.maintainable = selector.includes('data-');
    } else if (selector.startsWith('//')) {
      quality.type = 'xpath';
      quality.specificity = 'xpath';
      quality.simple = selector.split('/').length <= 4;
      quality.maintainable = false;
    } else {
      quality.type = 'tag';
      quality.specificity = 'tag';
      quality.simple = !selector.includes(' ');
      quality.maintainable = false;
    }
    
    // Parse selector parts
    quality.parts = selector.split(/[\s>+~]/).filter(Boolean);
    
    return quality;
  }
  
  recordSuccess(analysis) {
    const key = `${analysis.site}:${analysis.stepType}`;
    
    if (!this.successPatterns.has(key)) {
      this.successPatterns.set(key, []);
    }
    
    this.successPatterns.get(key).push({
      selector: analysis.selector,
      factors: analysis.factors,
      timestamp: analysis.timestamp,
      selectorQuality: analysis.selectorQuality
    });
    
    // Keep only last 50 successes
    const successes = this.successPatterns.get(key);
    if (successes.length > 50) {
      successes.shift();
    }
  }
  
  getSuccessReport(site) {
    const report = {
      site,
      stepTypes: {}
    };
    
    for (const [key, successes] of this.successPatterns) {
      if (key.startsWith(site)) {
        const stepType = key.split(':')[1];
        
        // Analyze common success factors
        const factorCounts = {};
        const selectorTypes = {};
        
        successes.forEach(s => {
          // Count factors
          s.factors.forEach(f => {
            factorCounts[f] = (factorCounts[f] || 0) + 1;
          });
          
          // Count selector types
          const type = s.selectorQuality.type;
          selectorTypes[type] = (selectorTypes[type] || 0) + 1;
        });
        
        report.stepTypes[stepType] = {
          totalSuccesses: successes.length,
          commonFactors: Object.entries(factorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5),
          selectorTypes,
          bestSelectors: successes
            .filter(s => s.selectorQuality.maintainable)
            .slice(-5)
            .map(s => s.selector)
        };
      }
    }
    
    return report;
  }
  
  getRecommendations(site) {
    const report = this.getSuccessReport(site);
    const recommendations = [];
    
    Object.entries(report.stepTypes).forEach(([stepType, data]) => {
      // Recommend based on common factors
      const topFactor = data.commonFactors[0];
      if (topFactor) {
        const [factor, count] = topFactor;
        const percentage = (count / data.totalSuccesses) * 100;
        
        if (factor === 'stable_id_selector' && percentage > 60) {
          recommendations.push({
            stepType,
            recommendation: 'Prioritize ID selectors',
            reason: `${percentage.toFixed(0)}% of successes use stable IDs`
          });
        } else if (factor === 'simple_selector' && percentage > 50) {
          recommendations.push({
            stepType,
            recommendation: 'Keep selectors simple',
            reason: `${percentage.toFixed(0)}% of successes use simple selectors`
          });
        }
      }
      
      // Recommend based on selector types
      if (data.selectorTypes.xpath > data.totalSuccesses * 0.3) {
        recommendations.push({
          stepType,
          recommendation: 'Reduce XPath usage',
          reason: 'XPath selectors are brittle and slow'
        });
      }
    });
    
    return recommendations;
  }
}
```

#### Day 4-5: Integration & Testing

```javascript
// src/diagnostics/DiagnosticsOrchestrator.js
class DiagnosticsOrchestrator {
  constructor(options = {}) {
    this.logger = options.logger;
    this.cache = options.cache;
    
    // Initialize diagnostic tools
    this.extractionDiagnostics = new ExtractionDiagnostics(this.logger, this.cache);
    this.patternValidator = new PatternValidator(options.patternMatcher, this.logger);
    this.successReporter = new SuccessReporter(this.logger, this.cache);
    
    this.reports = new Map();
  }
  
  async runDiagnostics(site, page) {
    const diagnostics = {
      site,
      timestamp: Date.now(),
      extraction: null,
      validation: null,
      success: null,
      overallHealth: null,
      recommendations: []
    };
    
    try {
      // Run pattern validation
      diagnostics.validation = await this.patternValidator.validatePatterns(site, page);
      
      // Get failure analysis
      diagnostics.extraction = this.extractionDiagnostics.getFailureReport(site);
      
      // Get success analysis
      diagnostics.success = this.successReporter.getSuccessReport(site);
      
      // Calculate overall health
      diagnostics.overallHealth = this.calculateOverallHealth(diagnostics);
      
      // Generate recommendations
      diagnostics.recommendations = this.generateRecommendations(diagnostics);
      
      // Store report
      this.reports.set(site, diagnostics);
      
    } catch (error) {
      this.logger.error('Diagnostics failed', { site, error: error.message });
      diagnostics.error = error.message;
    }
    
    return diagnostics;
  }
  
  calculateOverallHealth(diagnostics) {
    const scores = [];
    
    // Pattern validation score
    if (diagnostics.validation) {
      scores.push(diagnostics.validation.healthScore);
    }
    
    // Success rate score (if we have both successes and failures)
    if (diagnostics.success && diagnostics.extraction) {
      Object.keys(diagnostics.success.stepTypes).forEach(stepType => {
        const successes = diagnostics.success.stepTypes[stepType]?.totalSuccesses || 0;
        const failures = diagnostics.extraction[stepType]?.totalFailures || 0;
        const total = successes + failures;
        
        if (total > 0) {
          scores.push((successes / total) * 100);
        }
      });
    }
    
    if (scores.length === 0) return 0;
    
    // Return average score
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }
  
  generateRecommendations(diagnostics) {
    const recommendations = [];
    
    // Add validation recommendations
    if (diagnostics.validation?.recommendation) {
      recommendations.push({
        source: 'pattern_validator',
        ...diagnostics.validation.recommendation
      });
    }
    
    // Add success-based recommendations
    const successRecs = this.successReporter.getRecommendations(diagnostics.site);
    recommendations.push(...successRecs.map(r => ({
      source: 'success_analysis',
      ...r
    })));
    
    // Add failure-based recommendations
    if (diagnostics.extraction) {
      Object.entries(diagnostics.extraction).forEach(([stepType, data]) => {
        if (data.totalFailures > 10) {
          const topReason = Object.entries(data.reasons)
            .sort((a, b) => b[1] - a[1])[0];
          
          if (topReason) {
            recommendations.push({
              source: 'failure_analysis',
              stepType,
              recommendation: this.getFailureRecommendation(topReason[0]),
              reason: `${topReason[1]} failures due to ${topReason[0]}`
            });
          }
        }
      });
    }
    
    // Prioritize recommendations
    return recommendations.sort((a, b) => {
      const priority = { high: 3, medium: 2, low: 1 };
      return (priority[b.priority] || 0) - (priority[a.priority] || 0);
    });
  }
  
  getFailureRecommendation(reason) {
    const recommendations = {
      'selector_outdated': 'Update selectors using suggested alternatives',
      'timing_issue': 'Increase wait times for dynamic content',
      'site_redesign': 'Trigger full pattern relearning',
      'unknown': 'Manual investigation required'
    };
    
    return recommendations[reason] || recommendations.unknown;
  }
  
  async generateReport(site) {
    const diagnostics = this.reports.get(site);
    if (!diagnostics) {
      return { error: 'No diagnostics available for site' };
    }
    
    return {
      site,
      timestamp: diagnostics.timestamp,
      
      summary: {
        overallHealth: `${diagnostics.overallHealth.toFixed(1)}%`,
        status: diagnostics.overallHealth > 70 ? 'healthy' : 
                diagnostics.overallHealth > 40 ? 'degraded' : 'critical',
        topRecommendations: diagnostics.recommendations.slice(0, 3)
      },
      
      details: {
        patternValidation: diagnostics.validation,
        failureAnalysis: diagnostics.extraction,
        successAnalysis: diagnostics.success
      },
      
      actionItems: diagnostics.recommendations.map(r => ({
        action: r.recommendation,
        reason: r.reason,
        priority: r.priority || 'medium',
        source: r.source,
        stepType: r.stepType
      }))
    };
  }
}

// Usage example
async function runWeek9Diagnostics() {
  const orchestrator = new DiagnosticsOrchestrator({
    logger: console,
    cache: redisCache,
    patternMatcher: simplePatternMatcher
  });
  
  const sites = ['glasswingshop.com', 'macys.com', 'gap.com'];
  
  for (const site of sites) {
    const page = await browser.newPage();
    await page.goto(`https://${site}`);
    
    const diagnostics = await orchestrator.runDiagnostics(site, page);
    const report = await orchestrator.generateReport(site);
    
    console.log(`\n=== Diagnostics Report for ${site} ===`);
    console.log(`Health: ${report.summary.overallHealth} (${report.summary.status})`);
    console.log('\nTop Recommendations:');
    report.summary.topRecommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec.recommendation}`);
      console.log(`   Reason: ${rec.reason}`);
    });
    
    await page.close();
  }
}
```

**Expected Outcomes**:
- ✅ Understand WHY extraction fails (not just that it fails)
- ✅ Get actionable recommendations for fixing selectors
- ✅ Track pattern decay over time
- ✅ Identify success factors to replicate
- ✅ Path from 40% to 70% extraction success

**NOT Building**:
- ❌ Traditional unit tests
- ❌ Integration test suites
- ❌ Coverage metrics
- ❌ CI/CD pipelines

---

### Week 10: Batch Processing Production Setup

**Make it Work Reliably When Called (Not 24/7 Service)**:

#### Day 1-2: Integration Script & Error Handling

```bash
#!/bin/bash
# run.sh - Main entry point for scraping runs

set -e  # Exit on error
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
TODAY=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/scrape-$TODAY.log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Rotate logs if too large (>50MB)
if [ -f "$LOG_FILE" ] && [ $(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE") -gt 52428800 ]; then
    mv "$LOG_FILE" "$LOG_FILE.$(date +%s)"
fi

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handler
handle_error() {
    log "ERROR: Script failed at line $1"
    log "ERROR: Exit code $2"
    
    # Send notification (optional)
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"Scraping failed: $1\"}" \
            "$SLACK_WEBHOOK" 2>/dev/null || true
    fi
    
    exit $2
}

trap 'handle_error $LINENO $?' ERR

# Check dependencies
log "Starting scraping run"
log "Checking dependencies..."

# Check Redis
if ! redis-cli ping > /dev/null 2>&1; then
    log "ERROR: Redis is not running"
    exit 1
fi

# Check MongoDB
if ! mongosh --eval "db.version()" > /dev/null 2>&1; then
    log "ERROR: MongoDB is not running"
    exit 1
fi

# Load configuration
if [ -f "$SCRIPT_DIR/.env" ]; then
    export $(cat "$SCRIPT_DIR/.env" | grep -v '^#' | xargs)
fi

# Parse arguments
SITES="${1:-all}"
MODE="${2:-full}"  # full, diagnostic, pattern-learn

log "Configuration: SITES=$SITES, MODE=$MODE"

# Run appropriate scraping mode
case "$MODE" in
    "full")
        log "Running full extraction pipeline"
        node "$SCRIPT_DIR/src/batch/fullPipeline.js" --sites="$SITES" 2>&1 | tee -a "$LOG_FILE"
        ;;
    
    "diagnostic")
        log "Running diagnostics only"
        node "$SCRIPT_DIR/src/diagnostics/runDiagnostics.js" --sites="$SITES" 2>&1 | tee -a "$LOG_FILE"
        ;;
    
    "pattern-learn")
        log "Running pattern learning"
        node "$SCRIPT_DIR/src/patterns/learnPatterns.js" --sites="$SITES" 2>&1 | tee -a "$LOG_FILE"
        ;;
    
    *)
        log "ERROR: Unknown mode $MODE"
        exit 1
        ;;
esac

# Check exit status
EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
    log "Scraping completed successfully"
    
    # Run post-processing
    log "Running post-processing..."
    node "$SCRIPT_DIR/src/batch/postProcess.js" 2>&1 | tee -a "$LOG_FILE"
    
    # Generate summary
    node "$SCRIPT_DIR/src/batch/generateSummary.js" 2>&1 | tee -a "$LOG_FILE"
else
    log "Scraping failed with exit code $EXIT_CODE"
    exit $EXIT_CODE
fi

log "Run complete"
```

#### Day 2-3: Batch Pipeline Orchestrator

```javascript
// src/batch/fullPipeline.js
const { program } = require('commander');
const PipelineOrchestrator = require('../core/PipelineOrchestrator');
const DiagnosticsOrchestrator = require('../diagnostics/DiagnosticsOrchestrator');
const SimplePatternMatcher = require('../patterns/SimplePatternMatcher');
const { logger } = require('../utils/logger');
const { cache } = require('../cache/RedisCacheManager');

class BatchPipelineRunner {
  constructor(options = {}) {
    this.sites = options.sites || [];
    this.maxRetries = options.maxRetries || 3;
    this.diagnosticsEnabled = options.diagnosticsEnabled !== false;
    
    // Initialize components from previous weeks
    this.pipeline = new PipelineOrchestrator(logger, {
      persistResults: true,
      maxConcurrency: 3
    });
    
    this.diagnostics = new DiagnosticsOrchestrator({
      logger,
      cache,
      patternMatcher: new SimplePatternMatcher(logger, cache)
    });
    
    this.results = [];
    this.errors = [];
  }
  
  async run() {
    logger.info(`Starting batch run for ${this.sites.length} sites`);
    const startTime = Date.now();
    
    try {
      // Initialize pipeline
      await this.pipeline.initialize();
      
      // Process each site
      for (const site of this.sites) {
        await this.processSite(site);
      }
      
      // Generate summary
      const summary = this.generateSummary();
      
      // Save results
      await this.saveResults(summary);
      
      const duration = Date.now() - startTime;
      logger.info(`Batch run completed in ${duration}ms`, summary);
      
      return summary;
      
    } catch (error) {
      logger.error('Batch run failed', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
  
  async processSite(site) {
    logger.info(`Processing site: ${site}`);
    let attempts = 0;
    let lastError = null;
    
    while (attempts < this.maxRetries) {
      attempts++;
      
      try {
        // Run extraction
        const result = await this.pipeline.executePipeline(
          `https://${site}`,
          {
            jobId: `batch_${site}_${Date.now()}`,
            enableNavigation: true,
            enableCollection: true,
            enableExtraction: true
          }
        );
        
        // Run diagnostics if enabled
        if (this.diagnosticsEnabled && result.status === 'completed') {
          const diagnostics = await this.runDiagnostics(site);
          result.diagnostics = diagnostics;
        }
        
        // Record success
        this.results.push({
          site,
          status: 'success',
          attempts,
          result,
          timestamp: Date.now()
        });
        
        logger.info(`Site ${site} completed successfully`);
        return result;
        
      } catch (error) {
        lastError = error;
        logger.warn(`Attempt ${attempts} failed for ${site}`, error.message);
        
        if (attempts < this.maxRetries) {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempts), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // Record failure after all retries
    this.errors.push({
      site,
      status: 'failed',
      attempts,
      error: lastError.message,
      timestamp: Date.now()
    });
    
    logger.error(`Site ${site} failed after ${attempts} attempts`);
  }
  
  async runDiagnostics(site) {
    try {
      // Create page for diagnostics
      const browser = await this.pipeline.browserManager.createBrowser();
      const page = browser.page;
      await page.goto(`https://${site}`);
      
      // Run diagnostics
      const diagnostics = await this.diagnostics.runDiagnostics(site, page);
      const report = await this.diagnostics.generateReport(site);
      
      await browser.close();
      
      // Log critical issues
      if (report.summary.status === 'critical') {
        logger.warn(`Critical issues found for ${site}:`, 
          report.summary.topRecommendations);
      }
      
      return report;
      
    } catch (error) {
      logger.error(`Diagnostics failed for ${site}`, error);
      return null;
    }
  }
  
  generateSummary() {
    const total = this.results.length + this.errors.length;
    const successful = this.results.length;
    const failed = this.errors.length;
    
    // Calculate extraction stats
    let totalProducts = 0;
    let totalCategories = 0;
    
    this.results.forEach(r => {
      if (r.result?.summary) {
        totalProducts += r.result.summary.extractedProducts || 0;
        totalCategories += r.result.summary.navigationSections || 0;
      }
    });
    
    // Calculate success rates by step
    const stepSuccessRates = this.calculateStepSuccessRates();
    
    return {
      sites: {
        total,
        successful,
        failed,
        successRate: total > 0 ? (successful / total) * 100 : 0
      },
      extraction: {
        totalProducts,
        totalCategories,
        avgProductsPerSite: successful > 0 ? totalProducts / successful : 0
      },
      stepSuccessRates,
      errors: this.errors.map(e => ({
        site: e.site,
        error: e.error,
        attempts: e.attempts
      })),
      timestamp: Date.now()
    };
  }
  
  calculateStepSuccessRates() {
    const rates = {
      navigation: { success: 0, total: 0 },
      collection: { success: 0, total: 0 },
      extraction: { success: 0, total: 0 }
    };
    
    this.results.forEach(r => {
      if (r.result?.navigation) {
        rates.navigation.total++;
        if (r.result.navigation.categories?.length > 0) {
          rates.navigation.success++;
        }
      }
      
      if (r.result?.collection) {
        rates.collection.total++;
        if (r.result.collection.products?.length > 0) {
          rates.collection.success++;
        }
      }
      
      if (r.result?.extraction) {
        rates.extraction.total++;
        if (r.result.extraction.items?.length > 0) {
          rates.extraction.success++;
        }
      }
    });
    
    // Calculate percentages
    Object.keys(rates).forEach(step => {
      const { success, total } = rates[step];
      rates[step].rate = total > 0 ? (success / total) * 100 : 0;
    });
    
    return rates;
  }
  
  async saveResults(summary) {
    const timestamp = new Date().toISOString();
    const filename = `results/batch_${timestamp}.json`;
    
    const fullResults = {
      summary,
      sites: this.results,
      errors: this.errors,
      timestamp
    };
    
    // Save to file
    const fs = require('fs').promises;
    await fs.mkdir('results', { recursive: true });
    await fs.writeFile(filename, JSON.stringify(fullResults, null, 2));
    
    logger.info(`Results saved to ${filename}`);
    
    // Also save summary to MongoDB for tracking
    if (this.pipeline.db) {
      await this.pipeline.db.collection('batch_runs').insertOne({
        ...summary,
        filename,
        created_at: new Date()
      });
    }
  }
  
  async cleanup() {
    try {
      await this.pipeline.close();
    } catch (error) {
      logger.error('Cleanup error', error);
    }
  }
}

// Command-line interface
program
  .option('-s, --sites <sites>', 'Comma-separated list of sites or "all"')
  .option('-r, --retries <number>', 'Max retries per site', '3')
  .option('--no-diagnostics', 'Skip diagnostics')
  .parse(process.argv);

const options = program.opts();

// Load sites from config
const loadSites = () => {
  if (options.sites === 'all') {
    // Load from sites.json
    const config = require('../../config/sites.json');
    return Object.keys(config.sites);
  } else if (options.sites) {
    return options.sites.split(',').map(s => s.trim());
  } else {
    // Default test sites
    return ['glasswingshop.com', 'macys.com', 'gap.com'];
  }
};

// Run batch pipeline
async function main() {
  const sites = loadSites();
  
  const runner = new BatchPipelineRunner({
    sites,
    maxRetries: parseInt(options.retries),
    diagnosticsEnabled: options.diagnostics
  });
  
  try {
    const summary = await runner.run();
    
    // Exit with appropriate code
    if (summary.sites.failed > 0) {
      process.exit(1); // Partial failure
    } else {
      process.exit(0); // Success
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(2); // Complete failure
  }
}

if (require.main === module) {
  main();
}

module.exports = BatchPipelineRunner;
```

#### Day 3-4: Simple Health Check & Status

```javascript
// src/batch/healthCheck.js
const redis = require('redis');
const { MongoClient } = require('mongodb');
const fs = require('fs').promises;
const path = require('path');

class HealthChecker {
  async checkAll() {
    const checks = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: {}
    };
    
    // Check Redis
    checks.checks.redis = await this.checkRedis();
    
    // Check MongoDB
    checks.checks.mongodb = await this.checkMongoDB();
    
    // Check disk space
    checks.checks.disk = await this.checkDiskSpace();
    
    // Check last run
    checks.checks.lastRun = await this.checkLastRun();
    
    // Determine overall status
    if (Object.values(checks.checks).some(c => c.status === 'error')) {
      checks.status = 'unhealthy';
    } else if (Object.values(checks.checks).some(c => c.status === 'warning')) {
      checks.status = 'degraded';
    }
    
    return checks;
  }
  
  async checkRedis() {
    try {
      const client = redis.createClient();
      await client.connect();
      await client.ping();
      await client.quit();
      
      return { status: 'healthy', message: 'Redis is running' };
    } catch (error) {
      return { status: 'error', message: `Redis error: ${error.message}` };
    }
  }
  
  async checkMongoDB() {
    try {
      const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
      await client.connect();
      await client.db('admin').command({ ping: 1 });
      await client.close();
      
      return { status: 'healthy', message: 'MongoDB is running' };
    } catch (error) {
      return { status: 'error', message: `MongoDB error: ${error.message}` };
    }
  }
  
  async checkDiskSpace() {
    try {
      // Simple check - ensure logs directory isn't too large
      const logsDir = path.join(__dirname, '../../logs');
      const files = await fs.readdir(logsDir).catch(() => []);
      
      let totalSize = 0;
      for (const file of files) {
        const stats = await fs.stat(path.join(logsDir, file)).catch(() => null);
        if (stats) totalSize += stats.size;
      }
      
      const sizeMB = totalSize / (1024 * 1024);
      
      if (sizeMB > 1000) {
        return { 
          status: 'warning', 
          message: `Logs directory is ${sizeMB.toFixed(2)}MB - consider cleanup` 
        };
      }
      
      return { 
        status: 'healthy', 
        message: `Logs directory: ${sizeMB.toFixed(2)}MB` 
      };
    } catch (error) {
      return { status: 'warning', message: 'Could not check disk space' };
    }
  }
  
  async checkLastRun() {
    try {
      // Check for recent results
      const resultsDir = path.join(__dirname, '../../results');
      const files = await fs.readdir(resultsDir).catch(() => []);
      
      if (files.length === 0) {
        return { status: 'warning', message: 'No previous runs found' };
      }
      
      // Get most recent file
      const recentFile = files
        .filter(f => f.startsWith('batch_'))
        .sort()
        .pop();
      
      if (!recentFile) {
        return { status: 'warning', message: 'No batch runs found' };
      }
      
      // Check age
      const stats = await fs.stat(path.join(resultsDir, recentFile));
      const ageHours = (Date.now() - stats.mtime) / (1000 * 60 * 60);
      
      if (ageHours > 24) {
        return { 
          status: 'warning', 
          message: `Last run was ${ageHours.toFixed(1)} hours ago` 
        };
      }
      
      // Load and check success rate
      const content = await fs.readFile(path.join(resultsDir, recentFile), 'utf8');
      const results = JSON.parse(content);
      
      if (results.summary?.sites?.successRate < 50) {
        return {
          status: 'warning',
          message: `Last run had ${results.summary.sites.successRate.toFixed(1)}% success rate`
        };
      }
      
      return {
        status: 'healthy',
        message: `Last run: ${ageHours.toFixed(1)}h ago, ${results.summary.sites.successRate.toFixed(1)}% success`
      };
      
    } catch (error) {
      return { status: 'error', message: `Error checking last run: ${error.message}` };
    }
  }
}

// Simple HTTP endpoint
if (require.main === module) {
  const http = require('http');
  const checker = new HealthChecker();
  
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      const health = await checker.checkAll();
      
      res.writeHead(health.status === 'healthy' ? 200 : 503, {
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify(health, null, 2));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  
  const port = process.env.HEALTH_PORT || 3001;
  server.listen(port, () => {
    console.log(`Health check endpoint running on port ${port}`);
  });
}

module.exports = HealthChecker;
```

#### Day 4-5: Documentation & Cron Setup

```markdown
# Production Setup Guide

## Overview
This is a batch processing scraper that runs on-demand via cron jobs, not a 24/7 service.

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   cp .env.example .env
   # Edit .env with your settings
   ```

2. **Test single run**:
   ```bash
   ./run.sh glasswingshop.com full
   ```

3. **Check health**:
   ```bash
   node src/batch/healthCheck.js
   curl http://localhost:3001/health
   ```

## Cron Setup

Add to crontab (`crontab -e`):

```cron
# Run every 6 hours for all sites
0 */6 * * * cd /path/to/scraper && ./run.sh all full >> logs/cron.log 2>&1

# Run diagnostics daily at 2 AM
0 2 * * * cd /path/to/scraper && ./run.sh all diagnostic >> logs/cron.log 2>&1

# Pattern learning weekly on Sunday
0 3 * * 0 cd /path/to/scraper && ./run.sh all pattern-learn >> logs/cron.log 2>&1
```

## Configuration

### Sites Configuration (config/sites.json)
```json
{
  "sites": {
    "glasswingshop.com": {
      "enabled": true,
      "priority": "high",
      "selectors": {
        "products": ".product-card",
        "price": ".price"
      }
    },
    "macys.com": {
      "enabled": true,
      "priority": "medium",
      "selectors": {
        "products": ".productThumbnail",
        "price": ".prices"
      }
    }
  }
}
```

### Environment Variables (.env)
```
MONGODB_URI=mongodb://localhost:27017/scraper
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info
MAX_RETRIES=3
SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

## Monitoring

### Check Recent Runs
```bash
# View latest results
ls -la results/batch_*.json | tail -5

# Check today's log
tail -f logs/scrape-$(date +%Y-%m-%d).log

# Search for errors
grep ERROR logs/scrape-*.log
```

### Health Monitoring
```bash
# Manual health check
node src/batch/healthCheck.js

# Or via HTTP
curl http://localhost:3001/health
```

## Troubleshooting

### Common Issues

1. **"Redis is not running"**
   - Start Redis: `redis-server`
   - Check connection: `redis-cli ping`

2. **"MongoDB is not running"**
   - Start MongoDB: `mongod`
   - Check connection: `mongosh --eval "db.version()"`

3. **Site extraction failing**
   - Run diagnostics: `./run.sh failing-site.com diagnostic`
   - Check recommendations in output
   - Update selectors in config/sites.json if needed

4. **Logs getting too large**
   - Logs auto-rotate at 50MB
   - Manual cleanup: `find logs -name "*.log.*" -mtime +7 -delete`

## Manual Operations

### Run Specific Sites
```bash
./run.sh "glasswingshop.com,macys.com" full
```

### Run Diagnostics Only
```bash
./run.sh all diagnostic
```

### Learn New Patterns
```bash
./run.sh all pattern-learn
```

### Generate Summary Report
```bash
node src/batch/generateSummary.js
```

## Architecture

```
run.sh                    # Main entry point
├── src/batch/
│   ├── fullPipeline.js  # Orchestrates extraction
│   ├── healthCheck.js   # System health checks
│   └── generateSummary.js # Report generation
├── src/diagnostics/     # Week 9 diagnostic tools
├── src/patterns/        # Week 7-8 pattern learning
└── logs/                # Daily log files
```

## Performance Expectations

- **Processing time**: 30-60 seconds per site
- **Success rate**: 40-70% (improving with pattern learning)
- **Resource usage**: 
  - Memory: ~500MB per run
  - CPU: Moderate (single process)
  - Network: ~10MB per site

## Maintenance

### Weekly Tasks
- Review diagnostic reports
- Update failing selectors
- Clean old logs: `find logs -mtime +30 -delete`
- Check disk space: `du -sh logs/`

### Monthly Tasks
- Analyze pattern learning effectiveness
- Review and update sites.json
- Archive old results: `tar -czf results/archive-$(date +%Y-%m).tar.gz results/batch_*.json`

## Support

For issues:
1. Check logs: `logs/scrape-YYYY-MM-DD.log`
2. Run diagnostics: `./run.sh site-name diagnostic`
3. Review this guide's Troubleshooting section
```

**Expected Outcomes**:
- ✅ Reliable batch processing via cron
- ✅ Simple error handling and logging
- ✅ Easy troubleshooting with diagnostics
- ✅ Clear documentation for operations
- ✅ No unnecessary infrastructure

**NOT Building**:
- ❌ Docker containers
- ❌ PM2 process management
- ❌ Load balancers
- ❌ Complex monitoring dashboards
- ❌ 24/7 services

---

## Summary: Practical 10-Week Roadmap

This roadmap has been redesigned for the reality of a 5-10 site scraper with 40% extraction success:

- **Weeks 1-3**: Core infrastructure (4-step pipeline, checkpoints)
- **Weeks 4-5**: Minimal monitoring (reuse existing WebSocket/SSE)
- **Weeks 6**: Simple site configuration (sites.json)
- **Weeks 7-8**: Pattern learning to improve success rate
- **Week 9**: Diagnostic tools (not tests) to understand failures
- **Week 10**: Batch processing setup (not 24/7 service)

---

## End of Revised Roadmap

This practical roadmap focuses on real value at the current 5-10 site scale, avoiding premature optimization and overengineering. Each week builds on actual needs rather than theoretical requirements.
