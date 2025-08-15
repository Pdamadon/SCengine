/**
 * ExtractorIntelligence
 * 
 * Intelligent selector discovery system that learns how to extract products from any site.
 * Uses iterative testing with intelligence services until quality threshold is met.
 * 
 * Flow:
 * 1. Test sample products with various strategies
 * 2. Evaluate extraction quality
 * 3. Learn from failures and refine
 * 4. Repeat until quality threshold met
 * 5. Store successful patterns for UniversalProductExtractor
 */

const { chromium } = require('playwright');
const BrowserIntelligence = require('./BrowserIntelligence');
const AdaptiveRetryStrategy = require('./AdaptiveRetryStrategy');
const WorldModel = require('../intelligence/WorldModel');

class ExtractorIntelligence {
  constructor(logger, worldModel = null) {
    this.logger = logger;
    this.worldModel = worldModel || new WorldModel(logger);
    this.browser = null;
    
    // Only use BrowserIntelligence - it's the only one that actually works
    this.browserIntelligence = new BrowserIntelligence(logger);
    
    // Add adaptive retry strategy for intelligent learning
    this.retryStrategy = new AdaptiveRetryStrategy(logger);
    
    // Configuration
    this.config = {
      maxAttempts: 5,
      qualityThreshold: 70, // 70% minimum quality
      sampleSize: 3, // Test on 3 products minimum
      timeout: 10000,
      requiredFields: ['title', 'price', 'images'], // Must have these
      optionalFields: ['description', 'variants', 'brand', 'availability']
    };
    
    // Track learning progress
    this.learningHistory = new Map(); // domain -> attempts
  }

