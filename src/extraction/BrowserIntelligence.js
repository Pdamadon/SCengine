/**
 * BrowserIntelligence
 * 
 * Executes intelligent selector discovery INSIDE the browser context
 * where it has access to the real DOM, computed styles, and element properties.
 * 
 * Features human-like interaction patterns to avoid bot detection:
 * - Random mouse movements and clicks
 * - Realistic scrolling behavior
 * - Variable timing delays
 * - User-agent rotation
 * - Cookie and session handling
 * 
 * Enhanced with Redis-MongoDB selector persistence for learning across sessions.
 */

const SelectorCacheSingleton = require('../cache/SelectorCacheSingleton');

class BrowserIntelligence {
  constructor(logger) {
    this.logger = logger;
    
    // Use singleton cache for shared persistence across all components
    this.selectorCache = SelectorCacheSingleton.getInstance();
    this.cacheInitialized = false;
    
    // Human behavior simulation config
    this.humanConfig = {
      minDelay: 100,        // Minimum delay between actions (ms)
      maxDelay: 2000,       // Maximum delay between actions (ms)
      scrollSpeed: 300,     // Pixels per scroll step
      mouseSpeed: 100,      // Mouse movement speed
      clickDelay: 50,       // Delay before/after clicks
      readingTime: 1500,    // Time to "read" content
      hoverChance: 0.3,     // Probability to hover before clicking
      scrollChance: 0.7,    // Probability to scroll during analysis
      randomMoveChance: 0.4 // Probability for random mouse movements
    };
    
    // Realistic user agents for rotation
    this.userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0'
    ];
  }

  /**
   * Initialize the selector learning cache
   */
  async initialize() {
    if (!this.cacheInitialized) {
      await this.selectorCache.initialize(this.logger);
      this.cacheInitialized = true;
      this.logger?.info('BrowserIntelligence initialized with singleton selector learning cache');
    }
  }

  /**
   * Initialize page with human-like behavior patterns
   */
  async setupHumanBehavior(page) {
    // Set random user agent
    const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    await page.setExtraHTTPHeaders({ 'User-Agent': userAgent });
    
    // Set realistic viewport size
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1536, height: 864 }
    ];
    const viewport = viewports[Math.floor(Math.random() * viewports.length)];
    await page.setViewportSize(viewport);
    
    // Set realistic headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0'
    });
    
    // Inject anti-detection scripts
    await page.addInitScript(() => {
      // Remove webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      
      // Mock permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      
      // Mock chrome runtime
      if (!window.chrome) {
        window.chrome = {};
      }
      if (!window.chrome.runtime) {
        window.chrome.runtime = {};
      }
      
      // Hide automation indicators
      Object.defineProperty(window, 'outerHeight', {
        get: () => window.innerHeight,
      });
      Object.defineProperty(window, 'outerWidth', {
        get: () => window.innerWidth,
      });
    });
    
    this.logger?.debug('Initialized human behavior patterns', { userAgent, viewport });
  }

  /**
   * Simulate human-like delay with random variation
   */
  async humanDelay(baseMs = null) {
    const min = baseMs || this.humanConfig.minDelay;
    const max = baseMs ? baseMs * 2 : this.humanConfig.maxDelay;
    const delay = Math.random() * (max - min) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Simulate realistic mouse movement to element
   */
  async humanMouseMove(page, element) {
    if (Math.random() > this.humanConfig.randomMoveChance) return;
    
    try {
      const box = await element.boundingBox();
      if (!box) return;
      
      // Random point within element
      const x = box.x + Math.random() * box.width;
      const y = box.y + Math.random() * box.height;
      
      // Move mouse with realistic speed
      await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 5 });
      await this.humanDelay(50);
    } catch (error) {
      // Ignore mouse movement errors
    }
  }

  /**
   * Simulate human-like hover behavior
   */
  async humanHover(page, element) {
    if (Math.random() > this.humanConfig.hoverChance) return;
    
    try {
      await this.humanMouseMove(page, element);
      await element.hover();
      await this.humanDelay(200);
    } catch (error) {
      // Ignore hover errors
    }
  }

  /**
   * Simulate human-like clicking with pre/post delays and timeout protection
   */
  async humanClick(page, element, timeout = 5000) {
    try {
      await this.humanHover(page, element);
      await this.humanDelay(this.humanConfig.clickDelay);
      
      // Add timeout protection to prevent hanging
      await Promise.race([
        element.click(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Click timeout')), timeout)
        )
      ]);
      
      await this.humanDelay(this.humanConfig.clickDelay);
      this.logger?.debug('Performed human-like click');
    } catch (error) {
      this.logger?.debug('Click failed:', error.message);
    }
  }

  /**
   * Simulate natural scrolling behavior while analyzing page
   */
  async humanScroll(page, direction = 'down', amount = null) {
    if (Math.random() > this.humanConfig.scrollChance) return;
    
    const scrollAmount = amount || this.humanConfig.scrollSpeed;
    const steps = Math.floor(Math.random() * 3) + 2; // 2-4 scroll steps
    
    try {
      for (let i = 0; i < steps; i++) {
        const delta = direction === 'down' ? scrollAmount : -scrollAmount;
        await page.mouse.wheel(0, delta);
        await this.humanDelay(100);
      }
      
      // Small delay to let content load
      await this.humanDelay(500);
      this.logger?.debug(`Performed human-like scroll ${direction}`);
    } catch (error) {
      // Ignore scroll errors
    }
  }

  /**
   * Find and select the first available variant on the page
   * This is needed to enable "Add to Cart" buttons that depend on variant selection
   */
  async selectFirstAvailableVariant(page) {
    try {
      this.logger?.debug('🎯 VARIANT SELECTION START: Looking for variant selectors to enable availability button');
      
      // Use enhanced variant discovery first
      try {
        this.logger?.debug('   🔍 Attempting enhanced variant discovery...');
        const variantGroups = await this.discoverVariantGroups(page);
        
        if (variantGroups.length > 0) {
          this.logger?.debug(`   ✅ Found ${variantGroups.length} variant groups via enhanced discovery`);
          
          // Log details of each group found
          variantGroups.forEach((group, i) => {
            this.logger?.debug(`     Group ${i + 1}: ${group.variantType || 'unknown'} (${group.optionCount} options) - ${group.selector}`);
          });
          
          // Use the new sweep system for variant testing
          this.logger?.debug('   🚀 Using sweep system for variant testing...');
          const sweepResults = await this.sweepAllVariants(page, { 
            maxCombinations: 3, 
            timeout: 10000 
          });
          if (sweepResults && sweepResults.combinations?.length > 0) {
            this.logger?.debug(`   ✅ Successfully found ${sweepResults.combinations.length} working combinations via sweep system`);
            return true;
          } else {
            this.logger?.debug(`   ❌ Exhaustive testing found no working combinations`);
          }
          
          // Fallback to selecting from individual groups
          this.logger?.debug('   🔄 Fallback: Trying individual group selection...');
          for (const group of variantGroups.slice(0, 3)) { // Try top 3 groups
            try {
              this.logger?.debug(`     Testing group: ${group.variantType || 'unknown'} (${group.selector})`);
              const elements = await page.$$(group.selector);
              this.logger?.debug(`     Found ${elements.length} elements for group`);
              
              if (elements.length > 0) {
                this.logger?.debug(`     Attempting to select first element...`);
                await this.selectVariantElement(page, elements[0], group.type);
                this.logger?.debug(`     ✅ Selected variant from enhanced group: ${group.variantType} (${group.discoveryMethod})`);
                return true;
              }
            } catch (error) {
              this.logger?.debug(`     ❌ Failed to select from group ${group.selector}: ${error.message}`);
              continue;
            }
          }
          
          this.logger?.debug('   ❌ All enhanced group selections failed');
        } else {
          this.logger?.debug('   ❌ Enhanced variant discovery found no groups');
        }
      } catch (error) {
        this.logger?.debug(`   ❌ Enhanced variant discovery failed: ${error.message}`);
      }
      
      // Fallback to traditional hardcoded selectors
      this.logger?.debug('Falling back to traditional variant selection');
      const variantSelectors = [
        'select[name*="option"]',
        'select[name*="size"]', 
        'select[name*="color"]',
        'select.product-form__input',
        'select[data-option]',
        'input[type="radio"][name*="option"]',
        'input[type="radio"][name*="size"]',
        'input[type="radio"][name*="color"]',
        '.swatch input[type="radio"]'
      ];

      for (const selector of variantSelectors) {
        try {
          const elements = await page.$$(selector);
          if (elements.length === 0) continue;

          const element = elements[0];
          const tagName = await element.evaluate(el => el.tagName.toLowerCase());
          
          if (tagName === 'select') {
            // For select elements, choose the first non-placeholder option
            const options = await element.$$('option');
            if (options.length > 1) {
              // Skip the first option if it's a placeholder (empty value)
              const firstOption = await options[0].evaluate(opt => ({ value: opt.value, text: opt.textContent }));
              const optionIndex = (!firstOption.value || firstOption.text.includes('Select') || firstOption.text.includes('Choose')) ? 1 : 0;
              
              if (options.length > optionIndex) {
                await element.selectOption({ index: optionIndex });
                this.logger?.debug(`Selected variant option ${optionIndex} from select`);
                await this.humanDelay(500);
                return true;
              }
            }
          } else if (element.evaluate && await element.evaluate(el => el.type === 'radio')) {
            // For radio buttons, click the first one
            const isChecked = await element.isChecked();
            if (!isChecked) {
              await this.humanClick(page, element);
              this.logger?.debug('Selected first radio variant');
              return true;
            }
          }
        } catch (error) {
          this.logger?.debug(`Failed to select variant with selector ${selector}:`, error.message);
          continue;
        }
      }
      
      this.logger?.debug('No variant selectors found or all failed');
      return false;
    } catch (error) {
      this.logger?.debug('selectFirstAvailableVariant failed:', error.message);
      return false;
    }
  }

  /**
   * Select variant combination (color + size) for multi-variant products
   */
  async selectVariantCombination(page) {
    try {
      this.logger?.debug('Attempting variant combination selection');
      
      let colorSelected = false;
      let sizeSelected = false;
      
      // 1. Try to select a color first
      colorSelected = await this.selectColorVariant(page);
      
      if (colorSelected) {
        // Wait for page to update (size options might change based on color)
        await this.humanDelay(800);
      }
      
      // 2. Try to select a size
      sizeSelected = await this.selectSizeVariant(page);
      
      if (sizeSelected) {
        await this.humanDelay(500);
      }
      
      // 3. Verify combination enables Add to Cart
      const buttonEnabled = await this.checkAvailabilityButton(page);
      
      const success = (colorSelected || sizeSelected) && buttonEnabled;
      this.logger?.debug(`Variant combination: color=${colorSelected}, size=${sizeSelected}, buttonEnabled=${buttonEnabled}, success=${success}`);
      
      return success;
    } catch (error) {
      this.logger?.debug('selectVariantCombination failed:', error.message);
      return false;
    }
  }

  /**
   * Select the first available color variant
   */
  async selectColorVariant(page) {
    try {
      const colorSelectors = [
        '.color-swatch:not(.disabled)',
        '[data-color]:not(.disabled)', 
        'button[class*="color"]:not(:disabled)',
        '.swatch:not(.disabled)',
        'select[name*="color" i]',
        'input[type="radio"][name*="color" i]:not(:disabled)'
      ];

      for (const selector of colorSelectors) {
        try {
          const elements = await page.$$(selector);
          if (elements.length === 0) continue;

          const element = elements[0];
          const tagName = await element.evaluate(el => el.tagName.toLowerCase());
          
          if (tagName === 'select') {
            const options = await element.$$('option');
            if (options.length > 1) {
              await element.selectOption({ index: 1 });
              this.logger?.debug('Selected color from dropdown');
              return true;
            }
          } else {
            // For buttons/swatches/radios
            await this.humanClick(page, element);
            this.logger?.debug(`Selected color variant: ${selector}`);
            return true;
          }
        } catch (error) {
          continue;
        }
      }
      
      return false;
    } catch (error) {
      this.logger?.debug('selectColorVariant failed:', error.message);
      return false;
    }
  }

  /**
   * Select the first available size variant
   */
  async selectSizeVariant(page) {
    try {
      const sizeSelectors = [
        'select[name*="size" i]:not(:disabled)',
        'button[class*="size"]:not(.disabled):not(:disabled)',
        '[data-size]:not(.disabled)',
        'input[type="radio"][name*="size" i]:not(:disabled)',
        '.size-selector:not(.disabled)'
      ];

      for (const selector of sizeSelectors) {
        try {
          const elements = await page.$$(selector);
          if (elements.length === 0) continue;

          const element = elements[0];
          const tagName = await element.evaluate(el => el.tagName.toLowerCase());
          
          if (tagName === 'select') {
            const options = await element.$$('option');
            if (options.length > 1) {
              await element.selectOption({ index: 1 });
              this.logger?.debug('Selected size from dropdown');
              return true;
            }
          } else {
            // For buttons/radios
            await this.humanClick(page, element);
            this.logger?.debug(`Selected size variant: ${selector}`);
            return true;
          }
        } catch (error) {
          continue;
        }
      }
      
      return false;
    } catch (error) {
      this.logger?.debug('selectSizeVariant failed:', error.message);
      return false;
    }
  }

  /**
   * Check if availability/Add to Cart button is enabled
   */
  async checkAvailabilityButton(page) {
    try {
      const buttonSelectors = [
        'button[class*="add"]:not([class*="disabled"])',
        '[class*="add-to-cart"]:not(.disabled)',
        '[class*="add-to-bag"]:not(.disabled)',
        'button[type="submit"]:not(:disabled)'
      ];

      for (const selector of buttonSelectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            const isEnabled = await button.evaluate(el => !el.disabled && !el.classList.contains('disabled'));
            if (isEnabled) {
              this.logger?.debug(`Found enabled availability button: ${selector}`);
              return true;
            }
          }
        } catch (error) {
          continue;
        }
      }
      
      return false;
    } catch (error) {
      this.logger?.debug('checkAvailabilityButton failed:', error.message);
      return false;
    }
  }

  /**
   * Test variant combinations to understand dependencies and availability
   */
  async testVariantCombinations(page, variantGroups, options = {}) {
    try {
      const { exhaustive = false, maxTestsPerGroup = 2 } = options;
      
      if (exhaustive) {
        this.logger?.debug('🔥 EXHAUSTIVE VARIANT TESTING - Testing all options in all groups');
      } else {
        this.logger?.debug(`🎯 QUICK VARIANT TESTING - Testing max ${maxTestsPerGroup} options per group`);
      }
      
      const results = {
        combinations: [],
        dependencies: false,
        availableCombinations: [],
        groupTests: [],
        singleOptionTests: []
      };
      
      // Get initial button state
      const initialButtonState = await this.checkAvailabilityButton(page);
      this.logger?.debug(`Initial button state: ${initialButtonState ? 'enabled' : 'disabled'}`);
      
      // Step 1: Test each individual option in each group
      for (let groupIndex = 0; groupIndex < variantGroups.length; groupIndex++) {
        const group = variantGroups[groupIndex];
        this.logger?.debug(`\n🎯 Testing Group ${groupIndex + 1}: ${group.variantType || 'unknown'} (${group.optionCount} options)`);
        this.logger?.debug(`   Selector: ${group.selector}`);
        
        const groupElements = await page.$$(group.selector);
        this.logger?.debug(`   Found ${groupElements.length} actual elements`);
        
        const groupTest = {
          groupIndex,
          groupType: group.variantType || 'unknown',
          selector: group.selector,
          optionTests: []
        };
        
        // Test options in this group (limited by maxTestsPerGroup unless exhaustive)
        const optionsToTest = exhaustive ? groupElements.length : Math.min(maxTestsPerGroup, groupElements.length);
        for (let optionIndex = 0; optionIndex < optionsToTest; optionIndex++) {
          const element = groupElements[optionIndex];
          
          try {
            this.logger?.debug(`   Testing option ${optionIndex + 1}/${optionsToTest} (of ${groupElements.length} total)`);
            
            // Get option details before clicking
            const optionValue = await this.getVariantValue(element, group.type);
            const isVisible = await element.isVisible();
            const isEnabled = await element.evaluate(el => !el.disabled && !el.classList.contains('disabled'));
            
            this.logger?.debug(`     Value: "${optionValue}" | Visible: ${isVisible} | Enabled: ${isEnabled}`);
            
            if (!isVisible || !isEnabled) {
              this.logger?.debug(`     ⏭️ Skipping disabled/hidden option`);
              continue;
            }
            
            // Click the option with timeout protection
            try {
              await Promise.race([
                this.selectVariantElement(page, element, group.type),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Click timeout')), 3000))
              ]);
              await this.humanDelay(500); // Wait for page updates
            } catch (error) {
              this.logger?.debug(`     Click failed: ${error.message}`);
              // Continue to next option instead of failing
            }
            
            // Check button state after selecting this option
            const buttonStateAfter = await this.checkAvailabilityButton(page);
            
            const optionTest = {
              optionIndex,
              optionValue,
              buttonEnabledAfter: buttonStateAfter
            };
            
            groupTest.optionTests.push(optionTest);
            results.singleOptionTests.push({
              groupIndex,
              groupType: group.variantType || 'unknown',
              ...optionTest
            });
            
            this.logger?.debug(`     Result: Button ${buttonStateAfter ? '✅ ENABLED' : '❌ disabled'} after selecting "${optionValue}"`);
            
          } catch (error) {
            this.logger?.debug(`     ❌ Failed to test option ${optionIndex}: ${error.message}`);
            continue;
          }
        }
        
        results.groupTests.push(groupTest);
      }
      
      // Step 2: Test combinations if we have multiple groups
      if (variantGroups.length >= 2) {
        this.logger?.debug(`\n🔄 Testing combinations between groups...`);
        
        // Take top 2 groups for combination testing
        const group1 = variantGroups[0];
        const group2 = variantGroups[1];
        
        this.logger?.debug(`Combination testing: ${group1.variantType || 'Group1'} x ${group2.variantType || 'Group2'}`);
        
        const group1Elements = await page.$$(group1.selector);
        const group2Elements = await page.$$(group2.selector);
        
        // Test ALL combinations (exhaustive)
        for (let i = 0; i < group1Elements.length; i++) {
          const group1Element = group1Elements[i];
          
          try {
            // Select from Group 1
            const group1Value = await this.getVariantValue(group1Element, group1.type);
            this.logger?.debug(`  Selecting ${group1.variantType || 'Group1'}: "${group1Value}"`);
            
            await this.selectVariantElement(page, group1Element, group1.type);
            await this.humanDelay(800);
            
            // Test with ALL options in Group 2
            for (let j = 0; j < group2Elements.length; j++) {
              const group2Element = group2Elements[j];
              
              try {
                const group2Value = await this.getVariantValue(group2Element, group2.type);
                this.logger?.debug(`    + ${group2.variantType || 'Group2'}: "${group2Value}"`);
                
                // Select from Group 2
                await this.selectVariantElement(page, group2Element, group2.type);
                await this.humanDelay(500);
                
                // Check button state after combination
                const combinationState = await this.checkAvailabilityButton(page);
                
                const combination = {
                  group1Index: i,
                  group2Index: j,
                  group1Value,
                  group2Value,
                  enabled: combinationState,
                  group1Type: group1.variantType || 'unknown',
                  group2Type: group2.variantType || 'unknown'
                };
                
                results.combinations.push(combination);
                
                if (combinationState) {
                  results.availableCombinations.push(combination);
                  this.logger?.debug(`      ✅ AVAILABLE: "${group1Value}" + "${group2Value}"`);
                } else {
                  this.logger?.debug(`      ❌ Not available: "${group1Value}" + "${group2Value}"`);
                }
                
              } catch (error) {
                this.logger?.debug(`    ❌ Failed combination ${i},${j}: ${error.message}`);
                continue;
              }
            }
          } catch (error) {
            this.logger?.debug(`  ❌ Failed to select from Group 1 element ${i}: ${error.message}`);
            continue;
          }
        }
      }
      
      // Summary
      this.logger?.debug(`\n📊 EXHAUSTIVE TEST RESULTS:`);
      this.logger?.debug(`   Groups tested: ${results.groupTests.length}`);
      this.logger?.debug(`   Individual options tested: ${results.singleOptionTests.length}`);
      this.logger?.debug(`   Combinations tested: ${results.combinations.length}`);
      this.logger?.debug(`   Available combinations: ${results.availableCombinations.length}`);
      
      // Determine dependencies
      if (results.combinations.length > 0) {
        results.dependencies = results.availableCombinations.length < results.combinations.length;
        this.logger?.debug(`   Dependencies detected: ${results.dependencies ? 'YES' : 'NO'}`);
      }
      
      return results;
      
    } catch (error) {
      this.logger?.error('Exhaustive variant testing failed:', error.message);
      return { combinations: [], dependencies: false, availableCombinations: [], groupTests: [], singleOptionTests: [] };
    }
  }

  /**
   * Select a variant element based on its type (non-intrusive)
   */
  async selectVariantElement(page, element, type) {
    // First check if this is actually a variant button vs an action button
    const isActionButton = await element.evaluate(el => {
      const text = (el.textContent || '').toLowerCase();
      const classes = (el.className || '').toLowerCase();
      
      // Skip buttons that are clearly action buttons
      const actionKeywords = ['add', 'cart', 'bag', 'buy', 'purchase', 'checkout', 'submit'];
      return actionKeywords.some(keyword => text.includes(keyword) || classes.includes(keyword));
    });
    
    if (isActionButton) {
      this.logger?.debug('Skipping action button (add-to-cart/buy/etc)');
      return;
    }
    
    switch (type) {
      case 'dropdown':
        // For select elements
        const options = await element.$$('option');
        if (options.length > 1) {
          await element.selectOption({ index: 1 });
        }
        break;
      case 'radio':
        // For radio buttons
        if (!(await element.isChecked())) {
          await this.humanClick(page, element);
        }
        break;
      default:
        // For buttons, divs, etc. - but only if they're variant buttons
        const isVariantButton = await element.evaluate(el => {
          const text = (el.textContent || '').toLowerCase();
          const classes = (el.className || '').toLowerCase();
          const parent = el.parentElement;
          const parentClasses = (parent?.className || '').toLowerCase();
          const parentId = (parent?.id || '').toLowerCase();
          
          // Check if this looks like a variant button
          const variantIndicators = [
            'swatch', 'color', 'size', 'variant', 'option', 'choice',
            // Text patterns for variants
            /^[a-z]{1,2}$|^\d+$|^(xs|s|m|l|xl|xxl)$/i.test(text),
            // Parent container suggests variants
            parentClasses.includes('color') || parentClasses.includes('size') ||
            parentId.includes('color') || parentId.includes('size')
          ];
          
          return variantIndicators.some(indicator => 
            typeof indicator === 'boolean' ? indicator :
            text.includes(indicator) || classes.includes(indicator)
          );
        });
        
        if (isVariantButton) {
          await this.humanClick(page, element);
        } else {
          this.logger?.debug('Skipping non-variant button');
        }
        break;
    }
  }

  /**
   * Get the value/label of a variant element
   */
  async getVariantValue(element, type) {
    try {
      switch (type) {
        case 'dropdown':
          return await element.evaluate(el => el.selectedOptions[0]?.textContent || el.value);
        case 'radio':
          return await element.evaluate(el => el.value || el.getAttribute('data-value') || el.id);
        default:
          return await element.evaluate(el => 
            el.textContent?.trim() || 
            el.getAttribute('data-value') || 
            el.getAttribute('title') ||
            el.className.split(' ')[0]
          );
      }
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Enhanced variant discovery combining multiple approaches:
   * 1. Label-driven discovery (primary)
   * 2. Structural clustering (fallback)
   * 3. Accessibility patterns
   * 4. Data attribute patterns
   */
  async discoverVariantGroups(page) {
    try {
      this.logger?.debug('Discovering variant groups with enhanced multi-layer approach');
      
      // Layer 1: Label-driven discovery (highest priority)
      const labelGroups = await this.discoverByLabels(page);
      this.logger?.debug(`Label-driven discovery found: ${labelGroups.length} groups`);
      
      // Layer 2: Structural clustering (current approach as fallback)
      const structuralGroups = await this.discoverByStructure(page);
      this.logger?.debug(`Structural discovery found: ${structuralGroups.length} groups`);
      
      // Layer 3: Accessibility patterns
      const ariaGroups = await this.discoverByAccessibility(page);
      this.logger?.debug(`Accessibility discovery found: ${ariaGroups.length} groups`);
      
      // Layer 4: Data attribute patterns
      const dataGroups = await this.discoverByDataAttributes(page);
      this.logger?.debug(`Data attribute discovery found: ${dataGroups.length} groups`);
      
      // Merge and deduplicate intelligently
      const mergedGroups = this.mergeVariantGroups(labelGroups, structuralGroups, ariaGroups, dataGroups);
      this.logger?.debug(`Final merged groups: ${mergedGroups.length}`);
      
      return mergedGroups;
      
    } catch (error) {
      this.logger?.error('discoverVariantGroups failed:', error);
      // Fallback to original structural approach
      return this.discoverByStructure(page);
    }
  }
  
  /**
   * Label-driven variant discovery - finds text labels then nearby controls
   */
  async discoverByLabels(page) {
    try {
      const labelGroups = await page.evaluate(() => {
        const groups = [];
        
        // Universal variant label patterns (language-agnostic where possible)
        const labelPatterns = [
          /\b(size|sizes|taille|tamaño|größe)\b/i,
          /\b(color|colour|colors|colours|couleur|color|farbe)\b/i,
          /\b(style|styles|estilo|stil)\b/i,
          /\b(finish|finishes|finition)\b/i,
          /\b(variant|variants|variante)\b/i,
          /\b(option|options|opción|opciones|option)\b/i,
          /\b(choose|select|choisir|elegir|wählen)\b/i,
          /\b(pick|selection|sélection|selección)\b/i
        ];
        
        // Focus search on product/buybox areas first, avoid reviews/search
        const productAreas = [
          document.querySelector('#product-page, #buy-box, [class*="product"], [class*="buybox"], main, [role="main"]') || document.body
        ];
        
        // Exclude areas that are likely not product variants
        const excludeSelectors = [
          '#reviews, [class*="review"]',
          '#search, [class*="search"]', 
          'footer, [class*="footer"]',
          'header, [class*="header"]',
          '[class*="nav"], nav',
          '[class*="breadcrumb"]',
          '[class*="filter"]'
        ];
        
        const labelElements = [];
        
        productAreas.forEach(productArea => {
          if (!productArea) return;
          
          // Find elements with variant patterns in product areas
          const walker = document.createTreeWalker(
            productArea,
            NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
            {
              acceptNode: function(node) {
                // Skip excluded areas
                for (const excludeSelector of excludeSelectors) {
                  if (node.nodeType === Node.ELEMENT_NODE && node.matches && node.matches(excludeSelector)) {
                    return NodeFilter.FILTER_REJECT;
                  }
                  if (node.parentElement && node.parentElement.closest && node.parentElement.closest(excludeSelector)) {
                    return NodeFilter.FILTER_REJECT;
                  }
                }
                
                if (node.nodeType === Node.TEXT_NODE) {
                  const text = node.textContent.trim();
                  return labelPatterns.some(pattern => pattern.test(text)) ? 
                    NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
                if (node.nodeType === Node.ELEMENT_NODE) {
                  const text = node.textContent?.trim() || '';
                  const aria = node.getAttribute('aria-label') || '';
                  return (labelPatterns.some(pattern => pattern.test(text + ' ' + aria)) && text.length < 100) ? 
                    NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_REJECT;
              }
            }
          );
          
          let node;
          while (node = walker.nextNode()) {
            if (node.nodeType === Node.TEXT_NODE) {
              labelElements.push(node.parentElement);
            } else {
              labelElements.push(node);
            }
          }
        });
        
        
        // For each label, find nearby interactive controls
        labelElements.forEach(labelEl => {
          if (!labelEl || !labelEl.textContent) return;
          
          const labelText = labelEl.textContent.trim().toLowerCase();
          let variantType = 'unknown';
          
          // Determine semantic type from label
          if (/\b(size|taille|tamaño|größe)\b/i.test(labelText)) {
            variantType = 'size';
          } else if (/\b(color|colour|couleur|farbe)\b/i.test(labelText)) {
            variantType = 'color';
          } else if (/\b(style|estilo|stil)\b/i.test(labelText)) {
            variantType = 'style';
          }
          
          // Search for controls near this label (enhanced search)
          const foundControls = [];
          
          // Strategy 1: Local proximity search
          const searchAreas = [
            labelEl.parentElement, // Same parent
            labelEl.nextElementSibling, // Next sibling
            labelEl.parentElement?.parentElement, // Grandparent
            ...Array.from(labelEl.parentElement?.children || []) // Siblings
          ];
          
          // Strategy 2: Global search by variant type if local search fails
          let globalSearchSelectors = [];
          if (variantType === 'color') {
            globalSearchSelectors = [
              '#product-page-color-swatches',
              '[id*="color"]',
              '[class*="color"]',
              '[data-testid*="color"]'
            ];
          } else if (variantType === 'size') {
            globalSearchSelectors = [
              '#product-page-size-selector',
              '[id*="size"]',
              '[class*="size"]',
              '[data-testid*="size"]'
            ];
          }
          
          // First try local proximity search
          searchAreas.forEach(area => {
            if (!area) return;
            
            // Look for interactive elements within this area (exclude action buttons)
            const controls = area.querySelectorAll(`
              select:not([disabled]), 
              input[type="radio"]:not([disabled]), 
              button:not([disabled]):not([type="submit"]):not([class*="close"]):not([aria-label*="close"]):not([class*="add"]):not([class*="cart"]):not([class*="buy"]), 
              [class*="swatch"]:not(.disabled),
              [class*="option"]:not(.disabled),
              [role="button"]:not(.disabled),
              [data-color]:not(.disabled),
              [data-size]:not(.disabled)
            `);
            
            // Filter out action buttons by text
            const variantControls = Array.from(controls).filter(control => {
              const text = (control.textContent || '').toLowerCase();
              const actionWords = ['add to cart', 'add to bag', 'buy now', 'purchase', 'checkout'];
              return !actionWords.some(word => text.includes(word));
            });
            
            variantControls.forEach(control => {
              if (foundControls.indexOf(control) === -1) {
                foundControls.push(control);
              }
            });
          });
          
          // If local search didn't find controls, try global search by type
          if (foundControls.length === 0 && globalSearchSelectors.length > 0) {
            globalSearchSelectors.forEach(selector => {
              try {
                const globalContainer = document.querySelector(selector);
                if (globalContainer) {
                  const globalControls = globalContainer.querySelectorAll(`
                    select:not([disabled]), 
                    input[type="radio"]:not([disabled]), 
                    button:not([disabled]):not([type="submit"]):not([class*="add"]):not([class*="cart"]):not([class*="buy"]), 
                    [class*="swatch"]:not(.disabled),
                    [class*="option"]:not(.disabled),
                    [role="button"]:not(.disabled)
                  `);
                  
                  Array.from(globalControls).forEach(control => {
                    const text = (control.textContent || '').toLowerCase();
                    const actionWords = ['add to cart', 'add to bag', 'buy now', 'purchase', 'checkout'];
                    if (!actionWords.some(word => text.includes(word))) {
                      if (foundControls.indexOf(control) === -1) {
                        foundControls.push(control);
                      }
                    }
                  });
                }
              } catch (e) {
                // Continue if selector fails
              }
            });
          }
          
          // If we found controls, create a group
          if (foundControls.length > 0) {
            // Group similar controls together
            const controlsByType = new Map();
            
            foundControls.forEach(control => {
              const signature = `${control.tagName}_${control.type || ''}_${control.parentElement?.tagName || ''}`;
              
              if (!controlsByType.has(signature)) {
                controlsByType.set(signature, []);
              }
              controlsByType.get(signature).push(control);
            });
            
            // Create groups for each control type found
            controlsByType.forEach((controls, signature) => {
              if (controls.length === 0) return;
              
              const firstControl = controls[0];
              let groupSelector = '';
              
              // Generate selector
              if (firstControl.tagName === 'SELECT') {
                groupSelector = firstControl.id ? `#${firstControl.id}` : 
                  firstControl.className ? `.${firstControl.className.split(' ')[0]}` : 'select';
              } else if (firstControl.type === 'radio' && firstControl.name) {
                groupSelector = `input[type="radio"][name="${firstControl.name}"]`;
              } else {
                // For buttons/other elements, use parent container + element
                const container = firstControl.parentElement;
                let containerSel = '';
                if (container.id) {
                  containerSel = `#${container.id}`;
                } else if (container.className) {
                  containerSel = `.${container.className.split(' ')[0]}`;
                } else {
                  containerSel = container.tagName.toLowerCase();
                }
                groupSelector = `${containerSel} ${firstControl.tagName.toLowerCase()}`;
              }
              
              groups.push({
                selector: groupSelector,
                type: firstControl.tagName === 'SELECT' ? 'dropdown' : 
                      firstControl.type === 'radio' ? 'radio' : 'button',
                variantType: variantType, // Semantic type from label
                optionCount: controls.length,
                elements: controls.length,
                containerClass: firstControl.parentElement?.className || '',
                groupKey: `label_${variantType}_${signature}`,
                discoveryMethod: 'label-driven',
                labelText: labelText.substring(0, 30),
                confidence: 0.9 // High confidence for label-driven discovery
              });
            });
          }
        });
        
        return groups;
      });
      
      return labelGroups;
      
    } catch (error) {
      this.logger?.debug('Label-driven discovery failed:', error.message);
      return [];
    }
  }
  
  /**
   * Structural clustering approach (original method, now as fallback)
   */
  async discoverByStructure(page) {
    try {
      this.logger?.debug('🏗️ STRUCTURAL DISCOVERY: Starting structural clustering');
      
      const structuralGroups = await page.evaluate(() => {
        const groups = [];
        const debugLog = []; // For logging what we find
        
        // Look for potential variant containers
        const containerSelectors = [
          'form', 
          '[class*="product"]', 
          '[class*="variant"]', 
          '[class*="option"]',
          '[id*="product"]',
          '[data-product]',
          'body' // Add body to catch top-level custom dropdowns
        ];
        
        debugLog.push(`Searching in ${containerSelectors.length} container types`);
        
        // FIRST: Direct search for Nordstrom-style custom dropdowns
        const customDropdowns = document.querySelectorAll('[aria-label="dropdown"], [id*="size"][aria-label], [id*="width"][aria-label], [id*="color"][aria-label]');
        if (customDropdowns.length > 0) {
          debugLog.push(`CUSTOM DROPDOWNS: Found ${customDropdowns.length} aria-label dropdowns`);
          
          customDropdowns.forEach((dropdown, i) => {
            const id = dropdown.id || '';
            const text = (dropdown.textContent || '').trim();
            
            debugLog.push(`  Dropdown ${i}: id="${id}" text="${text.substring(0, 30)}"`);
            
            // Determine variant type from ID
            let variantType = 'unknown';
            if (id.includes('size')) variantType = 'size';
            else if (id.includes('width')) variantType = 'width';
            else if (id.includes('color')) variantType = 'color';
            else if (id.includes('style')) variantType = 'style';
            
            groups.push({
              selector: `#${dropdown.id}`,
              type: 'dropdown',
              variantType: variantType,
              optionCount: 1, // Custom dropdowns appear as single elements
              elements: [dropdown],
              containerClass: dropdown.className || '',
              groupKey: `custom_dropdown_${id}`,
              discoveryMethod: 'custom_dropdown',
              confidence: 0.8
            });
          });
        }
        
        containerSelectors.forEach(containerSel => {
          const containers = document.querySelectorAll(containerSel);
          debugLog.push(`${containerSel}: found ${containers.length} containers`);
          
          containers.forEach((container, containerIndex) => {
            // Within each container, look for interactive elements (exclude action buttons)
            const interactiveElements = container.querySelectorAll(`
              select:not([disabled]), 
              input[type="radio"]:not([disabled]), 
              button:not([disabled]):not([type="submit"]):not([class*="add"]):not([class*="cart"]):not([class*="buy"]), 
              [class*="swatch"]:not(.disabled),
              [class*="option"]:not(.disabled),
              [role="button"]:not(.disabled):not([class*="add"]):not([class*="cart"]),
              [aria-label="dropdown"]:not(.disabled),
              [tabindex="0"][aria-label="dropdown"],
              div[id*="size"]:not(.disabled),
              div[id*="color"]:not(.disabled),
              div[id*="width"]:not(.disabled),
              div[id*="style"]:not(.disabled)
            `);
            
            debugLog.push(`  Container ${containerIndex}: found ${interactiveElements.length} interactive elements`);
            
            // Filter out obvious action buttons and non-variant UI elements
            const filteredElements = Array.from(interactiveElements).filter(el => {
              const text = (el.textContent || '').toLowerCase();
              const className = (el.className || '').toLowerCase();
              const id = (el.id || '').toLowerCase();
              const parentId = (el.parentElement?.id || '').toLowerCase();
              
              // Filter out action buttons
              const actionWords = ['add to cart', 'add to bag', 'buy now', 'purchase', 'checkout'];
              if (actionWords.some(word => text.includes(word))) {
                return false;
              }
              
              // Filter out review/filter elements
              const reviewWords = ['review', 'filter', 'satisfaction', 'comfort', 'rating', 'star'];
              if (reviewWords.some(word => 
                text.includes(word) || 
                className.includes(word) || 
                id.includes(word) || 
                parentId.includes(word)
              )) {
                return false;
              }
              
              // Filter out search/navigation elements
              const navWords = ['search', 'clear', 'reset', 'submit', 'login', 'account'];
              if (navWords.some(word => text.includes(word) || className.includes(word))) {
                return false;
              }
              
              // Filter out elements with review context patterns like "(2)" or "(26)"
              if (text.match(/^\s*\(\d+\)\s*\d*\s*$/) || text.match(/\(\d+\)$/)) {
                return false;
              }
              
              return true;
            });
            
            debugLog.push(`  After filtering: ${filteredElements.length} elements remain`);
            
            // Log details about what elements we found
            filteredElements.slice(0, 5).forEach((el, i) => {
              debugLog.push(`    Element ${i}: ${el.tagName}${el.type ? `[type="${el.type}"]` : ''} "${(el.textContent || '').trim().substring(0, 20)}"`);
            });
            
            if (filteredElements.length === 0) return;
            
            // Group elements by their parent container or similar attributes
            const groupsByParent = new Map();
            const potentialGroups = new Map(); // For detecting similar element clusters
            
            // Phase 1: Detect similar element clusters without hardcoding
            filteredElements.forEach(el => {
              // Create a signature for this element based on structure, not content
              const signature = {
                tagName: el.tagName,
                parentTag: el.parentElement?.tagName || '',
                grandParentTag: el.parentElement?.parentElement?.tagName || '',
                hasImage: !!el.querySelector('img'),
                hasText: (el.textContent?.trim().length || 0) > 0,
                isButton: el.tagName === 'BUTTON' || el.getAttribute('role') === 'button',
                hasDataAttrs: Object.keys(el.dataset || {}).length > 0,
                siblingCount: el.parentElement?.children.length || 0
              };
              
              // Create a key from structural characteristics
              const structuralKey = `${signature.tagName}_${signature.parentTag}_${signature.grandParentTag}_${signature.hasImage}_${signature.isButton}_${signature.siblingCount}`;
              
              if (!potentialGroups.has(structuralKey)) {
                potentialGroups.set(structuralKey, {
                  signature,
                  elements: [],
                  commonParent: null
                });
              }
              
              potentialGroups.get(structuralKey).elements.push(el);
              
              // Find common parent for this group
              const group = potentialGroups.get(structuralKey);
              if (!group.commonParent) {
                group.commonParent = el.parentElement;
              } else {
                // Find lowest common ancestor
                let current = el.parentElement;
                while (current && !current.contains(group.commonParent)) {
                  current = current.parentElement;
                }
                if (current && current.contains(group.commonParent)) {
                  group.commonParent = current;
                }
              }
            });
            
            // Phase 2: Convert structural groups to variant groups
            potentialGroups.forEach((group, key) => {
              if (group.elements.length > 1) {
                // Multiple similar elements = likely a variant group
                const firstEl = group.elements[0];
                
                // Determine if elements are siblings (better grouping)
                const areSiblings = group.elements.every(el => 
                  el.parentElement === firstEl.parentElement
                );
                
                const container = areSiblings ? firstEl.parentElement : group.commonParent;
                
                groupsByParent.set(`cluster_${key}`, {
                  container: container,
                  elements: group.elements,
                  groupType: 'clustered',
                  isStructuralGroup: true,
                  signature: group.signature
                });
              } else {
                // Single element - use traditional parent-based grouping
                const el = group.elements[0];
                
                // Find the immediate parent that seems like a variant group
                let parent = el.parentElement;
                let depth = 0;
                
                while (parent && depth < 3) {
                  const parentClass = parent.className?.toLowerCase() || '';
                  const parentId = parent.id?.toLowerCase() || '';
                  
                  // Look for group indicators
                  if (parentClass.includes('option') || 
                      parentClass.includes('variant') || 
                      parentClass.includes('select') ||
                      parentClass.includes('size') ||
                      parentClass.includes('color') ||
                      parentClass.includes('style') ||
                      parentId.includes('option') ||
                      parent.tagName === 'FIELDSET') {
                    
                    const groupKey = parent.outerHTML.substring(0, 100); // Use partial HTML as key
                    
                    if (!groupsByParent.has(groupKey)) {
                      groupsByParent.set(groupKey, {
                        container: parent,
                        elements: [],
                        groupType: 'traditional'
                      });
                    }
                    
                    groupsByParent.get(groupKey).elements.push(el);
                    break;
                  }
                  
                  parent = parent.parentElement;
                  depth++;
                }
                
                // If no good parent found, create individual group
                if (depth >= 3) {
                  const solitary = `solitary_${el.tagName}_${el.className}`;
                  groupsByParent.set(solitary, {
                    container: el.parentElement,
                    elements: [el],
                    groupType: 'single'
                  });
                }
              }
            });
            
            // Convert groups to results
            groupsByParent.forEach((group, key) => {
              if (group.elements.length > 0) {
                const firstEl = group.elements[0];
                
                // Determine group characteristics
                const isSelect = firstEl.tagName === 'SELECT';
                const isRadio = firstEl.type === 'radio';
                const isButton = firstEl.tagName === 'BUTTON' || firstEl.getAttribute('role') === 'button';
                
                // Generate a selector that targets this group
                let groupSelector;
                if (isSelect) {
                  // For select, use id or class or tagname
                  if (firstEl.id) {
                    groupSelector = `#${firstEl.id}`;
                  } else if (firstEl.className) {
                    groupSelector = `.${firstEl.className.split(' ')[0]}`;
                  } else {
                    groupSelector = firstEl.tagName.toLowerCase();
                  }
                } else if (isRadio) {
                  // For radio groups, select all with same name
                  const name = firstEl.name;
                  groupSelector = name ? `input[type="radio"][name="${name}"]` : 
                    (firstEl.className ? `.${firstEl.className.split(' ')[0]}` : 'input[type="radio"]');
                } else {
                  // For other types, try to get parent selector
                  let containerSelector = '';
                  if (group.container.id) {
                    containerSelector = `#${group.container.id}`;
                  } else if (group.container.className) {
                    containerSelector = `.${group.container.className.split(' ')[0]}`;
                  } else {
                    containerSelector = group.container.tagName.toLowerCase();
                  }
                  groupSelector = `${containerSelector} ${firstEl.tagName.toLowerCase()}`;
                }
                
                // Enhanced semantic detection
                let variantType = 'unknown';
                let confidence = 0.7; // Base confidence for structural discovery
                
                // Analyze selector and container for semantic clues
                const selectorLower = groupSelector.toLowerCase();
                const containerClassLower = (group.container?.className || '').toLowerCase();
                const containerIdLower = (group.container?.id || '').toLowerCase();
                
                if (selectorLower.includes('color') || containerClassLower.includes('color') || containerIdLower.includes('color')) {
                  variantType = 'color';
                  confidence = 0.9; // High confidence for semantic matches
                } else if (selectorLower.includes('size') || containerClassLower.includes('size') || containerIdLower.includes('size')) {
                  variantType = 'size';
                  confidence = 0.9;
                } else if (selectorLower.includes('style') || containerClassLower.includes('style') || containerIdLower.includes('style')) {
                  variantType = 'style';
                  confidence = 0.85;
                } else if (selectorLower.includes('swatch') || containerClassLower.includes('swatch')) {
                  variantType = 'color'; // Swatches are usually colors
                  confidence = 0.85;
                } else if (group.elements.length > 10) {
                  // Large groups are likely primary variants (colors)
                  confidence = 0.8;
                }
                
                groups.push({
                  selector: groupSelector,
                  type: isSelect ? 'dropdown' : isRadio ? 'radio' : isButton ? 'button' : 'unknown',
                  variantType: variantType,
                  optionCount: group.elements.length,
                  elements: group.elements.length,
                  containerClass: group.container?.className || '',
                  groupKey: key.substring(0, 50), // Truncated key for debugging
                  discoveryMethod: 'structural',
                  confidence: confidence
                });
              }
            });
          });
        });
        
        // Remove duplicates and sort by option count (more options = more likely primary variant)
        const uniqueGroups = groups.filter((group, index, self) =>
          index === self.findIndex(g => g.selector === group.selector)
        );
        
        // Sort by confidence first, then option count
        const sortedGroups = uniqueGroups.sort((a, b) => {
          const confidenceDiff = (b.confidence || 0.7) - (a.confidence || 0.7);
          if (confidenceDiff !== 0) return confidenceDiff;
          return b.optionCount - a.optionCount;
        });
        
        // Return both groups and debug log
        return { groups: sortedGroups, debugLog };
        
      });
      
      // Log what was found
      this.logger?.debug('🏗️ STRUCTURAL DISCOVERY RESULTS:');
      structuralGroups.debugLog?.forEach(log => {
        this.logger?.debug(`   ${log}`);
      });
      
      this.logger?.debug(`   Final groups found: ${structuralGroups.groups?.length || 0}`);
      structuralGroups.groups?.forEach((group, i) => {
        this.logger?.debug(`     ${i + 1}. ${group.variantType || 'unknown'} (${group.optionCount} options) - ${group.selector}`);
      });
      
      return structuralGroups.groups || [];
      
    } catch (error) {
      this.logger?.debug('Structural discovery failed:', error.message);
      return [];
    }
  }
  
  /**
   * Accessibility-based variant discovery
   */
  async discoverByAccessibility(page) {
    try {
      const ariaGroups = await page.evaluate(() => {
        const groups = [];
        
        // Find elements with variant-related ARIA attributes
        const ariaSelectors = [
          '[role="radiogroup"]',
          '[role="listbox"]', 
          '[role="group"][aria-label*="color" i]',
          '[role="group"][aria-label*="size" i]',
          '[role="group"][aria-label*="style" i]',
          '[role="group"][aria-label*="option" i]',
          '[aria-label*="select color" i]',
          '[aria-label*="select size" i]',
          '[aria-label*="choose" i]'
        ];
        
        ariaSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          
          elements.forEach(element => {
            // Find interactive children
            const interactiveChildren = element.querySelectorAll(`
              button:not([disabled]), 
              input[type="radio"]:not([disabled]),
              [role="option"]:not([aria-disabled="true"]),
              [role="radio"]:not([aria-disabled="true"])
            `);
            
            if (interactiveChildren.length > 1) {
              const ariaLabel = element.getAttribute('aria-label') || '';
              let variantType = 'unknown';
              
              if (/color/i.test(ariaLabel)) variantType = 'color';
              else if (/size/i.test(ariaLabel)) variantType = 'size';
              else if (/style/i.test(ariaLabel)) variantType = 'style';
              
              groups.push({
                selector: `${selector.includes('[') ? selector : `[role="${element.getAttribute('role')}"]`}`,
                type: 'aria-group',
                variantType: variantType,
                optionCount: interactiveChildren.length,
                elements: interactiveChildren.length,
                containerClass: element.className || '',
                groupKey: `aria_${variantType}_${element.tagName}`,
                discoveryMethod: 'accessibility',
                ariaLabel: ariaLabel.substring(0, 30),
                confidence: 0.85
              });
            }
          });
        });
        
        return groups;
      });
      
      return ariaGroups;
      
    } catch (error) {
      this.logger?.debug('Accessibility discovery failed:', error.message);
      return [];
    }
  }
  
  /**
   * Data attribute-based variant discovery
   */
  async discoverByDataAttributes(page) {
    try {
      const dataGroups = await page.evaluate(() => {
        const groups = [];
        
        // Find elements with variant-related data attributes
        const dataSelectors = [
          '[data-testid*="color" i]',
          '[data-testid*="size" i]',
          '[data-testid*="variant" i]',
          '[data-automation-id*="color" i]',
          '[data-automation-id*="size" i]',
          '[data-color]',
          '[data-size]',
          '[data-variant]',
          '[data-option-type]'
        ];
        
        const elementsByAttribute = new Map();
        
        dataSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          
          elements.forEach(element => {
            // Determine attribute type
            let attrType = 'unknown';
            const attrs = Array.from(element.attributes);
            
            attrs.forEach(attr => {
              const name = attr.name.toLowerCase();
              const value = attr.value.toLowerCase();
              
              if (name.includes('color') || value.includes('color')) attrType = 'color';
              else if (name.includes('size') || value.includes('size')) attrType = 'size';
              else if (name.includes('variant') || value.includes('variant')) attrType = 'variant';
            });
            
            if (!elementsByAttribute.has(attrType)) {
              elementsByAttribute.set(attrType, []);
            }
            elementsByAttribute.get(attrType).push(element);
          });
        });
        
        // Convert to groups
        elementsByAttribute.forEach((elements, attrType) => {
          if (elements.length > 1) {
            const firstElement = elements[0];
            const commonClass = firstElement.className.split(' ')[0] || '';
            
            groups.push({
              selector: commonClass ? `.${commonClass}` : elements[0].tagName.toLowerCase(),
              type: 'data-driven',
              variantType: attrType,
              optionCount: elements.length,
              elements: elements.length,
              containerClass: firstElement.parentElement?.className || '',
              groupKey: `data_${attrType}_${firstElement.tagName}`,
              discoveryMethod: 'data-attributes',
              confidence: 0.8
            });
          }
        });
        
        return groups;
      });
      
      return dataGroups;
      
    } catch (error) {
      this.logger?.debug('Data attribute discovery failed:', error.message);
      return [];
    }
  }
  
  /**
   * Intelligently merge variant groups from different discovery methods
   */
  mergeVariantGroups(labelGroups, structuralGroups, ariaGroups, dataGroups) {
    try {
      const allGroups = [...labelGroups, ...structuralGroups, ...ariaGroups, ...dataGroups];
      
      // Remove exact duplicates based on selector
      const uniqueGroups = allGroups.filter((group, index, self) =>
        index === self.findIndex(g => g.selector === group.selector)
      );
      
      // Prioritize by discovery method and confidence
      const priorityOrder = {
        'label-driven': 4,
        'accessibility': 3,
        'data-attributes': 2,
        'structural': 1
      };
      
      // Sort by priority, then confidence, then option count
      const sortedGroups = uniqueGroups.sort((a, b) => {
        const priorityDiff = (priorityOrder[b.discoveryMethod] || 0) - (priorityOrder[a.discoveryMethod] || 0);
        if (priorityDiff !== 0) return priorityDiff;
        
        const confidenceDiff = (b.confidence || 0) - (a.confidence || 0);
        if (confidenceDiff !== 0) return confidenceDiff;
        
        return b.optionCount - a.optionCount;
      });
      
      // Keep top groups (avoid too many duplicate-ish groups)
      const finalGroups = sortedGroups.slice(0, 10);
      
      this.logger?.debug(`Merged groups: ${labelGroups.length} label + ${structuralGroups.length} structural + ${ariaGroups.length} aria + ${dataGroups.length} data = ${finalGroups.length} final`);
      
      return finalGroups;
      
    } catch (error) {
      this.logger?.debug('Group merging failed:', error.message);
      return [...labelGroups, ...structuralGroups].slice(0, 10);
    }
  }

  /**
   * Simulate reading/analyzing content with realistic timing
   */
  async humanRead(page, element = null) {
    // If element provided, scroll it into view and focus
    if (element) {
      try {
        await element.scrollIntoViewIfNeeded();
        await this.humanMouseMove(page, element);
        await this.humanDelay(300);
      } catch (error) {
        // Ignore element interaction errors
      }
    }
    
    // Simulate reading time based on content length
    const readingTime = this.humanConfig.readingTime + (Math.random() * 1000);
    await this.humanDelay(readingTime);
  }

  /**
   * Simulate natural page exploration before analysis
   */
  async explorePageLikeHuman(page) {
    this.logger?.debug('Starting human-like page exploration');
    
    // Initial page load reading
    await this.humanRead(page);
    
    // Random scroll to explore page
    const scrollActions = Math.floor(Math.random() * 3) + 1; // 1-3 scrolls
    for (let i = 0; i < scrollActions; i++) {
      await this.humanScroll(page, Math.random() > 0.7 ? 'up' : 'down');
    }
    
    // Occasionally interact with random elements (hover only, no clicks)
    if (Math.random() > 0.5) {
      try {
        const randomElements = await page.$$('img, button, a, h1, h2');
        if (randomElements.length > 0) {
          const randomElement = randomElements[Math.floor(Math.random() * randomElements.length)];
          await this.humanHover(page, randomElement);
        }
      } catch (error) {
        // Ignore exploration errors
      }
    }
    
    // Return to top for consistent analysis
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await this.humanDelay(1000);
    
    this.logger?.debug('Completed human-like page exploration');
  }

  /**
   * Enhanced page navigation with human behavior
   */
  async navigateToPageLikeHuman(page, url) {
    this.logger?.info(`Navigating to ${url} with human behavior`);
    
    // Setup human behavior patterns
    await this.setupHumanBehavior(page);
    
    // Navigate with realistic timing
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Wait for initial load and potential anti-bot checks
    await this.humanDelay(2000);
    
    // Close any popups/modals that appeared
    await this.closePopups(page);
    
    // Explore page like a human would
    await this.explorePageLikeHuman(page);
    
    return page;
  }

  /**
   * Close common popups and modals that interfere with scraping
   */
  async closePopups(page) {
    try {
      this.logger?.debug('Checking for and closing popups');
      
      // Common popup close button selectors
      const closeSelectors = [
        // Generic close buttons
        '[data-dismiss="modal"]',
        '[aria-label*="close" i]',
        '[aria-label*="dismiss" i]',
        'button[class*="close"]',
        '[class*="modal-close"]',
        '[class*="popup-close"]',
        '[class*="dialog-close"]',
        
        // X buttons
        'button:has-text("×")',
        'button:has-text("✕")',
        '[title*="close" i]',
        
        // Cookie consent
        '[data-cookie-dismiss]',
        'button[class*="cookie"]:has-text("Accept")',
        'button[class*="cookie"]:has-text("OK")',
        'button[class*="consent"]:has-text("Accept")',
        
        // Newsletter/Email signups
        '[class*="newsletter"] button[class*="close"]',
        '[class*="email"] button[class*="close"]',
        '[data-modal="email"] button',
        
        // Survey/Feedback
        '[class*="survey"] button[class*="close"]',
        '[class*="feedback"] button[class*="close"]',
        
        // Chat widgets
        '[class*="chat"] button[class*="close"]',
        '[class*="intercom"] button[class*="close"]',
        
        // Overlay/backdrop clicks
        '.modal-backdrop',
        '[class*="overlay"][class*="close"]'
      ];
      
      let closedPopups = 0;
      
      for (const selector of closeSelectors) {
        try {
          const elements = await page.$$(selector);
          for (const element of elements.slice(0, 2)) { // Limit to prevent excessive clicking
            // Check if element is visible
            const isVisible = await element.evaluate(el => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && 
                     window.getComputedStyle(el).display !== 'none' &&
                     window.getComputedStyle(el).visibility !== 'hidden';
            });
            
            if (isVisible) {
              await this.humanClick(page, element, 2000); // Shorter timeout for popups
              closedPopups++;
              await this.humanDelay(500);
              this.logger?.debug(`Closed popup with selector: ${selector}`);
              break; // Move to next selector after successful close
            }
          }
        } catch (error) {
          // Continue with other selectors if one fails
          continue;
        }
      }
      
      // Also try pressing Escape key to close modals
      try {
        await page.keyboard.press('Escape');
        await this.humanDelay(300);
      } catch (error) {
        // Ignore escape key errors
      }
      
      if (closedPopups > 0) {
        this.logger?.debug(`Closed ${closedPopups} popups/modals`);
        // Wait a bit for any animations to complete
        await this.humanDelay(1000);
      }
      
    } catch (error) {
      this.logger?.debug('Popup closing failed:', error.message);
      // Don't throw - popups are optional to close
    }
  }

  /**
   * Capture current page state for comparison during validation
   */
  async capturePageState(page) {
    try {
      const state = await page.evaluate(() => {
        return {
          url: window.location.href,
          title: document.title,
          price: (() => {
            // Look for price elements
            const priceSelectors = ['.price', '.money', '[class*="price"]', '[data-price]'];
            for (const selector of priceSelectors) {
              const el = document.querySelector(selector);
              if (el && /[\d,]+/.test(el.textContent)) {
                return el.textContent.trim();
              }
            }
            return null;
          })(),
          images: (() => {
            // Capture main product images
            const imgs = document.querySelectorAll('img[src*="product"], img[class*="product"], .product img');
            return Array.from(imgs).slice(0, 3).map(img => ({
              src: img.src,
              alt: img.alt || '',
              className: img.className
            }));
          })(),
          availability: (() => {
            // Check add to cart button state
            const buttons = document.querySelectorAll('button, input[type="submit"]');
            for (const btn of buttons) {
              const text = (btn.textContent || btn.value || '').toLowerCase();
              if (text.includes('add') || text.includes('cart') || text.includes('buy')) {
                return {
                  text: btn.textContent || btn.value,
                  disabled: btn.disabled,
                  className: btn.className
                };
              }
            }
            return null;
          })(),
          selectedVariants: (() => {
            // Capture currently selected variants
            const variants = {};
            
            // Check selected options in selects
            const selects = document.querySelectorAll('select');
            selects.forEach((select, i) => {
              if (select.selectedIndex >= 0) {
                variants[`select_${i}`] = {
                  value: select.value,
                  text: select.options[select.selectedIndex]?.text || '',
                  selector: select.className || select.id || `select:nth-child(${i+1})`
                };
              }
            });
            
            // Check selected radio buttons
            const radios = document.querySelectorAll('input[type="radio"]:checked');
            radios.forEach((radio, i) => {
              variants[`radio_${i}`] = {
                value: radio.value,
                name: radio.name,
                selector: radio.className || radio.id || `input[name="${radio.name}"][value="${radio.value}"]`
              };
            });
            
            // Check active/selected elements (like color swatches)
            const activeElements = document.querySelectorAll('.selected, .active, [class*="selected"], [class*="active"]');
            activeElements.forEach((el, i) => {
              if (el.closest('[class*="variant"], [class*="color"], [class*="size"], [class*="option"]')) {
                variants[`active_${i}`] = {
                  text: el.textContent?.trim() || '',
                  className: el.className,
                  dataValue: el.getAttribute('data-value') || el.getAttribute('data-variant-id') || ''
                };
              }
            });
            
            return variants;
          })(),
          timestamp: Date.now()
        };
      });
      
      return state;
    } catch (error) {
      this.logger?.error('Failed to capture page state:', error);
      return null;
    }
  }

  /**
   * Compare two page states and detect changes
   */
  detectChanges(beforeState, afterState) {
    if (!beforeState || !afterState) return [];
    
    const changes = [];
    
    // URL change
    if (beforeState.url !== afterState.url) {
      changes.push({
        type: 'URL_CHANGE',
        before: beforeState.url,
        after: afterState.url,
        confidence: 0.9
      });
    }
    
    // Price change
    if (beforeState.price !== afterState.price) {
      changes.push({
        type: 'PRICE_CHANGE',
        before: beforeState.price,
        after: afterState.price,
        confidence: 0.8
      });
    }
    
    // Image changes
    const beforeImages = beforeState.images || [];
    const afterImages = afterState.images || [];
    if (beforeImages.length > 0 && afterImages.length > 0) {
      const imageSrcsChanged = beforeImages.some((img, i) => 
        afterImages[i] && img.src !== afterImages[i].src
      );
      if (imageSrcsChanged) {
        changes.push({
          type: 'IMAGE_CHANGE',
          before: beforeImages.map(img => img.src),
          after: afterImages.map(img => img.src),
          confidence: 0.9
        });
      }
    }
    
    // Availability change
    const beforeAvail = beforeState.availability;
    const afterAvail = afterState.availability;
    if (beforeAvail && afterAvail) {
      if (beforeAvail.text !== afterAvail.text || beforeAvail.disabled !== afterAvail.disabled) {
        changes.push({
          type: 'AVAILABILITY_CHANGE',
          before: beforeAvail,
          after: afterAvail,
          confidence: 0.7
        });
      }
    }
    
    // Variant selection changes
    const beforeVariants = beforeState.selectedVariants || {};
    const afterVariants = afterState.selectedVariants || {};
    const variantKeys = new Set([...Object.keys(beforeVariants), ...Object.keys(afterVariants)]);
    
    for (const key of variantKeys) {
      const before = beforeVariants[key];
      const after = afterVariants[key];
      
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        changes.push({
          type: 'VARIANT_SELECTION_CHANGE',
          field: key,
          before: before,
          after: after,
          confidence: 0.8
        });
      }
    }
    
    return changes;
  }

  /**
   * Calculate confidence score based on detected changes
   */
  calculateValidationConfidence(changes) {
    // Add defensive check for non-array or invalid changes
    if (!changes || !Array.isArray(changes) || changes.length === 0) return 0;
    
    let score = 0;
    
    // Weight different types of changes
    changes.forEach(change => {
      switch (change.type) {
        case 'IMAGE_CHANGE':
          score += 40 * change.confidence;
          break;
        case 'PRICE_CHANGE':
          score += 35 * change.confidence;
          break;
        case 'URL_CHANGE':
          score += 30 * change.confidence;
          break;
        case 'VARIANT_SELECTION_CHANGE':
          score += 25 * change.confidence;
          break;
        case 'AVAILABILITY_CHANGE':
          score += 20 * change.confidence;
          break;
        default:
          score += 10 * change.confidence;
      }
    });
    
    // Bonus for multiple types of changes
    const changeTypes = new Set(changes.map(c => c.type));
    if (changeTypes.size > 1) {
      score += 15;
    }
    
    return Math.min(100, Math.round(score));
  }

  /**
   * Validate a selector by interacting with it and observing changes
   */
  async validateSelectorInteractively(page, selector, fieldType) {
    this.logger?.debug(`🔍 VALIDATION START: ${selector} (fieldType: ${fieldType})`);
    
    try {
      // Capture initial state
      const beforeState = await this.capturePageState(page);
      if (!beforeState) return { works: false, reason: 'Could not capture initial state' };
      
      // Find elements matching the selector
      const elements = await page.$$(selector);
      this.logger?.debug(`   Found ${elements.length} elements for selector`);
      
      if (elements.length === 0) {
        return { works: false, reason: 'No elements found for selector' };
      }
      
      const validationResults = [];
      
      // Test up to 3 different options/elements
      const elementsToTest = elements.slice(0, 3);
      this.logger?.debug(`   Testing ${elementsToTest.length} elements`);
      
      for (let i = 0; i < elementsToTest.length; i++) {
        const element = elementsToTest[i];
        
        try {
          this.logger?.debug(`   🎯 Testing element ${i + 1}/${elementsToTest.length}`);
          
          // Get detailed element information
          const elementInfo = await element.evaluate(el => ({
            tagName: el.tagName.toLowerCase(),
            type: el.type || '',
            disabled: el.disabled,
            hasDisabledAttr: el.hasAttribute('disabled'),
            hasDisabledClass: el.classList.contains('disabled'),
            ariaDisabled: el.getAttribute('aria-disabled'),
            text: el.textContent?.trim().substring(0, 50),
            className: el.className || '',
            id: el.id || '',
            isVisible: el.offsetHeight > 0 && el.offsetWidth > 0
          }));
          
          this.logger?.debug(`     Element details:`, elementInfo);
          
          // Scroll element into view
          await element.scrollIntoViewIfNeeded();
          await this.humanDelay(300);
          
          // Interact based on element type
          const { tagName, type: inputType } = elementInfo;
          
          if (tagName === 'select') {
            this.logger?.debug(`     Processing SELECT element`);
            const options = await element.$$('option');
            this.logger?.debug(`     Found ${options.length} options in select`);
            if (options.length > 1) {
              // Select a different option (not the first one)
              const optionIndex = Math.min(1, options.length - 1);
              this.logger?.debug(`     Selecting option ${optionIndex}`);
              await element.selectOption({ index: optionIndex });
            }
          } else if (inputType === 'radio') {
            this.logger?.debug(`     Processing RADIO button`);
            const isChecked = await element.isChecked();
            this.logger?.debug(`     Radio checked: ${isChecked}`);
            if (!isChecked) {
              this.logger?.debug(`     Clicking radio button`);
              await this.humanClick(page, element);
            }
          } else {
            this.logger?.debug(`     Processing OTHER element (${tagName})`);
            
            // For other elements (buttons, divs, etc.), handle availability specially
            if (fieldType === 'availability') {
              this.logger?.debug(`     🚨 AVAILABILITY BUTTON LOGIC TRIGGERED`);
              
              // Enhanced button state detection
              const isDisabledTraditional = elementInfo.disabled || elementInfo.hasDisabledAttr || elementInfo.hasDisabledClass;
              const isAriaDisabled = elementInfo.ariaDisabled === 'true';
              const textSuggestsSelection = /select|choose|pick/i.test(elementInfo.text);
              
              this.logger?.debug(`     Button state analysis:`);
              this.logger?.debug(`       Traditional disabled: ${isDisabledTraditional}`);
              this.logger?.debug(`       Aria disabled: ${isAriaDisabled}`);
              this.logger?.debug(`       Text suggests selection: ${textSuggestsSelection}`);
              this.logger?.debug(`       Button text: "${elementInfo.text}"`);
              
              const shouldTryVariants = isDisabledTraditional || isAriaDisabled || textSuggestsSelection;
              
              if (shouldTryVariants) {
                this.logger?.debug(`     ⚡ Button needs variants - attempting selection`);
                const variantSelected = await this.selectFirstAvailableVariant(page);
                
                if (variantSelected) {
                  this.logger?.debug(`     ✅ Variant selection successful, waiting for button update`);
                  // Wait for button state to change
                  await this.humanDelay(1000);
                  
                  // Re-check button state
                  const newElementInfo = await element.evaluate(el => ({
                    disabled: el.disabled,
                    hasDisabledAttr: el.hasAttribute('disabled'),
                    hasDisabledClass: el.classList.contains('disabled'),
                    text: el.textContent?.trim().substring(0, 50)
                  }));
                  
                  this.logger?.debug(`     Button state after variant selection:`, newElementInfo);
                  
                  const stillDisabled = newElementInfo.disabled || newElementInfo.hasDisabledAttr || newElementInfo.hasDisabledClass;
                  if (!stillDisabled) {
                    this.logger?.debug(`     ✅ Button enabled after variant selection, proceeding with click`);
                    await this.humanClick(page, element);
                  } else {
                    this.logger?.debug(`     ❌ Button still disabled after variant selection, skipping click`);
                  }
                } else {
                  this.logger?.debug(`     ❌ Could not select variant, skipping disabled button`);
                }
              } else {
                this.logger?.debug(`     ⚡ Button appears enabled, trying variant selection anyway (Nordstrom-style)`);
                // For sites like Nordstrom, always try variant selection for availability buttons
                const variantSelected = await this.selectFirstAvailableVariant(page);
                
                if (variantSelected) {
                  this.logger?.debug(`     ✅ Variant selection completed, now clicking button`);
                  await this.humanDelay(500);
                }
                
                this.logger?.debug(`     🖱️ Clicking availability button`);
                await this.humanClick(page, element);
              }
            } else {
              this.logger?.debug(`     🖱️ Non-availability element, clicking normally`);
              await this.humanClick(page, element);
            }
          }
          
          // Wait for potential changes to propagate
          await this.humanDelay(1500);
          
          // Capture new state
          const afterState = await this.capturePageState(page);
          if (!afterState) continue;
          
          // Detect changes
          const changes = this.detectChanges(beforeState, afterState);
          const confidence = this.calculateValidationConfidence(changes);
          
          validationResults.push({
            elementIndex: i,
            changes: changes,
            confidence: confidence,
            worked: changes.length > 0
          });
          
          this.logger?.debug(`Element ${i} validation:`, { changes: changes.length, confidence });
          
          // If we got good results, no need to test more elements
          if (confidence > 70) break;
          
        } catch (error) {
          this.logger?.debug(`Failed to test element ${i}:`, error.message);
          continue;
        }
      }
      
      // Analyze overall results
      const bestResult = validationResults.reduce((best, current) => 
        current.confidence > best.confidence ? current : best, 
        { confidence: 0 }
      );
      
      const workedCount = validationResults.filter(r => r.worked).length;
      const reliability = elementsToTest.length > 0 ? workedCount / elementsToTest.length : 0;
      
      return {
        works: bestResult.confidence > 30, // Minimum threshold
        confidence: bestResult.confidence,
        reliability: reliability,
        changes: bestResult.changes || [],
        elementsTested: elementsToTest.length,
        elementsWorked: workedCount,
        bestElementIndex: bestResult.elementIndex,
        reason: bestResult.confidence === 0 ? 'No observable changes detected' : 'Validation successful'
      };
      
    } catch (error) {
      this.logger?.error(`Interactive validation failed for ${selector}:`, error);
      return { 
        works: false, 
        confidence: 0,
        reason: `Validation error: ${error.message}` 
      };
    }
  }

  /**
   * Main discovery method - finds selectors by analyzing the actual DOM
   */
  async discoverSelectors(page, targetField) {
    // Ensure cache is initialized
    if (!this.cacheInitialized) {
      await this.initialize();
    }

    const domain = new URL(page.url()).hostname;
    this.logger.info(`Discovering selectors for ${targetField} on ${domain} using DOM analysis`);
    
    // Check cache first for existing selectors
    const cached = await this.selectorCache.getOrDiscoverSelector(
      domain,
      targetField,
      {
        elementType: this.getElementTypeForField(targetField),
        context: { url: page.url() }
      }
    );
    
    if (cached && cached.fromCache) {
      this.logger.info(`Using cached selector for ${targetField}: ${cached.selector}`);
      
      // Convert cached selector to expected format
      return [{
        selector: cached.selector,
        confidence: (cached.reliability || 0.7) * 100,
        source: cached.cacheType === 'mongodb' ? 'cached-proven' : 'cached-recent',
        sample: `Cached ${targetField} selector`,
        interactive: { works: true, confidence: (cached.reliability || 0.7) * 100 },
        finalConfidence: (cached.reliability || 0.7) * 100,
        validated: true,
        fromCache: true,
        cacheType: cached.cacheType
      }];
    }
    
    // Add human-like interaction before analysis
    await this.humanRead(page);
    
    // Occasionally scroll to discover lazy-loaded content
    if (Math.random() > 0.5) {
      await this.humanScroll(page, 'down');
      await this.humanDelay(1000); // Wait for potential lazy loading
    }
    
    // For variant-related fields, use enhanced variant group discovery
    if (['variants', 'size', 'color'].includes(targetField)) {
      try {
        this.logger?.debug(`Using enhanced variant discovery for ${targetField}`);
        const variantGroups = await this.discoverVariantGroups(page);
        
        if (variantGroups.length > 0) {
          // Convert variant groups to selector format expected by pipeline
          const variantResults = variantGroups
            .filter(group => {
              // Filter by target field type if specific
              if (targetField === 'size') return group.variantType === 'size';
              if (targetField === 'color') return group.variantType === 'color';
              return true; // For 'variants', include all types
            })
            .map(group => ({
              selector: group.selector,
              confidence: (group.confidence || 0.7) * 100, // Convert to percentage
              source: `enhanced-variant-${group.discoveryMethod}`,
              sample: group.labelText || group.ariaLabel || `${group.variantType} with ${group.optionCount} options`,
              interactive: { works: true, confidence: group.confidence * 100 },
              finalConfidence: (group.confidence || 0.7) * 100,
              validated: true,
              variantType: group.variantType,
              optionCount: group.optionCount,
              discoveryMethod: group.discoveryMethod
            }));
          
          if (variantResults.length > 0) {
            this.logger?.info(`Enhanced variant discovery found ${variantResults.length} groups for ${targetField}`);
            return variantResults;
          }
        }
        
        this.logger?.debug(`Enhanced variant discovery found no matches for ${targetField}, falling back to traditional method`);
      } catch (error) {
        this.logger?.debug(`Enhanced variant discovery failed: ${error.message}, falling back to traditional method`);
      }
    }
    
    try {
      const results = await page.evaluate((field) => {
        // This entire function runs IN THE BROWSER with full DOM access
        
        /**
         * Find candidate elements by analyzing visual and semantic patterns
         */
        function findCandidateElements(targetField) {
          const candidates = [];
          
          switch(targetField) {
            case 'title': {
              // Find title by visual hierarchy and content
              const headings = document.querySelectorAll('h1, h2, h3');
              headings.forEach(h => {
                const text = h.textContent.trim();
                if (text.length > 5 && text.length < 200) {
                  // Check if it's visible and prominent
                  const rect = h.getBoundingClientRect();
                  const style = window.getComputedStyle(h);
                  
                  if (rect.height > 0 && style.display !== 'none') {
                    candidates.push({
                      element: h,
                      confidence: h.tagName === 'H1' ? 0.9 : 0.7,
                      reason: 'heading element with product-like text'
                    });
                  }
                }
              });
              
              // Also check for elements with title-like classes (semantic)
              const titleClassed = document.querySelectorAll('[class*="title"], [class*="name"], [class*="heading"]');
              titleClassed.forEach(el => {
                const text = el.textContent.trim();
                if (text.length > 5 && text.length < 200 && !candidates.find(c => c.element === el)) {
                  candidates.push({
                    element: el,
                    confidence: 0.6,
                    reason: 'semantic class name'
                  });
                }
              });
              break;
            }
            
            case 'price': {
              // Find price by content pattern and visual styling
              const allElements = document.querySelectorAll('*');
              const pricePattern = /^\$?\d{1,6}([,.]?\d{1,3})*([.]?\d{1,2})?$/;
              
              allElements.forEach(el => {
                // Skip if element has children (we want leaf nodes)
                if (el.children.length > 0) return;
                
                const text = el.textContent.trim();
                if (pricePattern.test(text) || text.includes('$')) {
                  const rect = el.getBoundingClientRect();
                  const style = window.getComputedStyle(el);
                  
                  // Check if visible and styled like a price
                  if (rect.height > 0 && style.display !== 'none') {
                    const fontSize = parseFloat(style.fontSize);
                    const fontWeight = style.fontWeight;
                    
                    candidates.push({
                      element: el,
                      confidence: fontSize > 14 ? 0.8 : 0.6,
                      reason: 'price pattern in text',
                      sample: text
                    });
                  }
                }
              });
              break;
            }
            
            case 'images': {
              // Find product images by size and position
              const images = document.querySelectorAll('img');
              
              images.forEach(img => {
                const rect = img.getBoundingClientRect();
                
                // Product images are usually larger than thumbnails
                if (rect.width > 100 && rect.height > 100) {
                  // Check if it's in viewport or near
                  if (rect.top < window.innerHeight * 2) {
                    candidates.push({
                      element: img,
                      confidence: rect.width > 300 ? 0.9 : 0.7,
                      reason: 'large image in product area',
                      src: img.src
                    });
                  }
                }
              });
              
              // Also check for picture elements and lazy-loaded images
              const pictures = document.querySelectorAll('picture img, [data-src], [loading="lazy"]');
              pictures.forEach(img => {
                if (!candidates.find(c => c.element === img)) {
                  candidates.push({
                    element: img,
                    confidence: 0.6,
                    reason: 'lazy-loaded or picture element'
                  });
                }
              });
              break;
            }
            
            case 'description': {
              // Find description by text length and position
              const textElements = document.querySelectorAll('p, div, section');
              
              textElements.forEach(el => {
                const text = el.textContent.trim();
                
                // Description is usually longer text
                if (text.length > 100 && text.length < 5000) {
                  // Check if it's not navigation or footer
                  const isNav = el.closest('nav, header, footer');
                  if (!isNav) {
                    candidates.push({
                      element: el,
                      confidence: text.length > 200 ? 0.7 : 0.5,
                      reason: 'long text content',
                      preview: text.substring(0, 100)
                    });
                  }
                }
              });
              break;
            }
            
            case 'color': {
              // Color-specific variant detection
              const colorSelectors = [
                '[class*="color"]:not([class*="colorless"])',
                '[data-color]',
                '[aria-label*="color" i]',
                '.swatch',
                '.color-swatch', 
                '.color-option',
                'button[data-variant*="color" i]',
                'img[alt*="color" i]',
                '[class*="pdp-color"]',
                '[class*="product-color"]',
                '[class*="variant-color"]'
              ];
              
              colorSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                  // Check if element seems like a color selector
                  const hasColorClass = el.className.toLowerCase().includes('color');
                  const hasColorData = el.dataset.color || el.getAttribute('data-color');
                  const hasColorAria = el.getAttribute('aria-label')?.toLowerCase().includes('color');
                  const isClickable = el.tagName === 'BUTTON' || el.onclick || el.style.cursor === 'pointer';
                  
                  if (hasColorClass || hasColorData || hasColorAria || isClickable) {
                    candidates.push({
                      element: el,
                      confidence: (hasColorData ? 0.9 : hasColorClass ? 0.8 : 0.7),
                      reason: `color variant: ${selector}`,
                      colorValue: hasColorData || el.textContent?.trim()
                    });
                  }
                });
              });
              break;
            }
            
            case 'size': {
              // Size-specific variant detection  
              const sizeSelectors = [
                'select[name*="size" i]',
                '[class*="size"]:not([class*="oversized"])',
                '[data-size]',
                '[aria-label*="size" i]',
                'button[data-variant*="size" i]',
                '.size-selector',
                '.size-option',
                '[class*="pdp-size"]',
                '[class*="product-size"]',
                '[class*="variant-size"]'
              ];
              
              sizeSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                  const hasSizeClass = el.className.toLowerCase().includes('size');
                  const hasSizeData = el.dataset.size || el.getAttribute('data-size');
                  const hasSizeAria = el.getAttribute('aria-label')?.toLowerCase().includes('size');
                  const isSelect = el.tagName === 'SELECT' && el.options?.length > 1;
                  const isClickable = el.tagName === 'BUTTON' || el.onclick || el.style.cursor === 'pointer';
                  
                  if (hasSizeClass || hasSizeData || hasSizeAria || isSelect || isClickable) {
                    candidates.push({
                      element: el,
                      confidence: (hasSizeData ? 0.9 : isSelect ? 0.85 : hasSizeClass ? 0.8 : 0.7),
                      reason: `size variant: ${selector}`,
                      sizeValue: hasSizeData || (isSelect ? `${el.options.length} options` : el.textContent?.trim())
                    });
                  }
                });
              });
              break;
            }

            case 'variants': {
              // Find variant selectors (dropdowns, radio buttons, swatches)
              const selects = document.querySelectorAll('select');
              const radios = document.querySelectorAll('input[type="radio"]');
              const swatches = document.querySelectorAll('[class*="swatch"], [class*="option"], [class*="variant"]');
              
              selects.forEach(el => {
                if (el.options.length > 1) {
                  candidates.push({
                    element: el,
                    confidence: 0.9,
                    reason: 'dropdown with options',
                    optionCount: el.options.length
                  });
                }
              });
              
              if (radios.length > 1) {
                candidates.push({
                  element: radios[0],
                  confidence: 0.8,
                  reason: 'radio button group',
                  groupSize: radios.length
                });
              }
              
              swatches.forEach(el => {
                candidates.push({
                  element: el,
                  confidence: 0.6,
                  reason: 'swatch-like element'
                });
              });
              break;
            }
            
            case 'availability': {
              // Enhanced Add to Cart / Availability button discovery
              const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
              const stockTexts = document.querySelectorAll('[class*="stock"], [class*="availability"]');
              const forms = document.querySelectorAll('form');
              
              // Expanded search patterns for button text
              const addToCartPatterns = [
                'add', 'cart', 'buy', 'bag', 'purchase', 'order',
                'add to cart', 'add to bag', 'buy now', 'purchase now'
              ];
              
              const unavailablePatterns = [
                'sold out', 'out of stock', 'unavailable', 'notify',
                'sold', 'stock', 'waitlist', 'coming soon'
              ];
              
              const selectPatterns = [
                'select', 'choose', 'options', 'variants', 'size', 'color'
              ];
              
              // Find cart forms first (highest confidence)
              forms.forEach(form => {
                const action = (form.action || '').toLowerCase();
                const formId = ((form.id || '') + '').toLowerCase();
                const formClass = ((form.className || '') + '').toLowerCase();
                
                if (action.includes('/cart/add') || action.includes('add') || 
                    formId.includes('cart') || formId.includes('product') ||
                    formClass.includes('cart') || formClass.includes('product')) {
                  
                  // Find submit button in this form
                  const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
                  if (submitBtn) {
                    candidates.push({
                      element: submitBtn,
                      confidence: 0.95,
                      reason: 'submit button in cart form',
                      text: submitBtn.textContent || submitBtn.value || 'Form Submit'
                    });
                  }
                }
              });
              
              // Analyze all buttons
              buttons.forEach(btn => {
                const text = (btn.textContent || btn.value || '').toLowerCase().trim();
                const btnId = ((btn.id || '') + '').toLowerCase();
                const btnClass = ((btn.className || '') + '').toLowerCase();
                const ariaLabel = ((btn.getAttribute('aria-label') || '') + '').toLowerCase();
                const title = ((btn.title || '') + '').toLowerCase();
                
                // Combine all text sources
                const allText = `${text} ${btnId} ${btnClass} ${ariaLabel} ${title}`;
                
                // Check for add to cart patterns
                for (const pattern of addToCartPatterns) {
                  if (allText.includes(pattern)) {
                    // Higher confidence for exact matches
                    const confidence = text.includes(pattern) ? 0.9 : 0.7;
                    
                    candidates.push({
                      element: btn,
                      confidence,
                      reason: `add to cart button (${pattern})`,
                      text: btn.textContent || btn.value,
                      available: !btn.disabled
                    });
                    break; // Don't double-add same button
                  }
                }
                
                // Check for unavailable/sold out patterns
                for (const pattern of unavailablePatterns) {
                  if (allText.includes(pattern)) {
                    candidates.push({
                      element: btn,
                      confidence: 0.8,
                      reason: `unavailable button (${pattern})`,
                      text: btn.textContent || btn.value,
                      available: false
                    });
                    break;
                  }
                }
                
                // Check for selection patterns (lower confidence)
                for (const pattern of selectPatterns) {
                  if (allText.includes(pattern)) {
                    candidates.push({
                      element: btn,
                      confidence: 0.5,
                      reason: `selection button (${pattern})`,
                      text: btn.textContent || btn.value,
                      available: !btn.disabled
                    });
                    break;
                  }
                }
              });
              
              // Look for prominent buttons (likely primary action)
              buttons.forEach(btn => {
                // Skip if already added
                if (candidates.find(c => c.element === btn)) return;
                
                const rect = btn.getBoundingClientRect();
                const style = window.getComputedStyle(btn);
                
                // Check if button is prominent (large, styled)
                const isProminent = rect.width > 150 || rect.height > 40 ||
                                   style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
                                   style.fontSize > '14px';
                
                if (isProminent && btn.textContent.trim().length > 2) {
                  candidates.push({
                    element: btn,
                    confidence: 0.6,
                    reason: 'prominent button (likely primary action)',
                    text: btn.textContent,
                    available: !btn.disabled
                  });
                }
              });
              
              // Check stock indicator elements
              stockTexts.forEach(el => {
                const text = el.textContent.toLowerCase();
                let available = null;
                let confidence = 0.6;
                
                // Determine availability from text
                if (text.includes('in stock') || text.includes('available')) {
                  available = true;
                  confidence = 0.8;
                } else if (text.includes('out of stock') || text.includes('sold out')) {
                  available = false;
                  confidence = 0.8;
                }
                
                candidates.push({
                  element: el,
                  confidence,
                  reason: 'stock indicator element',
                  text: el.textContent.trim(),
                  available
                });
              });
              
              break;
            }
          }
          
          return candidates;
        }
        
        /**
         * Generate optimal selector for an element
         */
        function generateOptimalSelector(element) {
          // Try ID first
          if (element.id) {
            return `#${element.id}`;
          }
          
          // Try unique class combination
          if (element.className) {
            const classes = element.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) {
              // Escape special characters in class names
              const escapeSelector = (className) => {
                return className.replace(/([:.\/\[\]@!%$#^&*()+=~`])/g, '\\$1');
              };
              
              // Test if single class is unique
              const firstClass = escapeSelector(classes[0]);
              try {
                if (document.querySelectorAll(`.${firstClass}`).length === 1) {
                  return `.${firstClass}`;
                }
              } catch (e) {
                // Skip invalid selectors
              }
              
              // Try combination of classes
              const escapedClasses = classes.slice(0, 2).map(escapeSelector);
              const selector = '.' + escapedClasses.join('.');
              try {
                if (document.querySelectorAll(selector).length === 1) {
                  return selector;
                }
              } catch (e) {
                // Skip invalid selectors
              }
            }
          }
          
          // Try data attributes
          const dataAttrs = Array.from(element.attributes).filter(a => a.name.startsWith('data-'));
          for (const attr of dataAttrs) {
            const selector = `[${attr.name}="${attr.value}"]`;
            if (document.querySelectorAll(selector).length === 1) {
              return selector;
            }
          }
          
          // Build path selector
          let path = [];
          let current = element;
          
          const escapeSelector = (className) => {
            return className.replace(/([:.\/\[\]@!%$#^&*()+=~`])/g, '\\$1');
          };
          
          while (current && current !== document.body) {
            let selector = current.tagName.toLowerCase();
            
            // Add class if it helps specificity
            if (current.className) {
              const classes = current.className.split(' ').filter(c => c.trim() && !c.startsWith('js-'));
              if (classes.length > 0) {
                selector += '.' + escapeSelector(classes[0]);
              }
            }
            
            path.unshift(selector);
            current = current.parentElement;
            
            // Test if current path is unique
            const currentSelector = path.join(' > ');
            try {
              if (document.querySelectorAll(currentSelector).length === 1) {
                return currentSelector;
              }
            } catch (e) {
              // Continue building path if selector is invalid
            }
          }
          
          return path.join(' > ');
        }
        
        /**
         * Analyze spatial relationships to find product patterns
         */
        function analyzeProductPattern(candidates) {
          // Group candidates by proximity
          const groups = [];
          
          candidates.forEach(candidate => {
            const rect = candidate.element.getBoundingClientRect();
            candidate.rect = rect;
            
            // Find group this might belong to
            let foundGroup = false;
            for (const group of groups) {
              const groupRect = group.rect;
              
              // Check if vertically aligned and close
              if (Math.abs(rect.left - groupRect.left) < 50 &&
                  Math.abs(rect.top - groupRect.bottom) < 100) {
                group.members.push(candidate);
                group.rect.bottom = Math.max(groupRect.bottom, rect.bottom);
                foundGroup = true;
                break;
              }
            }
            
            if (!foundGroup) {
              groups.push({
                rect: {...rect},
                members: [candidate]
              });
            }
          });
          
          // Score groups by completeness
          return groups.map(group => ({
            ...group,
            score: group.members.length / 3 // Expect title, price, image minimum
          })).sort((a, b) => b.score - a.score);
        }
        
        // Main execution
        const candidates = findCandidateElements(field);
        
        // Generate selectors for top candidates
        const results = candidates
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 5)
          .map(candidate => {
            const selector = generateOptimalSelector(candidate.element);
            
            // Verify selector works
            try {
              const test = document.querySelector(selector);
              if (test === candidate.element) {
                return {
                  selector,
                  confidence: candidate.confidence,
                  reason: candidate.reason,
                  sample: candidate.sample || candidate.preview || candidate.text,
                  verified: true
                };
              }
            } catch (e) {
              // Invalid selector
            }
            
            return null;
          })
          .filter(Boolean);
        
        return {
          field,
          candidatesFound: candidates.length,
          results
        };
        
      }, targetField);
      
      this.logger.info(`DOM analysis complete for ${targetField}:`, {
        candidatesFound: results.candidatesFound,
        selectorsGenerated: results.results.length
      });
      
      // Stage 2: Interactive validation for variant-related fields
      if (this.shouldValidateInteractively(targetField) && results.results.length > 0) {
        this.logger.info(`Starting interactive validation for ${targetField}`);
        
        const validatedResults = [];
        
        for (const result of results.results.slice(0, 3)) { // Limit to top 3 candidates
          const validation = await this.validateSelectorInteractively(page, result.selector, targetField);
          
          // Enhance result with validation data
          const enhancedResult = {
            ...result,
            interactive: validation,
            finalConfidence: this.calculateFinalConfidence(result.confidence, validation),
            validated: validation.works
          };
          
          validatedResults.push(enhancedResult);
          
          this.logger.debug(`Validation result for ${result.selector}:`, {
            originalConfidence: result.confidence,
            interactionConfidence: validation.confidence,
            finalConfidence: enhancedResult.finalConfidence,
            changes: validation.changes?.length || 0
          });
          
          // If we found a highly confident selector, we can stop testing
          if (enhancedResult.finalConfidence > 0.85) {
            this.logger.info(`High-confidence selector found, stopping validation`);
            break;
          }
        }
        
        // Sort by final confidence (combining DOM analysis + interaction validation)
        validatedResults.sort((a, b) => b.finalConfidence - a.finalConfidence);
        
        this.logger.info(`Interactive validation complete:`, {
          validatedSelectors: validatedResults.filter(r => r.validated).length,
          totalTested: validatedResults.length,
          bestConfidence: validatedResults[0]?.finalConfidence || 0
        });
        
        // Cache successful discoveries for future use
        await this.cacheDiscoveredSelectors(domain, targetField, validatedResults);
        
        return validatedResults;
      }
      
      // Cache non-validated discoveries as well
      if (results.results && results.results.length > 0) {
        await this.cacheDiscoveredSelectors(domain, targetField, results.results);
      }
      
      return results.results;
      
    } catch (error) {
      this.logger.error(`Failed to discover selectors for ${targetField}:`, error);
      return [];
    }
  }

  /**
   * Determine if a field should undergo interactive validation
   */
  shouldValidateInteractively(targetField) {
    const interactiveFields = ['variants', 'color', 'size', 'availability'];
    return interactiveFields.includes(targetField);
  }

  /**
   * Calculate final confidence combining DOM analysis and interaction validation
   */
  calculateFinalConfidence(domConfidence, validation) {
    if (!validation.works) {
      // If interaction validation failed, reduce DOM confidence
      return domConfidence * 0.6;
    }
    
    // Combine confidences with weighting
    const domWeight = 0.4;
    const interactionWeight = 0.6;
    
    const finalConfidence = (domConfidence * domWeight) + 
                           ((validation.confidence / 100) * interactionWeight);
    
    // Bonus for reliability (if multiple elements work)
    const reliabilityBonus = validation.reliability ? validation.reliability * 0.1 : 0;
    
    return Math.min(1.0, finalConfidence + reliabilityBonus);
  }

  /**
   * Discover all product fields at once by analyzing the page holistically
   */
  async discoverProductStructure(page) {
    this.logger.info('Discovering complete product structure from DOM');
    
    return await page.evaluate(() => {
      // This runs in browser with full DOM access
      
      const structure = {
        title: null,
        price: null,
        images: [],
        description: null,
        variants: null,
        availability: null
      };
      
      // Find the main product container (usually the largest content area)
      const containers = document.querySelectorAll('main, article, [role="main"], .product, #product');
      let productContainer = containers[0] || document.body;
      
      // Refine to most specific product container
      const productClassed = document.querySelector('[class*="product-"], [class*="product_"], .product-single, .product-detail');
      if (productClassed) {
        productContainer = productClassed;
      }
      
      // Now search within this container for each field
      const searchContainer = productContainer;
      
      // Title: Largest heading in product area
      const headings = searchContainer.querySelectorAll('h1, h2');
      if (headings.length > 0) {
        structure.title = {
          selector: 'h1',
          text: headings[0].textContent.trim(),
          confidence: 0.9
        };
      }
      
      // Price: Element with price pattern
      const pricePattern = /\$[\d,]+\.?\d*/;
      const textElements = searchContainer.querySelectorAll('*');
      
      for (const el of textElements) {
        if (el.children.length === 0) { // Leaf nodes only
          const text = el.textContent.trim();
          if (pricePattern.test(text)) {
            const selector = el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase();
            structure.price = {
              selector,
              text,
              confidence: 0.8
            };
            break;
          }
        }
      }
      
      // Images: Large images in product area
      const images = searchContainer.querySelectorAll('img');
      images.forEach(img => {
        const rect = img.getBoundingClientRect();
        if (rect.width > 200) {
          structure.images.push({
            selector: 'img',
            src: img.src,
            size: `${rect.width}x${rect.height}`
          });
        }
      });
      
      // Variants: Dropdowns or radio groups
      const selects = searchContainer.querySelectorAll('select');
      if (selects.length > 0) {
        structure.variants = {
          selector: 'select',
          type: 'dropdown',
          count: selects.length
        };
      }
      
      // Availability: Add to cart button
      const buttons = searchContainer.querySelectorAll('button');
      buttons.forEach(btn => {
        const text = btn.textContent.toLowerCase();
        if (text.includes('add') || text.includes('cart')) {
          structure.availability = {
            selector: 'button',
            text: btn.textContent,
            available: !btn.disabled
          };
        }
      });
      
      return structure;
    });
  }

  /**
   * Validate discovered selectors work on the page
   */
  async validateSelectors(page, selectors) {
    return await page.evaluate((selectorList) => {
      const results = {};
      
      for (const [field, selector] of Object.entries(selectorList)) {
        try {
          const element = document.querySelector(selector);
          results[field] = {
            selector,
            found: !!element,
            visible: element ? element.offsetHeight > 0 : false,
            content: element ? element.textContent.substring(0, 100) : null
          };
        } catch (e) {
          results[field] = {
            selector,
            found: false,
            error: e.message
          };
        }
      }
      
      return results;
    }, selectors);
  }

  // ========================================
  // ADVANCED VARIANT SWEEP SYSTEM
  // ========================================

  /**
   * Build a normalized variant model for consistent interaction across different HTML patterns
   * Returns: [{ key, label, type, getOptions() }, ...]
   */
  async buildVariantModel(page) {
    this.logger?.debug('🏗️ Building normalized variant model');
    
    // Reuse existing discovery to seed candidates
    const groups = await this.discoverVariantGroups(page);
    
    if (groups.length === 0) {
      this.logger?.debug('No variant groups found for model building');
      return [];
    }

    this.logger?.debug(`Building model from ${groups.length} discovered groups`);

    // Shared helper functions for options
    const getOptionLabel = async (el) => {
      return await el.evaluate(el => (
        el.getAttribute('data-value') ||
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        (el.innerText || el.textContent || '').trim()
      )).catch(() => '');
    };

    const getOptionValue = async (el) => {
      return await el.evaluate(el =>
        el.value ||
        el.getAttribute('data-value') ||
        el.getAttribute('data-color') ||
        el.getAttribute('data-size') ||
        el.getAttribute('data-variant') ||
        (el.innerText || el.textContent || '').trim()
      ).catch(() => '');
    };

    const isDisabled = async (el) => {
      return await el.evaluate(el =>
        el.disabled ||
        el.getAttribute('aria-disabled') === 'true' ||
        el.classList.contains('disabled') ||
        el.closest('[aria-disabled="true"], .is-disabled, [disabled]') != null
      ).catch(() => false);
    };

    const isSelected = async (el) => {
      return await el.evaluate(el =>
        (el.getAttribute('aria-checked') === 'true') ||
        (el.getAttribute('aria-selected') === 'true') ||
        (el.tagName === 'INPUT' && el.type === 'radio' && el.checked) ||
        el.classList.contains('selected') ||
        el.classList.contains('active')
      ).catch(() => false);
    };

    // Create reselector for resilience against DOM changes
    const createReselector = (baseSel, index, attrMatch) => async () => {
      try {
        // Try attribute match first for precision
        if (attrMatch?.selector && attrMatch?.value) {
          const nodes = await page.$$(attrMatch.selector);
          for (const n of nodes) {
            const val = await n.evaluate(el =>
              el.getAttribute('data-value') ||
              el.getAttribute('data-color') ||
              el.getAttribute('data-size') ||
              el.getAttribute('title') ||
              (el.innerText || el.textContent || '').trim()
            ).catch(() => null);
            if ((val || '').toLowerCase() === (attrMatch.value || '').toLowerCase()) {
              return n;
            }
          }
        }
        
        // Fallback to index-based selection
        const els = await page.$$(baseSel);
        return els[index] || null;
      } catch (error) {
        this.logger?.debug(`Reselector failed for ${baseSel}[${index}]: ${error.message}`);
        return null;
      }
    };

    // Build normalized groups
    const normalized = [];
    
    for (const g of groups) {
      try {
        const nodes = await page.$$(g.selector);
        if (!nodes?.length) {
          this.logger?.debug(`No nodes found for selector: ${g.selector}`);
          continue;
        }

        // Determine semantic key
        const key = g.variantType && g.variantType !== 'unknown' ? g.variantType : 'variant_' + normalized.length;
        const type = g.type; // dropdown | radio | button | etc.

        this.logger?.debug(`Processing group: ${key} (${type}) with ${nodes.length} options`);

        const options = [];
        
        for (let i = 0; i < nodes.length; i++) {
          const el = nodes[i];
          const label = await getOptionLabel(el);
          const value = await getOptionValue(el);
          const attrMatch = value ? { selector: g.selector, value } : null;

          // Advanced selection method that handles framework state updates
          const select = async () => {
            const fresh = await createReselector(g.selector, i, attrMatch)();
            if (!fresh) {
              this.logger?.debug(`Could not reselect element ${i} for ${key}`);
              return false;
            }

            try {
              const tag = await fresh.evaluate(e => e.tagName.toLowerCase());
              const typeAttr = await fresh.evaluate(e => e.type || '');
              
              // Scroll into view and human-like interaction
              await fresh.scrollIntoViewIfNeeded();
              await this.humanMouseMove(page, fresh);
              await this.humanDelay(80);

              if (tag === 'select') {
                this.logger?.debug(`Selecting from dropdown: ${label}`);
                const opts = await fresh.$$('option');
                let idx = 1; // Default to first non-placeholder option
                
                if (label) {
                  // Try to find exact match
                  for (let k = 0; k < opts.length; k++) {
                    const optText = await opts[k].evaluate(o => (o.textContent || '').trim());
                    if ((optText || '').toLowerCase() === label.toLowerCase()) {
                      idx = k;
                      break;
                    }
                  }
                }
                
                await fresh.selectOption({ index: Math.min(idx, opts.length - 1) });
                
                // Dispatch synthetic events for React/Vue
                await page.evaluate((sel) => {
                  const node = document.querySelector(sel);
                  if (!node) return;
                  const ev1 = new Event('input', { bubbles: true });
                  const ev2 = new Event('change', { bubbles: true });
                  node.dispatchEvent(ev1);
                  node.dispatchEvent(ev2);
                }, g.selector);
                
              } else if (typeAttr === 'radio') {
                this.logger?.debug(`Selecting radio: ${label}`);
                if (!(await fresh.isChecked())) {
                  await this.humanClick(page, fresh);
                }
                
                // Dispatch synthetic change event
                await fresh.evaluate((el) => {
                  const ev = new Event('change', { bubbles: true });
                  el.dispatchEvent(ev);
                });
                
              } else {
                this.logger?.debug(`Clicking button/swatch: ${label}`);
                await this.humanClick(page, fresh);
                
                // Dispatch synthetic events for button-based variants
                await fresh.evaluate((el) => {
                  const ev = new Event('click', { bubbles: true });
                  el.dispatchEvent(ev);
                });
              }

              // Wait for variant update
              const updateDetected = await this.waitForVariantUpdate(page, { expectUrlParam: true });
              this.logger?.debug(`Variant update detected: ${updateDetected}`);
              
              return updateDetected;
              
            } catch (error) {
              this.logger?.debug(`Selection failed for ${label}: ${error.message}`);
              return false;
            }
          };

          options.push({
            id: `${key}:${i}`,
            index: i,
            label,
            value,
            get: createReselector(g.selector, i, attrMatch),
            select,
            isDisabled: async () => {
              const n = await createReselector(g.selector, i, attrMatch)();
              return n ? await isDisabled(n) : true;
            },
            isSelected: async () => {
              const n = await createReselector(g.selector, i, attrMatch)();
              return n ? await isSelected(n) : false;
            }
          });
        }

        // Create group with live getOptions() for re-render safety
        normalized.push({
          key,
          label: g.labelText || g.ariaLabel || key,
          type,
          baseSelector: g.selector,
          options, // Static reference
          getOptions: async () => {
            // Re-bind fresh nodes to avoid stale handles
            const freshNodes = await page.$$(g.selector);
            return options.map((opt, idx) => ({
              ...opt,
              index: idx,
              get: createReselector(g.selector, idx, { selector: g.selector, value: opt.value })
            }));
          }
        });

        this.logger?.debug(`Created normalized group: ${key} with ${options.length} options`);
        
      } catch (error) {
        this.logger?.debug(`Failed to process group ${g.selector}: ${error.message}`);
        continue;
      }
    }

    // Order groups: color before size (color often affects size availability)
    normalized.sort((a, b) => {
      const rank = (k) => k.includes('color') ? 0 : k.includes('style') ? 1 : k.includes('size') ? 2 : 3;
      return rank(a.key) - rank(b.key);
    });

    this.logger?.debug(`Built normalized model with ${normalized.length} groups`);
    return normalized;
  }

  /**
   * Wait for variant change to propagate: URL params, DOM updates, network calls
   */
  async waitForVariantUpdate(page, { timeout = 3000, expectUrlParam = false } = {}) {
    const start = Date.now();
    const beforeState = await this.capturePageState(page).catch(() => null);

    // Track variant-related network responses
    const variantResponses = [];
    const responseListener = (response) => {
      try {
        const url = response.url();
        if (
          /variant/i.test(url) ||
          (/graphql/i.test(url) && /product|variant|options/i.test(url)) ||
          /cart\/(add|change|update)/i.test(url)
        ) {
          variantResponses.push({ url, status: response.status() });
        }
      } catch (error) {
        // Ignore response processing errors
      }
    };
    
    page.on('response', responseListener);

    let success = false;
    let lastUrl = await page.url();
    
    while (Date.now() - start < timeout && !success) {
      await this.humanDelay(150);

      // Check for URL variant parameter changes
      const currentUrl = await page.url();
      if (expectUrlParam && /\bvariant=\d+/i.test(currentUrl) && currentUrl !== lastUrl) {
        this.logger?.debug(`Variant URL change detected: ${currentUrl}`);
        success = true;
      }
      lastUrl = currentUrl;

      // Check for DOM changes
      if (!success && beforeState) {
        const afterState = await this.capturePageState(page).catch(() => null);
        if (afterState) {
          const changes = this.detectChanges(beforeState, afterState);
          const changeTypes = new Set(changes.map(c => c.type));
          
          if (changeTypes.has('IMAGE_CHANGE') || 
              changeTypes.has('PRICE_CHANGE') || 
              changeTypes.has('VARIANT_SELECTION_CHANGE')) {
            this.logger?.debug(`DOM variant change detected: ${Array.from(changeTypes).join(', ')}`);
            success = true;
          }
        }
      }

      // Check for variant-related network activity
      if (variantResponses.length > 0) {
        this.logger?.debug(`Variant network activity detected: ${variantResponses.length} calls`);
        success = true;
      }
    }

    page.off('response', responseListener);
    
    this.logger?.debug(`Variant update detection: ${success ? 'SUCCESS' : 'TIMEOUT'} in ${Date.now() - start}ms`);
    return success;
  }

  /**
   * Framework-safe value setting for React/Vue controlled components
   */
  async frameworkSafeSetValue(page, selector, value) {
    await page.evaluate(({ selector, value }) => {
      const el = document.querySelector(selector);
      if (!el) return;
      
      // React tracks value via property descriptor; set directly then dispatch
      const descriptor = Object.getOwnPropertyDescriptor(el.__proto__, 'value');
      const setter = descriptor?.set;
      if (setter) {
        setter.call(el, value);
      } else {
        el.value = value;
      }
      
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { selector, value });
  }

  /**
   * Enumerate variant combinations with DFS and safety caps
   */
  async enumerateVariantCombos(page, groups, onEach, { maxCombos = 120, perGroupCap = 12 } = {}) {
    this.logger?.debug(`🔄 Enumerating variant combinations (max: ${maxCombos}, per group: ${perGroupCap})`);
    
    if (!groups || groups.length === 0) {
      this.logger?.debug('No groups to enumerate');
      return;
    }

    // Build working snapshot of options, filtering disabled ones
    const snapshot = [];
    for (const g of groups) {
      const opts = await g.getOptions();
      const activeOptions = [];
      
      for (const opt of opts) {
        if (activeOptions.length >= perGroupCap) break;
        const disabled = await opt.isDisabled();
        if (!disabled) {
          activeOptions.push(opt);
        }
      }
      
      if (activeOptions.length === 0) {
        this.logger?.debug(`Group ${g.key} has no active options, skipping enumeration`);
        return;
      }
      
      snapshot.push({
        key: g.key,
        options: activeOptions,
        getOptions: async () => activeOptions
      });
    }

    this.logger?.debug(`Built snapshot with ${snapshot.length} groups`);
    snapshot.forEach((snap, i) => {
      this.logger?.debug(`  Group ${i}: ${snap.key} (${snap.options.length} active options)`);
    });

    let tested = 0;
    const path = [];

    // Apply current path by selecting each option in sequence
    const applyPath = async () => {
      for (let i = 0; i < path.length; i++) {
        const { groupIdx, option } = path[i];
        this.logger?.debug(`  Applying step ${i + 1}: ${snapshot[groupIdx].key} = "${option.label}"`);
        
        const success = await option.select();
        if (!success) {
          this.logger?.debug(`  Failed to select ${option.label} in ${snapshot[groupIdx].key}`);
          return false;
        }
        
        await this.humanDelay(200);
        
        // After each selection, refresh subsequent group options to handle dynamic updates
        for (let j = i + 1; j < snapshot.length; j++) {
          const group = groups[j];
          if (group && group.getOptions) {
            const fresh = await group.getOptions();
            snapshot[j].options = fresh.slice(0, perGroupCap).filter(async (opt) => !(await opt.isDisabled()));
          }
        }
      }
      return true;
    };

    // Recursive DFS through all combinations
    const dfs = async (groupIdx = 0) => {
      if (tested >= maxCombos) {
        this.logger?.debug(`Reached max combinations limit: ${maxCombos}`);
        return;
      }
      
      if (groupIdx === snapshot.length) {
        // Reached end of path - test this combination
        tested++;
        const pathDescription = path.map(p => ({ 
          groupKey: snapshot[p.groupIdx].key, 
          optionIndex: p.option.index, 
          optionLabel: p.option.label 
        }));
        
        this.logger?.debug(`Testing combination ${tested}: ${pathDescription.map(p => `${p.groupKey}="${p.optionLabel}"`).join(' + ')}`);
        
        const availability = await this.checkAvailabilityButton(page);
        
        await onEach({
          path: pathDescription,
          success: availability,
          availabilityEnabled: availability,
          combinationNumber: tested
        });
        
        return;
      }

      // Try each option in current group
      const group = snapshot[groupIdx];
      const options = group.options;
      
      for (const opt of options) {
        if (tested >= maxCombos) break;

        // Add this option to path
        path.push({ groupIdx, option: opt });

        // Apply the full path so far
        const pathApplied = await applyPath();
        if (pathApplied) {
          // Recurse to next group
          await dfs(groupIdx + 1);
        } else {
          this.logger?.debug(`Path application failed at group ${groupIdx}, skipping branch`);
        }

        // Backtrack
        path.pop();
        await this.humanDelay(120);
      }
    };

    // Start enumeration
    this.logger?.debug('Starting DFS enumeration...');
    await dfs(0);
    
    this.logger?.debug(`Enumeration complete: tested ${tested} combinations`);
  }

  /**
   * Parse embedded product data for variant optimization
   */
  async parseEmbeddedVariantData(page) {
    this.logger?.debug('🔍 Parsing embedded variant data');
    
    return await page.evaluate(() => {
      const out = { variants: [], options: [], hasVariantHints: false };

      try {
        // Parse JSON-LD schema.org Product data
        const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        const ldData = ldScripts
          .map(s => {
            try { return JSON.parse(s.textContent); } 
            catch { return null; }
          })
          .filter(Boolean);
        
        const product = ldData.find(x => x['@type'] === 'Product');
        if (product) {
          if (product.additionalProperty) {
            out.options = product.additionalProperty.map(p => p.name?.toLowerCase()).filter(Boolean);
          }
          if (product.offers?.itemOffered?.size) {
            out.options.push('size');
          }
        }

        // Parse Shopify ProductJson
        const shopifySelectors = [
          'script#ProductJson',
          'script[data-product-json]', 
          'script[type="application/json"][data-product]'
        ];
        
        for (const sel of shopifySelectors) {
          const script = document.querySelector(sel);
          if (script) {
            try {
              const data = JSON.parse(script.textContent);
              if (data?.options) {
                out.options = data.options.map(o => (o.name || '').toLowerCase());
              }
              if (data?.variants) {
                out.variants = data.variants.map(v => ({
                  id: v.id,
                  available: v.available,
                  options: v.options || [v.option1, v.option2, v.option3].filter(Boolean)
                }));
              }
              break;
            } catch (e) {
              // Continue to next selector
            }
          }
        }

        // Check for Next.js/Nuxt variant hints
        const globals = [window.__NEXT_DATA__, window.__NUXT__];
        for (const g of globals) {
          if (g) {
            try {
              const str = JSON.stringify(g);
              if (/variant|product.*option/i.test(str)) {
                out.hasVariantHints = true;
              }
            } catch (e) {
              // Ignore stringification errors
            }
          }
        }

      } catch (error) {
        // Return partial results even if parsing fails
      }

      return out;
    });
  }

  /**
   * High-level variant sweeping: systematically test all combinations
   */
  async sweepAllVariants(page, { maxCombos = 150 } = {}) {
    this.logger?.debug('🧹 Starting comprehensive variant sweep');
    
    const model = await this.buildVariantModel(page);
    if (!model.length) {
      this.logger?.debug('No variant groups found for sweeping');
      return { 
        ok: false, 
        reason: 'No variant groups found', 
        groups: [], 
        combos: [],
        model: []
      };
    }

    this.logger?.debug(`Built model with ${model.length} groups for sweeping`);

    // Parse embedded data for potential optimization
    const embedded = await this.parseEmbeddedVariantData(page).catch(() => ({}));
    this.logger?.debug(`Embedded data: ${embedded.variants?.length || 0} variants, ${embedded.options?.length || 0} options`);

    // Collect all combination results
    const combos = [];
    const startTime = Date.now();
    
    await this.enumerateVariantCombos(page, model, async ({ path, success, combinationNumber }) => {
      combos.push({ 
        path, 
        success,
        combinationNumber,
        timestamp: Date.now() - startTime
      });
      
      this.logger?.debug(`Combination ${combinationNumber}: ${success ? '✅ AVAILABLE' : '❌ unavailable'}`);
    }, { 
      maxCombos, 
      perGroupCap: 16 
    });

    // Summarize results by group and option
    const groups = [];
    for (const g of model) {
      const opts = await g.getOptions();
      const summary = [];
      
      for (const opt of opts) {
        // Count successful combinations containing this option
        const successCount = combos.filter(c => 
          c.success && c.path.some(p => p.groupKey === g.key && p.optionLabel === opt.label)
        ).length;
        
        summary.push({
          label: opt.label,
          value: opt.value,
          successCount,
          testedInCombos: combos.filter(c => 
            c.path.some(p => p.groupKey === g.key && p.optionLabel === opt.label)
          ).length
        });
      }
      
      groups.push({
        key: g.key,
        label: g.label,
        type: g.type,
        options: summary
      });
    }

    const successfulCombos = combos.filter(c => c.success);
    const totalTime = Date.now() - startTime;
    
    this.logger?.debug(`Sweep complete: ${successfulCombos.length}/${combos.length} successful combinations in ${totalTime}ms`);

    return {
      ok: successfulCombos.length > 0,
      reason: combos.length ? undefined : 'No combinations enumerated',
      groups,
      combos,
      model,
      stats: {
        totalCombinations: combos.length,
        successfulCombinations: successfulCombos.length,
        totalTimeMs: totalTime,
        embedded
      }
    };
  }

  /**
   * Cache discovered selectors for future use
   */
  async cacheDiscoveredSelectors(domain, targetField, discoveredSelectors) {
    try {
      // Only cache high-confidence, validated selectors
      const worthCaching = discoveredSelectors.filter(sel => 
        sel.validated && 
        sel.finalConfidence >= 70 && 
        sel.selector
      );
      
      if (worthCaching.length === 0) {
        this.logger?.debug(`No high-confidence selectors to cache for ${targetField}`);
        return;
      }
      
      const bestSelector = worthCaching[0];
      const alternatives = worthCaching.slice(1, 3).map(s => s.selector);
      
      const selectorData = {
        selector: bestSelector.selector,
        alternatives,
        reliability: bestSelector.finalConfidence / 100,
        discoveryMethod: bestSelector.source || 'browser-intelligence',
        metadata: {
          confidence: bestSelector.finalConfidence,
          validated: bestSelector.validated,
          interactiveValidation: bestSelector.interactive,
          sample: bestSelector.sample,
          discoveredAt: new Date().toISOString()
        }
      };
      
      await this.selectorCache.getOrDiscoverSelector(
        domain,
        targetField,
        {
          discoveryFn: async () => selectorData,
          elementType: this.getElementTypeForField(targetField),
          context: { 
            confidence: bestSelector.finalConfidence,
            validated: true 
          }
        }
      );
      
      this.logger?.info(`Cached selector for ${domain}:${targetField} - ${bestSelector.selector}`);
      
    } catch (error) {
      this.logger?.error(`Failed to cache selectors for ${targetField}:`, error);
    }
  }

  /**
   * Map target field to element type for cache categorization
   */
  getElementTypeForField(targetField) {
    const fieldTypeMap = {
      'title': 'text',
      'price': 'price', 
      'images': 'image',
      'description': 'text',
      'variants': 'options',
      'size': 'options',
      'color': 'options',
      'availability': 'status',
      'brand': 'text',
      'sku': 'text',
      'rating': 'text',
      'reviews': 'text'
    };
    
    return fieldTypeMap[targetField] || 'generic';
  }

  /**
   * Update selector success/failure stats in cache
   */
  async updateSelectorResult(domain, targetField, selector, success, error = null) {
    try {
      await this.selectorCache.updateSelectorResult(domain, targetField, selector, success, error);
    } catch (error) {
      this.logger?.error(`Failed to update selector result:`, error);
    }
  }

  /**
   * Clean up cache resources
   */
  async close() {
    if (this.selectorCache) {
      await this.selectorCache.close();
    }
  }
}

module.exports = BrowserIntelligence;