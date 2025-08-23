/**
 * Tests for CheckpointCacheService
 */

const { v4: uuidv4 } = require('uuid');
const CheckpointCacheService = require('../../../src/core/checkpoint/CheckpointCacheService');
const { createCheckpoint, CheckpointStatus, JobType } = require('../../../src/core/checkpoint/validation/checkpoint.schema');

// Mock logger with all required methods
const logger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock RedisCacheManager
jest.mock('../../../src/cache/RedisCacheManager', () => {
  const mockCache = {
    initialize: jest.fn().mockResolvedValue(true),
    set: jest.fn().mockResolvedValue(true),
    get: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(true),
    exists: jest.fn().mockResolvedValue(false),
    redis: {
      keys: jest.fn().mockResolvedValue([]),
      del: jest.fn().mockResolvedValue(0)
    },
    namespaces: {
      checkpoint: {
        prefix: 'cp',
        ttl: 48 * 60 * 60
      }
    },
    getStats: jest.fn().mockReturnValue({
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    })
  };
  
  return {
    getInstance: jest.fn().mockReturnValue(mockCache)
  };
});

const RedisCacheManager = require('../../../src/cache/RedisCacheManager');

describe('CheckpointCacheService', () => {
  let service;
  let mockCache;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockCache = RedisCacheManager.getInstance();
    service = new CheckpointCacheService(logger, mockCache);
  });
  
  describe('Initialization', () => {
    test('should initialize with default configuration', async () => {
      await service.initialize();
      
      expect(mockCache.initialize).toHaveBeenCalled();
      expect(service.MAX_PAYLOAD_SIZE).toBe(524288);
      expect(service.COMPRESS_ENABLED).toBe(false);
      expect(service.DELETE_ON_ERROR).toBe(true);
    });
    
    test('should respect environment variables', () => {
      process.env.CHECKPOINT_MAX_PAYLOAD_SIZE = '1048576';
      process.env.CHECKPOINT_CACHE_COMPRESS = 'true';
      process.env.CACHE_CHECKPOINT_DELETE_ON_ERROR = 'false';
      
      const customService = new CheckpointCacheService(logger, mockCache);
      
      expect(customService.MAX_PAYLOAD_SIZE).toBe(1048576);
      expect(customService.COMPRESS_ENABLED).toBe(true);
      expect(customService.DELETE_ON_ERROR).toBe(false);
      
      // Clean up
      delete process.env.CHECKPOINT_MAX_PAYLOAD_SIZE;
      delete process.env.CHECKPOINT_CACHE_COMPRESS;
      delete process.env.CACHE_CHECKPOINT_DELETE_ON_ERROR;
    });
  });
  
  describe('Set Operations', () => {
    test('should validate and store checkpoint', async () => {
      const checkpoint = createCheckpoint({
        checkpoint_id: uuidv4()
      });
      
      const result = await service.set(checkpoint.checkpoint_id, checkpoint);
      
      expect(result).toBeDefined();
      expect(result.checkpoint_id).toBe(checkpoint.checkpoint_id);
      expect(mockCache.set).toHaveBeenCalledWith(
        'checkpoint',
        checkpoint.checkpoint_id,
        expect.objectContaining({
          checkpoint_id: checkpoint.checkpoint_id
        })
      );
    });
    
    test('should reject invalid checkpoint data', async () => {
      const invalidCheckpoint = {
        checkpoint_id: 'not-a-uuid',
        site_domain: 'example.com'
      };
      
      await expect(service.set('test-id', invalidCheckpoint))
        .rejects.toThrow();
      
      expect(service.stats.validationErrors).toBe(1);
    });
    
    test('should handle oversized payloads', async () => {
      service.MAX_PAYLOAD_SIZE = 100; // Set very small limit
      
      const checkpoint = createCheckpoint({
        checkpoint_id: uuidv4(),
        pipeline_data: {
          urls_discovered: Array(1000).fill('https://example.com/product'),
          urls_processed: [],
          current_page: 1,
          pagination_state: {},
          extraction_results: []
        }
      });
      
      const result = await service.set(checkpoint.checkpoint_id, checkpoint);
      
      expect(result._oversized).toBe(true);
      expect(service.stats.oversizedPayloads).toBe(1);
      
      // Should store minimal data only
      expect(mockCache.set).toHaveBeenCalledWith(
        'checkpoint',
        checkpoint.checkpoint_id,
        expect.objectContaining({
          _oversized: true,
          checkpoint_id: checkpoint.checkpoint_id,
          site_domain: checkpoint.site_domain
        })
      );
    });
  });
  
  describe('Get Operations', () => {
    test('should retrieve and validate checkpoint', async () => {
      const checkpoint = createCheckpoint({
        checkpoint_id: uuidv4()
      });
      
      mockCache.get.mockResolvedValueOnce(checkpoint);
      
      const result = await service.get(checkpoint.checkpoint_id);
      
      expect(result).toBeDefined();
      expect(result.checkpoint_id).toBe(checkpoint.checkpoint_id);
      expect(mockCache.get).toHaveBeenCalledWith('checkpoint', checkpoint.checkpoint_id);
    });
    
    test('should return null for non-existent checkpoint', async () => {
      mockCache.get.mockResolvedValueOnce(null);
      
      const result = await service.get('non-existent');
      
      expect(result).toBeNull();
    });
    
    test('should delete corrupted data when DELETE_ON_ERROR is true', async () => {
      const corruptedData = {
        checkpoint_id: 'not-a-uuid',
        site_domain: 'example.com'
      };
      
      mockCache.get.mockResolvedValueOnce(corruptedData);
      service.DELETE_ON_ERROR = true;
      
      const result = await service.get('test-id');
      
      expect(result).toBeNull();
      expect(mockCache.delete).toHaveBeenCalledWith('checkpoint', 'test-id');
      expect(service.stats.corruptedDeletes).toBe(1);
    });
    
    test('should not delete corrupted data when DELETE_ON_ERROR is false', async () => {
      const corruptedData = {
        checkpoint_id: 'not-a-uuid',
        site_domain: 'example.com'
      };
      
      mockCache.get.mockResolvedValueOnce(corruptedData);
      service.DELETE_ON_ERROR = false;
      
      const result = await service.get('test-id');
      
      expect(result).toBeNull();
      expect(mockCache.delete).not.toHaveBeenCalled();
      expect(service.stats.corruptedDeletes).toBe(1);
    });
    
    test('should handle oversized marker', async () => {
      const oversizedMarker = {
        checkpoint_id: uuidv4(),
        site_domain: 'example.com',
        _oversized: true
      };
      
      mockCache.get.mockResolvedValueOnce(oversizedMarker);
      
      const result = await service.get(oversizedMarker.checkpoint_id);
      
      expect(result).toBeDefined();
      expect(result._oversized).toBe(true);
    });
    
    test('should delete expired checkpoints', async () => {
      const expiredCheckpoint = createCheckpoint({
        checkpoint_id: uuidv4(),
        expires_at: new Date(Date.now() - 1000) // Expired
      });
      
      mockCache.get.mockResolvedValueOnce(expiredCheckpoint);
      
      const result = await service.get(expiredCheckpoint.checkpoint_id);
      
      expect(result).toBeNull();
      expect(mockCache.delete).toHaveBeenCalledWith('checkpoint', expiredCheckpoint.checkpoint_id);
    });
  });
  
  describe('Update Operations', () => {
    test('should update existing checkpoint', async () => {
      const checkpoint = createCheckpoint({
        checkpoint_id: uuidv4(),
        status: CheckpointStatus.ACTIVE
      });
      
      mockCache.get.mockResolvedValueOnce(checkpoint);
      
      const updated = await service.update(checkpoint.checkpoint_id, {
        status: CheckpointStatus.COMPLETED,
        pipeline_step: 2
      });
      
      expect(updated.status).toBe(CheckpointStatus.COMPLETED);
      expect(updated.pipeline_step).toBe(2);
      expect(updated.updated_at).toBeInstanceOf(Date);
      
      expect(mockCache.set).toHaveBeenCalledWith(
        'checkpoint',
        checkpoint.checkpoint_id,
        expect.objectContaining({
          status: CheckpointStatus.COMPLETED,
          pipeline_step: 2
        })
      );
    });
    
    test('should throw error for non-existent checkpoint', async () => {
      mockCache.get.mockResolvedValueOnce(null);
      
      await expect(service.update('non-existent', { status: CheckpointStatus.COMPLETED }))
        .rejects.toThrow('Checkpoint not found: non-existent');
    });
    
    test('should not update oversized checkpoints', async () => {
      const oversized = {
        checkpoint_id: uuidv4(),
        _oversized: true
      };
      
      mockCache.get.mockResolvedValueOnce(oversized);
      
      const result = await service.update(oversized.checkpoint_id, {
        status: CheckpointStatus.COMPLETED
      });
      
      expect(result._oversized).toBe(true);
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });
  
  describe('Batch Operations', () => {
    test('should get multiple checkpoints', async () => {
      const cp1 = createCheckpoint({ checkpoint_id: uuidv4() });
      const cp2 = createCheckpoint({ checkpoint_id: uuidv4() });
      
      mockCache.get
        .mockResolvedValueOnce(cp1)
        .mockResolvedValueOnce(cp2)
        .mockResolvedValueOnce(null);
      
      const results = await service.getMultiple([
        cp1.checkpoint_id,
        cp2.checkpoint_id,
        'non-existent'
      ]);
      
      expect(results).toHaveLength(2);
      expect(results[0].checkpoint_id).toBe(cp1.checkpoint_id);
      expect(results[1].checkpoint_id).toBe(cp2.checkpoint_id);
    });
    
    test('should set multiple checkpoints', async () => {
      const checkpoints = [
        createCheckpoint({ checkpoint_id: uuidv4() }),
        createCheckpoint({ checkpoint_id: uuidv4() })
      ];
      
      const results = await service.setMultiple(checkpoints);
      
      expect(results).toHaveLength(2);
      expect(mockCache.set).toHaveBeenCalledTimes(2);
    });
    
    test('should handle validation errors in batch set', async () => {
      const checkpoints = [
        createCheckpoint({ checkpoint_id: uuidv4() }),
        { checkpoint_id: 'invalid', site_domain: 'test.com' }, // Invalid
        createCheckpoint({ checkpoint_id: uuidv4() })
      ];
      
      const results = await service.setMultiple(checkpoints);
      
      expect(results).toHaveLength(2); // Only valid ones
      expect(mockCache.set).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('Utility Operations', () => {
    test('should check checkpoint existence', async () => {
      mockCache.exists.mockResolvedValueOnce(true);
      
      const exists = await service.exists('test-id');
      
      expect(exists).toBe(true);
      expect(mockCache.exists).toHaveBeenCalledWith('checkpoint', 'test-id');
    });
    
    test('should delete checkpoint', async () => {
      const deleted = await service.delete('test-id');
      
      expect(deleted).toBe(true);
      expect(mockCache.delete).toHaveBeenCalledWith('checkpoint', 'test-id');
    });
    
    test('should clear all checkpoints', async () => {
      const keys = ['cp:id1', 'cp:id2', 'cp:id3'];
      mockCache.redis.keys.mockResolvedValueOnce(keys);
      mockCache.redis.del.mockResolvedValueOnce(3);
      
      const count = await service.clearAll();
      
      expect(count).toBe(3);
      expect(mockCache.redis.keys).toHaveBeenCalledWith('cp:*');
      expect(mockCache.redis.del).toHaveBeenCalledWith(...keys);
    });
    
    test('should get statistics', () => {
      service.stats.validationErrors = 2;
      service.stats.corruptedDeletes = 1;
      
      const stats = service.getStats();
      
      expect(stats.validationErrors).toBe(2);
      expect(stats.corruptedDeletes).toBe(1);
      expect(stats.cacheStats).toBeDefined();
    });
    
    test('should reset statistics', () => {
      service.stats.validationErrors = 5;
      service.stats.corruptedDeletes = 3;
      
      service.resetStats();
      
      expect(service.stats.validationErrors).toBe(0);
      expect(service.stats.corruptedDeletes).toBe(0);
    });
  });
  
  describe('Singleton Pattern', () => {
    test('should return same instance', () => {
      const instance1 = CheckpointCacheService.getInstance(logger);
      const instance2 = CheckpointCacheService.getInstance(logger);
      
      expect(instance1).toBe(instance2);
    });
  });
});