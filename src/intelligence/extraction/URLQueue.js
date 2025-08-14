/**
 * URLQueue - Manages product URLs with deduplication and persistence
 * 
 * Features:
 * - Automatic deduplication of URLs
 * - Redis persistence with in-memory fallback
 * - Checkpoint/restore capability
 * - Batch operations
 * - Progress tracking
 */

const crypto = require('crypto');

class URLQueue {
  constructor(logger, redisClient = null) {
    this.logger = logger;
    this.redis = redisClient;
    this.useRedis = !!redisClient && redisClient.connected;
    
    // In-memory storage when Redis not available
    this.memoryQueue = [];
    this.processedUrls = new Set();
    this.failedUrls = new Map(); // URL -> error reason
    
    // Metadata
    this.domain = null;
    this.createdAt = new Date().toISOString();
    this.stats = {
      totalAdded: 0,
      totalProcessed: 0,
      totalFailed: 0,
      duplicatesRemoved: 0
    };
  }

  /**
   * Initialize queue for a specific domain
   */
  async initialize(domain) {
    this.domain = domain;
    const queueKey = this.getQueueKey();

    if (this.useRedis) {
      try {
        // Check if queue exists in Redis
        const exists = await this.redis.exists(queueKey);
        if (exists) {
          const restored = await this.restore();
          this.logger.info('Restored existing queue from Redis', {
            domain,
            pending: restored.pending,
            processed: restored.processed
          });
        }
      } catch (error) {
        this.logger.warn('Failed to restore from Redis, using memory', {
          error: error.message
        });
        this.useRedis = false;
      }
    }

    this.logger.info('URL Queue initialized', {
      domain,
      storage: this.useRedis ? 'redis' : 'memory'
    });
  }

  /**
   * Add URLs to queue with deduplication
   */
  async addUrls(urls) {
    if (!Array.isArray(urls)) {
      urls = [urls];
    }

    const uniqueUrls = [];
    const duplicates = [];

    for (const url of urls) {
      const urlHash = this.hashUrl(url);
      
      // Check if already processed or in queue
      if (this.processedUrls.has(urlHash)) {
        duplicates.push(url);
        continue;
      }

      if (this.useRedis) {
        try {
          const inQueue = await this.redis.sismember(
            `${this.getQueueKey()}:all`, 
            urlHash
          );
          if (inQueue) {
            duplicates.push(url);
            continue;
          }
        } catch (error) {
          // Fall back to memory check
        }
      } else {
        if (this.memoryQueue.some(item => item.hash === urlHash)) {
          duplicates.push(url);
          continue;
        }
      }

      uniqueUrls.push({ url, hash: urlHash });
    }

    // Add unique URLs to queue
    if (uniqueUrls.length > 0) {
      if (this.useRedis) {
        await this.addToRedisQueue(uniqueUrls);
      } else {
        this.memoryQueue.push(...uniqueUrls);
      }
    }

    this.stats.totalAdded += uniqueUrls.length;
    this.stats.duplicatesRemoved += duplicates.length;

    this.logger.info('URLs added to queue', {
      added: uniqueUrls.length,
      duplicates: duplicates.length,
      total: this.stats.totalAdded
    });

    return {
      added: uniqueUrls.length,
      duplicates: duplicates.length,
      queueSize: await this.getQueueSize()
    };
  }

  /**
   * Get batch of URLs from queue
   */
  async getBatch(size = 10) {
    const batch = [];

    if (this.useRedis) {
      try {
        const queueKey = `${this.getQueueKey()}:pending`;
        const items = await this.redis.lpop(queueKey, size);
        
        if (items) {
          for (const item of items) {
            const parsed = JSON.parse(item);
            batch.push(parsed.url);
            
            // Move to processing set
            await this.redis.sadd(
              `${this.getQueueKey()}:processing`, 
              parsed.hash
            );
          }
        }
      } catch (error) {
        this.logger.error('Failed to get batch from Redis', {
          error: error.message
        });
        // Fall back to memory
        return this.getBatchFromMemory(size);
      }
    } else {
      return this.getBatchFromMemory(size);
    }

    return batch;
  }

  /**
   * Get batch from memory queue
   */
  getBatchFromMemory(size) {
    const batch = [];
    const items = this.memoryQueue.splice(0, size);
    
    for (const item of items) {
      batch.push(item.url);
      // Don't add to processed yet - wait for markProcessed
    }
    
    return batch;
  }

  /**
   * Mark URLs as successfully processed
   */
  async markProcessed(urls) {
    if (!Array.isArray(urls)) {
      urls = [urls];
    }

    for (const url of urls) {
      const urlHash = this.hashUrl(url);
      this.processedUrls.add(urlHash);

      if (this.useRedis) {
        try {
          await this.redis.sadd(
            `${this.getQueueKey()}:processed`, 
            urlHash
          );
          await this.redis.srem(
            `${this.getQueueKey()}:processing`, 
            urlHash
          );
        } catch (error) {
          // Continue with memory tracking
        }
      }
    }

    this.stats.totalProcessed += urls.length;

    return {
      processed: urls.length,
      totalProcessed: this.stats.totalProcessed
    };
  }

