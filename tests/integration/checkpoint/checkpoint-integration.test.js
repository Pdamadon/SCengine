/**
 * Integration tests for checkpoint system with Redis
 */

// Set test environment before loading any modules
process.env.NODE_ENV = 'test';

const { v4: uuidv4 } = require('uuid');
const CheckpointCacheService = require('../../../src/core/checkpoint/CheckpointCacheService');
const RedisCacheManager = require('../../../src/cache/RedisCacheManager');
const {
  createCheckpoint,
  CheckpointStatus,
  JobType
} = require('../../../src/core/checkpoint/validation/checkpoint.schema');
const logger = require('../../../src/utils/logger');

describe('Checkpoint Integration Tests', () => {
  let cacheService;
  let redisManager;
  
  beforeAll(async () => {
    // Use real Redis connection for integration tests
    redisManager = RedisCacheManager.getInstance(logger);
    await redisManager.initialize();
    
    cacheService = new CheckpointCacheService(logger, redisManager);
    await cacheService.initialize();
    
    // Clear any existing test data
    await cacheService.clearAll();
  });
  
  afterAll(async () => {
    // Clean up test data
    await cacheService.clearAll();
    
    // Close Redis connection
    if (redisManager.redis) {
      await redisManager.redis.quit();
    }
  });
  
  describe('Redis Availability', () => {
    test('should verify Redis is connected', async () => {
      const isConnected = await redisManager.isConnected();
      expect(isConnected).toBe(true);
    });
    
    test('should verify checkpoint namespace exists', () => {
      expect(redisManager.namespaces.checkpoint).toBeDefined();
      expect(redisManager.namespaces.checkpoint.ttl).toBe(48 * 60 * 60);
      expect(redisManager.namespaces.checkpoint.noFallback).toBe(true);
    });
  });
  
  describe('Basic CRUD Operations', () => {
    test('should store and retrieve checkpoint', async () => {
      const checkpoint = createCheckpoint({
        checkpoint_id: uuidv4(),
        site_domain: 'test.example.com',
        status: CheckpointStatus.ACTIVE,
        pipeline_step: 2,
        pipeline_data: {
          urls_discovered: ['/p1', '/p2'],
          urls_processed: ['/p1'],
          current_page: 1,
          pagination_state: { hasNext: true },
          extraction_results: []
        }
      });
      
      // Store checkpoint
      const stored = await cacheService.set(checkpoint.checkpoint_id, checkpoint);
      expect(stored.checkpoint_id).toBe(checkpoint.checkpoint_id);
      
      // Retrieve checkpoint
      const retrieved = await cacheService.get(checkpoint.checkpoint_id);
      expect(retrieved).toBeDefined();
      expect(retrieved.checkpoint_id).toBe(checkpoint.checkpoint_id);
      expect(retrieved.site_domain).toBe('test.example.com');
      expect(retrieved.pipeline_step).toBe(2);
      expect(retrieved.pipeline_data.urls_discovered).toEqual(['/p1', '/p2']);
    });
    
    test('should update existing checkpoint', async () => {
      const checkpoint = createCheckpoint({
        checkpoint_id: uuidv4(),
        status: CheckpointStatus.ACTIVE,
        pipeline_step: 1
      });
      
      // Store initial checkpoint
      await cacheService.set(checkpoint.checkpoint_id, checkpoint);
      
      // Update checkpoint
      const updated = await cacheService.update(checkpoint.checkpoint_id, {
        status: CheckpointStatus.COMPLETED,
        pipeline_step: 4,
        pipeline_data: {
          urls_discovered: ['/p1', '/p2', '/p3'],
          urls_processed: ['/p1', '/p2', '/p3'],
          current_page: 3,
          pagination_state: { hasNext: false },
          extraction_results: [
            { url: 'https://example.com/p1', title: 'Product 1', price: 1999 }
          ]
        }
      });
      
      expect(updated.status).toBe(CheckpointStatus.COMPLETED);
      expect(updated.pipeline_step).toBe(4);
      expect(updated.pipeline_data.urls_processed).toHaveLength(3);
      
      // Verify update persisted
      const retrieved = await cacheService.get(checkpoint.checkpoint_id);
      expect(retrieved.status).toBe(CheckpointStatus.COMPLETED);
      expect(retrieved.pipeline_step).toBe(4);
    });
    
    test('should delete checkpoint', async () => {
      const checkpoint = createCheckpoint({
        checkpoint_id: uuidv4()
      });
      
      // Store and verify
      await cacheService.set(checkpoint.checkpoint_id, checkpoint);
      let exists = await cacheService.exists(checkpoint.checkpoint_id);
      expect(exists).toBe(true);
      
      // Delete and verify
      await cacheService.delete(checkpoint.checkpoint_id);
      exists = await cacheService.exists(checkpoint.checkpoint_id);
      expect(exists).toBe(false);
      
      // Get should return null
      const retrieved = await cacheService.get(checkpoint.checkpoint_id);
      expect(retrieved).toBeNull();
    });
  });
  
  describe('Validation Integration', () => {
    test('should reject invalid checkpoint data', async () => {
      const invalid = {
        checkpoint_id: 'not-a-uuid',
        site_domain: 'invalid domain!',
        pipeline_step: 10, // Out of range
        status: 'invalid-status'
      };
      
      await expect(cacheService.set('test', invalid))
        .rejects.toThrow();
    });
    
    test('should handle corrupted data in cache', async () => {
      const checkpointId = uuidv4();
      const key = `${redisManager.namespaces.checkpoint.prefix}:checkpoints:${checkpointId}`;
      
      // Manually insert corrupted data with proper structure
      await redisManager.redis.set(key, JSON.stringify({
        data: {
          checkpoint_id: 'not-a-uuid',
          corrupted: true
        },
        namespace: 'checkpoint',
        created_at: new Date().toISOString()
      }));
      
      // Should return null and delete corrupted data
      const result = await cacheService.get(checkpointId);
      expect(result).toBeNull();
      
      // Verify corrupted data was deleted
      const exists = await redisManager.redis.exists(key);
      expect(exists).toBe(0);
    });
    
    test('should handle oversized checkpoint data', async () => {
      // Set very low size limit for testing
      cacheService.MAX_PAYLOAD_SIZE = 500;
      
      const largeCheckpoint = createCheckpoint({
        checkpoint_id: uuidv4(),
        pipeline_data: {
          urls_discovered: Array(1000).fill('https://example.com/product/very-long-url-path'),
          urls_processed: Array(500).fill('https://example.com/product/processed'),
          current_page: 1,
          pagination_state: {},
          extraction_results: Array(100).fill({
            url: 'https://example.com/p',
            title: 'Very Long Product Title That Takes Up Space',
            price: 9999
          })
        }
      });
      
      // Should store minimal version
      const stored = await cacheService.set(largeCheckpoint.checkpoint_id, largeCheckpoint);
      expect(stored._oversized).toBe(true);
      expect(stored.pipeline_data).toBeUndefined();
      
      // Should retrieve oversized marker
      const retrieved = await cacheService.get(largeCheckpoint.checkpoint_id);
      expect(retrieved._oversized).toBe(true);
      
      // Reset size limit
      cacheService.MAX_PAYLOAD_SIZE = 524288;
    });
  });
  
  describe('Batch Operations', () => {
    test('should handle batch set and get', async () => {
      const checkpoints = [
        createCheckpoint({ checkpoint_id: uuidv4(), site_domain: 'site1.com' }),
        createCheckpoint({ checkpoint_id: uuidv4(), site_domain: 'site2.com' }),
        createCheckpoint({ checkpoint_id: uuidv4(), site_domain: 'site3.com' })
      ];
      
      // Batch set
      const stored = await cacheService.setMultiple(checkpoints);
      expect(stored).toHaveLength(3);
      
      // Batch get
      const ids = checkpoints.map(cp => cp.checkpoint_id);
      const retrieved = await cacheService.getMultiple(ids);
      expect(retrieved).toHaveLength(3);
      
      // Verify each checkpoint
      for (let i = 0; i < checkpoints.length; i++) {
        const found = retrieved.find(cp => cp.checkpoint_id === checkpoints[i].checkpoint_id);
        expect(found).toBeDefined();
        expect(found.site_domain).toBe(checkpoints[i].site_domain);
      }
    });
    
    test('should handle mixed valid/invalid batch', async () => {
      const checkpoints = [
        createCheckpoint({ checkpoint_id: uuidv4() }), // Valid
        { checkpoint_id: 'invalid', site_domain: 'test' }, // Invalid
        createCheckpoint({ checkpoint_id: uuidv4() }) // Valid
      ];
      
      const stored = await cacheService.setMultiple(checkpoints);
      expect(stored).toHaveLength(2); // Only valid ones
    });
  });
  
  describe('TTL and Expiration', () => {
    test('should respect TTL settings', async () => {
      const checkpoint = createCheckpoint({
        checkpoint_id: uuidv4()
      });
      
      await cacheService.set(checkpoint.checkpoint_id, checkpoint);
      
      // Check TTL is set
      const key = `${redisManager.namespaces.checkpoint.prefix}:checkpoints:${checkpoint.checkpoint_id}`;
      const ttl = await redisManager.redis.ttl(key);
      
      // Should be close to 48 hours (within 5 seconds)
      expect(ttl).toBeGreaterThan(48 * 60 * 60 - 5);
      expect(ttl).toBeLessThanOrEqual(48 * 60 * 60);
    });
    
    test('should delete expired checkpoints on retrieval', async () => {
      const expired = createCheckpoint({
        checkpoint_id: uuidv4(),
        expires_at: new Date(Date.now() - 1000) // Already expired
      });
      
      // Store directly in Redis to bypass validation with proper structure
      const key = `${redisManager.namespaces.checkpoint.prefix}:checkpoints:${expired.checkpoint_id}`;
      await redisManager.redis.set(key, JSON.stringify({
        data: expired,
        namespace: 'checkpoint',
        created_at: new Date().toISOString()
      }));
      
      // Should return null and delete
      const result = await cacheService.get(expired.checkpoint_id);
      expect(result).toBeNull();
      
      // Verify deleted
      const exists = await redisManager.redis.exists(key);
      expect(exists).toBe(0);
    });
  });
  
  describe('Concurrent Access', () => {
    test('should handle concurrent reads', async () => {
      const checkpoint = createCheckpoint({
        checkpoint_id: uuidv4()
      });
      
      await cacheService.set(checkpoint.checkpoint_id, checkpoint);
      
      // Concurrent reads
      const promises = Array(10).fill(null).map(() => 
        cacheService.get(checkpoint.checkpoint_id)
      );
      
      const results = await Promise.all(promises);
      
      // All should succeed
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.checkpoint_id).toBe(checkpoint.checkpoint_id);
      });
    });
    
    test('should handle concurrent updates', async () => {
      const checkpoint = createCheckpoint({
        checkpoint_id: uuidv4(),
        pipeline_step: 1
      });
      
      await cacheService.set(checkpoint.checkpoint_id, checkpoint);
      
      // Concurrent updates
      const promises = Array(5).fill(null).map((_, i) => 
        cacheService.update(checkpoint.checkpoint_id, {
          pipeline_step: i + 2
        }).catch(err => null)
      );
      
      const results = await Promise.all(promises);
      
      // At least one should succeed
      const successful = results.filter(r => r !== null);
      expect(successful.length).toBeGreaterThan(0);
      
      // Final state should be consistent
      const final = await cacheService.get(checkpoint.checkpoint_id);
      expect(final).toBeDefined();
      expect(final.pipeline_step).toBeGreaterThanOrEqual(2);
    });
  });
  
  describe('Error Recovery', () => {
    test('should handle Redis connection errors gracefully', async () => {
      // Create a service with invalid Redis connection
      const badRedis = {
        redis: {
          get: jest.fn().mockRejectedValue(new Error('Connection failed')),
          set: jest.fn().mockRejectedValue(new Error('Connection failed')),
          exists: jest.fn().mockRejectedValue(new Error('Connection failed'))
        },
        namespaces: redisManager.namespaces,
        get: jest.fn().mockRejectedValue(new Error('Connection failed')),
        set: jest.fn().mockRejectedValue(new Error('Connection failed')),
        exists: jest.fn().mockRejectedValue(new Error('Connection failed')),
        delete: jest.fn().mockRejectedValue(new Error('Connection failed')),
        initialize: jest.fn().mockResolvedValue(true)
      };
      
      const failService = new CheckpointCacheService(logger, badRedis);
      
      // Should handle errors gracefully
      const checkpoint = createCheckpoint({ checkpoint_id: uuidv4() });
      
      await expect(failService.set(checkpoint.checkpoint_id, checkpoint))
        .rejects.toThrow('Connection failed');
      
      const result = await failService.get(checkpoint.checkpoint_id);
      expect(result).toBeNull();
    });
  });
  
  describe('Statistics', () => {
    test('should track operation statistics', async () => {
      // Reset stats
      cacheService.resetStats();
      
      // Perform operations
      const checkpoint = createCheckpoint({ checkpoint_id: uuidv4() });
      await cacheService.set(checkpoint.checkpoint_id, checkpoint);
      
      // Try invalid operation
      try {
        await cacheService.set('test', { invalid: true });
      } catch {}
      
      // Get stats
      const stats = cacheService.getStats();
      expect(stats.validationErrors).toBeGreaterThan(0);
      expect(stats.cacheStats).toBeDefined();
    });
  });
});