# Technical Debt & Future Improvements

This document tracks planned improvements and technical debt that we need to address after getting the core system working.

## 🔥 Critical Architecture Tickets

### **TICKET-001A: Universal Scraper Architecture Implementation**
**Priority:** Critical  
**Status:** Pending Navigation Completion  
**Dependencies:** Navigation system finalization  
**Target:** 95% accuracy in under 2 minutes (max second pass)

**Overview:**
Implement comprehensive universal scraper system with hierarchical selector fallbacks, multi-tier caching, and robust error handling for product extraction.

**Architecture Components:**

1. **Platform Detection System**
   - Multi-signal weighted approach (HTML patterns, JS variables, meta tags, HTTP headers)
   - Platforms: Shopify, WooCommerce, Magento, BigCommerce, Custom
   - Fallback: Exhaustive brute-force selector approach when confidence is low

2. **Hierarchical Selector Resolution**
   - Tier 1: Site-specific overrides (nike.com custom selectors)
   - Tier 2: Platform-defaults (Shopify standard selectors)  
   - Tier 3: Generic/Universal fallbacks ([itemprop='price'])
   - Tier 4: Exhaustive brute-force (20-30 high-probability + 50-100 semantic + DOM scanning)

3. **Multi-Tier Caching Strategy**
   - L1 (Memory): 5-10min TTL for job batches
   - L2 (Redis): 24h domain-specific, 7d platform selectors
   - L3 (MongoDB): Persistent selector intelligence
   - Cache invalidation on scrape failures

4. **Circuit Breaker System**
   - Failure tracking: 5 failures in 1 hour → 6 hour circuit open
   - Exponential backoff for consistently failing sites
   - Resource protection from dead/blocked domains

5. **Performance Monitoring & Accuracy Tracking**
   - 95% accuracy benchmark with 7-day rolling average
   - Structured logging with validation
   - 2-minute max execution time with timeout handling

**Implementation blocked pending navigation system completion.**

---

### **TICKET-001B: Navigation Hierarchy & Discovery System Fixes**
**Priority:** Critical  
**Status:** Active - Hierarchy Corruption Occurring  
**Impact:** Data quality, navigation completeness  
**Estimated Time:** 8-10 hours total

**Critical Bug Found:**
Category ID collisions causing hierarchy corruption in navigation data - Women's categories appearing under Men's hierarchy due to non-unique ID generation when storing navigation structures.

**Root Cause:**
`ProductCatalogCache.js` line 473 generates category IDs without parent context:
- Both "Men > Tops" and "Women > Tops" generate same ID: `macys_com_tops`
- Causes navigation tree corruption when storing category relationships

**Phase 1: Fix Category ID Generation (2 hours)**
- Update `generateCategoryId()` to include full parent path
- Ensure unique IDs for all navigation nodes
- Clear corrupted navigation data from MongoDB

**Phase 2: Enable NavigationLearningCache (3-4 hours)**
- Re-enable in NavigationSubAgent.js (currently disabled)
- Implement hierarchical caching with `buildCachedHierarchy()`
- 10x performance improvement for navigation discovery
- Persist learned navigation patterns to WorldModel

**Phase 3: Fix Navigation Classification (2-3 hours)**
- Re-enable StructuralNavigationClassifier in NavigationDiscoveryPipeline
- Fix department vs utility link classification
- Improve navigation element detection accuracy

**Phase 4: Improve Navigation Discovery Coverage (2-3 hours)**
- Fix MegaMenuStrategy context tracking between menu captures
- Ensure all navigation strategies preserve parent-child relationships
- Target 500-1000 categories per retailer (vs current 150)

**Current Navigation Issues:**
- NavigationLearningCache disabled causing redundant discovery
- Category hierarchy corruption from ID collisions
- Only capturing ~150 navigation categories vs 500-1000 expected
- StructuralNavigationClassifier disabled
- MegaMenuStrategy not maintaining proper context between triggers

**Expected Outcomes:**
- Correct navigation hierarchies (no more Women under Men)
- 10x faster navigation discovery through caching
- Complete navigation trees with 500-1000 categories
- Accurate classification of navigation elements
- Reusable navigation patterns across scraping sessions

---

### **TICKET-001C: Modular Navigation System Refactor**
**Priority:** Critical  
**Status:** Active - Architecture Redesign  
**Impact:** Performance, maintainability, reliability  
**Estimated Time:** 12-15 hours total

