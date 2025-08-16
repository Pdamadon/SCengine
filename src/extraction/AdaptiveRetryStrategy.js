/**
 * AdaptiveRetryStrategy
 * 
 * Learns from previous attempts and implements intelligent retry logic
 * for selector discovery and validation.
 */

const SelectorCacheSingleton = require('../cache/SelectorCacheSingleton');

class AdaptiveRetryStrategy {
  constructor(logger) {
    this.logger = logger;
    this.attemptHistory = new Map(); // domain -> attempts
    this.learnedPatterns = new Map(); // domain -> patterns
    this.selectorCache = SelectorCacheSingleton.getInstance();
    this.cacheInitialized = false;
    
    this.config = {
      maxRetryAttempts: 3,
      learningThreshold: 0.5, // Minimum confidence to learn from attempt
      proximityDistance: 200,  // Pixels to search around working selectors
      interactionMethods: ['click', 'hover', 'select', 'focus'],
      waitTimes: [500, 1000, 1500, 2000], // Different wait times to try
    };
  }

  /**
   * Initialize cache connection
   */
  async initializeCache() {
    if (!this.cacheInitialized) {
      await this.selectorCache.initialize(this.logger);
      this.cacheInitialized = true;
      this.logger?.debug('AdaptiveRetryStrategy singleton cache initialized');
    }
  }

  /**
   * Analyze previous attempts to extract useful patterns
   */
  extractPatterns(attempts) {
    const patterns = {
      workingSelectors: [],
      failedSelectors: [],
      workingInteractions: [],
      commonParents: [],
      workingFieldTypes: new Set(),
      platformHints: null
    };

    attempts.forEach(attempt => {
      if (attempt.strategy && attempt.strategy.selectors) {
        Object.entries(attempt.strategy.selectors).forEach(([field, selectorObj]) => {
          if (selectorObj.confidence > this.config.learningThreshold) {
            patterns.workingSelectors.push({
              field,
              selector: selectorObj.selector,
              confidence: selectorObj.confidence,
              source: selectorObj.source
            });
            patterns.workingFieldTypes.add(field);
          } else {
            patterns.failedSelectors.push({
              field,
              selector: selectorObj.selector,
              reason: 'low_confidence'
            });
          }
        });
      }

      // Extract interaction patterns
      if (attempt.validationResults) {
        attempt.validationResults.forEach(validation => {
          if (validation.works) {
            patterns.workingInteractions.push({
              selector: validation.selector,
              method: validation.interactionMethod,
              changes: validation.changes
            });
          }
        });
      }

      // Platform detection
      if (attempt.strategy && attempt.strategy.platform) {
        patterns.platformHints = attempt.strategy.platform;
      }
    });

    return patterns;
  }

  /**
   * Find selectors near known working selectors
   */
  async findNearbySelectors(page, workingSelectors, targetField) {
    this.logger?.debug(`Looking for ${targetField} selectors near working ones`);

    try {
      const nearbySelectors = await page.evaluate((workingList, field, distance) => {
        const candidates = [];

        workingList.forEach(working => {
          try {
            const workingElement = document.querySelector(working.selector);
            if (!workingElement) return;

            const workingRect = workingElement.getBoundingClientRect();
            
            // Search for elements within proximity
            const allElements = document.querySelectorAll('*');
            
            allElements.forEach(el => {
              const rect = el.getBoundingClientRect();
              
              // Calculate distance
              const distanceX = Math.abs(rect.left - workingRect.left);
              const distanceY = Math.abs(rect.top - workingRect.top);
              const totalDistance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
              
              if (totalDistance <= distance && el !== workingElement) {
                // Check if element might be relevant for target field
                const isRelevant = this.elementSeemsMrelevantForField(el, field);
                
                if (isRelevant) {
                  candidates.push({
                    selector: this.generateSelectorForElement(el),
                    distance: totalDistance,
                    tagName: el.tagName.toLowerCase(),
                    textContent: el.textContent?.trim().substring(0, 50) || '',
                    className: el.className
                  });
                }
              }
            });
          } catch (error) {
            // Continue if individual selector fails
          }
        });

        return candidates.sort((a, b) => a.distance - b.distance);

      }, workingSelectors, targetField, this.config.proximityDistance);

      return nearbySelectors;

    } catch (error) {
      this.logger?.error('Failed to find nearby selectors:', error);
      return [];
    }
  }

  /**
   * Try alternative interaction methods on discovered selectors
   */
  async tryAlternativeInteractions(page, selectors, browserIntelligence) {
    const results = [];

    for (const selector of selectors.slice(0, 3)) { // Limit to prevent excessive testing
      for (const method of this.config.interactionMethods) {
        try {
          this.logger?.debug(`Trying ${method} interaction on ${selector}`);

          const validation = await this.testInteractionMethod(
            page, 
            selector, 
            method, 
            browserIntelligence
          );

          if (validation.works) {
            results.push({
              selector,
              interactionMethod: method,
              ...validation
            });
            break; // Found working method, move to next selector
          }

        } catch (error) {
          this.logger?.debug(`${method} interaction failed:`, error.message);
          continue;
        }
      }
    }

    return results;
  }

