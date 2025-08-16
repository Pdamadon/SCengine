/**
 * SelectorCacheSingleton.js
 * 
 * Singleton wrapper for SelectorLearningCache to ensure only one instance
 * is shared across all components (BrowserIntelligence, AdaptiveRetryStrategy, ExtractorIntelligence)
 * Reduces connection overhead from multiple cache instances to single shared instance
 */

const SelectorLearningCache = require('./SelectorLearningCache');

class SelectorCacheSingleton {
  constructor() {
    if (SelectorCacheSingleton.instance) {
      return SelectorCacheSingleton.instance;
    }
    
    this.cache = null;
    this.isInitialized = false;
    this.initializationPromise = null;
    this.logger = null;
    
    SelectorCacheSingleton.instance = this;
  }

  /**
   * Initialize the singleton cache instance
   */
  async initialize(logger) {
    if (this.isInitialized) {
      return this.cache;
    }
    
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    this.initializationPromise = this._doInitialize(logger);
    return this.initializationPromise;
  }

  async _doInitialize(logger) {
    try {
      this.logger = logger || {
        info: (msg, data) => console.log(`[SINGLETON] ${msg}`, data || ''),
        debug: (msg, data) => console.log(`[SINGLETON] ${msg}`, data || ''),
        warn: (msg, data) => console.warn(`[SINGLETON] ${msg}`, data || ''),
        error: (msg, data) => console.error(`[SINGLETON] ${msg}`, data || '')
      };
      
      this.cache = new SelectorLearningCache(this.logger);
      await this.cache.initialize();
      
      this.isInitialized = true;
      this.logger.info('SelectorCacheSingleton initialized successfully');
      
      return this.cache;
    } catch (error) {
      this.logger?.error('Failed to initialize SelectorCacheSingleton:', error);
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Get the cache instance (initializes if needed)
   */
  async getCache(logger) {
    if (!this.isInitialized) {
      await this.initialize(logger);
    }
    return this.cache;
  }

  /**
   * Proxy all cache methods to the underlying instance
   */
  async getOrDiscoverSelector(domain, selectorType, options = {}) {
    const cache = await this.getCache();
    return cache.getOrDiscoverSelector(domain, selectorType, options);
  }

  async getMongoSelector(domain, selectorType) {
    const cache = await this.getCache();
    return cache.getMongoSelector(domain, selectorType);
  }

  async persistSelector(domain, selectorType, selectorData, elementType = null, context = {}) {
    const cache = await this.getCache();
    return cache.persistSelector(domain, selectorType, selectorData, elementType, context);
  }

  async updateSelectorResult(domain, selectorType, selector, success, error = null) {
    const cache = await this.getCache();
    return cache.updateSelectorResult(domain, selectorType, selector, success, error);
  }

  async getSelectorStats(domain = null) {
    const cache = await this.getCache();
    return cache.getSelectorStats(domain);
  }

  async updateSelectorUsage(selectorId) {
    const cache = await this.getCache();
    return cache.updateSelectorUsage(selectorId);
  }

  schedulePersistence(domain, selectorType, selectorData, elementType, context) {
    // This method is synchronous, so we need to ensure cache is available
    if (this.cache) {
      this.cache.schedulePersistence(domain, selectorType, selectorData, elementType, context);
    } else {
      // Schedule for when cache becomes available
      this.getCache().then(cache => {
        cache.schedulePersistence(domain, selectorType, selectorData, elementType, context);
      }).catch(error => {
        this.logger?.error('Failed to schedule persistence:', error);
      });
    }
  }

  trackCacheHit(domain, selectorType, cacheType) {
    if (this.cache) {
      this.cache.trackCacheHit(domain, selectorType, cacheType);
    }
  }

  trackCacheMiss(domain, selectorType) {
    if (this.cache) {
      this.cache.trackCacheMiss(domain, selectorType);
    }
  }

  trackDiscovery(domain, selectorType, discovered) {
    if (this.cache) {
      this.cache.trackDiscovery(domain, selectorType, discovered);
    }
  }

  getCacheStats() {
    if (this.cache) {
      return this.cache.getCacheStats();
    }
    return { totalHits: 0, totalMisses: 0, hitRate: 0 };
  }

  async cleanupSelectors(daysOld = 30, minReliability = 0.2) {
    const cache = await this.getCache();
    return cache.cleanupSelectors(daysOld, minReliability);
  }

  async exportSelectors(domain) {
    const cache = await this.getCache();
    return cache.exportSelectors(domain);
  }

  async importSelectors(domain, selectors) {
    const cache = await this.getCache();
    return cache.importSelectors(domain, selectors);
  }

  /**
   * Close the cache connection
   */
  async close() {
    if (this.cache) {
      await this.cache.close();
      this.cache = null;
      this.isInitialized = false;
      this.initializationPromise = null;
    }
  }

  /**
   * Reset singleton (useful for testing)
   */
  static reset() {
    if (SelectorCacheSingleton.instance) {
      SelectorCacheSingleton.instance.close();
      SelectorCacheSingleton.instance = null;
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance() {
    return new SelectorCacheSingleton();
  }
}

// Initialize the singleton
SelectorCacheSingleton.instance = null;

module.exports = SelectorCacheSingleton;