  /**
   * Mark URLs as failed with reason
   */
  async markFailed(urls, reason = 'Unknown error') {
    if (!Array.isArray(urls)) {
      urls = [{ url: urls, reason }];
    }

    for (const item of urls) {
      const url = typeof item === 'string' ? item : item.url;
      const error = typeof item === 'string' ? reason : item.reason;
      
      const urlHash = this.hashUrl(url);
      this.failedUrls.set(urlHash, {
        url,
        error,
        timestamp: new Date().toISOString()
      });

      if (this.useRedis) {
        try {
          await this.redis.hset(
            `${this.getQueueKey()}:failed`,
            urlHash,
            JSON.stringify({ url, error, timestamp: new Date().toISOString() })
          );
        } catch (error) {
          // Continue with memory tracking
        }
      }
    }

    this.stats.totalFailed += urls.length;

    return {
      failed: urls.length,
      totalFailed: this.stats.totalFailed
    };
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    const queueSize = await this.getQueueSize();
    
    return {
      domain: this.domain,
      storage: this.useRedis ? 'redis' : 'memory',
      pending: queueSize,
      processed: this.stats.totalProcessed,
      failed: this.stats.totalFailed,
      duplicatesRemoved: this.stats.duplicatesRemoved,
      totalAdded: this.stats.totalAdded,
      successRate: this.stats.totalProcessed > 0 
        ? (this.stats.totalProcessed / (this.stats.totalProcessed + this.stats.totalFailed) * 100).toFixed(1) + '%'
        : '0%',
      createdAt: this.createdAt
    };
  }

  /**
   * Get current queue size
   */
  async getQueueSize() {
    if (this.useRedis) {
      try {
        return await this.redis.llen(`${this.getQueueKey()}:pending`);
      } catch (error) {
        return this.memoryQueue.length;
      }
    }
    return this.memoryQueue.length;
  }

  /**
   * Save queue state for checkpoint
   */
  async checkpoint() {
    const state = {
      domain: this.domain,
      createdAt: this.createdAt,
      stats: this.stats,
      pending: this.memoryQueue,
      processed: Array.from(this.processedUrls),
      failed: Array.from(this.failedUrls.entries())
    };

    if (this.useRedis) {
      try {
        await this.redis.set(
          `${this.getQueueKey()}:checkpoint`,
          JSON.stringify(state),
          'EX',
          86400 // 24 hour expiry
        );
        this.logger.info('Queue checkpoint saved to Redis');
      } catch (error) {
        this.logger.error('Failed to save checkpoint', { error: error.message });
      }
    }

    return state;
  }

  /**
   * Restore queue from checkpoint
   */
  async restore() {
    if (this.useRedis) {
      try {
        const checkpoint = await this.redis.get(`${this.getQueueKey()}:checkpoint`);
        if (checkpoint) {
          const state = JSON.parse(checkpoint);
          this.stats = state.stats;
          this.createdAt = state.createdAt;
          
          // Restore sets
          this.processedUrls = new Set(state.processed);
          this.failedUrls = new Map(state.failed);
          
          // Get pending from Redis list
          const pendingKey = `${this.getQueueKey()}:pending`;
          const pendingCount = await this.redis.llen(pendingKey);
          
          return {
            pending: pendingCount,
            processed: this.processedUrls.size,
            failed: this.failedUrls.size
          };
        }
      } catch (error) {
        this.logger.error('Failed to restore from checkpoint', {
          error: error.message
        });
      }
    }
    
    return { pending: 0, processed: 0, failed: 0 };
  }

  /**
   * Clear all queue data
   */
  async clear() {
    this.memoryQueue = [];
    this.processedUrls.clear();
    this.failedUrls.clear();
    this.stats = {
      totalAdded: 0,
      totalProcessed: 0,
      totalFailed: 0,
      duplicatesRemoved: 0
    };

    if (this.useRedis) {
      try {
        const keys = await this.redis.keys(`${this.getQueueKey()}:*`);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch (error) {
        this.logger.error('Failed to clear Redis queue', {
          error: error.message
        });
      }
    }

    this.logger.info('Queue cleared');
  }

  /**
   * Add URLs to Redis queue
   */
  async addToRedisQueue(uniqueUrls) {
    const pipeline = this.redis.pipeline();
    const queueKey = `${this.getQueueKey()}:pending`;
    
    for (const item of uniqueUrls) {
      // Add to pending list
      pipeline.rpush(queueKey, JSON.stringify(item));
      // Add to all URLs set for deduplication
      pipeline.sadd(`${this.getQueueKey()}:all`, item.hash);
    }
    
    await pipeline.exec();
  }

  /**
   * Generate consistent hash for URL
   */
  hashUrl(url) {
    // Normalize URL before hashing
    const normalized = url.toLowerCase().trim();
    return crypto.createHash('md5').update(normalized).digest('hex');
  }

  /**
   * Get Redis key for this queue
   */
  getQueueKey() {
    return `url_queue:${this.domain}`;
  }

  /**
   * Get failed URLs for retry
   */
  getFailedUrls() {
    return Array.from(this.failedUrls.values()).map(item => item.url);
  }
}

module.exports = URLQueue;