  /**
   * Test a specific interaction method on a selector
   */
  async testInteractionMethod(page, selector, method, browserIntelligence) {
    const beforeState = await browserIntelligence.capturePageState(page);
    if (!beforeState) return { works: false };

    try {
      const element = await page.$(selector);
      if (!element) return { works: false };

      switch (method) {
        case 'click':
          await browserIntelligence.humanClick(page, element);
          break;
        case 'hover':
          await browserIntelligence.humanHover(page, element);
          break;
        case 'focus':
          await element.focus();
          break;
        case 'select':
          // For select elements, try changing selection
          const tagName = await element.evaluate(el => el.tagName.toLowerCase());
          if (tagName === 'select') {
            const options = await element.$$('option');
            if (options.length > 1) {
              await element.selectOption({ index: 1 });
            }
          } else {
            // Skip non-select elements for select method
            return { works: false };
          }
          break;
        default:
          return { works: false };
      }

      // Wait for changes
      await browserIntelligence.humanDelay(1000);

      // Check for changes
      const afterState = await browserIntelligence.capturePageState(page);
      const changes = browserIntelligence.detectChanges(beforeState, afterState);
      const confidence = browserIntelligence.calculateValidationConfidence(changes);

      return {
        works: changes.length > 0,
        confidence,
        changes,
        interactionMethod: method
      };

    } catch (error) {
      return { works: false, reason: error.message };
    }
  }

  /**
   * Discover selectors through strategic interaction
   */
  async discoverThroughInteraction(page, targetField, browserIntelligence) {
    this.logger?.debug(`Discovering ${targetField} through strategic interaction`);

    const discoveries = [];

    try {
      // Strategy 1: Interact with product images to reveal variant UI
      if (targetField === 'variants' || targetField === 'color') {
        const imageSelectors = [
          'img[class*="product"]', 
          '.product img', 
          '[class*="gallery"] img',
          'picture img'
        ];

        for (const imgSelector of imageSelectors) {
          try {
            const images = await page.$$(imgSelector);
            if (images.length > 0) {
              await browserIntelligence.humanClick(page, images[0]);
              await browserIntelligence.humanDelay(1000);

              // Look for newly appeared elements
              const newElements = await this.findRecentlyAppearedElements(page);
              discoveries.push(...newElements);
            }
          } catch (error) {
            continue;
          }
        }
      }

      // Strategy 2: Scroll to reveal lazy-loaded variant options
      await browserIntelligence.humanScroll(page, 'down');
      await browserIntelligence.humanDelay(1000);

      // Strategy 3: Look for expandable sections
      const expandableSelectors = [
        '[class*="expand"]',
        '[class*="toggle"]', 
        '[class*="show-more"]',
        '.accordion'
      ];

      for (const expandSelector of expandableSelectors) {
        try {
          const expandables = await page.$$(expandSelector);
          for (const expandable of expandables.slice(0, 2)) {
            await browserIntelligence.humanClick(page, expandable);
            await browserIntelligence.humanDelay(500);
          }
        } catch (error) {
          continue;
        }
      }

      return discoveries;

    } catch (error) {
      this.logger?.error('Discovery through interaction failed:', error);
      return [];
    }
  }

