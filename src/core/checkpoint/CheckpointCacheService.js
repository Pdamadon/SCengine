/**
 * CheckpointCacheService - Facade for checkpoint-specific cache operations
 * Provides validated access to Redis cache for checkpoint data
 */

const RedisCacheManager = require('../../cache/RedisCacheManager');
const {
  validateCheckpoint,
  validateCheckpointUpdate,
  prepareForMongoDB,
  isExpired
} = require('./validation/checkpoint.schema');
const { CheckpointStatus } = require('./validation/validationUtils');

class CheckpointCacheService {
  constructor(logger, cache = null) {
    this.logger = logger;
    this.cache = cache || RedisCacheManager.getInstance(logger);
    
    // Configuration
    this.MAX_PAYLOAD_SIZE = parseInt(process.env.CHECKPOINT_MAX_PAYLOAD_SIZE || '524288'); // 512KB default
    this.COMPRESS_ENABLED = process.env.CHECKPOINT_CACHE_COMPRESS === 'true';
    this.DELETE_ON_ERROR = process.env.CACHE_CHECKPOINT_DELETE_ON_ERROR !== 'false'; // Default true
    
    // Checkpoint namespace configuration
    this.namespace = 'checkpoint';
    this.namespacePrefix = 'cp'; // Same as defined in RedisCacheManager
    
    // Metrics
    this.stats = {
      validationErrors: 0,
      corruptedDeletes: 0,
      compressionSaves: 0,
      oversizedPayloads: 0
    };
  }
  
  /**
   * Initialize the cache service
   */
  async initialize() {
    await this.cache.initialize();
    this.logger.info('CheckpointCacheService initialized', {
      maxPayloadSize: this.MAX_PAYLOAD_SIZE,
      compressionEnabled: this.COMPRESS_ENABLED,
      deleteOnError: this.DELETE_ON_ERROR
    });
  }
  
  /**
   * Validate checkpoint data for Redis storage
   * Removes MongoDB-specific fields
   */
  validateForRedis(data) {
    // First validate the data structure
    const validated = validateCheckpoint(data);
    
    // Remove MongoDB-specific fields
    const { _id, ...redisData } = validated;
    
    return redisData;
  }
  
  /**
   * Store a checkpoint in cache
   */
  async set(checkpointId, data) {
    try {
      // Validate before storing
      const validated = this.validateForRedis(data);
      
      // Check payload size
      const serialized = JSON.stringify(validated);
      const payloadSize = Buffer.byteLength(serialized);
      
      if (payloadSize > this.MAX_PAYLOAD_SIZE) {
        this.stats.oversizedPayloads++;
        this.logger.warn(`Checkpoint payload too large: ${checkpointId}`, {
          size: payloadSize,
          maxSize: this.MAX_PAYLOAD_SIZE
        });
        
        // Store minimal checkpoint reference instead
        const minimal = {
          checkpoint_id: validated.checkpoint_id,
          site_domain: validated.site_domain,
          status: validated.status,
          pipeline_step: validated.pipeline_step,
          created_at: validated.created_at,
          updated_at: validated.updated_at,
          _oversized: true
        };
        
        await this.cache.set('checkpoint', 'checkpoints', minimal, checkpointId);
        return minimal;
      }
      
      // Store in cache with checkpoint namespace TTL
      // Using checkpointId as identifier, 'checkpoints' as domain
      await this.cache.set('checkpoint', 'checkpoints', validated, checkpointId);
      
      this.logger.debug(`Checkpoint stored in cache: ${checkpointId}`, {
        size: payloadSize,
        status: validated.status
      });
      
      return validated;
      
    } catch (error) {
      this.stats.validationErrors++;
      this.logger.error(`Failed to cache checkpoint: ${checkpointId}`, error);
      throw error;
    }
  }
  
  /**
   * Retrieve a checkpoint from cache
   */
  async get(checkpointId) {
    try {
      const data = await this.cache.get('checkpoint', 'checkpoints', checkpointId);
      
      if (!data) {
        return null;
      }
      
      // Check for oversized marker
      if (data._oversized) {
        this.logger.debug(`Checkpoint was oversized, returning minimal data: ${checkpointId}`);
        return data;
      }
      
      // Validate retrieved data
      try {
        const validated = this.validateForRedis(data);
        
        // Check if expired
        if (isExpired(validated)) {
          this.logger.debug(`Checkpoint expired: ${checkpointId}`);
          await this.delete(checkpointId);
          return null;
        }
        
        return validated;
        
      } catch (validationError) {
        this.stats.corruptedDeletes++;
        this.logger.warn(`Checkpoint cache corruption (${checkpointId})`, validationError);
        
        if (this.DELETE_ON_ERROR) {
          await this.delete(checkpointId);
        }
        
        return null;
      }
      
    } catch (error) {
      this.logger.error(`Failed to retrieve checkpoint: ${checkpointId}`, error);
      return null;
    }
  }
  