**Critical Issues Discovered:**
- MegaMenuStrategy finding 579 triggers instead of 13 main categories
- 40+ second execution time causing pipeline timeout at 25 seconds
- Successfully captures 700+ items but data lost due to timeout
- Monolithic approach mixing too many responsibilities

**Root Causes:**
1. **Over-broad trigger detection:** Strategy captures every link instead of main nav only
2. **Pipeline timeout:** 25-second hardcoded limit kills long-running strategies
3. **Premature context cleanup:** Desktop browser closed before data returned
4. **Monolithic design:** Single component trying to do everything

**Solution: Modular Component Architecture**

**Phase 1: Build Focused Extractors (4-5 hours)**
- **MainNavigationExtractor:** Extract only 10-15 main categories (<100ms)
- **MegaMenuExtractor:** Hover and capture single menu (<3s per menu)
- **SubcategoryTraverser:** Navigate to category pages for L2/L3 (<5s per category)
- **ProductListExtractor:** Extract products from listing pages (<3s per page)

**Phase 2: Create Orchestration Layer (3-4 hours)**
- **NavigationOrchestrator:** Coordinate component execution
- Handle partial failures gracefully (8/10 menus OK)
- Implement progress tracking and retry logic
- Store intermediate results in Redis for resilience

**Phase 3: Quick Fixes for Existing System (2 hours)**
- Filter MegaMenuStrategy triggers to main nav only (13 items vs 579)
- Increase pipeline timeout from 25s to 60s
- Reduce hover delay from 2000ms to 1000ms
- Fix premature context cleanup in finally block

**Phase 4: Integration & Testing (3-4 hours)**
- Wire components together with orchestrator
- Test on Macy's, Nordstrom, Target, Glasswing
- Validate 80x performance improvement
- Ensure data quality and completeness

**Implementation Strategy:**
```javascript
// Modular flow
const mainNav = await MainNavigationExtractor.extract(page);       // 100ms
const megaMenus = await Promise.allSettled(                        // 3s parallel
  mainNav.items.map(cat => MegaMenuExtractor.extractOne(page, cat))
);
// Handle partial success gracefully
const successful = megaMenus.filter(r => r.status === 'fulfilled');
```

**Benefits of Modular Approach:**
- **80x faster:** 70ms for main nav vs 40,000ms for monolithic
- **Reliable:** No timeouts, no lost data
- **Testable:** Each component tested in isolation
- **Maintainable:** Single responsibility, easy to debug
- **Scalable:** Add new extractors without breaking existing ones

**Success Metrics:**
- Main nav extraction: <100ms
- Full navigation discovery: <30 seconds
- Success rate: >95%
- Zero data loss from timeouts
- Clean separation of concerns

---

## 🔥 High Priority

### **TICKET-001: Product Deduplication System**
**Priority:** High  
**Complexity:** Medium  
**Impact:** Critical for data quality

**Problem:**
Same products discovered through multiple navigation paths create duplicate database entries:
- `/collections/engineered-garments/pants-123`
- `/collections/mens-clothing/pants-123` 
- `/collections/sale/pants-123`

**Solution:**
Implement multi-phase deduplication system:

1. **Smart Product ID Generation:**
   - Use site's native product IDs when available
   - Extract IDs from URL patterns (`/products/name-12345`, `/p/ABC123`)
   - Fallback to composite keys (brand + title)
   - Current URL-based approach as last resort

2. **Session-Level Deduplication Cache:**
   - Map URLs to canonical product IDs
   - Track discovery metadata for each product
   - Avoid re-processing known products

3. **Multi-Category Tracking:**
   - Store product once with all discovery paths
   - Maintain product_categories linking table
   - Track popularity signals (more paths = more important)

**Files to modify:**
- `src/cache/ProductCatalogCache.js` (generateProductId)
- `src/intelligence/WorldModel.js` (storeProduct)
- Create new `src/utils/ProductDeduplicationCache.js`

**Benefits:**
- Eliminates duplicate products in database
- Preserves complete category associations
- Reduces redundant scraping
- Better navigation intelligence

---

### **TICKET-002: Navigation Exploration Optimization**
**Priority:** High  
**Complexity:** High  
**Impact:** Universal site compatibility

**Problem:**
Current `shouldExplore()` method uses hardcoded patterns that only work for enterprise sites:
- Glasswingshop: Only 3 of 135 sections explored (97% miss rate)
- Hardcoded patterns: 'women', 'men', 'clothing', etc.
- Resource explosion if we remove all filters

