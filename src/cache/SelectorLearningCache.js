/**
 * SelectorLearningCache.js
 *
 * Intelligent caching system for selector discovery that learns and improves over time
 * Bridges Redis temporary storage with MongoDB persistent storage
 * Based on NavigationLearningCache pattern but for selector management
 */

const RedisCacheManager = require('./RedisCacheManager');
const { MongoClient } = require('mongodb');
const { DATABASE_NAME } = require('../../mongodb-schema');

class SelectorLearningCache {
  constructor(logger) {
    this.logger = logger;
    this.cache = RedisCacheManager.getInstance(logger);
    this.learningData = new Map(); // Track success rates and patterns
    this.mongoClient = null;
    this.db = null;
    this.selectorsCollection = null;
  }

  async initialize() {
    // Initialize Redis cache manager
    await this.cache.initialize();

    // Initialize MongoDB connection
    const mongoUrl = process.env.MONGODB_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017';
    this.mongoClient = new MongoClient(mongoUrl);
    await this.mongoClient.connect();

    this.db = this.mongoClient.db(DATABASE_NAME); // Use 'ai_shopping_scraper'
    this.selectorsCollection = this.db.collection('selectors'); // Use new collection name

    // Indexes are already created by migration script
    // Just verify connection works
    await this.selectorsCollection.findOne({}, { limit: 1 });

    this.logger.info('SelectorLearningCache initialized with Redis and MongoDB');
  }

  /**
   * Get cached selector or discover and cache it
   */
  async getOrDiscoverSelector(domain, selectorType, options = {}) {
    try {
      const { discoveryFn, elementType, context } = options;

      // First, check MongoDB for proven selectors
      const mongoSelector = await this.getMongoSelector(domain, selectorType);
      if (mongoSelector && mongoSelector.confidence_score > 0.7) {
        this.logger.info(`Using proven MongoDB selector for ${domain}:${selectorType}`);
        this.trackCacheHit(domain, selectorType, 'mongodb');

        // Update usage stats
        await this.updateSelectorUsage(mongoSelector._id);

        return {
          selector: mongoSelector.selector,
          alternatives: mongoSelector.alternative_selectors,
          fromCache: true,
          cacheType: 'mongodb',
          reliability: mongoSelector.confidence_score,
          metadata: mongoSelector.context,
        };
      }

      // Check Redis cache for recent discoveries using RedisCacheManager
      const cached = await this.cache.get('selectors', domain, selectorType);

      if (cached) {
        this.logger.info(`Using Redis cached selector for ${domain}:${selectorType}`);
        this.trackCacheHit(domain, selectorType, 'redis');

        return {
          ...cached,
          fromCache: true,
          cacheType: 'redis',
        };
      }

      // If no cache and we have a discovery function, run it
      if (discoveryFn) {
        this.logger.info(`No cache found for ${domain}:${selectorType}, discovering...`);
        const discovered = await discoveryFn();

        if (discovered) {
          // Cache in Redis immediately for fast access
          await this.cache.set('selectors', domain, discovered, selectorType);

          // Track discovery for learning
          this.trackCacheMiss(domain, selectorType);
          this.trackDiscovery(domain, selectorType, discovered);

          // Schedule MongoDB persistence (non-blocking)
          this.schedulePersistence(domain, selectorType, discovered, elementType, context);

          return {
            ...discovered,
            fromCache: false,
            discovered: true,
          };
        }
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to get/discover selector for ${domain}:${selectorType}:`, error);
      return null;
    }
  }

  /**
   * Get selector from MongoDB
   */
  async getMongoSelector(domain, selectorType) {
    try {
      const selector = await this.selectorsCollection.findOne(
        {
          domain,
          selector_type: selectorType,
          active: true,
        },
        {
          sort: { confidence_score: -1, usage_count: -1 },
        },
      );

      return selector;
    } catch (error) {
      this.logger.error(`Failed to get MongoDB selector for ${domain}:${selectorType}:`, error);
      return null;
    }
  }

  /**
   * Save selector to MongoDB with learning data
   */
  async persistSelector(domain, selectorType, selectorData, elementType = null, context = {}) {
    try {
      const now = new Date();

      // Check if selector already exists
      const existing = await this.selectorsCollection.findOne({
        domain,
        selector_type: selectorType,
        selector: selectorData.selector,
      });

      if (existing) {
        // Update existing selector stats
        await this.selectorsCollection.updateOne(
          { _id: existing._id },
          {
            $inc: {
              usage_count: 1,
              discovery_count: 1,
            },
            $set: {
              last_used: now,
              last_verified: now,
              metadata: {
                ...existing.metadata,
                ...selectorData.metadata,
                last_context: context,
              },
            },
            $addToSet: {
              alternative_selectors: {
                $each: selectorData.alternatives || [],
              },
            },
          },
        );

        this.logger.info(`Updated existing selector for ${domain}:${selectorType}`);
      } else {
        // Insert new selector with new schema
        const newSelector = {
          domain: this.extractDomain(domain),
          page_type: context.page_type || 'product',
          selector_type: selectorType,
          selector: selectorData.selector,
          element_type: this.mapElementType(elementType),
          confidence_score: selectorData.reliability || 0.5,
          success_rate: selectorData.reliability || 0.5,
          usage_count: 1,
          alternative_selectors: selectorData.alternatives || [],
          context: {
            ...selectorData.metadata,
            discovery_method: selectorData.discoveryMethod || 'auto',
            ...context,
            patterns: selectorData.patterns || [],
          },
          created_at: now,
          last_used: now,
          last_validated: now,
          active: true,
        };

        await this.selectorsCollection.insertOne(newSelector);

        this.logger.info(`Persisted new selector for ${domain}:${selectorType}`);
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to persist selector for ${domain}:${selectorType}:`, error);
      return false;
    }
  }

