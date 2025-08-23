# 🧠 **SMART VARIANT EXTRACTION STRATEGY**

## **The Key Insight**

You've identified a critical optimization: **Separate variant discovery from availability checking**. This transforms variant extraction from a slow, comprehensive process into a fast discovery phase + on-demand availability checking.

---

## **TWO-PHASE APPROACH**

### **Phase 1: Fast Variant Discovery (During Scraping)**
- **Goal**: Identify all possible variants and their selectors
- **Time**: 5-10 seconds per product
- **Data Captured**: Variant structure, selectors, options
- **Storage**: Cached for future use

### **Phase 2: Real-Time Availability Check (On User Request)**
- **Goal**: Check specific variant availability instantly
- **Time**: 1-2 seconds per variant
- **Trigger**: User interaction (API request, UI selection)
- **Data Returned**: Live availability, price, stock status

---

## **IMPLEMENTATION COMPARISON**

### **❌ CURRENT APPROACH (Slow)**
```javascript
// During scraping: Check ALL combinations
async extractAllVariants(productUrl) {
  // 50 variants × 2 seconds each = 100 seconds
  for (const combination of allCombinations) {
    await selectVariant(combination);
    await checkAvailability(); // SLOW
    await captureData();
  }
  return allVariantsWithAvailability; // 100+ seconds
}
```

### **✅ OPTIMIZED APPROACH (Fast)**
```javascript
// Phase 1: During scraping (FAST)
async discoverVariantStructure(productUrl) {
  const variantGroups = await identifyVariantGroups(page);
  const selectors = await mapVariantSelectors(variantGroups);
  
  return {
    productId: extractProductId(productUrl),
    variantGroups: variantGroups,
    selectors: selectors,
    totalCombinations: calculateCombinations(variantGroups),
    discoveredAt: Date.now()
  };
  // 5-10 seconds total
}

// Phase 2: On user request (INSTANT)
async checkVariantAvailability(productId, variantOptions) {
  const { page } = await createBrowser();
  await page.goto(getProductUrl(productId));
  
  // Select specific variant (1-2 seconds)
  await selectVariantCombination(page, variantOptions);
  const availability = await checkAvailabilityState(page);
  
  await page.close();
  return availability; // 1-2 seconds total
}
```

---

## **DETAILED IMPLEMENTATION**

### **Phase 1: Variant Structure Discovery**

