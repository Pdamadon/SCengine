# 🛍️ **PRODUCT VARIANT EXTRACTION PROTOTYPE**

## **Overview**

This prototype implements intelligent product variant extraction by systematically selecting variant options and monitoring availability changes. It captures all possible combinations while detecting stock status through UI state changes.

## **Core Strategy**

1. **Identify Variant Groups**: Find all variant selectors (color, size, style, etc.)
2. **Systematic Selection**: Select first option in first group, then iterate through all options in subsequent groups
3. **State Monitoring**: Watch for changes in add-to-cart buttons and availability messages
4. **Variant Mapping**: Build complete variant availability matrix
5. **Data Extraction**: Capture variant-specific data (price, images, SKU, etc.)

---

## **IMPLEMENTATION**

```javascript
/**
 * ProductVariantExtractor - Comprehensive variant extraction with availability detection
 * 
 * Systematically explores all product variants by:
 * 1. Identifying variant option groups (color, size, etc.)
 * 2. Selecting combinations and monitoring availability changes
 * 3. Capturing variant-specific data and stock status
 */

class ProductVariantExtractor {
  constructor(options = {}) {
    this.options = {
      maxVariantCombinations: options.maxVariantCombinations || 100,
      selectionDelay: options.selectionDelay || 1500,
      stateCheckDelay: options.stateCheckDelay || 800,
      captureImages: options.captureImages !== false,
      capturePrice: options.capturePrice !== false,
      captureSKU: options.captureSKU !== false,
      enableDeepAnalysis: options.enableDeepAnalysis !== false,
      ...options
    };
    
    this.variantGroups = [];
    this.extractedVariants = [];
    this.availabilityStates = new Map();
    this.baselineState = null;
  }

  /**
   * Main extraction method - extracts all product variants
   */
  async extractAllVariants(page, productUrl) {
    console.log('🚀 Starting comprehensive variant extraction', {
      url: productUrl,
      maxCombinations: this.options.maxVariantCombinations
    });

    try {
      // Step 1: Navigate to product page and wait for load
      await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await this.waitForPageStabilization(page);

      // Step 2: Capture baseline state (no variants selected)
      this.baselineState = await this.capturePageState(page, 'baseline');
      
      // Step 3: Identify all variant groups
      this.variantGroups = await this.identifyVariantGroups(page);
      
      if (this.variantGroups.length === 0) {
        console.log('ℹ️ No variants found - single product');
        return {
          hasVariants: false,
          variants: [await this.extractSingleProductData(page)],
          totalVariants: 1,
          extractionMethod: 'single-product'
        };
      }

      console.log('📊 Variant groups identified', {
        groups: this.variantGroups.length,
        totalCombinations: this.calculateTotalCombinations(),
        groupTypes: this.variantGroups.map(g => g.type)
      });

      // Step 4: Extract variants using systematic selection
      const variants = await this.extractVariantsSystematically(page);

      // Step 5: Analyze and enhance variant data
      const enhancedVariants = await this.enhanceVariantData(variants, page);

      return {
        hasVariants: true,
        variants: enhancedVariants,
        totalVariants: enhancedVariants.length,
        variantGroups: this.variantGroups,
        extractionMethod: 'systematic-selection',
        baselineState: this.baselineState,
        extractionStats: this.generateExtractionStats()
      };

    } catch (error) {
      console.error('❌ Variant extraction failed', {
        url: productUrl,
        error: error.message
      });
      
      // Fallback to basic extraction
      return await this.fallbackExtraction(page, productUrl);
    }
  }

  /**
   * Identify all variant option groups on the page
   */
  async identifyVariantGroups(page) {
    return await page.evaluate(() => {
      const variantGroups = [];
      
      // Pattern 1: Color/Size/Style option groups
      const optionGroupSelectors = [
        // Common e-commerce patterns
        '.product-options .option-group',
        '.variant-selector',
        '.product-variants .variant-group',
        '.options-container .option',
        
        // Shopify patterns
        '.product-form__buttons .product-form__input',
        '.variant-input-wrap',
        '.selector-wrapper',
        
        // Generic patterns
        '[data-variant-group]',
        '[data-option-group]',
        '.size-selector',
        '.color-selector',
        '.style-selector'
      ];

      // Find option groups
      optionGroupSelectors.forEach(selector => {
        const groups = document.querySelectorAll(selector);
        groups.forEach((group, index) => {
          const groupData = this.analyzeVariantGroup(group, selector, index);
          if (groupData && groupData.options.length > 1) {
            variantGroups.push(groupData);
          }
        });
      });

      // Pattern 2: Standalone select dropdowns
      const selectElements = document.querySelectorAll('select[name*="variant"], select[name*="option"], select[data-variant]');
      selectElements.forEach((select, index) => {
        const groupData = this.analyzeSelectGroup(select, index);
        if (groupData && groupData.options.length > 1) {
          variantGroups.push(groupData);
        }
      });

      // Pattern 3: Button/swatch groups
      const buttonGroups = this.findButtonVariantGroups();
      variantGroups.push(...buttonGroups);

      // Deduplicate and sort by priority
      return this.deduplicateAndSortGroups(variantGroups);

      // Helper functions (browser context)
      function analyzeVariantGroup(group, selector, index) {
        const groupLabel = this.extractGroupLabel(group);
        const groupType = this.determineGroupType(groupLabel, group);
        
        // Find options within the group
        const options = [];
        
        // Look for different option types
        const optionSelectors = [
          'input[type="radio"]',
          'input[type="checkbox"]', 
          'button',
          'a[data-value]',
          '.option-value',
          '.variant-option'
        ];

        optionSelectors.forEach(optionSelector => {
          const optionElements = group.querySelectorAll(optionSelector);
          optionElements.forEach(option => {
            const optionData = this.extractOptionData(option, groupType);
            if (optionData) {
              options.push(optionData);
            }
          });
        });

        if (options.length === 0) return null;

        return {
          id: `group_${index}_${groupType}`,
          type: groupType,
          label: groupLabel,
          selector: selector,
          groupElement: this.getElementSelector(group),
          options: options,
          selectionMethod: this.determineSelectionMethod(options[0]),
          priority: this.calculateGroupPriority(groupType, groupLabel)
        };
      }

      function analyzeSelectGroup(select, index) {
        const groupLabel = this.extractSelectLabel(select);
        const groupType = this.determineGroupType(groupLabel, select);
        
        const options = Array.from(select.options).map((option, optIndex) => {
          if (!option.value || option.disabled) return null;
          
          return {
            id: `${select.name || 'select'}_${optIndex}`,
            value: option.value,
            label: option.textContent.trim(),
            selector: `select[name="${select.name}"] option[value="${option.value}"]`,
            element: this.getElementSelector(select),
            selected: option.selected,
            available: !option.disabled
          };
        }).filter(Boolean);

        if (options.length <= 1) return null;

        return {
          id: `select_${index}_${groupType}`,
          type: groupType,
          label: groupLabel,
          selector: this.getElementSelector(select),
          groupElement: this.getElementSelector(select),
          options: options,
          selectionMethod: 'select',
          priority: this.calculateGroupPriority(groupType, groupLabel)
        };
      }

      function findButtonVariantGroups() {
        const buttonGroups = [];
        
        // Look for groups of buttons that appear to be variants
        const potentialGroups = document.querySelectorAll([
          '.color-swatches',
          '.size-options', 
          '.variant-buttons',
          '[class*="swatch"]',
          '[class*="option-button"]'
        ].join(', '));

        potentialGroups.forEach((group, index) => {
          const buttons = group.querySelectorAll('button, a[role="button"], [data-variant-value]');
          
          if (buttons.length > 1) {
            const groupLabel = this.extractGroupLabel(group);
            const groupType = this.determineGroupType(groupLabel, group);
            
            const options = Array.from(buttons).map((button, btnIndex) => {
              return {
                id: `btn_${index}_${btnIndex}`,
                value: button.dataset.variantValue || button.dataset.value || button.textContent.trim(),
                label: button.textContent.trim() || button.title || button.getAttribute('aria-label'),
                selector: this.getElementSelector(button),
                element: this.getElementSelector(button),
                selected: button.classList.contains('selected') || button.classList.contains('active'),
                available: !button.disabled && !button.classList.contains('disabled')
              };
            });

            buttonGroups.push({
              id: `buttons_${index}_${groupType}`,
              type: groupType,
              label: groupLabel,
              selector: this.getElementSelector(group),
              groupElement: this.getElementSelector(group),
              options: options,
              selectionMethod: 'click',
              priority: this.calculateGroupPriority(groupType, groupLabel)
            });
          }
        });

        return buttonGroups;
      }

      function extractGroupLabel(group) {
        // Try multiple methods to get group label
        const labelSelectors = [
          'label',
          '.option-label',
          '.variant-label', 
          'h3', 'h4', 'h5',
          '.title',
          '[data-label]'
        ];

        for (const selector of labelSelectors) {
          const labelEl = group.querySelector(selector);
          if (labelEl && labelEl.textContent.trim()) {
            return labelEl.textContent.trim();
          }
        }

        // Check parent for label
        const parent = group.parentElement;
        if (parent) {
          for (const selector of labelSelectors) {
            const labelEl = parent.querySelector(selector);
            if (labelEl && labelEl.textContent.trim()) {
              return labelEl.textContent.trim();
            }
          }
        }

        // Fallback to data attributes
        return group.dataset.label || group.dataset.optionName || 'Unknown';
      }

      function determineGroupType(label, element) {
        const labelLower = label.toLowerCase();
        
        if (labelLower.includes('color') || labelLower.includes('colour')) return 'color';
        if (labelLower.includes('size')) return 'size';
        if (labelLower.includes('style')) return 'style';
        if (labelLower.includes('material')) return 'material';
        if (labelLower.includes('finish')) return 'finish';
        if (labelLower.includes('pattern')) return 'pattern';
        if (labelLower.includes('fit')) return 'fit';
        if (labelLower.includes('length')) return 'length';
        if (labelLower.includes('width')) return 'width';
        
        // Check element classes/attributes
        const elementClasses = element.className.toLowerCase();
        if (elementClasses.includes('color')) return 'color';
        if (elementClasses.includes('size')) return 'size';
        if (elementClasses.includes('style')) return 'style';
        
        return 'variant';
      }

      function extractOptionData(option, groupType) {
        let value, label, selector, available = true;
        
        if (option.tagName === 'INPUT') {
          value = option.value;
          label = this.getInputLabel(option);
          selector = this.getElementSelector(option);
          available = !option.disabled;
        } else if (option.tagName === 'BUTTON') {
          value = option.dataset.value || option.textContent.trim();
          label = option.textContent.trim() || option.title;
          selector = this.getElementSelector(option);
          available = !option.disabled && !option.classList.contains('disabled');
        } else if (option.tagName === 'A') {
          value = option.dataset.value || option.textContent.trim();
          label = option.textContent.trim() || option.title;
          selector = this.getElementSelector(option);
          available = !option.classList.contains('disabled');
        }

        if (!value || !label) return null;

        return {
          id: `${groupType}_${value}`.replace(/\s+/g, '_'),
          value: value,
          label: label,
          selector: selector,
          element: selector,
          selected: this.isOptionSelected(option),
          available: available,
          groupType: groupType
        };
      }

      function getInputLabel(input) {
        // Try associated label
        if (input.id) {
          const label = document.querySelector(`label[for="${input.id}"]`);
          if (label) return label.textContent.trim();
        }
        
        // Try parent label
        const parentLabel = input.closest('label');
        if (parentLabel) return parentLabel.textContent.trim();
        
        // Try sibling text
        const nextSibling = input.nextElementSibling;
        if (nextSibling && nextSibling.textContent.trim()) {
          return nextSibling.textContent.trim();
        }
        
        return input.value || input.name || '';
      }

      function isOptionSelected(option) {
        if (option.tagName === 'INPUT') {
          return option.checked;
        } else if (option.tagName === 'BUTTON' || option.tagName === 'A') {
          return option.classList.contains('selected') || 
                 option.classList.contains('active') ||
                 option.getAttribute('aria-pressed') === 'true';
        }
        return false;
      }

      function calculateGroupPriority(groupType, label) {
        // Priority order for variant selection
        const priorities = {
          'color': 1,
          'size': 2, 
          'style': 3,
          'material': 4,
          'finish': 5,
          'pattern': 6,
          'fit': 7,
          'variant': 8
        };
        
        return priorities[groupType] || 9;
      }

      function deduplicateAndSortGroups(groups) {
        // Remove duplicates based on similar selectors/labels
        const uniqueGroups = [];
        const seenSelectors = new Set();
        
        groups.forEach(group => {
          if (!seenSelectors.has(group.selector)) {
            seenSelectors.add(group.selector);
            uniqueGroups.push(group);
          }
        });
        
        // Sort by priority (color first, then size, etc.)
        return uniqueGroups.sort((a, b) => a.priority - b.priority);
      }

      function getElementSelector(element) {
        if (element.id) return `#${CSS.escape(element.id)}`;
        if (element.className) {
          const firstClass = element.className.split(' ')[0];
          return `.${CSS.escape(firstClass)}`;
        }
        return element.tagName.toLowerCase();
      }
    });
  }

  /**
   * Extract variants using systematic selection approach
   */
  async extractVariantsSystematically(page) {
    const variants = [];
    const totalCombinations = this.calculateTotalCombinations();
    
    console.log('🔄 Starting systematic variant extraction', {
      groups: this.variantGroups.length,
      totalCombinations: Math.min(totalCombinations, this.options.maxVariantCombinations)
    });

    // Strategy: Select first option in first group, then iterate through all options in subsequent groups
    if (this.variantGroups.length === 0) return variants;

    const firstGroup = this.variantGroups[0];
    const remainingGroups = this.variantGroups.slice(1);

    // Select first option in first group
    for (const firstOption of firstGroup.options.slice(0, 3)) { // Limit first group to 3 options
      console.log(`🎯 Selecting first group option: ${firstOption.label}`);
      
      // Select the first option
      await this.selectVariantOption(page, firstGroup, firstOption);
      await this.waitForStateChange(page);

      if (remainingGroups.length === 0) {
        // Only one group - capture this variant
        const variant = await this.captureVariantData(page, [firstOption]);
        variants.push(variant);
      } else {
        // Iterate through all combinations of remaining groups
        const remainingCombinations = await this.generateCombinations(remainingGroups);
        
        for (const combination of remainingCombinations.slice(0, this.options.maxVariantCombinations)) {
          try {
            console.log(`🔍 Testing combination: ${[firstOption, ...combination].map(o => o.label).join(' + ')}`);
            
            // Select each option in the combination
            for (let i = 0; i < combination.length; i++) {
              const group = remainingGroups[i];
              const option = combination[i];
              
              await this.selectVariantOption(page, group, option);
              await this.waitForStateChange(page);
            }

            // Capture variant data for this combination
            const variant = await this.captureVariantData(page, [firstOption, ...combination]);
            variants.push(variant);

            // Check if we should stop (too many variants or time limit)
            if (variants.length >= this.options.maxVariantCombinations) {
              console.log('⚠️ Reached maximum variant limit');
              break;
            }

          } catch (error) {
            console.warn('⚠️ Failed to extract variant combination', {
              combination: combination.map(o => o.label),
              error: error.message
            });
          }
        }
      }

      // Break if we have enough variants
      if (variants.length >= this.options.maxVariantCombinations) break;
    }

    console.log('✅ Systematic extraction complete', {
      variantsExtracted: variants.length,
      availableVariants: variants.filter(v => v.available).length,
      unavailableVariants: variants.filter(v => !v.available).length
    });

    return variants;
  }

  /**
   * Select a specific variant option
   */
  async selectVariantOption(page, group, option) {
    try {
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

      console.log(`✓ Selected ${group.type}: ${option.label}`);
      
    } catch (error) {
      console.warn(`⚠️ Failed to select option ${option.label}:`, error.message);
      throw error;
    }
  }

  /**
   * Wait for page state to change after variant selection
   */
  async waitForStateChange(page) {
    await page.waitForTimeout(this.options.selectionDelay);
    
    // Wait for any loading indicators to disappear
    try {
      await page.waitForSelector('.loading, .spinner, [data-loading]', { 
        state: 'hidden', 
        timeout: 3000 
      });
    } catch (e) {
      // No loading indicators found, continue
    }
    
    await page.waitForTimeout(this.options.stateCheckDelay);
  }

  /**
   * Capture comprehensive variant data including availability
   */
  async captureVariantData(page, selectedOptions) {
    const variantData = await page.evaluate((options, captureOptions) => {
      const variant = {
        id: options.map(o => o.id).join('_'),
        options: options.map(o => ({
          type: o.groupType,
          value: o.value,
          label: o.label
        })),
        available: true,
        availabilityReason: null,
        
        // Product data
        price: null,
        comparePrice: null,
        sku: null,
        images: [],
        
        // Availability indicators
        addToCartState: null,
        stockMessage: null,
        
        // Timestamps
        extractedAt: new Date().toISOString()
      };

      // Check add to cart button state
      const addToCartSelectors = [
        'button[name="add"]',
        '.add-to-cart',
        '.add-to-bag', 
        '[data-add-to-cart]',
        'button[type="submit"][name*="add"]',
        '.btn-add-to-cart',
        '.product-form__cart-submit'
      ];

      let addToCartButton = null;
      for (const selector of addToCartSelectors) {
        addToCartButton = document.querySelector(selector);
        if (addToCartButton) break;
      }

      if (addToCartButton) {
        const isDisabled = addToCartButton.disabled || 
                          addToCartButton.classList.contains('disabled') ||
                          addToCartButton.getAttribute('aria-disabled') === 'true';
        
        variant.addToCartState = {
          found: true,
          enabled: !isDisabled,
          text: addToCartButton.textContent.trim(),
          selector: this.getElementSelector(addToCartButton)
        };
        
        // If button is disabled, product is likely unavailable
        if (isDisabled) {
          variant.available = false;
          variant.availabilityReason = 'add-to-cart-disabled';
        }
      } else {
        variant.addToCartState = { found: false };
      }

      // Check for stock/availability messages
      const stockMessageSelectors = [
        '.stock-message',
        '.availability-message',
        '.product-availability',
        '[data-stock-message]',
        '.out-of-stock',
        '.in-stock',
        '.inventory-message'
      ];

      for (const selector of stockMessageSelectors) {
        const messageEl = document.querySelector(selector);
        if (messageEl && messageEl.textContent.trim()) {
          const message = messageEl.textContent.trim().toLowerCase();
          variant.stockMessage = messageEl.textContent.trim();
          
          // Check for out of stock indicators
          if (message.includes('out of stock') || 
              message.includes('unavailable') ||
              message.includes('sold out') ||
              message.includes('not available')) {
            variant.available = false;
            variant.availabilityReason = 'stock-message';
          }
          break;
        }
      }

      // Extract price information
      if (captureOptions.capturePrice) {
        const priceSelectors = [
          '.price',
          '.product-price',
          '[data-price]',
          '.current-price',
          '.sale-price'
        ];

        for (const selector of priceSelectors) {
          const priceEl = document.querySelector(selector);
          if (priceEl && priceEl.textContent.trim()) {
            variant.price = priceEl.textContent.trim();
            break;
          }
        }

        // Compare/original price
        const comparePriceSelectors = [
          '.compare-price',
          '.original-price',
          '.was-price',
          '.regular-price'
        ];

        for (const selector of comparePriceSelectors) {
          const comparePriceEl = document.querySelector(selector);
          if (comparePriceEl && comparePriceEl.textContent.trim()) {
            variant.comparePrice = comparePriceEl.textContent.trim();
            break;
          }
        }
      }

      // Extract SKU
      if (captureOptions.captureSKU) {
        const skuSelectors = [
          '[data-sku]',
          '.sku',
          '.product-sku',
          '.variant-sku'
        ];

        for (const selector of skuSelectors) {
          const skuEl = document.querySelector(selector);
          if (skuEl) {
            variant.sku = skuEl.textContent.trim() || skuEl.dataset.sku;
            if (variant.sku) break;
          }
        }
      }

      // Extract images
      if (captureOptions.captureImages) {
        const imageSelectors = [
          '.product-image img',
          '.variant-image img',
          '.main-image img',
          '.product-photo img'
        ];

        const images = [];
        for (const selector of imageSelectors) {
          const imgElements = document.querySelectorAll(selector);
          imgElements.forEach(img => {
            if (img.src && !images.includes(img.src)) {
              images.push(img.src);
            }
            if (img.dataset.src && !images.includes(img.dataset.src)) {
              images.push(img.dataset.src);
            }
          });
        }
        variant.images = images.slice(0, 5); // Limit to 5 images
      }

      return variant;

      function getElementSelector(element) {
        if (element.id) return `#${CSS.escape(element.id)}`;
        if (element.className) {
          const firstClass = element.className.split(' ')[0];
          return `.${CSS.escape(firstClass)}`;
        }
        return element.tagName.toLowerCase();
      }
    }, selectedOptions, this.options);

    return variantData;
  }

  /**
   * Generate all possible combinations of remaining groups
   */
  async generateCombinations(groups) {
    if (groups.length === 0) return [[]];
    if (groups.length === 1) return groups[0].options.map(option => [option]);

    const combinations = [];
    const firstGroup = groups[0];
    const remainingGroups = groups.slice(1);
    
    for (const option of firstGroup.options) {
      const subCombinations = await this.generateCombinations(remainingGroups);
      for (const subCombination of subCombinations) {
        combinations.push([option, ...subCombination]);
      }
    }

    return combinations;
  }

  /**
   * Calculate total possible combinations
   */
  calculateTotalCombinations() {
    return this.variantGroups.reduce((total, group) => total * group.options.length, 1);
  }

  /**
   * Capture baseline page state
   */
  async capturePageState(page, stateName) {
    return await page.evaluate((name) => {
      return {
        name: name,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        
        // Add to cart button state
        addToCartButton: (() => {
          const button = document.querySelector('button[name="add"], .add-to-cart, .add-to-bag');
          if (button) {
            return {
              text: button.textContent.trim(),
              disabled: button.disabled,
              classes: button.className
            };
          }
          return null;
        })(),
        
        // Stock messages
        stockMessages: Array.from(document.querySelectorAll('.stock-message, .availability-message, .out-of-stock, .in-stock'))
          .map(el => el.textContent.trim())
          .filter(Boolean),
        
        // Price
        price: (() => {
          const priceEl = document.querySelector('.price, .product-price, [data-price]');
          return priceEl ? priceEl.textContent.trim() : null;
        })()
      };
    }, stateName);
  }

  /**
   * Wait for page to stabilize after load
   */
  async waitForPageStabilization(page) {
    // Wait for initial load
    await page.waitForTimeout(2000);
    
    // Wait for any lazy loading to complete
    try {
      await page.waitForSelector('.product-form, .product-options, .variant-selector', { 
        timeout: 10000 
      });
    } catch (e) {
      // Continue if no variant selectors found
    }
    
    // Wait for images to load
    await page.waitForTimeout(1000);
  }

  /**
   * Enhance variant data with additional analysis
   */
  async enhanceVariantData(variants, page) {
    // Add availability analysis
    const availableCount = variants.filter(v => v.available).length;
    const unavailableCount = variants.length - availableCount;
    
    // Add price analysis
    const prices = variants.map(v => v.price).filter(Boolean);
    const uniquePrices = [...new Set(prices)];
    
    // Enhance each variant
    return variants.map((variant, index) => ({
      ...variant,
      index: index,
      availabilityStats: {
        totalVariants: variants.length,
        availableVariants: availableCount,
        unavailableVariants: unavailableCount,
        availabilityRate: availableCount / variants.length
      },
      priceStats: {
        uniquePrices: uniquePrices.length,
        hasPriceVariation: uniquePrices.length > 1
      }
    }));
  }

  /**
   * Generate extraction statistics
   */
  generateExtractionStats() {
    return {
      totalGroups: this.variantGroups.length,
      totalOptions: this.variantGroups.reduce((sum, group) => sum + group.options.length, 0),
      maxPossibleCombinations: this.calculateTotalCombinations(),
      extractedVariants: this.extractedVariants.length,
      extractionEfficiency: this.extractedVariants.length / Math.min(this.calculateTotalCombinations(), this.options.maxVariantCombinations)
    };
  }

  /**
   * Fallback extraction for when systematic approach fails
   */
  async fallbackExtraction(page, productUrl) {
    console.log('🔄 Using fallback extraction method');
    
    try {
      const singleProduct = await this.extractSingleProductData(page);
      return {
        hasVariants: false,
        variants: [singleProduct],
        totalVariants: 1,
        extractionMethod: 'fallback-single',
        error: 'Systematic extraction failed'
      };
    } catch (error) {
      return {
        hasVariants: false,
        variants: [],
        totalVariants: 0,
        extractionMethod: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Extract single product data (no variants)
   */
  async extractSingleProductData(page) {
    return await page.evaluate(() => {
      return {
        id: 'single_product',
        options: [],
        available: true,
        availabilityReason: null,
        
        price: (() => {
          const priceEl = document.querySelector('.price, .product-price, [data-price]');
          return priceEl ? priceEl.textContent.trim() : null;
        })(),
        
        sku: (() => {
          const skuEl = document.querySelector('[data-sku], .sku, .product-sku');
          return skuEl ? (skuEl.textContent.trim() || skuEl.dataset.sku) : null;
        })(),
        
        images: Array.from(document.querySelectorAll('.product-image img, .main-image img'))
          .map(img => img.src || img.dataset.src)
          .filter(Boolean)
          .slice(0, 5),
        
        addToCartState: (() => {
          const button = document.querySelector('button[name="add"], .add-to-cart, .add-to-bag');
          if (button) {
            return {
              found: true,
              enabled: !button.disabled,
              text: button.textContent.trim()
            };
          }
          return { found: false };
        })(),
        
        extractedAt: new Date().toISOString()
      };
    });
  }
}

module.exports = ProductVariantExtractor;
```

---

## **USAGE EXAMPLE**

```javascript
// Example usage of the ProductVariantExtractor
const ProductVariantExtractor = require('./ProductVariantExtractor');

async function extractProductVariants(page, productUrl) {
  const extractor = new ProductVariantExtractor({
    maxVariantCombinations: 50,
    selectionDelay: 1500,
    stateCheckDelay: 800,
    captureImages: true,
    capturePrice: true,
    captureSKU: true
  });

  const result = await extractor.extractAllVariants(page, productUrl);
  
  console.log('Extraction Results:', {
    hasVariants: result.hasVariants,
    totalVariants: result.totalVariants,
    availableVariants: result.variants.filter(v => v.available).length,
    extractionMethod: result.extractionMethod
  });

  // Process variants
  result.variants.forEach((variant, index) => {
    console.log(`Variant ${index + 1}:`, {
      options: variant.options.map(o => `${o.type}: ${o.label}`).join(', '),
      available: variant.available,
      price: variant.price,
      reason: variant.availabilityReason
    });
  });

  return result;
}
```

---

## **KEY FEATURES**

### **🎯 Systematic Selection Strategy**
- Selects first option in first variant group (e.g., first color)
- Iterates through ALL options in subsequent groups (all sizes for that color)
- Captures availability state for each combination

### **🔍 Comprehensive Availability Detection**
- **Add to Cart Button**: Monitors enabled/disabled state and text changes
- **Stock Messages**: Detects "out of stock", "unavailable", "sold out" messages
- **UI State Changes**: Tracks visual indicators of availability

### **📊 Intelligent Variant Identification**
- **Multiple Patterns**: Supports radio buttons, dropdowns, button swatches, links
- **Smart Grouping**: Automatically groups related options (color, size, style)
- **Priority Ordering**: Processes color first, then size, then other attributes

### **⚡ Performance Optimizations**
- **Configurable Limits**: Maximum combinations to prevent infinite loops
- **Smart Delays**: Waits for page state changes after selections
- **Fallback Handling**: Graceful degradation when systematic approach fails

### **📈 Rich Data Capture**
- **Variant-Specific Data**: Price, SKU, images for each combination
- **Availability Reasons**: Why a variant is unavailable
- **Extraction Stats**: Success rates and efficiency metrics

This prototype provides a robust foundation for comprehensive variant extraction that can handle complex e-commerce sites with multiple variant types and availability states.