  /**
   * Find elements that recently appeared (simple heuristic)
   */
  async findRecentlyAppearedElements(page) {
    try {
      return await page.evaluate(() => {
        // Look for elements that might have been dynamically added
        const candidates = [];
        const recentSelectors = [
          '[class*="variant"]:not([style*="display: none"])',
          '[class*="option"]:not([style*="display: none"])',
          '[class*="color"]:not([style*="display: none"])',
          '[class*="size"]:not([style*="display: none"])',
          'select:not([style*="display: none"])',
          'input[type="radio"]:not([style*="display: none"])'
        ];

        recentSelectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              // Check if element is visible and interactive
              const rect = el.getBoundingClientRect();
              if (rect.height > 0 && rect.width > 0) {
                candidates.push({
                  selector: selector,
                  tagName: el.tagName.toLowerCase(),
                  className: el.className,
                  visible: true
                });
              }
            });
          } catch (e) {
            // Continue with other selectors
          }
        });

        return candidates;
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Learn from a completed attempt
   */
  async learnFromAttempt(domain, attempt) {
    if (!this.attemptHistory.has(domain)) {
      this.attemptHistory.set(domain, []);
    }

    this.attemptHistory.get(domain).push({
      ...attempt,
      timestamp: Date.now()
    });

    // Extract patterns for future use
    const attempts = this.attemptHistory.get(domain);
    const patterns = this.extractPatterns(attempts);
    this.learnedPatterns.set(domain, patterns);

    // Cache working selectors from learned patterns
    await this.cacheLearnedPatterns(domain, patterns);

    this.logger?.debug(`Learned from attempt for ${domain}:`, {
      totalAttempts: attempts.length,
      workingSelectors: patterns.workingSelectors.length,
      workingFields: patterns.workingFieldTypes.size
    });
  }

  /**
   * Cache selectors from learned patterns
   */
  async cacheLearnedPatterns(domain, patterns) {
    try {
      await this.initializeCache();
      
      for (const workingSelector of patterns.workingSelectors) {
        if (workingSelector.confidence > this.config.learningThreshold) {
          await this.selectorCache.getOrDiscoverSelector(
            domain,
            workingSelector.field,
            {
              discoveryFn: async () => ({
                selector: workingSelector.selector,
                alternatives: [],
                reliability: workingSelector.confidence,
                discoveryMethod: 'pattern_learning',
                metadata: {
                  source: workingSelector.source,
                  validated: true,
                  learnedFromAttempts: true
                }
              }),
              elementType: this.getElementTypeForField(workingSelector.field),
              context: { domain }
            }
          );
        }
      }
    } catch (error) {
      this.logger?.error('Failed to cache learned patterns:', error);
    }
  }

  /**
   * Get retry strategy based on learned patterns
   */
  getRetryStrategy(domain, targetField, currentAttempt) {
    const patterns = this.learnedPatterns.get(domain);
    if (!patterns) {
      return {
        method: 'proximity_search',
        priority: 'low'
      };
    }

    // If we have working selectors, try proximity search
    if (patterns.workingSelectors.length > 0) {
      return {
        method: 'proximity_search',
        workingSelectors: patterns.workingSelectors,
        priority: 'high'
      };
    }

    // If we know the platform, try platform-specific strategies
    if (patterns.platformHints) {
      return {
        method: 'platform_specific',
        platform: patterns.platformHints,
        priority: 'medium'
      };
    }

    // Try interaction-based discovery
    return {
      method: 'interaction_discovery',
      priority: 'medium'
    };
  }

  /**
   * Execute a retry attempt based on strategy
   */
  async executeRetryStrategy(page, strategy, targetField, browserIntelligence) {
    await this.initializeCache();
    
    const domain = new URL(page.url()).hostname;
    
    // Check cache first for proven selectors
    try {
      const cached = await this.selectorCache.getOrDiscoverSelector(
        domain,
        targetField,
        {
          elementType: this.getElementTypeForField(targetField),
          context: { url: page.url() }
        }
      );
      
      if (cached && cached.selector && cached.fromCache) {
        this.logger?.debug(`Using cached selector for ${domain}:${targetField}: ${cached.selector}`);
        return [{
          selector: cached.selector,
          confidence: cached.reliability || 0.8,
          source: 'cache',
          validated: true
        }];
      }
    } catch (error) {
      this.logger?.warn('Cache lookup failed, continuing with strategy:', error.message);
    }
    
    // Execute original strategy
    let results = [];
    switch (strategy.method) {
      case 'proximity_search':
        results = await this.findNearbySelectors(page, strategy.workingSelectors, targetField);
        break;
        
      case 'interaction_discovery':
        results = await this.discoverThroughInteraction(page, targetField, browserIntelligence);
        break;
        
      case 'alternative_interactions':
        const basicSelectors = await browserIntelligence.discoverSelectors(page, targetField);
        results = await this.tryAlternativeInteractions(page, basicSelectors.map(s => s.selector), browserIntelligence);
        break;
        
      default:
        results = [];
    }
    
    // Cache successful discoveries
    if (results && results.length > 0) {
      await this.cacheSuccessfulSelectors(domain, targetField, results);
    }
    
    return results;
  }

  /**
   * Cache successful selector discoveries
   */
  async cacheSuccessfulSelectors(domain, targetField, results) {
    try {
      const highConfidenceResults = results.filter(r => 
        r.confidence && r.confidence > this.config.learningThreshold
      );
      
      for (const result of highConfidenceResults) {
        if (result.selector) {
          await this.selectorCache.getOrDiscoverSelector(
            domain,
            targetField,
            {
              discoveryFn: async () => ({
                selector: result.selector,
                alternatives: results.filter(r => r !== result).map(r => r.selector),
                reliability: result.confidence,
                discoveryMethod: result.source || 'adaptive_retry',
                metadata: {
                  validated: result.validated || false,
                  interactionMethod: result.interactionMethod,
                  patterns: result.patterns
                }
              }),
              elementType: this.getElementTypeForField(targetField),
              context: { domain }
            }
          );
        }
      }
    } catch (error) {
      this.logger?.error('Failed to cache selectors:', error);
    }
  }

  /**
   * Helper to map field to element type
   */
  getElementTypeForField(field) {
    const typeMap = {
      'title': 'text',
      'price': 'price', 
      'image': 'image',
      'variants': 'options',
      'color': 'options',
      'size': 'options',
      'availability': 'status',
      'description': 'text',
      'specifications': 'list'
    };
    
    return typeMap[field] || 'generic';
  }
}

module.exports = AdaptiveRetryStrategy;