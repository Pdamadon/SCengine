const Redis = require('ioredis');

class RedisCache {
  constructor(logger) {
    this.logger = logger;
    this.redis = null;
    this.connected = false;
  }

  async connect() {
    // Don't attempt connection if Redis is not configured
    if (!process.env.REDIS_HOST && !process.env.REDIS_URL) {
      this.logger.info('Redis not configured, using memory cache');
      this.redis = null;
      this.connected = false;
      this.memoryCache = new Map();
      return;
    }

    try {
      // Prefer REDIS_URL if available (for Railway/cloud Redis)
      if (process.env.REDIS_URL) {
        this.redis = new Redis(process.env.REDIS_URL, {
          retryDelayOnFailover: 100,
          enableReadyCheck: false,
          maxRetriesPerRequest: null,
          lazyConnect: true,
        });
      } else {
        // Fall back to individual settings (for local Redis)
        this.redis = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          password: process.env.REDIS_PASSWORD || undefined,
          retryDelayOnFailover: 100,
          enableReadyCheck: false,
          maxRetriesPerRequest: null,
          lazyConnect: true,
        });
      }

      // Test connection
      await this.redis.ping();
      this.connected = true;
      this.logger.info('Redis cache connected successfully');
    } catch (error) {
      this.logger.warn('Redis connection failed, using memory cache fallback:', error.message);
      this.redis = null;
      this.connected = false;
      this.memoryCache = new Map();
    }
  }

  async cacheCollections(domain, collections) {
    const key = `collections:${domain}`;
    const data = {
      collections,
      cached_at: new Date().toISOString(),
      ttl_hours: 24,
    };

    try {
      if (this.connected) {
        await this.redis.setex(key, 24 * 60 * 60, JSON.stringify(data)); // 24 hour TTL
        this.logger.info(`Cached ${collections.length} collections for ${domain} in Redis`);
      } else {
        this.memoryCache.set(key, data);
        this.logger.info(`Cached ${collections.length} collections for ${domain} in memory`);
      }
    } catch (error) {
      this.logger.error('Failed to cache collections:', error);
    }
  }

  async getCollections(domain) {
    const key = `collections:${domain}`;

    try {
      let data = null;

      if (this.connected) {
        const cached = await this.redis.get(key);
        if (cached) {
          data = JSON.parse(cached);
        }
      } else if (this.memoryCache && this.memoryCache.has(key)) {
        data = this.memoryCache.get(key);
      }

      if (data) {
        const cacheAge = (Date.now() - new Date(data.cached_at).getTime()) / (1000 * 60 * 60);
        if (cacheAge < data.ttl_hours) {
          this.logger.info(`Retrieved ${data.collections.length} cached collections for ${domain} (${Math.round(cacheAge)}h old)`);
          return data.collections;
        } else {
          this.logger.info(`Cache expired for ${domain}, will refresh`);
        }
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to retrieve cached collections:', error);
      return null;
    }
  }

  /**
   * Get keys matching a pattern
   * Required for StateManager compatibility
   */
  async keys(pattern) {
    try {
      if (this.connected && this.redis) {
        return await this.redis.keys(pattern);
      } else if (this.memoryCache) {
        // For memory cache, filter keys matching pattern
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return Array.from(this.memoryCache.keys()).filter(key => regex.test(key));
      }
      return [];
    } catch (error) {
      this.logger.warn('Failed to get keys:', error.message);
      return [];
    }
  }

  /**
   * Generic get method
   */
  async get(key) {
    try {
      if (this.connected && this.redis) {
        return await this.redis.get(key);
      } else if (this.memoryCache) {
        const value = this.memoryCache.get(key);
        return typeof value === 'object' ? JSON.stringify(value) : value;
      }
      return null;
    } catch (error) {
      this.logger.warn('Failed to get value:', error.message);
      return null;
    }
  }

  /**
   * Generic set method with TTL
   */
  async set(key, value, ttlSeconds = 86400) {
    try {
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
      
      if (this.connected && this.redis) {
        await this.redis.setex(key, ttlSeconds, stringValue);
      } else if (this.memoryCache) {
        this.memoryCache.set(key, value);
        // Simple TTL for memory cache
        setTimeout(() => this.memoryCache.delete(key), ttlSeconds * 1000);
      }
      return true;
    } catch (error) {
      this.logger.warn('Failed to set value:', error.message);
      return false;
    }
  }

  async cacheProducts(collectionUrl, products) {
    const key = `products:${Buffer.from(collectionUrl).toString('base64')}`;
    const data = {
      url: collectionUrl,
      products,
      cached_at: new Date().toISOString(),
      ttl_hours: 1, // Products change more frequently
    };

    try {
      if (this.connected) {
        await this.redis.setex(key, 60 * 60, JSON.stringify(data)); // 1 hour TTL
        this.logger.info(`Cached ${products.length} products for collection: ${collectionUrl}`);
      } else {
        this.memoryCache.set(key, data);
        this.logger.info(`Cached ${products.length} products in memory for: ${collectionUrl}`);
      }
    } catch (error) {
      this.logger.error('Failed to cache products:', error);
    }
  }

  async getProducts(collectionUrl) {
    const key = `products:${Buffer.from(collectionUrl).toString('base64')}`;

    try {
      let data = null;

      if (this.connected) {
        const cached = await this.redis.get(key);
        if (cached) {
          data = JSON.parse(cached);
        }
      } else if (this.memoryCache && this.memoryCache.has(key)) {
        data = this.memoryCache.get(key);
      }

      if (data) {
        const cacheAge = (Date.now() - new Date(data.cached_at).getTime()) / (1000 * 60);
        if (cacheAge < data.ttl_hours * 60) {
          this.logger.info(`Retrieved ${data.products.length} cached products (${Math.round(cacheAge)}m old)`);
          return data.products;
        }
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to retrieve cached products:', error);
      return null;
    }
  }

  async setScrapingProgress(domain, progress) {
    const key = `scraping_progress:${domain}`;
    const data = {
      ...progress,
      updated_at: new Date().toISOString(),
    };

    try {
      if (this.connected) {
        await this.redis.setex(key, 60 * 60, JSON.stringify(data)); // 1 hour TTL
      } else {
        this.memoryCache.set(key, data);
      }
    } catch (error) {
      this.logger.error('Failed to save scraping progress:', error);
    }
  }

  async getScrapingProgress(domain) {
    const key = `scraping_progress:${domain}`;

    try {
      let data = null;

      if (this.connected) {
        const cached = await this.redis.get(key);
        if (cached) {
          data = JSON.parse(cached);
        }
      } else if (this.memoryCache && this.memoryCache.has(key)) {
        data = this.memoryCache.get(key);
      }

      return data;
    } catch (error) {
      this.logger.error('Failed to retrieve scraping progress:', error);
      return null;
    }
  }

  async incrementCollectionCount(domain) {
    const key = `collection_count:${domain}`;

    try {
      if (this.connected) {
        return await this.redis.incr(key);
      } else {
        const current = this.memoryCache.get(key) || 0;
        const newCount = current + 1;
        this.memoryCache.set(key, newCount);
        return newCount;
      }
    } catch (error) {
      this.logger.error('Failed to increment collection count:', error);
      return 0;
    }
  }

  /**
   * Cache navigation structure for a domain
   * @param {string} domain - The domain (e.g., 'gap.com')
   * @param {string} level - Navigation level ('main', 'women', 'women:tops', etc.)
   * @param {object} navigation - Navigation data to cache
   * @param {number} ttlDays - Time to live in days (default 7)
   */
  async cacheNavigation(domain, level, navigation, ttlDays = 7) {
    const key = `nav:${domain}:${level}`;
    const data = {
      navigation,
      level,
      cached_at: new Date().toISOString(),
      ttl_days: ttlDays,
      item_count: Array.isArray(navigation) ? navigation.length : 
                  (navigation.main_sections ? navigation.main_sections.length : 0)
    };

    try {
      const ttlSeconds = ttlDays * 24 * 60 * 60;
      
      if (this.connected && this.redis) {
        await this.redis.setex(key, ttlSeconds, JSON.stringify(data));
        this.logger.info(`Cached navigation for ${domain}:${level} (${data.item_count} items)`);
      } else if (this.memoryCache) {
        this.memoryCache.set(key, data);
        // Simple TTL for memory cache
        setTimeout(() => this.memoryCache.delete(key), ttlSeconds * 1000);
        this.logger.info(`Cached navigation for ${domain}:${level} in memory (${data.item_count} items)`);
      }
      return true;
    } catch (error) {
      this.logger.error(`Failed to cache navigation for ${domain}:${level}:`, error);
      return false;
    }
  }

  /**
   * Get cached navigation for a domain and level
   */
  async getCachedNavigation(domain, level = 'main') {
    const key = `nav:${domain}:${level}`;

    try {
      let data = null;

      if (this.connected && this.redis) {
        const cached = await this.redis.get(key);
        if (cached) {
          data = JSON.parse(cached);
        }
      } else if (this.memoryCache && this.memoryCache.has(key)) {
        data = this.memoryCache.get(key);
      }

      if (data) {
        const cacheAge = (Date.now() - new Date(data.cached_at).getTime()) / (1000 * 60 * 60 * 24);
        if (cacheAge < data.ttl_days) {
          this.logger.info(`Retrieved cached navigation for ${domain}:${level} (${Math.round(cacheAge)} days old, ${data.item_count} items)`);
          return data.navigation;
        } else {
          this.logger.info(`Navigation cache expired for ${domain}:${level}`);
        }
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to retrieve cached navigation for ${domain}:${level}:`, error);
      return null;
    }
  }

  /**
   * Get full navigation hierarchy from cache
   */
  async getFullNavigationHierarchy(domain) {
    try {
      // Get all navigation keys for this domain
      const pattern = `nav:${domain}:*`;
      const navKeys = await this.keys(pattern);
      
      if (navKeys.length === 0) {
        return null;
      }

      const hierarchy = {
        domain,
        cached_at: new Date().toISOString(),
        levels: {}
      };

      // Retrieve all navigation levels
      for (const key of navKeys) {
        const level = key.replace(`nav:${domain}:`, '');
        const navigation = await this.getCachedNavigation(domain, level);
        
        if (navigation) {
          hierarchy.levels[level] = navigation;
        }
      }

      // Only return if we have at least the main navigation
      if (hierarchy.levels.main) {
        this.logger.info(`Retrieved full navigation hierarchy for ${domain} (${Object.keys(hierarchy.levels).length} levels)`);
        return hierarchy;
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to retrieve navigation hierarchy for ${domain}:`, error);
      return null;
    }
  }

  /**
   * Check if we have valid cached navigation
   */
  async hasValidNavigationCache(domain, maxAgeDays = 7) {
    try {
      const mainNav = await this.getCachedNavigation(domain, 'main');
      if (!mainNav) return false;

      // Check cache age
      const key = `nav:${domain}:main`;
      let data = null;

      if (this.connected && this.redis) {
        const cached = await this.redis.get(key);
        if (cached) data = JSON.parse(cached);
      } else if (this.memoryCache) {
        data = this.memoryCache.get(key);
      }

      if (data) {
        const cacheAge = (Date.now() - new Date(data.cached_at).getTime()) / (1000 * 60 * 60 * 24);
        return cacheAge < maxAgeDays;
      }

      return false;
    } catch (error) {
      this.logger.error(`Failed to check navigation cache validity for ${domain}:`, error);
      return false;
    }
  }

  /**
   * Clear navigation cache for a domain
   */
  async clearNavigationCache(domain) {
    try {
      const pattern = `nav:${domain}:*`;
      const navKeys = await this.keys(pattern);
      
      for (const key of navKeys) {
        if (this.connected && this.redis) {
          await this.redis.del(key);
        } else if (this.memoryCache) {
          this.memoryCache.delete(key);
        }
      }
      
      this.logger.info(`Cleared navigation cache for ${domain} (${navKeys.length} keys)`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to clear navigation cache for ${domain}:`, error);
      return false;
    }
  }

  async close() {
    if (this.connected && this.redis) {
      await this.redis.quit();
      this.logger.info('Redis cache connection closed');
    }
  }
}

module.exports = RedisCache;
