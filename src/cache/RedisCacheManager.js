/**
 * RedisCacheManager.js
 *
 * Unified Redis cache management system that consolidates multiple cache instances
 * into a single shared connection pool with namespace management and TTL policies.
 *
 * Replaces separate RedisCache instances in:
 * - WorldModel (site intelligence)
 * - NavigationLearningCache (hierarchical navigation)
 * - SelectorLearningCache (selector patterns)
 * - StateManager (job state)
 */

const Redis = require('ioredis');

class RedisCacheManager {
  constructor(logger) {
    if (RedisCacheManager.instance) {
      return RedisCacheManager.instance;
    }

    this.logger = logger || {
      info: (msg, data) => console.log(`[CACHE] ${msg}`, data || ''),
      debug: (msg, data) => console.log(`[CACHE] ${msg}`, data || ''),
      warn: (msg, data) => console.warn(`[CACHE] ${msg}`, data || ''),
      error: (msg, data) => console.error(`[CACHE] ${msg}`, data || ''),
    };

    this.redis = null;
    this.connected = false;
    this.memoryCache = new Map();
    this.initializationPromise = null;

    // Namespace configuration with TTL policies
    this.namespaceConfig = {
      navigation: {
        prefix: 'nav',
        ttl: 7 * 24 * 60 * 60, // 7 days
        description: 'Site navigation intelligence',
      },
      selectors: {
        prefix: 'sel',
        ttl: 3 * 24 * 60 * 60, // 3 days
        description: 'CSS selector patterns',
      },
      learning: {
        prefix: 'learn',
        ttl: 24 * 60 * 60, // 1 day
        description: 'Hierarchical navigation learning',
      },
      state: {
        prefix: 'state',
        ttl: 12 * 60 * 60, // 12 hours
        description: 'Job and process state',
      },
      discovery: {
        prefix: 'disc',
        ttl: 1 * 60 * 60, // 1 hour
        description: 'Recent discoveries cache',
      },
      checkpoint: {
        prefix: 'cp',
        ttl: 48 * 60 * 60, // 48 hours
        description: 'Pipeline checkpoint state',
        noFallback: true, // Prevent memory fallback for checkpoints
      },
    };

    // Connection statistics
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
      operations: 0,
    };

