// AI Shopping Scraper - Redis Schema and Data Structures
// Caching, job queues, and real-time data management

// Note: This file defines Redis configuration and schemas but does not create connections
// Connections are managed by individual services (RedisCache, etc.)

// Redis connection configuration for reference
const REDIS_CONFIG = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  options: {
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  }
};

// =====================================================
// CACHING STRUCTURES AND TTL SETTINGS
// =====================================================

const CACHE_TTL = {
  DOMAIN_INTELLIGENCE: 24 * 60 * 60, // 24 hours
  PRODUCT_DATA: 4 * 60 * 60,         // 4 hours
  PRICE_DATA: 30 * 60,               // 30 minutes
  SELECTORS: 7 * 24 * 60 * 60,       // 7 days
  API_RESPONSES: 15 * 60,            // 15 minutes
  SESSION_DATA: 2 * 60 * 60,         // 2 hours
  NAVIGATION_MAPS: 24 * 60 * 60,     // 24 hours
  AVAILABILITY: 10 * 60,             // 10 minutes
};

// =====================================================
// KEY NAMING CONVENTIONS
// =====================================================

const REDIS_KEYS = {
  // Caching patterns
  DOMAIN_CACHE: (domain) => `cache:domain:${domain}`,
  PRODUCT_CACHE: (domain, productId) => `cache:product:${domain}:${productId}`,
  PRICE_CACHE: (domain) => `cache:prices:${domain}`,
  SELECTORS_CACHE: (domain, type) => `cache:selectors:${domain}:${type}`,
  NAVIGATION_CACHE: (domain) => `cache:navigation:${domain}`,
  API_CACHE: (endpoint, params) => `cache:api:${endpoint}:${Buffer.from(JSON.stringify(params)).toString('base64')}`,
  
  // Job queues
  SCRAPING_QUEUE: 'queue:scraping',
  PROCESSING_QUEUE: 'queue:processing',
  MONITORING_QUEUE: 'queue:monitoring',
  CLEANUP_QUEUE: 'queue:cleanup',
  
  // Real-time data
  ACTIVE_SESSION: (sessionId) => `session:${sessionId}`,
  SCRAPING_STATUS: 'status:scraping',
  PRICE_ALERTS: 'alerts:price',
  LIVE_METRICS: 'metrics:live',
  
  // Performance and control
  RATE_LIMIT: (identifier) => `throttle:${identifier}`,
  SCRAPING_LOCK: (domain) => `lock:scraping:${domain}`,
  DOMAIN_STATS: (domain) => `stats:domain:${domain}`,
  FAILED_ATTEMPTS: (domain) => `failed:${domain}`,
  
  // Training data cache
  TRAINING_CACHE: (type, hash) => `cache:training:${type}:${hash}`,
  SCENARIO_CACHE: (scenarioId) => `cache:scenario:${scenarioId}`,
  COMPONENT_CACHE: (componentType, domain) => `cache:component:${componentType}:${domain}`,
};

// =====================================================
// CACHING HELPER FUNCTIONS
// =====================================================

