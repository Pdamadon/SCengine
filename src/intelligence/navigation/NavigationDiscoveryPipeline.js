/**
 * NavigationDiscoveryPipeline.js
 * 
 * Orchestrates multiple navigation discovery strategies to find ALL navigation elements
 * on any website, regardless of how they're implemented or hidden.
 * 
 * Aligns with UNIVERSAL_SCRAPER_CLAUDE.md requirements:
 * - Progressive enhancement through learning (line 87-98)
 * - Builds category_hierarchy for quality scoring (line 51)
 * 
 * Key Features:
 * - Runs strategies in sequence or parallel
 * - Merges and deduplicates results
 * - Tracks strategy success rates
 * - Learns which strategies work for which domains
 */

class NavigationDiscoveryPipeline {
  constructor(logger, worldModel = null) {
    this.logger = logger;
    this.worldModel = worldModel;
    this.strategies = [];
    this.results = {
      discovered: [],
      strategyMetrics: {},
      totalDiscovered: 0,
      confidence: 0
    };
  }

  /**
   * Register a strategy to the pipeline
   */
  addStrategy(strategy) {
    if (!strategy.execute || typeof strategy.execute !== 'function') {
      throw new Error('Strategy must have an execute method');
    }
    this.strategies.push(strategy);
    this.logger.debug(`Added strategy: ${strategy.constructor.name}`);
  }

  /**
   * Register multiple strategies at once
   */
  addStrategies(strategies) {
    strategies.forEach(strategy => this.addStrategy(strategy));
  }

  /**
   * Main discovery method - runs all strategies and merges results
   */
  async discover(page, options = {}) {
    const {
      maxStrategies = 10,        // Max strategies to try
      minConfidence = 0.3,       // Min confidence to accept results
      parallel = false,          // Run strategies in parallel
      timeout = 30000,           // Overall timeout
      earlyExit = true          // Stop if we find enough navigation
    } = options;

    this.logger.info(`🔍 Starting navigation discovery with ${this.strategies.length} strategies`);
    const startTime = Date.now();
    const domain = await this.extractDomain(page);

    // Get strategy priority from learning
    const strategyPriority = await this.getStrategyPriority(domain);
    const orderedStrategies = this.orderStrategies(strategyPriority);

    // Reset results
    this.results = {
      discovered: [],
      strategyMetrics: {},
      totalDiscovered: 0,
      confidence: 0,
      domain: domain,
      timestamp: new Date().toISOString()
    };

    // Execute strategies
    if (parallel) {
      await this.executeParallel(page, orderedStrategies, maxStrategies, timeout);
    } else {
      await this.executeSequential(page, orderedStrategies, maxStrategies, timeout, earlyExit, minConfidence);
    }

    // Process and merge results
    const mergedResults = this.mergeResults();
    
    // Calculate overall confidence
    this.results.confidence = this.calculateConfidence(mergedResults);
    
    // Store successful patterns for learning
    if (this.worldModel && this.results.confidence > 0.5) {
      await this.storeSuccessfulPatterns(domain, mergedResults);
    }

    const duration = Date.now() - startTime;
    this.logger.info(`✅ Navigation discovery complete: ${this.results.totalDiscovered} elements found in ${duration}ms (confidence: ${(this.results.confidence * 100).toFixed(1)}%)`);

    return this.formatResults(mergedResults);
  }