**Solution:**
Replace hardcoded filters with intelligent exploration system:

1. **Multi-Stage Adaptive Strategy:**
   - Lightweight pre-scan (no browser launch)
   - URL pattern analysis + navigation prominence scoring
   - Progressive exploration with productivity feedback

2. **Site Type Detection:**
   - Enterprise model (few rich categories)
   - Boutique model (many smaller collections)
   - Adaptive resource budgets per site type

3. **Commerce Relevance Scoring:**
   - Position in navigation (earlier = more important)
   - URL patterns (/collections/, /shop/, /category/)
   - Historical learning (known productive URLs)
   - Negative indicators (about, terms, careers)

**Files to modify:**
- `src/intelligence/navigation/NavigationTreeBuilder.js` (shouldExplore method)
- Create `src/intelligence/navigation/utils/ExplorationStrategy.js`
- Create `src/intelligence/navigation/utils/SiteTypeDetector.js`

**Expected Results:**
- Glasswingshop: Process 20-30 most valuable sections vs 3
- Macy's: Maintain current efficiency (12 departments)
- Universal compatibility without hardcoded patterns

---

### **TICKET-002B: Product Coverage Optimization System**
**Priority:** Medium  
**Complexity:** High  
**Impact:** Crawl efficiency and product coverage maximization

**Problem:**
Current category deduplication only removes duplicate URLs, but doesn't optimize for unique product coverage. We may crawl 25 categories that contain mostly the same products, wasting resources.

**Solution:**
Implement intelligent category selection system that maximizes unique product coverage with minimal crawl effort:

1. **Product Coverage Analysis:**
   - For each category URL, sample first page of products
   - Create product fingerprints (handles/IDs) to measure overlap
   - Calculate Jaccard similarity between categories

2. **Content-Based Deduplication:**
   - Cluster categories with >90% product overlap
   - Select representative category per cluster
   - Keep track of which categories are aliases vs unique

3. **Optimal Seed Set Selection:**
   - Use greedy algorithm to select minimum categories for maximum coverage
   - Budget-aware: "crawl X categories, get Y% of all unique products"
   - Filter expansion analysis: which filters add unique products vs re-sort

4. **Smart Filter Strategy:**
   - Detect which filter dimensions add unique products (>10% new SKUs)
   - Avoid combinatorial explosion (size x color unless disjoint product sets)
   - Prioritize semantic filters (brand, subcategory) over sort/price

**Expected Benefits:**
- "Crawl 25 categories instead of 215, get 95% of unique products"
- Resource optimization for FilterNavigationStrategy 
- Scientific approach to filter expansion decisions
- Measurable coverage vs effort tradeoffs

**Files to Create:**
- `src/core/optimization/ProductCoverageAnalyzer.js`
- `src/core/optimization/CategoryClusteringService.js`  
- `src/core/optimization/OptimalSeedSelector.js`

**Success Metrics:**
- Reduce category crawling by 80%+ while maintaining 95%+ product coverage
- Quantify filter expansion ROI with coverage vs effort analysis
- Provide actionable "crawl budget" recommendations per site

---

## 🚧 Medium Priority

### **TICKET-003: Structural Navigation Classifier Improvements**
**Priority:** Medium  
**Complexity:** Medium  
**Impact:** Better navigation discovery

**Problem:**
Current structural classifier lacks DOM selectors from strategies:
- All items fall back to text-based classification
- Missing advanced structural analysis capabilities
- Scoring thresholds may be too restrictive

**Solution:**
1. Fix strategy pipeline to preserve DOM selectors
2. Enhance structural scoring algorithm
3. Add tier-based prioritization system
4. Improve fallback classification patterns

**Files to modify:**
- `src/intelligence/navigation/strategies/*.js` (preserve selectors)
- `src/intelligence/navigation/utils/StructuralNavigationClassifier.js`

---

### **TICKET-004: Anti-Bot System Modularization**
**Priority:** Medium  
**Complexity:** Medium  
**Impact:** Code reusability

**Problem:**
Anti-bot batch processing embedded in NavigationTreeBuilder:
- Cannot reuse for product extraction phases
- Tightly coupled to navigation discovery
- No external API interface

**Solution:**
1. Extract `AntiBotBrowserPool` as standalone component
2. Create granular API endpoints for navigation-only operations
3. Design configuration system for frontend customization