  /**
   * Update selector success/failure stats
   */
  async updateSelectorResult(domain, selectorType, selector, success, error = null) {
    try {
      const now = new Date();
      const updateDoc = {
        $inc: success ?
          { success_count: 1, usage_count: 1 } :
          { failure_count: 1, usage_count: 1 },
      };

      // Update last success/failure time
      if (success) {
        updateDoc.$set = { last_success: now };
      } else {
        updateDoc.$set = {
          last_failure: now,
          last_error: error ? error.message : 'Unknown error',
        };
      }

      // Recalculate reliability score
      const selectorDoc = await this.selectorsCollection.findOne({
        domain,
        selector_type: selectorType,
        selector,
      });

      if (selectorDoc) {
        const newSuccessRate = success ? Math.min(1.0, (selectorDoc.success_rate || 0.5) + 0.1) : Math.max(0.0, (selectorDoc.success_rate || 0.5) - 0.1);

        updateDoc.$set.confidence_score = newSuccessRate;
        updateDoc.$set.success_rate = newSuccessRate;

        // Mark as inactive if reliability drops too low
        if (newSuccessRate < 0.3) {
          updateDoc.$set.active = false;
          this.logger.warn(`Deactivating unreliable selector for ${domain}:${selectorType}`);
        }

        await this.selectorsCollection.updateOne(
          { _id: selectorDoc._id },
          updateDoc,
        );

        // Also update Redis cache if successful
        if (success) {
          const cached = await this.cache.get('selectors', domain, selectorType);
          if (cached) {
            cached.reliability = newSuccessRate;
            await this.cache.set('selectors', domain, cached, selectorType);
          }
        }
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to update selector result for ${domain}:${selectorType}:`, error);
      return false;
    }
  }

  /**
   * Get selector statistics for a domain
   */
  async getSelectorStats(domain = null) {
    try {
      const match = domain ? { domain } : {};

      const stats = await this.selectorsCollection.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$domain',
            total_selectors: { $sum: 1 },
            active_selectors: {
              $sum: { $cond: ['$active', 1, 0] },
            },
            avg_reliability: { $avg: '$confidence_score' },
            total_usage: { $sum: '$usage_count' },
            avg_success_rate: { $avg: '$success_rate' },
            selector_types: { $addToSet: '$selector_type' },
          },
        },
      ]).toArray();

      // Add cache statistics
      const cacheStats = this.getCacheStats();

      return {
        mongodb: stats,
        cache: cacheStats,
        learning: Array.from(this.learningData.entries()).map(([key, data]) => ({
          key,
          ...data,
        })),
      };
    } catch (error) {
      this.logger.error('Failed to get selector stats:', error);
      return null;
    }
  }

  /**
   * Schedule non-blocking persistence to MongoDB
   */
  schedulePersistence(domain, selectorType, selectorData, elementType, context) {
    // Use setImmediate to avoid blocking
    setImmediate(async () => {
      try {
        await this.persistSelector(domain, selectorType, selectorData, elementType, context);
      } catch (error) {
        this.logger.error(`Background persistence failed for ${domain}:${selectorType}:`, error);
      }
    });
  }

  /**
   * Update usage statistics for a selector
   */
  async updateSelectorUsage(selectorId) {
    try {
      await this.selectorsCollection.updateOne(
        { _id: selectorId },
        {
          $inc: { usage_count: 1 },
          $set: { last_used: new Date() },
        },
      );
    } catch (error) {
      this.logger.error('Failed to update selector usage:', error);
    }
  }

  /**
   * Track cache performance
   */
  trackCacheHit(domain, selectorType, cacheType) {
    const key = `${domain}:${selectorType}`;
    if (!this.learningData.has(key)) {
      this.learningData.set(key, { hits: 0, misses: 0, mongoHits: 0, redisHits: 0 });
    }
    const data = this.learningData.get(key);
    data.hits++;
    if (cacheType === 'mongodb') {
      data.mongoHits++;
    } else if (cacheType === 'redis') {
      data.redisHits++;
    }
  }

  trackCacheMiss(domain, selectorType) {
    const key = `${domain}:${selectorType}`;
    if (!this.learningData.has(key)) {
      this.learningData.set(key, { hits: 0, misses: 0, mongoHits: 0, redisHits: 0 });
    }
    this.learningData.get(key).misses++;
  }

  trackDiscovery(domain, selectorType, discovered) {
    const key = `${domain}:${selectorType}`;
    if (!this.learningData.has(key)) {
      this.learningData.set(key, { hits: 0, misses: 0, discoveries: [] });
    }
    const data = this.learningData.get(key);
    if (!data.discoveries) {data.discoveries = [];}
    data.discoveries.push({
      timestamp: Date.now(),
      selector: discovered.selector,
      method: discovered.discoveryMethod,
    });

    // Keep only last 10 discoveries
    if (data.discoveries.length > 10) {
      data.discoveries = data.discoveries.slice(-10);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const stats = {
      domains: new Set(),
      totalHits: 0,
      totalMisses: 0,
      mongoHits: 0,
      redisHits: 0,
      hitRate: 0,
      typeStats: {},
    };

    for (const [key, data] of this.learningData) {
      const [domain, type] = key.split(':');
      stats.domains.add(domain);
      stats.totalHits += data.hits || 0;
      stats.totalMisses += data.misses || 0;
      stats.mongoHits += data.mongoHits || 0;
      stats.redisHits += data.redisHits || 0;

      if (!stats.typeStats[type]) {
        stats.typeStats[type] = { hits: 0, misses: 0 };
      }
      stats.typeStats[type].hits += data.hits || 0;
      stats.typeStats[type].misses += data.misses || 0;
    }

    if (stats.totalHits + stats.totalMisses > 0) {
      stats.hitRate = stats.totalHits / (stats.totalHits + stats.totalMisses);
    }

    return stats;
  }

  /**
   * Clean up old or unreliable selectors
   */
  async cleanupSelectors(daysOld = 30, minReliability = 0.2) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await this.selectorsCollection.updateMany(
        {
          $or: [
            { last_used: { $lt: cutoffDate } },
            {
              confidence_score: { $lt: minReliability },
              usage_count: { $gt: 10 },
            },
          ],
        },
        { $set: { active: false } },
      );

      this.logger.info(`Deactivated ${result.modifiedCount} old/unreliable selectors`);
      return result.modifiedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup selectors:', error);
      return 0;
    }
  }

  /**
   * Export selectors for a domain
   */
  async exportSelectors(domain) {
    try {
      const selectors = await this.selectorsCollection.find(
        { domain, active: true },
        { projection: { _id: 0 } },
      ).toArray();

      return selectors;
    } catch (error) {
      this.logger.error(`Failed to export selectors for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Import selectors for a domain
   */
  async importSelectors(domain, selectors) {
    try {
      const operations = selectors.map(selector => ({
        updateOne: {
          filter: {
            domain,
            selector_type: selector.selector_type,
            selector: selector.selector,
          },
          update: { $set: selector },
          upsert: true,
        },
      }));

      const result = await this.selectorsCollection.bulkWrite(operations);

      this.logger.info(`Imported ${result.upsertedCount} new selectors for ${domain}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to import selectors for ${domain}:`, error);
      return null;
    }
  }

  /**
   * Extract domain from URL or return as-is if already a domain
   */
  extractDomain(input) {
    try {
      // If it looks like a URL, extract the domain
      if (input.includes('://')) {
        const url = new URL(input);
        return url.hostname.replace('www.', '');
      }
      // Otherwise assume it's already a domain
      return input.replace('www.', '');
    } catch (error) {
      // If URL parsing fails, return the input as-is
      return input;
    }
  }

  /**
   * Map element types to the new expanded enum
   */
  mapElementType(type) {
    if (!type) {return 'text';}

    const typeMap = {
      'text': 'text',
      'description': 'description',
      'title': 'title',
      'price': 'price',
      'image': 'image',
      'images': 'image',
      'variant': 'variant',
      'variants': 'variant',
      'availability': 'availability',
      'brand': 'text',
      'button': 'button',
      'link': 'link',
      'input': 'input',
      'select': 'select',
      'navigation': 'navigation',
      'search': 'search',
      'filter': 'filter',
      'cart': 'cart',
      'booking': 'booking',
      'product': 'product',
    };

    return typeMap[type.toLowerCase()] || 'text';
  }

  async close() {
    // RedisCacheManager is a singleton, handles its own cleanup
    if (this.mongoClient) {
      await this.mongoClient.close();
    }
  }
}

module.exports = SelectorLearningCache;
