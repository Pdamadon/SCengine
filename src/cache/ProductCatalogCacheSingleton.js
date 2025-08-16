/**
 * ProductCatalogCacheSingleton.js
 * 
 * Singleton wrapper for ProductCatalogCache to ensure single shared instance
 * across the entire navigation and product discovery system.
 * 
 * Prevents multiple cache instances and ensures efficient resource usage.
 */

const ProductCatalogCache = require('./ProductCatalogCache');

class ProductCatalogCacheSingleton {
  constructor() {
    throw new Error('Use ProductCatalogCacheSingleton.getInstance()');
  }

  /**
   * Get the singleton instance of ProductCatalogCache
   * @param {Object} logger - Logger instance (only used on first call)
   * @returns {ProductCatalogCache} Singleton instance
   */
  static getInstance(logger = null) {
    if (!ProductCatalogCacheSingleton.instance) {
      if (!logger) {
        throw new Error('Logger required for first getInstance() call');
      }
      
      ProductCatalogCacheSingleton.instance = new ProductCatalogCache(logger);
      
      // Initialize the cache asynchronously
      ProductCatalogCacheSingleton.instance.initialize().catch(error => {
        logger.error('Failed to initialize ProductCatalogCache:', error);
      });
      
      logger.info('ProductCatalogCache singleton instance created');
    }
    
    return ProductCatalogCacheSingleton.instance;
  }

  /**
   * Check if instance exists
   * @returns {boolean} Whether instance exists
   */
  static hasInstance() {
    return !!ProductCatalogCacheSingleton.instance;
  }

  /**
   * Destroy the singleton instance (for testing or cleanup)
   */
  static async destroyInstance() {
    if (ProductCatalogCacheSingleton.instance) {
      await ProductCatalogCacheSingleton.instance.close();
      ProductCatalogCacheSingleton.instance = null;
    }
  }
}

// Static property to hold the singleton instance
ProductCatalogCacheSingleton.instance = null;

module.exports = ProductCatalogCacheSingleton;