    RedisCacheManager.instance = this;
  }

  /**
   * Initialize Redis connection (singleton pattern)
   */
  async initialize() {
    if (this.connected) {
      return this.redis;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize();
    return this.initializationPromise;
  }

  async _doInitialize() {
    // Check if Redis is configured
    if (!process.env.REDIS_HOST && !process.env.REDIS_URL) {
      this.logger.info('Redis not configured, using memory cache fallback');
      this.redis = null;
      this.connected = false;
      return null;
    }

    try {
      // Create Redis connection with optimized settings
      const redisConfig = {
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        lazyConnect: true,
        // Optimizations for high concurrency
        maxRetriesPerRequest: 3,
        retryDelayOnClusterDown: 300,
        enableOfflineQueue: false,
        // Connection pooling settings
        family: 4,
        keepAlive: true,
        connectTimeout: 10000,
        commandTimeout: 5000,
      };

      if (process.env.REDIS_URL) {
        this.redis = new Redis(process.env.REDIS_URL, redisConfig);
      } else {
        this.redis = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          password: process.env.REDIS_PASSWORD || undefined,
          ...redisConfig,
        });
      }

      // Connect explicitly since we're using lazyConnect
      await this.redis.connect();

      // Test connection
      await this.redis.ping();
      this.connected = true;

      // Set up event handlers
      this.redis.on('error', (error) => {
        this.logger.error('Redis connection error:', error);
        this.stats.errors++;
      });

      this.redis.on('connect', () => {
        this.logger.info('Redis connection established');
      });

      this.redis.on('close', () => {
        this.logger.warn('Redis connection closed');
        this.connected = false;
      });

      this.logger.info('RedisCacheManager initialized with shared connection pool');
      return this.redis;

    } catch (error) {
      this.logger.warn('Redis connection failed, using memory cache fallback:', error.message);
      this.redis = null;
      this.connected = false;
      this.initializationPromise = null;
      return null;
    }
  }

  /**
   * Generate namespaced key with validation
   */
  generateKey(namespace, domain, identifier = null) {
    if (!this.namespaceConfig[namespace]) {
      throw new Error(`Unknown namespace: ${namespace}. Available: ${Object.keys(this.namespaceConfig).join(', ')}`);
    }

    const config = this.namespaceConfig[namespace];
    const parts = [config.prefix, domain];

    if (identifier) {
      parts.push(identifier);
    }

    return parts.join(':');
  }

  /**
   * Set value with namespace-specific TTL
   */
  async set(namespace, domain, value, identifier = null, customTTL = null) {
    try {
      await this.initialize();

      const key = this.generateKey(namespace, domain, identifier);
      const ttl = customTTL || this.namespaceConfig[namespace].ttl;
      const serializedValue = JSON.stringify({
        data: value,
        namespace,
        created_at: new Date().toISOString(),
        ttl: ttl,
      });

      this.stats.operations++;

      if (this.connected && this.redis) {
        await this.redis.setex(key, ttl, serializedValue);
        this.logger.debug(`Cached ${namespace} data for ${domain}${identifier ? ':' + identifier : ''} (TTL: ${ttl}s)`);
      } else {
        // Check if namespace allows memory fallback
        const config = this.namespaceConfig[namespace];
        if (config.noFallback) {
          this.logger.warn(`Redis unavailable and memory fallback disabled for ${namespace}`);
          return false;
        }
        
        // Memory cache fallback
        this.memoryCache.set(key, {
          value: serializedValue,
          expires: Date.now() + (ttl * 1000),
        });
        this.logger.debug(`Memory cached ${namespace} data for ${domain}${identifier ? ':' + identifier : ''}`);
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to cache ${namespace} data:`, error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Get value with automatic deserialization
   */
  async get(namespace, domain, identifier = null) {
    try {
      await this.initialize();

      const key = this.generateKey(namespace, domain, identifier);
      let cached = null;

      this.stats.operations++;

      if (this.connected && this.redis) {
        cached = await this.redis.get(key);
      } else {
        // Check if namespace allows memory fallback
        const config = this.namespaceConfig[namespace];
        if (config.noFallback) {
          this.logger.warn(`Redis unavailable and memory fallback disabled for ${namespace}`);
          return null;
        }
        
        if (this.memoryCache.has(key)) {
          const entry = this.memoryCache.get(key);
          if (entry.expires > Date.now()) {
            cached = entry.value;
          } else {
            this.memoryCache.delete(key);
          }
        }
      }

      if (cached) {
        const parsed = JSON.parse(cached);
        this.stats.hits++;

        // Log cache age for monitoring
        const cacheAge = (Date.now() - new Date(parsed.created_at).getTime()) / 1000;
        this.logger.debug(`Cache hit for ${namespace}:${domain}${identifier ? ':' + identifier : ''} (age: ${Math.round(cacheAge)}s)`);

        return parsed.data;
      }

      this.stats.misses++;
      return null;

    } catch (error) {
      this.logger.error(`Failed to retrieve ${namespace} data:`, error);
      this.stats.errors++;
      return null;
    }
  }

  /**
   * Delete specific key or all keys for a domain/namespace
   */
  async delete(namespace, domain, identifier = null) {
    try {
      await this.initialize();

      if (identifier) {
        // Delete specific key
        const key = this.generateKey(namespace, domain, identifier);

        if (this.connected && this.redis) {
          await this.redis.del(key);
        } else {
          this.memoryCache.delete(key);
        }

        this.logger.debug(`Deleted ${namespace} cache for ${domain}:${identifier}`);
      } else {
        // Delete all keys for domain in namespace
        await this.clearNamespace(namespace, domain);
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to delete ${namespace} cache:`, error);
      return false;
    }
  }

  /**
   * Clear all keys in a namespace for a domain
   */
  async clearNamespace(namespace, domain = '*') {
    try {
      await this.initialize();

      const pattern = this.generateKey(namespace, domain, '*');

      if (this.connected && this.redis) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
          this.logger.info(`Cleared ${keys.length} keys from ${namespace} namespace for ${domain}`);
        }
      } else {
        // Clear memory cache
        const prefix = this.generateKey(namespace, domain, '');
        for (const key of this.memoryCache.keys()) {
          if (key.startsWith(prefix)) {
            this.memoryCache.delete(key);
          }
        }
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to clear ${namespace} namespace:`, error);
      return false;
    }
  }

  /**
   * Batch operations for efficiency
   */
  async setBatch(operations) {
    try {
      await this.initialize();

      if (this.connected && this.redis) {
        const pipeline = this.redis.pipeline();

        for (const op of operations) {
          const { namespace, domain, value, identifier, customTTL } = op;
          const key = this.generateKey(namespace, domain, identifier);
          const ttl = customTTL || this.namespaceConfig[namespace].ttl;
          const serializedValue = JSON.stringify({
            data: value,
            namespace,
            created_at: new Date().toISOString(),
            ttl: ttl,
          });

          pipeline.setex(key, ttl, serializedValue);
        }

        await pipeline.exec();
        this.logger.info(`Batch cached ${operations.length} operations`);
      } else {
        // Fallback to individual operations for memory cache
        for (const op of operations) {
          await this.set(op.namespace, op.domain, op.value, op.identifier, op.customTTL);
        }
      }

      return true;
    } catch (error) {
      this.logger.error('Batch cache operation failed:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.operations > 0 ? (this.stats.hits / this.stats.operations * 100).toFixed(1) : 0;

    return {
      connected: this.connected,
      hits: this.stats.hits,
      misses: this.stats.misses,
      errors: this.stats.errors,
      operations: this.stats.operations,
      hitRate: `${hitRate}%`,
      namespaces: Object.keys(this.namespaceConfig),
      memoryCache: {
        enabled: !this.connected,
        size: this.memoryCache.size,
      },
    };
  }

  /**
   * Get namespace configuration (for testing and debugging)
   */
  get namespaces() {
    return this.namespaceConfig;
  }
  
  /**
   * Check if Redis is connected
   */
  async isConnected() {
    return this.connected;
  }
  
  /**
   * Check if a key exists in cache
   */
  async exists(namespace, domain, identifier = null) {
    const key = this.generateKey(namespace, domain, identifier);
    
    try {
      if (this.connected && this.redis) {
        const exists = await this.redis.exists(key);
        return exists === 1;
      } else {
        // Check memory cache
        return this.memoryCache.has(key);
      }
    } catch (error) {
      this.logger.error(`Failed to check existence for ${namespace}:${domain}`, error);
      return false;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      await this.initialize();

      if (this.connected && this.redis) {
        await this.redis.ping();
        return { status: 'healthy', type: 'redis' };
      } else {
        return { status: 'degraded', type: 'memory', size: this.memoryCache.size };
      }
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  /**
   * Close connection and cleanup
   */
  async close() {
    try {
      if (this.redis) {
        await this.redis.quit();
      }
      this.memoryCache.clear();
      this.connected = false;
      this.redis = null;
      this.initializationPromise = null;

      this.logger.info('RedisCacheManager closed successfully');
    } catch (error) {
      this.logger.error('Error closing RedisCacheManager:', error);
    }
  }

  /**
   * Static method to get singleton instance
   */
  static getInstance(logger) {
    return new RedisCacheManager(logger);
  }

  /**
   * Reset singleton (for testing)
   */
  static reset() {
    if (RedisCacheManager.instance) {
      RedisCacheManager.instance.close();
      RedisCacheManager.instance = null;
    }
  }
}

// Initialize static instance
RedisCacheManager.instance = null;

module.exports = RedisCacheManager;
