/**
 * Integration tests for CheckpointManager with Redis and MongoDB
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.ENABLE_CHECKPOINTS = 'true';

const { v4: uuidv4 } = require('uuid');
const CheckpointManager = require('../../../src/core/checkpoint/CheckpointManager');
const CheckpointCacheService = require('../../../src/core/checkpoint/CheckpointCacheService');
const RedisCacheManager = require('../../../src/cache/RedisCacheManager');
const mongoDBClient = require('../../../src/database/MongoDBClient');
const logger = require('../../../src/utils/logger');
const { CheckpointStatus } = require('../../../src/core/checkpoint/validation/checkpoint.schema');

describe('CheckpointManager Integration Tests', () => {
  let checkpointManager;
  let cacheService;
  let redisManager;
  let testJobId;
  let testDomain;
  
  beforeAll(async () => {
    // Initialize Redis
    redisManager = RedisCacheManager.getInstance(logger);
    await redisManager.initialize();
    
    // Initialize cache service
    cacheService = new CheckpointCacheService(logger, redisManager);
    await cacheService.initialize();
    
    // Initialize MongoDB
    await mongoDBClient.connect();
    
    // Create CheckpointManager
    checkpointManager = new CheckpointManager(logger, mongoDBClient, cacheService);
    await checkpointManager.initialize();
    
    // Clear any existing test data
    await cacheService.clearAll();
    const db = mongoDBClient.getDatabase();
    const collection = db.collection('checkpoints');
    await collection.deleteMany({ site_domain: /^test\./});
  });
  
  afterAll(async () => {
    // Clean up test data
    await cacheService.clearAll();
    
    // Clean MongoDB test data
    const db = mongoDBClient.getDatabase();
    const collection = db.collection('checkpoints');
    await collection.deleteMany({ site_domain: /^test\./ });
    
    // Close connections
    if (redisManager.redis) {
      await redisManager.redis.quit();
    }
    await mongoDBClient.disconnect();
  });
  
  beforeEach(() => {
    testJobId = `test_job_${uuidv4()}`;
    testDomain = `test.example${Math.random()}.com`;
  });
  
  describe('Initialization', () => {
    test('should initialize with MongoDB and Redis', async () => {
      expect(checkpointManager.isEnabled()).toBe(true);
      expect(checkpointManager.initialized).toBe(true);
      
      const stats = checkpointManager.getStats();
      expect(stats.mongodbEnabled).toBe(true);
      expect(stats.initialized).toBe(true);
    });
    
    test('should create MongoDB indexes', async () => {
      const db = mongoDBClient.getDatabase();
      const collection = db.collection('checkpoints');
      const indexes = await collection.indexes();
      
      const indexNames = indexes.map(idx => idx.name);
      expect(indexNames).toContain('job_lookup_idx');
      // TTL index might be named differently by MongoDB
      const hasTTLIndex = indexNames.some(name => 
        name.includes('ttl') || name.includes('expires')
      );
      expect(hasTTLIndex).toBe(true);
    });
  });
  
  describe('Create Checkpoint', () => {
    test('should create checkpoint in both Redis and MongoDB', async () => {
      const checkpoint = await checkpointManager.createCheckpoint(
        testJobId,
        testDomain,
        { source: 'test', user: 'tester' }
      );
      
      expect(checkpoint).toBeDefined();
      expect(checkpoint.checkpoint_id).toBeDefined();
      expect(checkpoint.job_id).toBe(testJobId);
      expect(checkpoint.site_domain).toBe(testDomain);
      expect(checkpoint.status).toBe(CheckpointStatus.ACTIVE);
      expect(checkpoint.pipeline_step).toBe(1);
      
      // Verify in Redis
      const fromRedis = await cacheService.get(checkpoint.checkpoint_id);
      expect(fromRedis).toBeDefined();
      expect(fromRedis.checkpoint_id).toBe(checkpoint.checkpoint_id);
      
      // Verify in MongoDB
      const db = mongoDBClient.getDatabase();
      const collection = db.collection('checkpoints');
      const fromMongo = await collection.findOne({ checkpoint_id: checkpoint.checkpoint_id });
      expect(fromMongo).toBeDefined();
      expect(fromMongo.job_id).toBe(testJobId);
    });
    
    test('should set proper TTL values', async () => {
      const checkpoint = await checkpointManager.createCheckpoint(
        testJobId,
        testDomain
      );
      
      // Check MongoDB document has expires_at
      const db = mongoDBClient.getDatabase();
      const collection = db.collection('checkpoints');
      const doc = await collection.findOne({ checkpoint_id: checkpoint.checkpoint_id });
      
      expect(doc.expires_at).toBeDefined();
      const ttlDays = (doc.expires_at - new Date()) / (1000 * 60 * 60 * 24);
      expect(ttlDays).toBeGreaterThan(6.9);
      expect(ttlDays).toBeLessThan(7.1);
    });
  });
  
  describe('Save Progress', () => {
    test('should update checkpoint progress in Redis', async () => {
      const checkpoint = await checkpointManager.createCheckpoint(
        testJobId,
        testDomain
      );
      
      const progressData = {
        urls_discovered: ['/p1', '/p2', '/p3'],
        current_page: 2
      };
      
      const updated = await checkpointManager.saveProgress(
        checkpoint.checkpoint_id,
        2,
        progressData,
        false // Not step complete
      );
      
      expect(updated.pipeline_step).toBe(2);
      expect(updated.pipeline_data.urls_discovered).toEqual(['/p1', '/p2', '/p3']);
      expect(updated.pipeline_data.current_page).toBe(2);
      
      // Verify in Redis
      const fromRedis = await cacheService.get(checkpoint.checkpoint_id);
      expect(fromRedis.pipeline_step).toBe(2);
      expect(fromRedis.pipeline_data.current_page).toBe(2);
    });
    
    test('should sync to MongoDB on step completion', async () => {
      const checkpoint = await checkpointManager.createCheckpoint(
        testJobId,
        testDomain
      );
      
      const progressData = {
        urls_discovered: ['/p1', '/p2'],
        urls_processed: ['/p1', '/p2']
      };
      
      await checkpointManager.saveProgress(
        checkpoint.checkpoint_id,
        3,
        progressData,
        true // Step complete
      );
      
      // Verify MongoDB was updated
      const db = mongoDBClient.getDatabase();
      const collection = db.collection('checkpoints');
      const fromMongo = await collection.findOne({ checkpoint_id: checkpoint.checkpoint_id });
      
      expect(fromMongo.pipeline_step).toBe(3);
      expect(fromMongo.pipeline_data.urls_discovered).toEqual(['/p1', '/p2']);
      
      // Check sync count increased
      const stats = checkpointManager.getStats();
      expect(stats.mongoSyncs).toBeGreaterThan(0);
    });
    
    test('should mark as completed on step 4 completion', async () => {
      const checkpoint = await checkpointManager.createCheckpoint(
        testJobId,
        testDomain
      );
      
      const finalData = {
        extraction_results: [
          { url: 'https://example.com/p1', title: 'Product 1', price: 100 }
        ]
      };
      
      const completed = await checkpointManager.saveProgress(
        checkpoint.checkpoint_id,
        4,
        finalData,
        true
      );
      
      expect(completed.status).toBe(CheckpointStatus.COMPLETED);
      expect(completed.pipeline_step).toBe(4);
    });
  });
  
  describe('Load Checkpoint', () => {
    test('should load checkpoint from Redis if available', async () => {
      const checkpoint = await checkpointManager.createCheckpoint(
        testJobId,
        testDomain
      );
      
      const loaded = await checkpointManager.loadCheckpoint(testJobId);
      
      expect(loaded).toBeDefined();
      expect(loaded.checkpoint_id).toBe(checkpoint.checkpoint_id);
      expect(loaded.job_id).toBe(testJobId);
      
      // Verify it came from Redis (no fallback)
      const stats = checkpointManager.getStats();
      const initialFallbacks = stats.redisFallbacks;
      
      await checkpointManager.loadCheckpoint(testJobId);
      const newStats = checkpointManager.getStats();
      expect(newStats.redisFallbacks).toBe(initialFallbacks);
    });
    
    test('should fallback to MongoDB if not in Redis', async () => {
      const checkpoint = await checkpointManager.createCheckpoint(
        testJobId,
        testDomain
      );
      
      // Remove from Redis
      await cacheService.delete(checkpoint.checkpoint_id);
      
      // Should still load from MongoDB
      const loaded = await checkpointManager.loadCheckpoint(testJobId);
      
      expect(loaded).toBeDefined();
      expect(loaded.checkpoint_id).toBe(checkpoint.checkpoint_id);
      
      // Verify fallback occurred
      const stats = checkpointManager.getStats();
      expect(stats.redisFallbacks).toBeGreaterThan(0);
      
      // Verify it was restored to Redis
      const fromRedis = await cacheService.get(checkpoint.checkpoint_id);
      expect(fromRedis).toBeDefined();
    });
    
    test('should return null if checkpoint not found', async () => {
      const loaded = await checkpointManager.loadCheckpoint('non_existent_job');
      expect(loaded).toBeNull();
    });
  });
  
  describe('Resume Point Detection', () => {
    test('should detect correct resume point for incomplete checkpoint', async () => {
      const checkpoint = await checkpointManager.createCheckpoint(
        testJobId,
        testDomain
      );
      
      // Simulate progress through step 2
      await checkpointManager.saveProgress(
        checkpoint.checkpoint_id,
        2,
        {
          urls_discovered: ['/cat1', '/cat2'],
          main_categories: ['Category 1', 'Category 2']
        },
        true
      );
      
      const resumeInfo = await checkpointManager.getResumePoint(testJobId);
      
      expect(resumeInfo.canResume).toBe(true);
      expect(resumeInfo.startStep).toBe(3); // Should resume at step 3
      expect(resumeInfo.checkpoint).toBeDefined();
      expect(resumeInfo.previousOutputs).toEqual(['Category 1', 'Category 2']);
    });
    
    test('should not resume completed checkpoints', async () => {
      const checkpoint = await checkpointManager.createCheckpoint(
        testJobId,
        testDomain
      );
      
      // Mark as completed
      await checkpointManager.saveProgress(
        checkpoint.checkpoint_id,
        4,
        { extraction_results: [{ url: 'https://example.com/test', title: 'Test' }] },
        true
      );
      
      const resumeInfo = await checkpointManager.getResumePoint(testJobId);
      
      expect(resumeInfo.canResume).toBe(false);
      expect(resumeInfo.startStep).toBe(4);
    });
    
    test('should handle no checkpoint case', async () => {
      const resumeInfo = await checkpointManager.getResumePoint('no_checkpoint_job');
      
      expect(resumeInfo.canResume).toBe(false);
      expect(resumeInfo.startStep).toBe(1);
      expect(resumeInfo.checkpoint).toBeNull();
    });
  });
  
  describe('Error Handling', () => {
    test('should mark checkpoint as failed', async () => {
      const checkpoint = await checkpointManager.createCheckpoint(
        testJobId,
        testDomain
      );
      
      const error = new Error('Pipeline failed');
      await checkpointManager.markFailed(checkpoint.checkpoint_id, error);
      
      // Verify status updated
      const loaded = await checkpointManager.loadCheckpoint(testJobId);
      expect(loaded.status).toBe(CheckpointStatus.FAILED);
      expect(loaded.error_details).toBeDefined();
      expect(loaded.error_details.message).toBe('Pipeline failed');
    });
    
    test('should handle save progress for non-existent checkpoint', async () => {
      await expect(
        checkpointManager.saveProgress('non_existent', 2, {})
      ).rejects.toThrow('Checkpoint not found');
    });
  });
  
  describe('Cleanup Operations', () => {
    test('should clear expired checkpoints', async () => {
      // Create a checkpoint with past expiration
      const db = mongoDBClient.getDatabase();
      const collection = db.collection('checkpoints');
      
      await collection.insertOne({
        checkpoint_id: uuidv4(),
        job_id: 'expired_job',
        site_domain: 'test.expired.com',
        expires_at: new Date(Date.now() - 1000), // Already expired
        created_at: new Date(),
        status: CheckpointStatus.ACTIVE
      });
      
      const deleted = await checkpointManager.clearExpired();
      expect(deleted).toBeGreaterThan(0);
      
      // Verify it was deleted
      const found = await collection.findOne({ job_id: 'expired_job' });
      expect(found).toBeNull();
    });
  });
  
  describe('Statistics', () => {
    test('should track operation statistics', async () => {
      const initialStats = checkpointManager.getStats();
      
      // Perform operations
      const checkpoint = await checkpointManager.createCheckpoint(
        testJobId,
        testDomain
      );
      await checkpointManager.saveProgress(checkpoint.checkpoint_id, 2, {}, true);
      await checkpointManager.loadCheckpoint(testJobId);
      
      const finalStats = checkpointManager.getStats();
      
      expect(finalStats.checkpointsCreated).toBeGreaterThan(initialStats.checkpointsCreated);
      expect(finalStats.checkpointsSaved).toBeGreaterThan(initialStats.checkpointsSaved);
      expect(finalStats.checkpointsLoaded).toBeGreaterThan(initialStats.checkpointsLoaded);
      expect(finalStats.mongoSyncs).toBeGreaterThan(initialStats.mongoSyncs);
    });
  });
  
  describe('Feature Flag', () => {
    test('should respect ENABLE_CHECKPOINTS flag', async () => {
      // Create new manager with checkpoints disabled
      process.env.ENABLE_CHECKPOINTS = 'false';
      const disabledManager = new CheckpointManager(logger, mongoDBClient, cacheService);
      await disabledManager.initialize();
      
      expect(disabledManager.isEnabled()).toBe(false);
      
      // Operations should return null
      const checkpoint = await disabledManager.createCheckpoint('test', 'test.com');
      expect(checkpoint).toBeNull();
      
      const loaded = await disabledManager.loadCheckpoint('test');
      expect(loaded).toBeNull();
      
      // Re-enable for other tests
      process.env.ENABLE_CHECKPOINTS = 'true';
    });
  });
});