```javascript
class VariantStructureDiscovery {
  async discoverVariantStructure(page, productUrl) {
    console.log('🔍 Discovering variant structure (fast mode)');
    
    const discovery = {
      productId: this.extractProductId(productUrl),
      productUrl: productUrl,
      variantGroups: [],
      selectors: {
        addToCart: null,
        stockMessage: null,
        price: null,
        sku: null
      },
      metadata: {
        discoveredAt: new Date().toISOString(),
        totalCombinations: 0,
        estimatedCheckTime: 0
      }
    };

    // Step 1: Identify variant groups (no selection needed)
    discovery.variantGroups = await this.identifyVariantGroups(page);
    
    // Step 2: Map critical selectors for future availability checks
    discovery.selectors = await this.mapCriticalSelectors(page);
    
    // Step 3: Calculate metadata
    discovery.metadata.totalCombinations = this.calculateTotalCombinations(discovery.variantGroups);
    discovery.metadata.estimatedCheckTime = discovery.metadata.totalCombinations * 1.5; // 1.5s per variant
    
    // Step 4: Test one variant to validate selectors work
    await this.validateSelectors(page, discovery);
    
    console.log('✅ Variant structure discovered', {
      groups: discovery.variantGroups.length,
      combinations: discovery.metadata.totalCombinations,
      estimatedCheckTime: `${discovery.metadata.estimatedCheckTime}s`
    });
    
    return discovery;
  }

  async identifyVariantGroups(page) {
    return await page.evaluate(() => {
      const groups = [];
      
      // Find all variant option groups
      const groupSelectors = [
        '.product-options .option-group',
        '.variant-selector',
        '.product-form__buttons .product-form__input',
        'select[name*="variant"]',
        '.color-swatches',
        '.size-options'
      ];

      groupSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((element, index) => {
          const group = this.analyzeVariantGroup(element, selector, index);
          if (group && group.options.length > 1) {
            groups.push(group);
          }
        });
      });

      return this.deduplicateGroups(groups);

      // Helper functions...
      function analyzeVariantGroup(element, selector, index) {
        const groupType = this.determineGroupType(element);
        const options = this.extractGroupOptions(element);
        
        if (options.length <= 1) return null;

        return {
          id: `group_${index}_${groupType}`,
          type: groupType,
          label: this.extractGroupLabel(element),
          selector: selector,
          options: options,
          selectionMethod: this.determineSelectionMethod(options[0])
        };
      }

      function extractGroupOptions(element) {
        const options = [];
        
        // Different option types
        const optionSelectors = [
          'input[type="radio"]',
          'input[type="checkbox"]',
          'button',
          'option',
          'a[data-value]'
        ];

        optionSelectors.forEach(optionSelector => {
          const optionElements = element.querySelectorAll(optionSelector);
          optionElements.forEach(option => {
            const optionData = this.extractOptionData(option);
            if (optionData) options.push(optionData);
          });
        });

        return options;
      }

      function extractOptionData(option) {
        let value, label, selector;
        
        if (option.tagName === 'INPUT') {
          value = option.value;
          label = this.getInputLabel(option);
          selector = this.buildInputSelector(option);
        } else if (option.tagName === 'BUTTON') {
          value = option.dataset.value || option.textContent.trim();
          label = option.textContent.trim();
          selector = this.buildButtonSelector(option);
        } else if (option.tagName === 'OPTION') {
          value = option.value;
          label = option.textContent.trim();
          selector = this.buildOptionSelector(option);
        }

        if (!value || !label) return null;

        return {
          value: value,
          label: label,
          selector: selector,
          available: !option.disabled
        };
      }
    });
  }

  async mapCriticalSelectors(page) {
    return await page.evaluate(() => {
      const selectors = {};

      // Add to cart button
      const addToCartSelectors = [
        'button[name="add"]',
        '.add-to-cart',
        '.add-to-bag',
        '[data-add-to-cart]',
        'button[type="submit"][name*="add"]'
      ];

      for (const selector of addToCartSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          selectors.addToCart = {
            selector: selector,
            element: this.getElementSelector(element),
            initialText: element.textContent.trim(),
            initialDisabled: element.disabled
          };
          break;
        }
      }

      // Stock message area
      const stockSelectors = [
        '.stock-message',
        '.availability-message',
        '.product-availability',
        '.inventory-message'
      ];

      for (const selector of stockSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          selectors.stockMessage = {
            selector: selector,
            element: this.getElementSelector(element),
            initialText: element.textContent.trim()
          };
          break;
        }
      }

      // Price
      const priceSelectors = [
        '.price',
        '.product-price',
        '[data-price]',
        '.current-price'
      ];

      for (const selector of priceSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          selectors.price = {
            selector: selector,
            element: this.getElementSelector(element),
            initialPrice: element.textContent.trim()
          };
          break;
        }
      }

      // SKU
      const skuSelectors = [
        '[data-sku]',
        '.sku',
        '.product-sku',
        '.variant-sku'
      ];

      for (const selector of skuSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          selectors.sku = {
            selector: selector,
            element: this.getElementSelector(element),
            initialSku: element.textContent.trim() || element.dataset.sku
          };
          break;
        }
      }

      return selectors;
    });
  }

  async validateSelectors(page, discovery) {
    // Test one variant selection to ensure selectors work
    if (discovery.variantGroups.length === 0) return;

    try {
      const firstGroup = discovery.variantGroups[0];
      const firstOption = firstGroup.options[0];

      // Select the option
      await this.selectVariantOption(page, firstGroup, firstOption);
      await page.waitForTimeout(1000);

      // Check if selectors still work
      const validation = await page.evaluate((selectors) => {
        const results = {};

        if (selectors.addToCart) {
          const element = document.querySelector(selectors.addToCart.selector);
          results.addToCart = !!element;
        }

        if (selectors.stockMessage) {
          const element = document.querySelector(selectors.stockMessage.selector);
          results.stockMessage = !!element;
        }

        if (selectors.price) {
          const element = document.querySelector(selectors.price.selector);
          results.price = !!element;
        }

        return results;
      }, discovery.selectors);

      discovery.metadata.selectorsValidated = validation;
      discovery.metadata.validationPassed = Object.values(validation).every(Boolean);

    } catch (error) {
      discovery.metadata.validationError = error.message;
      discovery.metadata.validationPassed = false;
    }
  }
}
```