  /**
   * Execute strategies sequentially
   */
  async executeSequential(page, strategies, maxStrategies, timeout, earlyExit, minConfidence) {
    const timeoutTime = Date.now() + timeout;
    let strategyCount = 0;

    for (const strategy of strategies) {
      if (strategyCount >= maxStrategies) break;
      if (Date.now() > timeoutTime) {
        this.logger.warn('Navigation discovery timeout reached');
        break;
      }

      try {
        this.logger.debug(`Running strategy: ${strategy.constructor.name}`);
        const startTime = Date.now();
        
        // Execute strategy with timeout
        const strategyTimeout = Math.min(5000, timeoutTime - Date.now());
        const result = await Promise.race([
          strategy.execute(page),
          this.timeout(strategyTimeout)
        ]);

        const duration = Date.now() - startTime;
        
        // Store strategy results
        this.results.strategyMetrics[strategy.constructor.name] = {
          duration: duration,
          itemsFound: result?.items?.length || 0,
          confidence: result?.confidence || 0,
          success: true
        };

        if (result && result.items && result.items.length > 0) {
          this.results.discovered.push({
            strategy: strategy.constructor.name,
            items: result.items,
            confidence: result.confidence || 0.5,
            metadata: result.metadata || {}
          });
          
          this.logger.info(`  ✓ ${strategy.constructor.name}: Found ${result.items.length} items (${duration}ms)`);
        } else {
          this.logger.debug(`  ✗ ${strategy.constructor.name}: No items found (${duration}ms)`);
        }

        strategyCount++;

        // Early exit if we have enough high-confidence results
        if (earlyExit && this.hasEnoughNavigation(minConfidence)) {
          this.logger.info('Early exit: Sufficient navigation discovered');
          break;
        }

      } catch (error) {
        this.logger.warn(`Strategy ${strategy.constructor.name} failed: ${error.message}`);
        this.results.strategyMetrics[strategy.constructor.name] = {
          duration: 0,
          itemsFound: 0,
          confidence: 0,
          success: false,
          error: error.message
        };
      }
    }
  }

  /**
   * Execute strategies in parallel
   */
  async executeParallel(page, strategies, maxStrategies, timeout) {
    const strategiesToRun = strategies.slice(0, maxStrategies);
    const timeoutTime = Date.now() + timeout;

    const promises = strategiesToRun.map(async (strategy) => {
      try {
        const strategyTimeout = Math.min(5000, timeoutTime - Date.now());
        const startTime = Date.now();
        
        const result = await Promise.race([
          strategy.execute(page),
          this.timeout(strategyTimeout)
        ]);

        const duration = Date.now() - startTime;

        return {
          strategy: strategy.constructor.name,
          result: result,
          duration: duration,
          success: true
        };
      } catch (error) {
        return {
          strategy: strategy.constructor.name,
          error: error.message,
          success: false
        };
      }
    });

    const results = await Promise.allSettled(promises);

    results.forEach(({ status, value }) => {
      if (status === 'fulfilled' && value.success && value.result?.items?.length > 0) {
        this.results.discovered.push({
          strategy: value.strategy,
          items: value.result.items,
          confidence: value.result.confidence || 0.5,
          metadata: value.result.metadata || {}
        });

        this.results.strategyMetrics[value.strategy] = {
          duration: value.duration,
          itemsFound: value.result.items.length,
          confidence: value.result.confidence || 0,
          success: true
        };

        this.logger.info(`  ✓ ${value.strategy}: Found ${value.result.items.length} items`);
      }
    });
  }

  /**
   * Merge results from all strategies, removing duplicates
   */
  mergeResults() {
    const merged = {
      main_sections: [],
      dropdown_menus: {},
      navigation_selectors: {},
      clickable_elements: [],
      breadcrumb_patterns: [],
      sidebar_navigation: [],
      _metadata: {
        strategies_used: [],
        total_strategies: this.strategies.length,
        confidence_scores: {}
      }
    };

    const seenUrls = new Set();
    const seenSelectors = new Set();

    this.results.discovered.forEach(({ strategy, items, confidence }) => {
      merged._metadata.strategies_used.push(strategy);
      merged._metadata.confidence_scores[strategy] = confidence;

      items.forEach(item => {
        // Deduplicate by URL
        if (item.url && !seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          
          // Categorize the item
          if (item.type === 'main_section' || item.isMainNav) {
            merged.main_sections.push({
              name: item.name || item.text,
              url: item.url,
              selector: item.selector,
              has_dropdown: item.has_dropdown || false,
              element_type: item.element_type || 'a',
              discovered_via: item.discovered_via || strategy, // Preserve original attribution
              discovered_by: strategy,
              confidence: confidence
            });
          } else if (item.type === 'dropdown' || item.isDropdown) {
            const dropdownKey = `dropdown_${Object.keys(merged.dropdown_menus).length}`;
            merged.dropdown_menus[dropdownKey] = {
              selector: item.selector,
              trigger_selector: item.trigger_selector,
              items: item.items || [],
              discovered_by: strategy
            };
          } else if (item.type === 'breadcrumb') {
            merged.breadcrumb_patterns.push(item);
          } else if (item.type === 'sidebar') {
            merged.sidebar_navigation.push(item);
          } else {
            // Default to clickable element
            merged.clickable_elements.push({
              text: item.name || item.text,
              url: item.url,
              selector: item.selector,
              type: item.element_type || 'a',
              page_purpose: item.purpose || 'navigation',
              discovered_by: strategy
            });
          }
        }

        // Store unique selectors
        if (item.selector && !seenSelectors.has(item.selector)) {
          seenSelectors.add(item.selector);
          const category = item.selector_category || 'general';
          if (!merged.navigation_selectors[category]) {
            merged.navigation_selectors[category] = [];
          }
          merged.navigation_selectors[category].push(item.selector);
        }
      });
    });

    this.results.totalDiscovered = seenUrls.size;
    return merged;
  }