  /**
   * Initialize browser and services
   */
  async initialize() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: false, // Visible for debugging
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-field-trial-config',
          '--disable-back-forward-cache',
          '--disable-hang-monitor',
          '--disable-ipc-flooding-protection',
          '--disable-prompt-on-repost',
          '--disable-sync',
          '--force-color-profile=srgb',
          '--metrics-recording-only',
          '--no-default-browser-check',
          '--no-sandbox',
          '--disable-blink-features=AutomationControlled'
        ]
      });
    }
    await this.worldModel.initialize();
  }

  /**
   * Main method: Learn extraction strategy for a domain
   * Iterates until quality threshold is met or max attempts reached
   */
  async learnExtractionStrategy(domain, sampleUrls, options = {}) {
    const startTime = Date.now();
    const qualityThreshold = options.qualityThreshold || this.config.qualityThreshold;
    const maxAttempts = options.maxAttempts || this.config.maxAttempts;
    
    this.logger.info(`Starting extraction intelligence for ${domain}`, {
      sampleUrls: sampleUrls.length,
      qualityThreshold,
      maxAttempts
    });
    
    // Check if we already have good selectors
    const existingStrategy = await this.worldModel.getExtractionStrategy?.(domain);
    if (existingStrategy?.quality >= qualityThreshold) {
      this.logger.info(`Using existing strategy for ${domain} (quality: ${existingStrategy.quality}%)`);
      return existingStrategy;
    }
    
    let attempts = 0;
    let bestStrategy = null;
    let bestQuality = 0;
    const attemptHistory = [];
    
    while (bestQuality < qualityThreshold && attempts < maxAttempts) {
      attempts++;
      this.logger.info(`Attempt ${attempts}/${maxAttempts} for ${domain}`);
      
      // Try extraction with current knowledge
      const strategy = await this.attemptExtraction(domain, sampleUrls, attemptHistory);
      
      // Evaluate quality
      const quality = await this.evaluateStrategy(strategy, sampleUrls);
      
      attemptHistory.push({
        attempt: attempts,
        strategy,
        quality,
        timestamp: new Date()
      });
      
      if (quality > bestQuality) {
        bestStrategy = strategy;
        bestQuality = quality;
        this.logger.info(`Improved quality: ${quality}% (best so far)`);
      }
      
      // Learn from failures if not good enough
      if (quality < qualityThreshold) {
        await this.learnFromFailures(strategy, domain, sampleUrls, attempts);
      }
    }
    
    // Store the best strategy we found
    if (bestStrategy && bestQuality > 0) {
      bestStrategy.quality = bestQuality;
      bestStrategy.learned_at = new Date();
      bestStrategy.attempts_required = attempts;
      
      await this.storeStrategy(domain, bestStrategy);
      
      this.logger.info(`Learning complete for ${domain}`, {
        quality: bestQuality,
        attempts,
        timeElapsed: Date.now() - startTime,
        meetsThreshold: bestQuality >= qualityThreshold
      });
    }
    
    return bestStrategy;
  }

  /**
   * Single extraction attempt using various intelligence services
   */
  async attemptExtraction(domain, sampleUrls, previousAttempts = []) {
    const strategy = {
      domain,
      selectors: {},
      patterns: {},
      extraction_rules: {
        requires_js: true,
        wait_for_elements: [],
        interaction_required: false
      },
      platform: null,
      discovered_at: new Date()
    };
    
    const page = await this.browser.newPage();
    
    try {
      // Test on first sample URL with human-like navigation
      const testUrl = sampleUrls[0];
      await this.browserIntelligence.navigateToPageLikeHuman(page, testUrl);
      
      // Detect platform
      strategy.platform = await this.detectPlatform(page, domain);
      
      // Discover selectors for each field
      for (const field of [...this.config.requiredFields, ...this.config.optionalFields]) {
        this.logger.debug(`Discovering selector for ${field}`);
        
        const selector = await this.discoverFieldSelector(page, field, strategy.platform, previousAttempts);
        if (selector) {
          strategy.selectors[field] = selector;
          this.logger.info(`✓ Found selector for ${field}: ${selector.selector}`);
        } else {
          (this.logger.warn || this.logger.info)(`✗ No selector found for ${field}`);
        }
      }
      
      // Skip URL pattern learning for now - focus on working selector discovery
      strategy.patterns = { urlPatterns: [], confidence: 0 };
      
      // Determine extraction rules
      strategy.extraction_rules = await this.determineExtractionRules(page, strategy.selectors);
      
    } catch (error) {
      this.logger.error(`Attempt failed for ${domain}:`, error);
    } finally {
      await page.close();
    }
    
    return strategy;
  }

  /**
   * Discover optimal selector for a specific field using multi-stage approach
   */
  async discoverFieldSelector(page, field, platform, previousAttempts = [], attemptNumber = 1) {
    this.logger.debug(`Discovering selector for ${field} (attempt ${attemptNumber})`);
    
    // Stage 1: Primary DOM discovery with interactive validation
    let discoveredSelectors = await this.browserIntelligence.discoverSelectors(page, field);
    
    if (discoveredSelectors.length > 0) {
      // Return the best discovered selector
      const bestSelector = discoveredSelectors[0];
      
      const result = {
        selector: bestSelector.selector,
        source: 'dom-discovery',
        confidence: bestSelector.finalConfidence || bestSelector.confidence,
        validated: bestSelector.validated || bestSelector.verified,
        sample: bestSelector.sample,
        interactive: bestSelector.interactive // Include validation results
      };
      
      // If we have a highly confident, validated selector, use it
      if (result.confidence > 0.7 && result.validated) {
        this.logger.info(`High-confidence validated selector found for ${field}`);
        return result;
      }
    }
    
    // Stage 2: Retry with adaptive strategy if first attempt was not sufficient
    if (attemptNumber <= this.config.maxAttempts && discoveredSelectors.length === 0) {
      this.logger.info(`Attempting retry strategy for ${field}`);
      
      const domain = new URL(page.url()).hostname;
      const strategy = this.retryStrategy.getRetryStrategy(domain, field, attemptNumber);
      
      if (strategy.priority === 'high' || strategy.priority === 'medium') {
        try {
          const retryResults = await this.retryStrategy.executeRetryStrategy(
            page, 
            strategy, 
            field, 
            this.browserIntelligence
          );
          
          if (retryResults.length > 0) {
            // Process retry results and validate them
            for (const retryResult of retryResults.slice(0, 2)) {
              const validation = await this.browserIntelligence.validateSelectorInteractively(
                page, 
                retryResult.selector || retryResult, 
                field
              );
              
              if (validation.works) {
                this.logger.info(`Retry strategy found working selector for ${field}`);
                return {
                  selector: retryResult.selector || retryResult,
                  source: 'retry-strategy',
                  confidence: validation.confidence / 100,
                  validated: true,
                  interactive: validation,
                  retryMethod: strategy.method
                };
              }
            }
          }
        } catch (error) {
          this.logger.debug(`Retry strategy failed for ${field}:`, error.message);
        }
      }
    }
    
    // Stage 3: Fallback to learned selectors from previous attempts
    if (discoveredSelectors.length > 0) {
      const bestSelector = discoveredSelectors[0];
      return {
        selector: bestSelector.selector,
        source: 'dom-discovery',
        confidence: bestSelector.finalConfidence || bestSelector.confidence,
        validated: bestSelector.validated || false,
        sample: bestSelector.sample,
        interactive: bestSelector.interactive
      };
    }
    
    // Stage 4: Extract patterns from previous attempts
    const learnedSelectors = this.extractLearnedSelectors(previousAttempts, field);
    if (learnedSelectors.length > 0) {
      return learnedSelectors[0];
    }
    
    (this.logger.warn || this.logger.info)(`No selector found for ${field} after all strategies`);
    return null;
  }

  /**
   * Get platform-specific patterns for a field
   * @deprecated - Now using DOM discovery instead of hardcoded patterns
   */
  async getPlatformPatterns_DEPRECATED(field, platform) {
    const fieldMap = {
      'title': 'productTitle',
      'price': 'productPrice',
      'images': 'productImage',
      'description': 'productDescription',
      'variants': 'productVariants',
      'brand': 'productBrand',
      'availability': 'addToCart'
    };
    
    const mappedField = fieldMap[field];
    if (!mappedField || !platform) return [];
    
    // Get patterns from fallback system's platform patterns
    const patterns = this.fallbackSystem.platformPatterns[platform]?.[mappedField] || [];
    return patterns;
  }

  /**
   * Generate selector using IntelligentSelectorGenerator
   * @deprecated - Now using BrowserIntelligence with real DOM access
   */
  async generateIntelligentSelector_DEPRECATED(page, field) {
    try {
      // Execute in page context to find likely elements
      const result = await page.evaluate((targetField) => {
        // Field-specific element detection with more patterns
        const fieldDetectors = {
          title: () => {
            const selectors = [
              'h1',
              '.product__title',
              '.product-single__title', 
              '[class*="product-title"]',
              '[class*="product-name"]',
              '[class*="product__name"]',
              '[itemprop="name"]',
              '.product-details h1',
              'h1.title'
            ];
            
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el && el.textContent.trim().length > 5) {
                return { element: true, selector: sel, text: el.textContent.trim().substring(0, 50) };
              }
            }
            return null;
          },
          price: () => {
            const selectors = [
              '.price__current',
              '.price-item--regular',
              '.product__price',
              '.product-single__price',
              '[class*="price"]:not([class*="old"]):not([class*="was"]):not([class*="compare"])',
              '.money:not(del .money)',
              '[itemprop="price"]',
              '.product-price',
              'span.price',
              '.price:first-of-type'
            ];
            
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el && /[\d,]+/.test(el.textContent)) {
                return { element: true, selector: sel, text: el.textContent.trim() };
              }
            }
            return null;
          },
          images: () => {
            const selectors = [
              '.product__media img',
              '.product-single__photo img',
              '.product__main-photos img',
              '[class*="product-image"] img',
              '[class*="gallery"] img',
              '[class*="product-photo"] img',
              '.product-images img',
              'img.product-featured-image',
              '.product img[src*="products"]'
            ];
            
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el && el.src) {
                return { element: true, selector: sel, src: el.src.substring(0, 100) };
              }
            }
            return null;
          },
          description: () => {
            const selectors = [
              '.product__description',
              '.product-single__description',
              '[class*="description"]:not([class*="meta"])',
              '[itemprop="description"]',
              '.product-description',
              '.rte', // Shopify rich text editor
              '.product-details .content'
            ];
            
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el && el.textContent.trim().length > 20) {
                return { element: true, selector: sel, text: el.textContent.trim().substring(0, 100) };
              }
            }
            return null;
          },
          variants: () => {
            const selectors = [
              'select.product-form__input',
              'select[name*="option"]',
              'select[name*="Size"]',
              'select[name*="Color"]',
              '[class*="variant-selector"]',
              '[class*="option-selector"]',
              '.product-form select',
              'input[type="radio"][name*="option"]',
              '.swatch input[type="radio"]'
            ];
            
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el) {
                return { element: true, selector: sel };
              }
            }
            return null;
          },
          brand: () => {
            const selectors = [
              '[itemprop="brand"]',
              '.product__vendor',
              '.product-single__vendor',
              '[class*="brand"]',
              '.vendor',
              'a[href*="/collections/vendors"]'
            ];
            
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el && el.textContent.trim().length > 1) {
                return { element: true, selector: sel, text: el.textContent.trim() };
              }
            }
            return null;
          },
          availability: () => {
            const selectors = [
              'button[name="add"]',
              'button[type="submit"][class*="add"]',
              '.product-form__submit',
              '[class*="add-to-cart"]',
              '[class*="availability"]',
              '[class*="stock"]',
              '.product-form button[type="submit"]',
              'form[action*="/cart/add"] button'
            ];
            
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el) {
                return { element: true, selector: sel, text: el.textContent?.trim() || el.value };
              }
            }
            return null;
          }
        };
        
        const detector = fieldDetectors[targetField];
        if (!detector) return null;
        
        const result = detector();
        return result;
      }, field);
      
      if (result && result.element && result.selector) {
        this.logger.debug(`Found ${field} with selector: ${result.selector}`, {
          sample: result.text || result.src
        });
        return result.selector;
      }
      
      return null;
    } catch (error) {
      this.logger.debug(`Failed to generate intelligent selector for ${field}:`, error.message);
      return null;
    }
  }

  /**
   * Generate fallback selectors
   * @deprecated - Now using DOM discovery instead of hardcoded patterns
   */
  async generateFallbacks_DEPRECATED(page, field, platform) {
    const fallbacks = [];
    
    // Common patterns for each field
    const commonPatterns = {
      title: ['h1', 'h2', '[itemprop="name"]', '.product-title', '.product-name'],
      price: ['.price', '.money', '[itemprop="price"]', '.product-price'],
      images: ['img[class*="product"]', '.gallery img', '[itemprop="image"]'],
      description: ['.description', '[itemprop="description"]', '.product-description'],
      variants: ['select[name*="size"]', 'select[name*="color"]', '[class*="variant"]'],
      brand: ['[itemprop="brand"]', '.brand', '.product-brand'],
      availability: ['.availability', '.in-stock', '.out-of-stock', 'button[type="submit"]']
    };
    
    const patterns = commonPatterns[field] || [];
    
    return patterns.map(selector => ({
      selector,
      source: 'fallback',
      confidence: 0.5
    }));
  }

  /**
   * Test selectors and select the best one
   */
  async testAndSelectBest(page, strategies, field) {
    let bestSelector = null;
    let bestScore = 0;
    
    for (const strategy of strategies) {
      try {
        // Test if selector exists and returns content
        const result = await page.evaluate((sel, targetField) => {
          try {
            const elements = document.querySelectorAll(sel);
            if (elements.length === 0) return null;
            
            // Check if element has content
            const element = elements[0];
            const hasContent = element.textContent?.trim().length > 0 || 
                               element.src || 
                               element.value;
            
            // Field-specific validation
            const validators = {
              price: (el) => /[\d,]+/.test(el.textContent),
              title: (el) => el.textContent?.length > 5,
              images: (el) => el.tagName === 'IMG' || el.querySelector('img'),
              availability: (el) => true
            };
            
            const validator = validators[targetField];
            const isValid = validator ? validator(element) : hasContent;
            
            return {
              found: true,
              count: elements.length,
              hasContent,
              isValid,
              sample: element.textContent?.substring(0, 50)
            };
          } catch (e) {
            return null;
          }
        }, strategy.selector, field);
        
        if (result?.isValid) {
          const score = strategy.confidence * (result.count === 1 ? 1 : 0.8);
          if (score > bestScore) {
            bestScore = score;
            bestSelector = {
              selector: strategy.selector,
              source: strategy.source,
              confidence: score,
              validated: true
            };
          }
        }
      } catch (error) {
        // Selector failed, continue
      }
    }
    
    return bestSelector;
  }

  /**
   * Evaluate strategy quality by testing on sample products
   */
  async evaluateStrategy(strategy, sampleUrls) {
    if (!strategy || !strategy.selectors) return 0;
    
    let totalScore = 0;
    let testsRun = 0;
    
    const page = await this.browser.newPage();
    
    try {
      // Test on each sample URL with human-like navigation
      for (const url of sampleUrls.slice(0, this.config.sampleSize)) {
        await this.browserIntelligence.navigateToPageLikeHuman(page, url);
        
        let fieldScores = {};
        let fieldCount = 0;
        
        // Test required fields (weighted higher)
        for (const field of this.config.requiredFields) {
          const selectorObj = strategy.selectors[field];
          if (selectorObj && selectorObj.selector) {
            const works = await this.testSelector(page, selectorObj.selector, field);
            fieldScores[field] = works ? 100 : 0;
            fieldCount++;
          } else {
            fieldScores[field] = 0;
            fieldCount++;
          }
        }
        
        // Test optional fields (weighted lower)
        for (const field of this.config.optionalFields) {
          const selectorObj = strategy.selectors[field];
          if (selectorObj && selectorObj.selector) {
            const works = await this.testSelector(page, selectorObj.selector, field);
            fieldScores[field] = works ? 50 : 0; // Half weight for optional
            fieldCount++;
          }
        }
        
        // Calculate score for this URL
        const urlScore = Object.values(fieldScores).reduce((sum, score) => sum + score, 0) / 
                        (this.config.requiredFields.length * 100 + this.config.optionalFields.length * 50) * 100;
        
        totalScore += urlScore;
        testsRun++;
        
        this.logger.debug(`Quality test on ${url}:`, {
          score: urlScore,
          fields: fieldScores
        });
      }
    } catch (error) {
      this.logger.error('Strategy evaluation failed:', error);
    } finally {
      await page.close();
    }
    
    return testsRun > 0 ? Math.round(totalScore / testsRun) : 0;
  }

  /**
   * Test if a selector works for a field
   */
  async testSelector(page, selector, field) {
    try {
      if (!selector) return false;
      
      const result = await page.evaluate(({sel, targetField}) => {
        const element = document.querySelector(sel);
        if (!element) return false;
        
        // Field-specific validation
        switch(targetField) {
          case 'title':
            return element.textContent?.trim().length > 5;
          case 'price':
            return /[\d,]+/.test(element.textContent);
          case 'images':
            return element.tagName === 'IMG' || !!element.querySelector('img');
          case 'description':
            return element.textContent?.trim().length > 20;
          case 'availability':
            return element.textContent?.trim().length > 0;
          case 'variants':
            return true; // If element exists, variants are present
          case 'brand':
            return element.textContent?.trim().length > 0;
          default:
            return element.textContent?.trim().length > 0;
        }
      }, {sel: selector, targetField: field});
      
      return result;
    } catch (error) {
      this.logger.debug(`Test selector failed for ${field}: ${error.message}`);
      return false;
    }
  }

  /**
   * Learn from failures and adjust strategy using AdaptiveRetryStrategy
   */
  async learnFromFailures(strategy, domain, sampleUrls, attemptNumber = 1) {
    this.logger.info(`Learning from failures for ${domain} (attempt ${attemptNumber})`);
    
    // Identify which fields failed
    const missingFields = this.config.requiredFields.filter(field => !strategy.selectors[field]);
    
    if (missingFields.length > 0) {
      this.logger.info(`Missing required fields: ${missingFields.join(', ')}`);
      
      // Learn from this attempt using AdaptiveRetryStrategy
      const attemptData = {
        strategy,
        domain,
        attemptNumber,
        missingFields,
        quality: await this.evaluateStrategy(strategy, sampleUrls),
        timestamp: Date.now()
      };
      
      this.retryStrategy.learnFromAttempt(domain, attemptData);
      
      // Skip the automatic retry for now to prevent excessive browser usage
      // The retry logic will be handled in the main discovery loop instead
      this.logger.info(`Will retry missing fields in next attempt: ${missingFields.join(', ')}`);
      
      // Just learn from this attempt for future retries
      if (attemptNumber < this.config.maxAttempts) {
        this.logger.info(`Prepared retry strategies for next attempt`);
      }
    }
  }

  /**
   * Extract selectors that worked in previous attempts
   */
  extractLearnedSelectors(previousAttempts, field) {
    const learned = [];
    
    for (const attempt of previousAttempts) {
      const selector = attempt.strategy?.selectors?.[field];
      if (selector && attempt.quality > 30) {
        learned.push({
          selector: selector.selector,
          source: 'learned',
          confidence: attempt.quality / 100
        });
      }
    }
    
    return learned;
  }

  /**
   * Detect e-commerce platform
   */
  async detectPlatform(page, domain) {
    try {
      const platform = await page.evaluate(() => {
        const pageContent = document.documentElement.innerHTML;
        
        if (pageContent.includes('Shopify') || pageContent.includes('shopify')) {
          return 'shopify';
        }
        if (pageContent.includes('WooCommerce') || pageContent.includes('woocommerce')) {
          return 'woocommerce';
        }
        if (pageContent.includes('Magento')) {
          return 'magento';
        }
        
        return 'custom';
      });
      
      return platform;
    } catch (error) {
      return 'custom';
    }
  }

  /**
   * Determine extraction rules based on discovered selectors
   */
  async determineExtractionRules(page, selectors) {
    const rules = {
      requires_js: false,
      wait_for_elements: [],
      interaction_required: false,
      scroll_required: false
    };
    
    try {
      // Check if content is loaded dynamically
      const isDynamic = await page.evaluate(() => {
        return document.readyState !== 'complete' || 
               document.querySelectorAll('[data-react], [data-vue], [ng-app]').length > 0;
      });
      
      rules.requires_js = isDynamic;
      
      // Determine which elements to wait for
      if (selectors.price?.selector) {
        rules.wait_for_elements.push(selectors.price.selector);
      }
      if (selectors.title?.selector) {
        rules.wait_for_elements.push(selectors.title.selector);
      }
      
    } catch (error) {
      this.logger.debug('Failed to determine extraction rules:', error.message);
    }
    
    return rules;
  }

  /**
   * Store successful strategy
   */
  async storeStrategy(domain, strategy) {
    try {
      // Store in MongoDB via WorldModel
      if (this.worldModel.storeExtractionStrategy) {
        await this.worldModel.storeExtractionStrategy(domain, strategy);
      }
      
      // Also cache in Redis for fast access
      if (this.worldModel.cacheExtractionStrategy) {
        await this.worldModel.cacheExtractionStrategy(domain, strategy);
      }
      
      this.logger.info(`Stored extraction strategy for ${domain} with quality ${strategy.quality}%`);
      
      // Store learning history
      this.learningHistory.set(domain, {
        strategy,
        learned_at: new Date(),
        quality: strategy.quality
      });
      
    } catch (error) {
      this.logger.error(`Failed to store strategy for ${domain}:`, error);
    }
  }

  /**
   * Load existing strategy for a domain
   */
  async loadStrategy(domain) {
    try {
      // Try cache first
      if (this.worldModel.getCachedExtractionStrategy) {
        const cached = await this.worldModel.getCachedExtractionStrategy(domain);
        if (cached) return cached;
      }
      
      // Try MongoDB
      if (this.worldModel.getExtractionStrategy) {
        const stored = await this.worldModel.getExtractionStrategy(domain);
        if (stored) return stored;
      }
      
      // Check local history
      const local = this.learningHistory.get(domain);
      if (local) return local.strategy;
      
      return null;
    } catch (error) {
      this.logger.error(`Failed to load strategy for ${domain}:`, error);
      return null;
    }
  }

  /**
   * Clean up resources
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = ExtractorIntelligence;