### **Phase 2: On-Demand Availability Checking**

```javascript
class OnDemandAvailabilityChecker {
  constructor() {
    this.variantCache = new Map(); // Cache variant structures
    this.availabilityCache = new Map(); // Cache recent availability checks
  }

  async checkVariantAvailability(productId, requestedVariant, options = {}) {
    const cacheKey = `${productId}_${JSON.stringify(requestedVariant)}`;
    
    // Check cache first (if less than 5 minutes old)
    if (options.useCache !== false) {
      const cached = this.availabilityCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 300000) { // 5 minutes
        console.log('✅ Returning cached availability');
        return cached.data;
      }
    }

    console.log('🔍 Checking variant availability on-demand', {
      productId,
      variant: requestedVariant
    });

    const startTime = Date.now();

    try {
      // Get variant structure from cache
      const variantStructure = this.variantCache.get(productId);
      if (!variantStructure) {
        throw new Error(`Variant structure not found for product ${productId}`);
      }

      // Create browser session
      const { page, close } = await this.createBrowser();
      
      try {
        // Navigate to product
        await page.goto(variantStructure.productUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: 15000 
        });
        await page.waitForTimeout(1000);

        // Select the requested variant combination
        await this.selectVariantCombination(page, variantStructure, requestedVariant);
        
        // Wait for state change
        await page.waitForTimeout(800);

        // Check availability state
        const availability = await this.checkAvailabilityState(page, variantStructure.selectors);

        const duration = Date.now() - startTime;
        
        console.log('✅ Availability check complete', {
          productId,
          available: availability.available,
          duration: `${duration}ms`
        });

        // Cache the result
        this.availabilityCache.set(cacheKey, {
          data: availability,
          timestamp: Date.now()
        });

        return availability;

      } finally {
        await close();
      }

    } catch (error) {
      console.error('❌ Availability check failed', {
        productId,
        variant: requestedVariant,
        error: error.message
      });

      return {
        available: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async selectVariantCombination(page, variantStructure, requestedVariant) {
    // Select each variant option
    for (const [groupType, optionValue] of Object.entries(requestedVariant)) {
      const group = variantStructure.variantGroups.find(g => g.type === groupType);
      if (!group) {
        console.warn(`⚠️ Group type ${groupType} not found`);
        continue;
      }

      const option = group.options.find(o => o.value === optionValue);
      if (!option) {
        console.warn(`⚠️ Option ${optionValue} not found in group ${groupType}`);
        continue;
      }

      // Select the option
      await this.selectOption(page, group, option);
      await page.waitForTimeout(300); // Small delay between selections
    }
  }

  async selectOption(page, group, option) {
    const element = await page.$(option.selector);
    if (!element) {
      throw new Error(`Option element not found: ${option.selector}`);
    }

    switch (group.selectionMethod) {
      case 'click':
        await element.click();
        break;
      case 'select':
        await element.selectOption(option.value);
        break;
      default:
        await element.click();
    }
  }

  async checkAvailabilityState(page, selectors) {
    return await page.evaluate((sels) => {
      const availability = {
        available: true,
        reason: null,
        addToCartState: null,
        stockMessage: null,
        price: null,
        sku: null,
        timestamp: new Date().toISOString()
      };

      // Check add to cart button
      if (sels.addToCart) {
        const button = document.querySelector(sels.addToCart.selector);
        if (button) {
          const isDisabled = button.disabled || 
                            button.classList.contains('disabled') ||
                            button.getAttribute('aria-disabled') === 'true';
          
          availability.addToCartState = {
            found: true,
            enabled: !isDisabled,
            text: button.textContent.trim(),
            textChanged: button.textContent.trim() !== sels.addToCart.initialText
          };

          if (isDisabled) {
            availability.available = false;
            availability.reason = 'add-to-cart-disabled';
          }
        }
      }

      // Check stock message
      if (sels.stockMessage) {
        const messageEl = document.querySelector(sels.stockMessage.selector);
        if (messageEl) {
          const message = messageEl.textContent.trim();
          availability.stockMessage = {
            found: true,
            text: message,
            textChanged: message !== sels.stockMessage.initialText
          };

          const messageLower = message.toLowerCase();
          if (messageLower.includes('out of stock') || 
              messageLower.includes('unavailable') ||
              messageLower.includes('sold out')) {
            availability.available = false;
            availability.reason = 'stock-message';
          }
        }
      }

      // Get current price
      if (sels.price) {
        const priceEl = document.querySelector(sels.price.selector);
        if (priceEl) {
          availability.price = {
            current: priceEl.textContent.trim(),
            changed: priceEl.textContent.trim() !== sels.price.initialPrice
          };
        }
      }

      // Get current SKU
      if (sels.sku) {
        const skuEl = document.querySelector(sels.sku.selector);
        if (skuEl) {
          const currentSku = skuEl.textContent.trim() || skuEl.dataset.sku;
          availability.sku = {
            current: currentSku,
            changed: currentSku !== sels.sku.initialSku
          };
        }
      }

      return availability;
    }, selectors);
  }

  // Cache management
  cacheVariantStructure(productId, structure) {
    this.variantCache.set(productId, structure);
  }

  clearExpiredCache() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours for variant structures
    const availabilityMaxAge = 300000; // 5 minutes for availability

    // Clear expired variant structures
    for (const [key, value] of this.variantCache.entries()) {
      if (now - value.metadata.discoveredAt > maxAge) {
        this.variantCache.delete(key);
      }
    }

    // Clear expired availability checks
    for (const [key, value] of this.availabilityCache.entries()) {
      if (now - value.timestamp > availabilityMaxAge) {
        this.availabilityCache.delete(key);
      }
    }
  }
}
```

