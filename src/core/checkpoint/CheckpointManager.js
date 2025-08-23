/**
 * CheckpointManager - Orchestrates checkpoint operations across Redis and MongoDB
 * 
 * Architecture:
 * - Redis: Fast access for active pipeline operations (48-hour TTL)
 * - MongoDB: Durable storage for recovery and history (7-day TTL)
 * - Write-through pattern with selective MongoDB persistence
 */

const { v4: uuidv4 } = require('uuid');
const CheckpointCacheService = require('./CheckpointCacheService');
const {
  createCheckpoint,
  validateCheckpoint,
  prepareForMongoDB,
  CheckpointStatus,
  JobType
} = require('./validation/checkpoint.schema');

class CheckpointManager {
  constructor(logger, mongoClient = null, cacheService = null) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.cache = cacheService || CheckpointCacheService.getInstance(logger);
    this.collection = null;
    this.initialized = false;
    
    // Configuration
    this.ENABLE_CHECKPOINTS = process.env.ENABLE_CHECKPOINTS === 'true';
    this.MONGODB_TTL_DAYS = parseInt(process.env.CHECKPOINT_MONGODB_TTL_DAYS || '7');
    this.SYNC_TO_MONGODB = process.env.CHECKPOINT_SYNC_TO_MONGODB !== 'false'; // Default true
    
