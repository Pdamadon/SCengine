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
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });

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

  async close() {
    if (this.connected && this.redis) {
      await this.redis.quit();
      this.logger.info('Redis cache connection closed');
    }
  }
}

module.exports = RedisCache;