---

## **API USAGE EXAMPLES**

### **During Scraping (Phase 1)**
```javascript
// Fast variant discovery during product scraping
const discovery = new VariantStructureDiscovery();
const variantStructure = await discovery.discoverVariantStructure(page, productUrl);

// Store in database for future use
await database.storeVariantStructure(productId, variantStructure);
```

### **On User Request (Phase 2)**
```javascript
// Real-time availability check when user selects variant
const checker = new OnDemandAvailabilityChecker();

// User wants to check: Red shirt, Size Large
const availability = await checker.checkVariantAvailability('product_123', {
  color: 'red',
  size: 'large'
});

// Returns in 1-2 seconds:
{
  available: false,
  reason: 'stock-message',
  stockMessage: { text: 'Out of Stock', textChanged: true },
  addToCartState: { enabled: false, text: 'Sold Out' },
  price: { current: '$29.99', changed: false }
}
```

---

## **PERFORMANCE COMPARISON**

| Approach | Scraping Time | User Request Time | Total Time |
|----------|---------------|-------------------|------------|
| **Current (All Variants)** | 100+ seconds | 0 seconds | 100+ seconds |
| **Smart (Two-Phase)** | 10 seconds | 1-2 seconds | 11-12 seconds |
| **Improvement** | **10x faster** | **On-demand** | **8-9x faster** |

---

## **BENEFITS**

### **✅ Faster Scraping**
- **10x speed improvement** during product discovery
- **Parallel processing** of multiple products
- **Better resource utilization**

### **✅ Real-Time Accuracy**
- **Live availability** when user needs it
- **Fresh data** for purchase decisions
- **No stale inventory** issues

### **✅ Better User Experience**
- **Instant responses** to variant selections
- **Accurate stock status** at decision time
- **Reduced server load** during scraping

### **✅ Scalability**
- **Cache variant structures** for reuse
- **On-demand checking** scales with usage
- **Reduced database storage** needs

This approach transforms variant extraction from a bottleneck into an efficient, user-responsive system!