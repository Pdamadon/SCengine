# Phase 2 Enhanced Implementation Plan
## Incorporating Universal Scraper Learning Concepts

## 🎯 Enhanced Extraction Architecture

### Quality Scoring System (from Universal Scraper)
```javascript
// DataValidator will use this weighted scoring
const EXTRACTION_QUALITY_WEIGHTS = {
  required_fields: 0.4,    // title, price, url, description
  enhanced_fields: 0.4,    // images, variants, availability, category
  actionable_selectors: 0.2, // NEW: buttons for automation
  
  // Field-level weights
  fields: {
    title: { weight: 0.3, required: true },
    price: { weight: 0.3, required: true },
    url: { weight: 0.2, required: true },
    description: { weight: 0.2, required: true },
    images: { weight: 0.25, required: false },
    variants: { weight: 0.25, required: false },
    availability: { weight: 0.2, required: false },
    category_hierarchy: { weight: 0.15, required: false },
    brand: { weight: 0.15, required: false },
    // NEW: Actionable elements
    add_to_cart_selector: { weight: 0.4, actionable: true },
    size_selector: { weight: 0.2, actionable: true },
    quantity_selector: { weight: 0.2, actionable: true },
    color_selector: { weight: 0.2, actionable: true }
  }
};
```

### Progressive Extraction Strategy (3-Attempt Learning)
```javascript
class ProgressiveExtractionStrategy {
  async extract(url, domain) {
    let quality = 0;
    let attempt = 0;
    let extractedData = {};
    
    while (attempt < 3 && quality < 0.9) {
      attempt++;
      
      switch(attempt) {
        case 1:
          // Try known patterns (Gap, Macy's, Shopify, etc.)
          extractedData = await this.tryKnownPlatforms(url, domain);
          break;
          
        case 2:
          // Use SelectorDiscovery with cross-site learning
          extractedData = await this.discoverWithLearning(url, domain, extractedData);
          break;
          
        case 3:
          // Deep extraction with all learned patterns
          extractedData = await this.deepExtraction(url, domain, extractedData);
          break;
      }
      
      quality = await this.validator.calculateQuality(extractedData);
      
      // Store learning after each attempt
      await this.worldModel.updateExtractionStrategy(domain, {
        attempt,
        quality,
        patterns: extractedData.extraction_strategy
      });
    }
    
    return extractedData;
  }
}
```

### Cross-Platform Learning for Custom Retailers
```javascript
// PlatformDetector enhancement
class EnhancedPlatformDetector {
  async detectWithLearning(page, domain) {
    // 1. Check exact domain match (gap.com, macys.com, etc.)
    const knownPlatform = await this.checkKnownPlatform(domain);
    if (knownPlatform) return knownPlatform;
    
    // 2. Check similar retailers for patterns
    const sectorPatterns = await this.getCrossSectorPatterns(domain);
    // e.g., Gap can learn from H&M, Zara patterns
    
    // 3. Apply learned patterns
    const learnedPlatform = await this.applyLearnedPatterns(page, sectorPatterns);
    if (learnedPlatform) return learnedPlatform;
    
    // 4. Discover new patterns
    return await this.discoverNewPlatform(page, domain);
  }
  
  async getCrossSectorPatterns(domain) {
    // Categorize by retail sector
    const sectors = {
      'clothing': ['gap.com', 'oldnavy.com', 'zara.com', 'hm.com'],
      'department': ['macys.com', 'nordstrom.com', 'bloomingdales.com'],
      'outdoor': ['rei.com', 'patagonia.com', 'thenorthface.com']
    };
    
    // Find which sector this domain belongs to
    const sector = await this.identifySector(domain);
    
    // Get patterns from similar sites
    return await this.worldModel.getSectorPatterns(sector);
  }
}
```

### Actionable Selectors Extraction (NEW)
```javascript
// Add to UniversalProductExtractor
async extractActionableSelectors(page) {
  const actionable = {};
  
  // Add to cart button
  const addToCartSelectors = [
    'button[class*="add-to-cart"]',
    'button[class*="add-to-bag"]',
    'button[id*="add-to-cart"]',
    'button[data-action="add-to-cart"]',
    'form[action*="/cart/add"] button[type="submit"]'
  ];
  
  for (const selector of addToCartSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        actionable.add_to_cart = selector;
        break;
      }
    } catch (e) {}
  }
  
  // Size selector
  const sizeSelectors = [
    'select[name*="size"]',
    'div[class*="size-selector"]',
    'input[type="radio"][name*="size"]',
    'button[data-option*="size"]'
  ];
  
  for (const selector of sizeSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        actionable.size_selector = selector;
        break;
      }
    } catch (e) {}
  }
  
  // Similar for color, quantity, etc.
  
  return actionable;
}
```