**Files to modify:**
- Create `src/utils/AntiBotBrowserPool.js`
- `src/intelligence/navigation/NavigationTreeBuilder.js` (use pool)
- API layer for external access

---

### **TICKET-005: Enterprise Filter Extraction System**
**Priority:** High (after dropdown fix)  
**Complexity:** High  
**Impact:** Critical for AI training data

**Problem:**
Current TaxonomyDiscoveryProcessor only handles navigation discovery, not filter extraction from category pages. Enterprise sites like Macy's have sophisticated filter systems we need to capture for complete taxonomy mapping.

**Screenshots Evidence (Macy's):**
- **Horizontal Filter Pills**: Color, Size, Brand, Discount Range, Price
- **Expandable Sidebar**: (+) icons reveal nested filter options
- **Visual Elements**: Color swatches with semantic names (Black, Blue, Brown)
- **Dynamic Counts**: Each filter shows item counts (297, 408, etc.)
- **Progressive Disclosure**: "See More Filters" for additional options
- **Multiple UI Patterns**: Checkboxes, color swatches, range sliders, text lists

**Implementation Strategy:**
1. **Headless Browser Automation**: Use Playwright for dynamic interaction
2. **Iterative Filter Expansion**: Programmatically click (+) to expand each filter category
3. **Multi-Pattern Extraction**: Handle diverse UI patterns per filter type
4. **Enhanced Data Model**:
   ```json
   {
     "filters": [{
       "category_name": "Color",
       "ui_type": "color_swatch_group",
       "options": [{
         "name": "Black",
         "value": "black",
         "visual_data": {"type": "color_hex", "value": "#000000"},
         "count": null,
         "is_selected": false
       }]
     }]
   }
   ```

**Technical Requirements:**
- Extract filter category names and UI types
- Capture option names, values, and counts
- Handle visual elements (color swatches) with semantic data
- Preserve selection states and availability
- Support progressive disclosure interactions
- Maintain robustness across site updates

**Files to Create/Modify:**
- Create `src/intelligence/filters/FilterExtractionStrategy.js`
- Enhance `src/intelligence/processors/TaxonomyDiscoveryProcessor.js`
- Extend MongoDB schema for comprehensive filter storage
- Add filter-specific test cases

**Success Criteria:**
- Extract 5+ filter types per enterprise category page
- Capture visual elements with semantic mapping
- Maintain dynamic counts and selection states
- Handle "See More Filters" progressive disclosure
- Work across boutique (glasswingshop) and enterprise (Macy's) sites

---

## 🔧 Low Priority / Tech Debt

### **TICKET-006: Configuration Centralization**
**Priority:** Low  
**Complexity:** Low  
**Impact:** Maintainability

**Problem:**
Site-specific configuration duplicated across multiple files:
- NavigationMapper.js
- NavigationTreeBuilder.js (multiple locations)

**Solution:**
Create centralized `SiteConfigurationManager` for all site-specific settings.

**Files to modify:**
- Create `src/config/SiteConfigurationManager.js`
- Update all components to use centralized config

---

### **TICKET-006: Redis Logger Bleed Fix**
**Priority:** Low  
**Complexity:** Low  
**Impact:** Clean logging

**Problem:**
Redis cache operations bleeding into main logs.

**Solution:**
Implement tuple return pattern to separate cache status from main operation results.

---

## 📊 Future Enhancements

### **TICKET-007: Machine Learning Classification**
**Priority:** Future  
**Complexity:** High  
**Impact:** Advanced intelligence

**Concept:**
Replace heuristic-based navigation classification with lightweight ML model:
- Features: DOM position, siblings, visual prominence, text embeddings
- Training data: Manual labeling of ~200 navigation bars
- Model: Logistic regression or gradient boosting (portable in JS/TS)

---

### **TICKET-008: Real-Time Configuration System**
**Priority:** Future  
**Complexity:** High  
**Impact:** Dynamic adaptation

**Concept:**
Allow runtime configuration updates for:
- Site-specific exploration budgets
- Anti-bot timing adjustments
- Classification threshold tuning

---

## 📝 Tracking

**Last Updated:** 2025-08-16  
**Active Tickets:** 8  
**Completed:** 0  

**Priority Legend:**
- 🔥 High: Critical for system functionality
- 🚧 Medium: Important for scalability/quality
- 🔧 Low: Technical debt cleanup
- 📊 Future: Enhancement opportunities

---

**Note:** Focus on completing core functionality before implementing these improvements. This list serves as a roadmap for system evolution after initial deployment.