    // Metrics
    this.stats = {
      checkpointsCreated: 0,
      checkpointsSaved: 0,
      checkpointsLoaded: 0,
      mongoSyncs: 0,
      redisFallbacks: 0
    };
  }
  
  /**
   * Initialize the checkpoint manager
   */
  async initialize() {
    if (!this.ENABLE_CHECKPOINTS) {
      this.logger.info('Checkpoints disabled via feature flag');
      return false;
    }
    
    try {
      // Initialize cache service
      await this.cache.initialize();
      
      // Initialize MongoDB if available
      if (this.mongoClient) {
        await this.mongoClient.connect();
        const db = this.mongoClient.db('ai_shopping_scraper');
        this.collection = db.collection('checkpoints');
        
        // Create indexes
        await this.createIndexes();
        
        this.logger.info('CheckpointManager initialized with MongoDB support');
      } else {
        this.logger.warn('CheckpointManager initialized without MongoDB (Redis-only mode)');
      }
      
      this.initialized = true;
      return true;
      
    } catch (error) {
      this.logger.error('Failed to initialize CheckpointManager', error);
      throw error;
    }
  }
  
  /**
   * Create MongoDB indexes for efficient querying
   */
  async createIndexes() {
    if (!this.collection) return;
    
    try {
      // Compound index for job lookup
      await this.collection.createIndex(
        { job_id: 1, created_at: -1 },
        { name: 'job_lookup_idx' }
      );
      
      // TTL index for automatic cleanup
      await this.collection.createIndex(
        { expires_at: 1 },
        { 
          name: 'ttl_idx',
          expireAfterSeconds: 0 // Use the expires_at field value
        }
      );
      
      // Index for domain-based queries
      await this.collection.createIndex(
        { site_domain: 1, status: 1 },
        { name: 'domain_status_idx' }
      );
      
      this.logger.debug('MongoDB indexes created for checkpoints collection');
      
    } catch (error) {
      // Indexes might already exist, which is fine
      this.logger.debug('Index creation completed (may have already existed)', error.message);
    }
  }
  
  /**
   * Create a new checkpoint
   */
  async createCheckpoint(jobId, domain, metadata = {}) {
    if (!this.ENABLE_CHECKPOINTS) return null;
    
    try {
      const checkpointData = {
        checkpoint_id: uuidv4(),
        job_id: jobId,
        site_domain: domain,
        status: CheckpointStatus.ACTIVE,
        pipeline_step: 1,
        pipeline_data: {
          urls_discovered: [],
          urls_processed: [],
          current_page: 1,
          pagination_state: {},
          extraction_results: []
        },
        metadata: {
          ...metadata,
          created_by: 'CheckpointManager',
          pipeline_version: '1.0'
        },
        created_at: new Date(),
        updated_at: new Date(),
        expires_at: new Date(Date.now() + (this.MONGODB_TTL_DAYS * 24 * 60 * 60 * 1000))
      };
      
      // Validate checkpoint
      const validated = createCheckpoint(checkpointData);
      validated.job_id = jobId; // Ensure job_id is in the validated object
      
      // Save to Redis (fast access)
      await this.cache.set(validated.checkpoint_id, validated);
      
      // Save to MongoDB (durable storage)
      if (this.SYNC_TO_MONGODB && this.collection) {
        const preparedDoc = prepareForMongoDB(validated);
        preparedDoc.job_id = jobId; // Add job_id directly
        
        this.logger.debug(`Saving to MongoDB with job_id: ${preparedDoc.job_id}`);
        console.log('DEBUG: preparedDoc before insert:', JSON.stringify({ 
          has_job_id: 'job_id' in preparedDoc,
          job_id_value: preparedDoc.job_id,
          keys: Object.keys(preparedDoc)
        }));
        const insertResult = await this.collection.insertOne(preparedDoc);
        console.log('DEBUG: Insert result:', insertResult.acknowledged);
        this.stats.mongoSyncs++;
        
        this.logger.debug(`Checkpoint created in MongoDB: ${validated.checkpoint_id}`);
      }
      
      this.stats.checkpointsCreated++;
      
      this.logger.info(`Checkpoint created: ${validated.checkpoint_id}`, {
        jobId,
        domain,
        checkpointId: validated.checkpoint_id
      });
      
      return validated;
      
    } catch (error) {
      this.logger.error(`Failed to create checkpoint for job ${jobId}`, error);
      throw error;
    }
  }
  
  /**
   * Save checkpoint progress
   * @param {string} checkpointId - Checkpoint ID
   * @param {number} step - Pipeline step (1-4)
   * @param {object} data - Step data to save
   * @param {boolean} stepComplete - Whether the step is complete (triggers MongoDB sync)
   */
  async saveProgress(checkpointId, step, data, stepComplete = false) {
    if (!this.ENABLE_CHECKPOINTS) return null;
    
    try {
      // Get existing checkpoint from cache
      const existing = await this.cache.get(checkpointId);
      if (!existing) {
        throw new Error(`Checkpoint not found: ${checkpointId}`);
      }
      
      // Update checkpoint data
      const updated = {
        ...existing,
        pipeline_step: step,
        pipeline_data: {
          ...existing.pipeline_data,
          ...data
        },
        updated_at: new Date(),
        job_id: existing.job_id // Preserve job_id
      };
      
      // Update status if step complete
      if (stepComplete) {
        if (step === 4) {
          updated.status = CheckpointStatus.COMPLETED;
        } else {
          updated.status = CheckpointStatus.ACTIVE;
        }
      }
      
      // Always update Redis
      await this.cache.update(checkpointId, updated);
      
      // Sync to MongoDB on step completion or important milestones
      if ((stepComplete || step === 4) && this.SYNC_TO_MONGODB && this.collection) {
        const mongoDoc = prepareForMongoDB(updated);
        mongoDoc.job_id = existing.job_id || updated.job_id; // Preserve job_id
        
        await this.collection.replaceOne(
          { checkpoint_id: checkpointId },
          mongoDoc,
          { upsert: true }
        );
        
        this.stats.mongoSyncs++;
        this.logger.debug(`Checkpoint synced to MongoDB: ${checkpointId} (step ${step})`);
      }
      
      this.stats.checkpointsSaved++;
      
      this.logger.debug(`Checkpoint progress saved: ${checkpointId}`, {
        step,
        stepComplete,
        status: updated.status
      });
      
      return updated;
      
    } catch (error) {
      this.logger.error(`Failed to save checkpoint progress: ${checkpointId}`, error);
      throw error;
    }
  }
  
  /**
   * Load checkpoint for resume
   * @param {string} jobId - Job ID to load checkpoint for
   * @returns {object|null} Checkpoint data or null if not found
   */
  async loadCheckpoint(jobId) {
    if (!this.ENABLE_CHECKPOINTS) return null;
    
    try {
      // First, try to find the checkpoint ID from MongoDB
      let checkpointId = null;
      let checkpoint = null;
      
      // If we have MongoDB, find the most recent checkpoint for this job
      if (this.collection) {
        // Debug: Check what's in the collection
        const count = await this.collection.countDocuments({ job_id: jobId });
        this.logger.debug(`Found ${count} checkpoints for job_id: ${jobId}`);
        
        const mongoDoc = await this.collection.findOne(
          { job_id: jobId },
          { sort: { created_at: -1 } }
        );
        
        if (mongoDoc) {
          checkpointId = mongoDoc.checkpoint_id;
          
          // Try to load from Redis first
          checkpoint = await this.cache.get(checkpointId);
          
          if (!checkpoint) {
            // Not in Redis, use MongoDB data
            delete mongoDoc._id; // Remove MongoDB _id
            checkpoint = mongoDoc;
            
            // Restore to Redis for fast access
            await this.cache.set(checkpointId, checkpoint);
            this.stats.redisFallbacks++;
            
            this.logger.debug(`Checkpoint restored from MongoDB to Redis: ${checkpointId}`);
          }
        }
      }
      
      // If no MongoDB or not found, scan Redis (less efficient)
      if (!checkpoint) {
        this.logger.debug(`No checkpoint found for job: ${jobId}`);
        return null;
      }
      
      this.stats.checkpointsLoaded++;
      
      this.logger.info(`Checkpoint loaded for job: ${jobId}`, {
        checkpointId,
        step: checkpoint.pipeline_step,
        status: checkpoint.status
      });
      
      return checkpoint;
      
    } catch (error) {
      this.logger.error(`Failed to load checkpoint for job: ${jobId}`, error);
      return null;
    }
  }
  
  /**
   * Get the resume point for a job
   * @param {string} jobId - Job ID
   * @returns {object} Resume information
   */
  async getResumePoint(jobId) {
    const checkpoint = await this.loadCheckpoint(jobId);
    
    if (!checkpoint) {
      return {
        canResume: false,
        startStep: 1,
        checkpoint: null
      };
    }
    
    // Determine where to resume based on status
    let resumeStep = checkpoint.pipeline_step;
    
    // If step was in progress, restart it
    // If step was complete, move to next
    if (checkpoint.status === CheckpointStatus.COMPLETED) {
      return {
        canResume: false, // Job is done
        startStep: 4,
        checkpoint
      };
    }
    
    // Check if the current step has meaningful progress
    const stepData = checkpoint.pipeline_data;
    const hasProgress = 
      (stepData.urls_discovered && stepData.urls_discovered.length > 0) ||
      (stepData.urls_processed && stepData.urls_processed.length > 0) ||
      (stepData.extraction_results && stepData.extraction_results.length > 0);
    
    if (hasProgress && resumeStep < 4) {
      resumeStep = checkpoint.pipeline_step + 1; // Move to next step
    }
    
    return {
      canResume: true,
      startStep: resumeStep,
      checkpoint,
      previousOutputs: this.extractStepOutputs(checkpoint, resumeStep - 1)
    };
  }
  
  /**
   * Extract outputs from previous step for resume
   */
  extractStepOutputs(checkpoint, completedStep) {
    const data = checkpoint.pipeline_data;
    
    switch (completedStep) {
      case 1:
        return data.main_categories || [];
      case 2:
        return data.main_categories || data.subcategories || [];
      case 3:
        return data.urls_discovered || [];
      case 4:
        return data.extraction_results || [];
      default:
        return null;
    }
  }
  
  /**
   * Mark a checkpoint as failed
   */
  async markFailed(checkpointId, error) {
    if (!this.ENABLE_CHECKPOINTS) return;
    
    try {
      const updates = {
        status: CheckpointStatus.FAILED,
        error_details: {
          message: error.message || 'Unknown error',
          stack: error.stack,
          timestamp: new Date()
        }
      };
      
      // Update Redis
      await this.cache.update(checkpointId, updates);
      
      // Sync to MongoDB
      if (this.SYNC_TO_MONGODB && this.collection) {
        await this.collection.updateOne(
          { checkpoint_id: checkpointId },
          { 
            $set: {
              ...updates,
              updated_at: new Date()
            }
          }
        );
      }
      
      this.logger.info(`Checkpoint marked as failed: ${checkpointId}`);
      
    } catch (err) {
      this.logger.error(`Failed to mark checkpoint as failed: ${checkpointId}`, err);
    }
  }
  
  /**
   * Clear expired checkpoints
   */
  async clearExpired() {
    if (!this.collection) return 0;
    
    try {
      const result = await this.collection.deleteMany({
        expires_at: { $lt: new Date() }
      });
      
      if (result.deletedCount > 0) {
        this.logger.info(`Cleared ${result.deletedCount} expired checkpoints`);
      }
      
      return result.deletedCount;
      
    } catch (error) {
      this.logger.error('Failed to clear expired checkpoints', error);
      return 0;
    }
  }
  
  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheStats: this.cache.getStats(),
      initialized: this.initialized,
      mongodbEnabled: !!this.collection
    };
  }
  
  /**
   * Check if checkpoint system is enabled
   */
  isEnabled() {
    return this.ENABLE_CHECKPOINTS && this.initialized;
  }
}

// Export class
module.exports = CheckpointManager;