  /**
   * Check if we have discovered enough navigation
   */
  hasEnoughNavigation(minConfidence = 0.3) {
    const totalItems = this.results.discovered.reduce((sum, r) => sum + r.items.length, 0);
    const avgConfidence = this.results.discovered.reduce((sum, r) => sum + r.confidence, 0) / 
                          (this.results.discovered.length || 1);

    // We have enough if:
    // 1. Found at least 10 main navigation items with good confidence
    // 2. Or found at least 100 total items (was 20)
    // 3. Or have very high average confidence
    return (totalItems >= 10 && avgConfidence >= minConfidence) ||
           totalItems >= 100 ||
           avgConfidence >= 0.9;
  }

  /**
   * Calculate overall confidence score
   */
  calculateConfidence(mergedResults) {
    const factors = {
      mainSections: mergedResults.main_sections.length > 0 ? 0.3 : 0,
      dropdowns: Object.keys(mergedResults.dropdown_menus).length > 0 ? 0.2 : 0,
      totalElements: Math.min(mergedResults.main_sections.length / 10, 1) * 0.2,
      strategySuccess: this.calculateStrategySuccessRate() * 0.3
    };

    return Object.values(factors).reduce((sum, val) => sum + val, 0);
  }

  /**
   * Calculate strategy success rate
   */
  calculateStrategySuccessRate() {
    const metrics = Object.values(this.results.strategyMetrics);
    if (metrics.length === 0) return 0;
    
    const successful = metrics.filter(m => m.success && m.itemsFound > 0).length;
    return successful / metrics.length;
  }

  /**
   * Order strategies based on learned priority for this domain
   */
  orderStrategies(priority) {
    if (!priority || priority.length === 0) {
      return this.strategies;
    }

    const priorityMap = {};
    priority.forEach((name, index) => {
      priorityMap[name] = index;
    });

    return [...this.strategies].sort((a, b) => {
      const aPriority = priorityMap[a.constructor.name] ?? 999;
      const bPriority = priorityMap[b.constructor.name] ?? 999;
      return aPriority - bPriority;
    });
  }

  /**
   * Get strategy priority from WorldModel learning
   */
  async getStrategyPriority(domain) {
    if (!this.worldModel) return [];

    try {
      const patterns = await this.worldModel.getSitePatterns(domain);
      return patterns?.navigation?.strategy_priority || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Store successful patterns for future learning
   */
  async storeSuccessfulPatterns(domain, results) {
    if (!this.worldModel) return;

    try {
      const patterns = {
        successful_strategies: this.results.discovered
          .filter(d => d.items.length > 0)
          .map(d => d.strategy),
        navigation_selectors: results.navigation_selectors,
        element_count: results.main_sections.length,
        confidence: this.results.confidence,
        timestamp: new Date().toISOString()
      };

      await this.worldModel.storeNavigationPatterns(domain, patterns);
    } catch (error) {
      this.logger.warn('Failed to store navigation patterns:', error.message);
    }
  }

  /**
   * Format results to match NavigationMapper's expected structure
   */
  formatResults(mergedResults) {
    return {
      navigation_map: mergedResults,
      discovery_metadata: {
        strategies_used: this.results.discovered.map(d => d.strategy),
        total_discovered: this.results.totalDiscovered,
        confidence: this.results.confidence,
        metrics: this.results.strategyMetrics
      }
    };
  }

  /**
   * Extract domain from page
   */
  async extractDomain(page) {
    try {
      const url = await page.url();
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Timeout helper
   */
  timeout(ms) {
    return new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    );
  }
}

module.exports = NavigationDiscoveryPipeline;