## 📊 Enhanced MongoDB Schema Addition

```javascript
// Add to products collection
{
  // Existing fields...
  
  // NEW: Actionable selectors for automation
  actionable_selectors: {
    add_to_cart: String,
    size_selector: String,
    color_selector: String,
    quantity_input: String,
    checkout_button: String,
    last_verified: Date
  },
  
  // NEW: Learning metadata
  extraction_learning: {
    attempts_to_success: Number,
    quality_progression: [Number], // [0.3, 0.6, 0.92]
    patterns_discovered: Number,
    cross_site_patterns_used: [String],
    learning_duration_ms: Number
  }
}
```

## 🔄 Implementation Updates

### 1. DataValidator.js (Enhanced with Quality Scoring)
```javascript
class DataValidator {
  constructor(logger) {
    this.logger = logger;
    this.weights = EXTRACTION_QUALITY_WEIGHTS;
  }
  
  async validateProduct(productData) {
    const validation = {
      isValid: true,
      quality: 0,
      missing: [],
      warnings: []
    };
    
    // Check required fields
    const requiredScore = this.validateRequiredFields(productData);
    validation.quality += requiredScore * this.weights.required_fields;
    
    // Check enhanced fields
    const enhancedScore = this.validateEnhancedFields(productData);
    validation.quality += enhancedScore * this.weights.enhanced_fields;
    
    // Check actionable selectors
    const actionableScore = this.validateActionableSelectors(productData);
    validation.quality += actionableScore * this.weights.actionable_selectors;
    
    // Determine if valid (minimum 50% quality)
    validation.isValid = validation.quality >= 0.5;
    
    return validation;
  }
}
```

### 2. SelectorDiscovery.js (With Cross-Site Learning)
```javascript
class SelectorDiscovery {
  constructor(logger, worldModel) {
    this.logger = logger;
    this.worldModel = worldModel;
  }
  
  async discoverSelectors(page, domain, elementType) {
    // 1. Try cross-site patterns first
    const crossSitePatterns = await this.worldModel.getCrossSitePatterns(domain, elementType);
    
    for (const pattern of crossSitePatterns) {
      if (await this.testSelector(page, pattern.selector)) {
        return {
          selector: pattern.selector,
          source: 'cross_site',
          confidence: pattern.success_rate
        };
      }
    }
    
    // 2. Generate new candidates
    const candidates = await this.generateCandidates(page, elementType);
    
    // 3. Test and score
    const results = await this.testCandidates(page, candidates);
    
    // 4. Store successful pattern for cross-site learning
    if (results.best) {
      await this.worldModel.storeCrossSitePattern(domain, elementType, results.best);
    }
    
    return results.best;
  }
}
```

## 🎯 Success Metrics (Enhanced)

### Quality Targets by Attempt
- **Attempt 1**: 30-40% (basic fields)
- **Attempt 2**: 60-70% (+ images, categories)
- **Attempt 3**: 90-95% (+ variants, actionable selectors)

### Platform Detection Success
- Known platforms (Shopify, etc.): 100%
- Custom retailers (Gap, Macy's): 95%+
- Unknown sites: 80%+ with learning

### Cross-Site Learning Effectiveness
- Patterns reused: 60%+ for similar sites
- Learning time reduction: 50% for sector sites
- Quality improvement: +20% from cross-site patterns

## 📋 Updated Implementation Priority

1. **Enhanced PlatformDetector** with cross-site learning
2. **DataValidator** with quality scoring system
3. **SelectorDiscovery** with pattern persistence
4. **Actionable selectors** extraction
5. **Progressive extraction** strategy
6. **Cross-site pattern** storage in WorldModel

## 🔗 Key Integrations

### From Universal Scraper → Phase 2
- Quality scoring formula → DataValidator
- Learning persistence → WorldModel enhancements
- Cross-site patterns → PlatformDetector
- Actionable selectors → UniversalProductExtractor
- Progressive attempts → Extraction strategy

This enhanced plan incorporates the best learning concepts from the Universal Scraper while staying focused on Phase 2's product extraction goals.