/* COMMENTED OUT - CAUSING CONNECTION ERRORS
class RedisCache {
  constructor(redisClient) {
    this.redis = redisClient;
  }

  // Domain intelligence caching
  async cacheDomainIntelligence(domain, intelligenceData) {
    const key = REDIS_KEYS.DOMAIN_CACHE(domain);
    await this.redis.setex(key, CACHE_TTL.DOMAIN_INTELLIGENCE, JSON.stringify(intelligenceData));
    return true;
  }

  async getDomainIntelligence(domain) {
    const key = REDIS_KEYS.DOMAIN_CACHE(domain);
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  // Product data caching
  async cacheProduct(domain, productId, productData) {
    const key = REDIS_KEYS.PRODUCT_CACHE(domain, productId);
    await this.redis.setex(key, CACHE_TTL.PRODUCT_DATA, JSON.stringify(productData));
    
    // Also add to domain's product list
    const domainProductsKey = `${REDIS_KEYS.DOMAIN_CACHE(domain)}:products`;
    await this.redis.sadd(domainProductsKey, productId);
    await this.redis.expire(domainProductsKey, CACHE_TTL.DOMAIN_INTELLIGENCE);
    
    return true;
  }

  async getProduct(domain, productId) {
    const key = REDIS_KEYS.PRODUCT_CACHE(domain, productId);
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  // Price data caching with history
  async cachePriceData(domain, priceData) {
    const key = REDIS_KEYS.PRICE_CACHE(domain);
    const timestamp = Date.now();
    
    // Store current prices
    await this.redis.setex(key, CACHE_TTL.PRICE_DATA, JSON.stringify(priceData));
    
    // Store in sorted set for price history
    const historyKey = `${key}:history`;
    await this.redis.zadd(historyKey, timestamp, JSON.stringify(priceData));
    
    // Keep only last 100 price points
    await this.redis.zremrangebyrank(historyKey, 0, -101);
    await this.redis.expire(historyKey, 7 * 24 * 60 * 60); // 7 days
    
    return true;
  }

  async getPriceData(domain) {
    const key = REDIS_KEYS.PRICE_CACHE(domain);
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async getPriceHistory(domain, hours = 24) {
    const key = `${REDIS_KEYS.PRICE_CACHE(domain)}:history`;
    const since = Date.now() - (hours * 60 * 60 * 1000);
    const history = await this.redis.zrangebyscore(key, since, '+inf', 'WITHSCORES');
    
    const result = [];
    for (let i = 0; i < history.length; i += 2) {
      result.push({
        data: JSON.parse(history[i]),
        timestamp: parseInt(history[i + 1])
      });
    }
    return result;
  }

  // Selector reliability caching
  async cacheSelectors(domain, selectorType, selectors) {
    const key = REDIS_KEYS.SELECTORS_CACHE(domain, selectorType);
    await this.redis.setex(key, CACHE_TTL.SELECTORS, JSON.stringify(selectors));
    return true;
  }

  async getSelectors(domain, selectorType) {
    const key = REDIS_KEYS.SELECTORS_CACHE(domain, selectorType);
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  // API response caching
  async cacheAPIResponse(endpoint, params, response) {
    const key = REDIS_KEYS.API_CACHE(endpoint, params);
    await this.redis.setex(key, CACHE_TTL.API_RESPONSES, JSON.stringify(response));
    return true;
  }

  async getCachedAPIResponse(endpoint, params) {
    const key = REDIS_KEYS.API_CACHE(endpoint, params);
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  // Training data caching
  async cacheTrainingData(type, dataHash, trainingData) {
    const key = REDIS_KEYS.TRAINING_CACHE(type, dataHash);
    await this.redis.setex(key, CACHE_TTL.API_RESPONSES, JSON.stringify(trainingData));
    return true;
  }

  async getCachedTrainingData(type, dataHash) {
    const key = REDIS_KEYS.TRAINING_CACHE(type, dataHash);
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }
}

// =====================================================
// JOB QUEUE MANAGEMENT
// =====================================================

class RedisJobQueue {
  constructor(redisClient) {
    this.redis = redisClient;
  }

  // Add scraping job to queue
  async addScrapingJob(jobData, priority = 0) {
    const job = {
      id: require('crypto').randomUUID(),
      type: 'scraping',
      data: jobData,
      priority: priority,
      created_at: Date.now(),
      attempts: 0,
      max_attempts: 3
    };

    // Add to priority queue (higher score = higher priority)
    await this.redis.zadd(REDIS_KEYS.SCRAPING_QUEUE, priority, JSON.stringify(job));
    
    // Track job status
    await this.redis.hset(`job:${job.id}`, {
      status: 'queued',
      created_at: job.created_at,
      queue: 'scraping'
    });

    return job.id;
  }

  // Get next scraping job
  async getNextScrapingJob() {
    // Get highest priority job
    const jobs = await this.redis.zrevrange(REDIS_KEYS.SCRAPING_QUEUE, 0, 0, 'WITHSCORES');
    
    if (jobs.length === 0) return null;

    const jobData = JSON.parse(jobs[0]);
    const score = jobs[1];

    // Remove from queue
    await this.redis.zrem(REDIS_KEYS.SCRAPING_QUEUE, jobs[0]);
    
    // Update job status
    await this.redis.hset(`job:${jobData.id}`, {
      status: 'processing',
      started_at: Date.now()
    });

    return jobData;
  }

  // Add processing job
  async addProcessingJob(sessionId, jobType = 'conversation_generation') {
    const job = {
      id: require('crypto').randomUUID(),
      type: 'processing',
      session_id: sessionId,
      job_type: jobType,
      created_at: Date.now()
    };

    await this.redis.lpush(REDIS_KEYS.PROCESSING_QUEUE, JSON.stringify(job));
    
    await this.redis.hset(`job:${job.id}`, {
      status: 'queued',
      created_at: job.created_at,
      queue: 'processing'
    });

    return job.id;
  }

  // Complete job
  async completeJob(jobId, result = null) {
    await this.redis.hset(`job:${jobId}`, {
      status: 'completed',
      completed_at: Date.now(),
      result: result ? JSON.stringify(result) : null
    });

    // Set expiration for completed job data
    await this.redis.expire(`job:${jobId}`, 24 * 60 * 60); // 24 hours
    return true;
  }

  // Fail job
  async failJob(jobId, error, retry = false) {
    const jobKey = `job:${jobId}`;
    const jobInfo = await this.redis.hgetall(jobKey);
    
    if (retry && parseInt(jobInfo.attempts || 0) < 3) {
      // Retry job
      const attempts = parseInt(jobInfo.attempts || 0) + 1;
      await this.redis.hset(jobKey, {
        status: 'queued',
        attempts: attempts,
        last_error: error
      });

      // Re-add to queue with lower priority
      const originalJob = JSON.parse(jobInfo.original_data || '{}');
      originalJob.attempts = attempts;
      
      const queueKey = jobInfo.queue === 'scraping' ? REDIS_KEYS.SCRAPING_QUEUE : REDIS_KEYS.PROCESSING_QUEUE;
      if (jobInfo.queue === 'scraping') {
        await this.redis.zadd(queueKey, -attempts, JSON.stringify(originalJob)); // Lower priority
      } else {
        await this.redis.lpush(queueKey, JSON.stringify(originalJob));
      }
    } else {
      // Mark as failed
      await this.redis.hset(jobKey, {
        status: 'failed',
        failed_at: Date.now(),
        error: error
      });
    }

    return true;
  }
}

// =====================================================
// REAL-TIME DATA MANAGEMENT
// =====================================================

class RedisRealTime {
  constructor(redisClient) {
    this.redis = redisClient;
  }

  // Active session management
  async startSession(sessionId, sessionData) {
    const key = REDIS_KEYS.ACTIVE_SESSION(sessionId);
    const data = {
      ...sessionData,
      status: 'active',
      started_at: Date.now(),
      last_activity: Date.now()
    };

    await this.redis.setex(key, CACHE_TTL.SESSION_DATA, JSON.stringify(data));
    
    // Add to active sessions list
    await this.redis.sadd('active_sessions', sessionId);
    
    return true;
  }

  async updateSession(sessionId, updates) {
    const key = REDIS_KEYS.ACTIVE_SESSION(sessionId);
    const current = await this.redis.get(key);
    
    if (current) {
      const sessionData = JSON.parse(current);
      const updated = {
        ...sessionData,
        ...updates,
        last_activity: Date.now()
      };

      await this.redis.setex(key, CACHE_TTL.SESSION_DATA, JSON.stringify(updated));
      return updated;
    }
    
    return null;
  }

  async endSession(sessionId, finalData = {}) {
    const key = REDIS_KEYS.ACTIVE_SESSION(sessionId);
    const current = await this.redis.get(key);
    
    if (current) {
      const sessionData = JSON.parse(current);
      const final = {
        ...sessionData,
        ...finalData,
        status: 'completed',
        ended_at: Date.now()
      };

      // Store final session data with longer TTL
      await this.redis.setex(key, 24 * 60 * 60, JSON.stringify(final)); // 24 hours
      
      // Remove from active sessions
      await this.redis.srem('active_sessions', sessionId);
    }
    
    return true;
  }

  // Live metrics and status
  async updateLiveMetrics(metrics) {
    await this.redis.setex(REDIS_KEYS.LIVE_METRICS, 60, JSON.stringify({
      ...metrics,
      timestamp: Date.now()
    }));
    
    // Publish to subscribers
    await this.redis.publish('metrics_update', JSON.stringify(metrics));
    return true;
  }

  async getLiveMetrics() {
    const cached = await this.redis.get(REDIS_KEYS.LIVE_METRICS);
    return cached ? JSON.parse(cached) : null;
  }

  // Price alerts
  async addPriceAlert(productId, domain, alertData) {
    const alertKey = `alert:${productId}:${domain}`;
    await this.redis.setex(alertKey, 24 * 60 * 60, JSON.stringify(alertData));
    
    // Add to alerts list
    await this.redis.sadd(REDIS_KEYS.PRICE_ALERTS, alertKey);
    
    return true;
  }

  async checkPriceAlerts(domain, currentPrices) {
    const alerts = await this.redis.smembers(REDIS_KEYS.PRICE_ALERTS);
    const triggeredAlerts = [];

    for (const alertKey of alerts) {
      if (alertKey.includes(domain)) {
        const alertData = await this.redis.get(alertKey);
        if (alertData) {
          const alert = JSON.parse(alertData);
          // Check if price conditions are met
          // Implementation depends on alert logic
          triggeredAlerts.push(alert);
        }
      }
    }

    return triggeredAlerts;
  }
}

// =====================================================
// RATE LIMITING AND CONTROL
// =====================================================

class RedisRateLimit {
  constructor(redisClient) {
    this.redis = redisClient;
  }

  // Domain-based rate limiting
  async checkDomainRateLimit(domain, maxRequestsPerMinute = 10) {
    const key = REDIS_KEYS.RATE_LIMIT(`domain:${domain}`);
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      await this.redis.expire(key, 60); // 1 minute window
    }
    
    return current <= maxRequestsPerMinute;
  }

  // API rate limiting
  async checkAPIRateLimit(userId, maxRequestsPerHour = 1000) {
    const key = REDIS_KEYS.RATE_LIMIT(`api:${userId}`);
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      await this.redis.expire(key, 3600); // 1 hour window
    }
    
    return current <= maxRequestsPerHour;
  }

  // Scraping locks to prevent concurrent access
  async acquireScrapingLock(domain, lockTimeSeconds = 300) {
    const key = REDIS_KEYS.SCRAPING_LOCK(domain);
    const lockValue = require('crypto').randomUUID();
    
    const result = await this.redis.set(key, lockValue, 'EX', lockTimeSeconds, 'NX');
    
    if (result === 'OK') {
      return lockValue; // Return lock value for later release
    }
    
    return null; // Lock not acquired
  }

  async releaseScrapingLock(domain, lockValue) {
    const key = REDIS_KEYS.SCRAPING_LOCK(domain);
    
    // Lua script for atomic check-and-delete
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    const result = await this.redis.eval(script, 1, key, lockValue);
    return result === 1;
  }

  // Track failed attempts
  async recordFailedAttempt(domain, error) {
    const key = REDIS_KEYS.FAILED_ATTEMPTS(domain);
    const failureData = {
      timestamp: Date.now(),
      error: error,
      count: await this.redis.incr(`${key}:count`)
    };

    await this.redis.lpush(key, JSON.stringify(failureData));
    await this.redis.ltrim(key, 0, 99); // Keep last 100 failures
    await this.redis.expire(key, 24 * 60 * 60); // 24 hours
    await this.redis.expire(`${key}:count`, 24 * 60 * 60);

    return failureData.count;
  }
}
*/

// =====================================================
// EXPORT CONFIGURATION AND UTILITIES
// =====================================================

module.exports = {
  REDIS_CONFIG,
  REDIS_KEYS,
  CACHE_TTL
  // Classes are implemented in individual service files
  // to avoid unwanted Redis connections on module load
};