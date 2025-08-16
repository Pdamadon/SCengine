/**
 * RedisCacheFactory.js
 * 
 * Factory for creating shared RedisCache instances with proper logger handling.
 * Consolidates 4 separate Redis connections into 1 shared connection while
 * preserving all existing APIs and logger compatibility.
 * 
 * Components using this factory:
 * - WorldModel (site intelligence)
 * - NavigationLearningCache (hierarchical navigation)
 * - SelectorLearningCache (selector patterns)
 * - StateManager (job state)
 */

const RedisCache = require('./RedisCache');

class RedisCacheFactory {
  constructor() {
    throw new Error('RedisCacheFactory is a static factory. Use getInstance() instead.');
  }

  static instance = null;
  static loggers = new Map(); // Track component-specific loggers
  static useSharedConnection = process.env.REDIS_SHARED_CONNECTION === 'true';

  /**
   * Get RedisCache instance with connection sharing and proper logger handling
   * @param {Object} logger - Component-specific logger
   * @param {string} componentName - Optional component identifier for logging
   * @returns {RedisCache} Shared or individual RedisCache instance
   */
  static getInstance(logger, componentName = 'unknown') {
    if (!logger) {
      throw new Error('Logger is required for RedisCacheFactory.getInstance()');
    }

    // Feature flag: Use shared connection or individual connections
    if (RedisCacheFactory.useSharedConnection) {
      
      // Create shared instance on first call
      if (!RedisCacheFactory.instance) {
        RedisCacheFactory.instance = new RedisCache(logger);
        RedisCacheFactory.loggers.set('primary', logger);
        
        if (logger && logger.info) {
          logger.info(`RedisCacheFactory: Created shared Redis connection for ${componentName}`);
        }
      }

      // Track component-specific loggers for debugging
      if (componentName !== 'unknown') {
        RedisCacheFactory.loggers.set(componentName, logger);
      }

      // Create wrapper that preserves component-specific logging
      const sharedCache = RedisCacheFactory.instance;
      const componentLogger = logger;

      // Return proxy that uses component's logger for messages while sharing connection
      return new Proxy(sharedCache, {
        get(target, prop) {
          const value = target[prop];
          
          // If it's a method that might log, wrap it to use component's logger
          if (typeof value === 'function' && prop !== 'constructor') {
            return function(...args) {
              // Temporarily override logger for this operation
              const originalLogger = target.logger;
              target.logger = componentLogger;
              
              try {
                const result = value.apply(target, args);
                
                // Handle async methods
                if (result && typeof result.then === 'function') {
                  return result.finally(() => {
                    target.logger = originalLogger;
                  });
                } else {
                  target.logger = originalLogger;
                  return result;
                }
              } catch (error) {
                target.logger = originalLogger;
                throw error;
              }
            };
          }
          
          return value;
        }
      });

    } else {
      // Legacy behavior: Each component gets own connection
      if (logger && logger.debug) {
        logger.debug(`RedisCacheFactory: Creating individual Redis connection for ${componentName}`);
      }
      return new RedisCache(logger);
    }
  }

  /**
   * Get connection statistics
   * @returns {Object} Connection and usage statistics
   */
  static getStats() {
    return {
      sharedConnection: RedisCacheFactory.useSharedConnection,
      hasSharedInstance: !!RedisCacheFactory.instance,
      componentCount: RedisCacheFactory.loggers.size,
      components: Array.from(RedisCacheFactory.loggers.keys()),
      connected: RedisCacheFactory.instance ? RedisCacheFactory.instance.connected : false
    };
  }

  /**
   * Health check for shared connection
   * @returns {Promise<Object>} Health status
   */
  static async healthCheck() {
    if (!RedisCacheFactory.useSharedConnection || !RedisCacheFactory.instance) {
      return { 
        status: 'disabled',
        sharedConnection: false,
        message: 'Individual connections mode'
      };
    }

    try {
      if (RedisCacheFactory.instance.redis) {
        await RedisCacheFactory.instance.redis.ping();
        return {
          status: 'healthy',
          sharedConnection: true,
          components: RedisCacheFactory.loggers.size,
          message: 'Shared Redis connection operational'
        };
      } else {
        return {
          status: 'degraded',
          sharedConnection: true,
          components: RedisCacheFactory.loggers.size,
          message: 'Using memory cache fallback'
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        sharedConnection: true,
        error: error.message,
        message: 'Shared Redis connection failed'
      };
    }
  }

  /**
   * Force close shared connection (for testing/cleanup)
   * @returns {Promise<void>}
   */
  static async close() {
    if (RedisCacheFactory.instance) {
      try {
        if (RedisCacheFactory.instance.redis) {
          await RedisCacheFactory.instance.redis.quit();
        }
        
        // Log shutdown with all component loggers
        for (const [component, logger] of RedisCacheFactory.loggers) {
          if (logger && logger.info) {
            logger.info(`RedisCacheFactory: Shared connection closed for ${component}`);
          }
        }
        
      } catch (error) {
        console.error('Error closing shared Redis connection:', error);
      } finally {
        RedisCacheFactory.instance = null;
        RedisCacheFactory.loggers.clear();
      }
    }
  }

  /**
   * Reset factory state (for testing)
   */
  static reset() {
    RedisCacheFactory.instance = null;
    RedisCacheFactory.loggers.clear();
    RedisCacheFactory.useSharedConnection = process.env.REDIS_SHARED_CONNECTION === 'true';
  }

  /**
   * Enable/disable shared connection (for testing)
   * @param {boolean} enabled - Whether to use shared connections
   */
  static setSharedConnection(enabled) {
    if (enabled !== RedisCacheFactory.useSharedConnection) {
      RedisCacheFactory.reset();
      RedisCacheFactory.useSharedConnection = enabled;
    }
  }
}

module.exports = RedisCacheFactory;