  /**
   * Update a checkpoint in cache
   */
  async update(checkpointId, updates) {
    try {
      const existing = await this.get(checkpointId);
      
      if (!existing) {
        throw new Error(`Checkpoint not found: ${checkpointId}`);
      }
      
      // Don't update oversized checkpoints
      if (existing._oversized) {
        this.logger.warn(`Cannot update oversized checkpoint: ${checkpointId}`);
        return existing;
      }
      
      // Merge updates
      const updated = {
        ...existing,
        ...updates,
        updated_at: new Date()
      };
      
      // Validate the merged data
      const validated = this.validateForRedis(updated);
      
      // Store updated checkpoint (will reset TTL)
      await this.set(checkpointId, validated);
      
      this.logger.debug(`Checkpoint updated in cache: ${checkpointId}`, {
        status: validated.status,
        pipeline_step: validated.pipeline_step
      });
      
      return validated;
      
    } catch (error) {
      this.logger.error(`Failed to update checkpoint: ${checkpointId}`, error);
      throw error;
    }
  }
  
  /**
   * Delete a checkpoint from cache
   */
  async delete(checkpointId) {
    try {
      await this.cache.delete('checkpoint', 'checkpoints', checkpointId);
      this.logger.debug(`Checkpoint deleted from cache: ${checkpointId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete checkpoint: ${checkpointId}`, error);
      return false;
    }
  }
  
  /**
   * Get multiple checkpoints in a single operation
   */
  async getMultiple(checkpointIds) {
    if (!checkpointIds || checkpointIds.length === 0) {
      return [];
    }
    
    const results = [];
    const errors = [];
    
    // Use Promise.all for parallel fetching
    const promises = checkpointIds.map(id => 
      this.get(id).catch(error => {
        errors.push({ id, error });
        return null;
      })
    );
    
    const checkpoints = await Promise.all(promises);
    
    // Filter out nulls and return
    const valid = checkpoints.filter(cp => cp !== null);
    
    if (errors.length > 0) {
      this.logger.warn(`Failed to retrieve ${errors.length} checkpoints`, errors);
    }
    
    return valid;
  }
  
  /**
   * Set multiple checkpoints in a single operation
   */
  async setMultiple(checkpoints) {
    if (!checkpoints || checkpoints.length === 0) {
      return [];
    }
    
    const results = [];
    const errors = [];
    
    // Validate all checkpoints first
    const validatedItems = [];
    for (const checkpoint of checkpoints) {
      try {
        const validated = this.validateForRedis(checkpoint);
        validatedItems.push({
          id: checkpoint.checkpoint_id,
          data: validated
        });
      } catch (error) {
        errors.push({
          id: checkpoint.checkpoint_id,
          error: error.message
        });
      }
    }
    
    // Set all valid checkpoints
    const promises = validatedItems.map(item =>
      this.set(item.id, item.data).catch(error => {
        errors.push({ id: item.id, error });
        return null;
      })
    );
    
    const stored = await Promise.all(promises);
    const successful = stored.filter(s => s !== null);
    
    if (errors.length > 0) {
      this.logger.warn(`Failed to store ${errors.length} checkpoints`, errors);
    }
    
    return successful;
  }
  
  /**
   * Check if a checkpoint exists in cache
   */
  async exists(checkpointId) {
    try {
      const exists = await this.cache.exists('checkpoint', 'checkpoints', checkpointId);
      return exists;
    } catch (error) {
      this.logger.error(`Failed to check checkpoint existence: ${checkpointId}`, error);
      return false;
    }
  }
  
  /**
   * Get all active checkpoints for a domain
   */
  async getActiveByDomain(domain) {
    try {
      // This would require scanning keys, which is expensive
      // Better to maintain a separate index or use MongoDB
      this.logger.warn('getActiveByDomain not implemented for cache - use MongoDB');
      return [];
    } catch (error) {
      this.logger.error(`Failed to get active checkpoints for domain: ${domain}`, error);
      return [];
    }
  }
  
  /**
   * Clear all checkpoints (use with caution)
   */
  async clearAll() {
    try {
      // Check if Redis is available
      if (!this.cache.redis) {
        this.logger.warn('Redis not available, cannot clear checkpoints');
        return 0;
      }
      
      // Get all checkpoint keys
      const pattern = `${this.namespacePrefix}:*`;
      const keys = await this.cache.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.cache.redis.del(...keys);
        this.logger.info(`Cleared ${keys.length} checkpoints from cache`);
      }
      
      return keys.length;
    } catch (error) {
      this.logger.error('Failed to clear checkpoints', error);
      throw error;
    }
  }
  
  /**
   * Get cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheStats: this.cache.getStats()
    };
  }
  
  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      validationErrors: 0,
      corruptedDeletes: 0,
      compressionSaves: 0,
      oversizedPayloads: 0
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create the singleton instance
 */
CheckpointCacheService.getInstance = function(logger) {
  if (!instance) {
    instance = new CheckpointCacheService(logger);
  }
  return instance;
};

module.exports = CheckpointCacheService;