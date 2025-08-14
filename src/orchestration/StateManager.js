/**
 * StateManager - Centralized state management for orchestration
 * 
 * Manages:
 * - Job state and lifecycle
 * - Discovery results persistence
 * - Learning progress tracking
 * - Extraction results caching
 * - Cross-domain pattern sharing
 * 
 * This replaces scattered WorldModel usage with unified interface
 */

const WorldModel = require('../intelligence/WorldModel');
const RedisCache = require('../cache/RedisCache');

class StateManager {
  constructor(logger) {
    this.logger = logger;
    
    // Initialize storage backends
    this.worldModel = new WorldModel(logger);
    this.cache = new RedisCache(logger);
    
    // In-memory state for active sessions
    this.activeStates = new Map();
    this.domainPatterns = new Map();
    this.learningHistory = new Map();
  }

  /**
   * Initialize state management
   */
  async initialize() {
    await this.worldModel.initialize();
    await this.cache.connect();
    
    // Load cached patterns
    await this.loadCachedPatterns();
    
    this.logger.info('StateManager initialized');
  }

  /**
   * Store discovery results
   */
  async storeDiscovery(domain, discoveryData) {
    const key = `discovery:${domain}`;
    
    try {
      // Store in WorldModel
      await this.worldModel.storeSiteNavigation(domain, discoveryData.navigation);
      
      // Cache discovery data
      const cacheData = {
        domain,
        navigation: discoveryData.navigation,
        metadata: discoveryData.metadata,
        timestamp: new Date().toISOString()
      };
      
      await this.cache.set(key, JSON.stringify(cacheData), 7 * 24 * 60 * 60); // 7 days TTL
      
      // Update in-memory state
      if (!this.activeStates.has(domain)) {
        this.activeStates.set(domain, {});
      }
      this.activeStates.get(domain).discovery = cacheData;
      
      this.logger.info('Stored discovery data', {
        domain,
        navigationItems: discoveryData.navigation?.total_items || 0
      });
      
      return true;
      
    } catch (error) {
      this.logger.error('Failed to store discovery data', {
        domain,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get discovery results
   */
  async getDiscovery(domain) {
    // Check in-memory first
    if (this.activeStates.has(domain)) {
      const state = this.activeStates.get(domain);
      if (state.discovery) {
        return state.discovery;
      }
    }
    
    // Check cache
    const key = `discovery:${domain}`;
    const cached = await this.cache.get(key);
    
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (error) {
        this.logger.warn('Failed to parse cached discovery', { domain });
      }
    }
    
    // Check WorldModel
    const navigation = await this.worldModel.getSiteNavigation(domain);
    if (navigation) {
      return {
        domain,
        navigation: navigation.navigation_map,
        metadata: {
          timestamp: navigation.created_at
        }
      };
    }
    
    return null;
  }

  /**
   * Store learning results
   */
  async storeLearning(domain, learningData) {
    const key = `learning:${domain}`;
    
    try {
      // Store patterns in WorldModel (if the method exists)
      if (this.worldModel.storeNavigationPatterns) {
        await this.worldModel.storeNavigationPatterns(domain, learningData.patterns);
      }
      
      // Store selectors in WorldModel
      if (this.worldModel.storeSelectorLibrary) {
        await this.worldModel.storeSelectorLibrary(domain, learningData.selectors);
      }
      
      // Cache learning data
      const cacheData = {
        domain,
        quality: learningData.quality,
        patterns: learningData.patterns,
        selectors: learningData.selectors,
        platform_detected: learningData.platform_detected,
        attempts: learningData.attempts,
        timestamp: new Date().toISOString()
      };
      
      await this.cache.set(key, JSON.stringify(cacheData), 30 * 24 * 60 * 60); // 30 days TTL
      
      // Update in-memory state
      if (!this.activeStates.has(domain)) {
        this.activeStates.set(domain, {});
      }
      this.activeStates.get(domain).learning = cacheData;
      
      // Track learning history
      if (!this.learningHistory.has(domain)) {
        this.learningHistory.set(domain, []);
      }
      this.learningHistory.get(domain).push({
        quality: learningData.quality,
        timestamp: new Date().toISOString()
      });
      
      // Store domain patterns for cross-domain learning
      this.storeDomainPatterns(domain, learningData.patterns);
      
      this.logger.info('Stored learning data', {
        domain,
        quality: learningData.quality,
        patternsLearned: learningData.patterns?.length || 0
      });
      
      return true;
      
    } catch (error) {
      this.logger.error('Failed to store learning data', {
        domain,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get learning results
   */
  async getLearning(domain) {
    // Check in-memory first
    if (this.activeStates.has(domain)) {
      const state = this.activeStates.get(domain);
      if (state.learning) {
        return state.learning;
      }
    }
    
    // Check cache
    const key = `learning:${domain}`;
    const cached = await this.cache.get(key);
    
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (error) {
        this.logger.warn('Failed to parse cached learning', { domain });
      }
    }
    
    return null;
  }

  /**
   * Store extraction results
   */
  async storeExtraction(domain, extractionData) {
    const key = `extraction:${domain}:${Date.now()}`;
    
    try {
      // Store summary in cache (not full product data)
      const summary = {
        domain,
        productsExtracted: extractionData.products?.length || 0,
        stats: extractionData.stats,
        timestamp: new Date().toISOString()
      };
      
      await this.cache.set(key, JSON.stringify(summary), 24 * 60 * 60); // 24 hours TTL
      
      // Update in-memory state
      if (!this.activeStates.has(domain)) {
        this.activeStates.set(domain, {});
      }
      this.activeStates.get(domain).lastExtraction = summary;
      
      this.logger.info('Stored extraction summary', {
        domain,
        productsExtracted: summary.productsExtracted
      });
      
      return true;
      
    } catch (error) {
      this.logger.error('Failed to store extraction data', {
        domain,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Store domain patterns for cross-domain learning
   */
  storeDomainPatterns(domain, patterns) {
    if (!patterns || patterns.length === 0) return;
    
    // Extract platform type from patterns
    const platformIndicators = {
      shopify: /shopify|products\/|collections\//i,
      woocommerce: /product-category|product\//i,
      magento: /catalog\/product|category\//i,
      custom: /.*/
    };
    
    let platform = 'custom';
    for (const [key, regex] of Object.entries(platformIndicators)) {
      if (patterns.some(p => regex.test(p.pattern))) {
        platform = key;
        break;
      }
    }
    
    // Store patterns by platform
    if (!this.domainPatterns.has(platform)) {
      this.domainPatterns.set(platform, []);
    }
    
    const platformPatterns = this.domainPatterns.get(platform);
    platformPatterns.push({
      domain,
      patterns,
      timestamp: new Date().toISOString()
    });
    
    // Keep only recent patterns (last 10 domains)
    if (platformPatterns.length > 10) {
      platformPatterns.shift();
    }
    
    this.logger.debug('Stored domain patterns', {
      domain,
      platform,
      patternCount: patterns.length
    });
  }

  /**
   * Get similar domain patterns for cross-domain learning
   */
  getSimilarDomainPatterns(domain) {
    // Find patterns from similar domains
    const similarPatterns = [];
    
    for (const [platform, domainList] of this.domainPatterns.entries()) {
      for (const domainData of domainList) {
        if (domainData.domain !== domain) {
          similarPatterns.push({
            platform,
            domain: domainData.domain,
            patterns: domainData.patterns
          });
        }
      }
    }
    
    return similarPatterns;
  }

  /**
   * Load cached patterns on initialization
   */
  async loadCachedPatterns() {
    try {
      // Load recent patterns from cache
      const patternKeys = await this.cache.keys('learning:*');
      
      for (const key of patternKeys.slice(0, 20)) { // Load last 20
        const cached = await this.cache.get(key);
        if (cached) {
          try {
            const data = JSON.parse(cached);
            if (data.patterns) {
              const domain = key.replace('learning:', '');
              this.storeDomainPatterns(domain, data.patterns);
            }
          } catch (error) {
            // Skip invalid entries
          }
        }
      }
      
      this.logger.info('Loaded cached patterns', {
        platformCount: this.domainPatterns.size
      });
      
    } catch (error) {
      this.logger.warn('Failed to load cached patterns', {
        error: error.message
      });
    }
  }

  /**
   * Get job state
   */
  getJobState(jobId) {
    // Search through active states for job
    for (const [domain, state] of this.activeStates.entries()) {
      if (state.jobId === jobId) {
        return {
          domain,
          ...state
        };
      }
    }
    return null;
  }

  /**
   * Clear state for domain
   */
  clearDomainState(domain) {
    this.activeStates.delete(domain);
    this.logger.debug('Cleared state for domain', { domain });
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      activeDomains: this.activeStates.size,
      cachedPatterns: this.domainPatterns.size,
      learningHistory: this.learningHistory.size,
      platforms: Array.from(this.domainPatterns.keys())
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    // Clear in-memory state
    this.activeStates.clear();
    this.domainPatterns.clear();
    this.learningHistory.clear();
    
    // Disconnect from backends
    if (this.cache.connected) {
      await this.cache.disconnect();
    }
    
    this.logger.info('StateManager cleaned up');
  }
}

module.exports = StateManager;