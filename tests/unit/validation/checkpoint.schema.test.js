/**
 * Tests for checkpoint schema validation
 */

const { v4: uuidv4 } = require('uuid');
const {
  validateCheckpoint,
  validateCheckpointUpdate,
  createCheckpoint,
  prepareForMongoDB,
  isExpired,
  getCheckpointAge,
  CheckpointStatus,
  JobType
} = require('../../../src/core/checkpoint/validation/checkpoint.schema');
const { ValidationTimer } = require('../../../src/core/checkpoint/validation/validationUtils');

describe('Checkpoint Schema Validation', () => {
  const timer = new ValidationTimer(5); // 5ms threshold
  
  describe('Valid Data Tests', () => {
    test('should accept valid checkpoint data', () => {
      const validData = {
        checkpoint_id: uuidv4(),
        site_domain: 'example.com',
        job_type: JobType.PRODUCT_CATALOG,
        pipeline_step: 2,
        pipeline_data: {
          urls_discovered: ['/product1', '/product2'],
          urls_processed: ['/product1'],
          current_page: 1,
          pagination_state: { hasNext: true },
          extraction_results: []
        },
        status: CheckpointStatus.ACTIVE,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      const result = timer.measure(
        () => validateCheckpoint(validData),
        'valid-checkpoint'
      );
      
      expect(result).toBeDefined();
      expect(result.checkpoint_id).toBe(validData.checkpoint_id);
    });
    
    test('should accept checkpoint with all optional fields', () => {
      const fullData = {
        checkpoint_id: uuidv4(),
        site_domain: 'shop.example.com',
        job_type: JobType.PRODUCT_DETAIL,
        pipeline_step: 3,
        pipeline_data: {
          urls_discovered: ['/p1', '/p2', '/p3'],
          urls_processed: ['/p1', '/p2'],
          current_page: 2,
          pagination_state: {
            hasNext: true,
            totalPages: 5,
            nextPageUrl: 'https://example.com/page3',
            currentOffset: 20
          },
          extraction_results: [
            {
              url: 'https://example.com/p1',
              title: 'Product 1',
              price: 2999,
              extracted_at: new Date()
            }
          ]
        },
        status: CheckpointStatus.ACTIVE,
        error_details: {
          message: 'Test error',
          stack: 'Error stack trace',
          code: 'TEST_ERROR',
          timestamp: new Date()
        },
        created_at: new Date(),
        updated_at: new Date(),
        expires_at: new Date(Date.now() + 86400000)
      };
      
      const result = validateCheckpoint(fullData);
      expect(result.error_details).toBeDefined();
      expect(result.expires_at).toBeDefined();
    });
  });
  
  describe('Invalid Data Tests', () => {
    test('should reject invalid UUID', () => {
      const invalidData = createCheckpoint({
        checkpoint_id: 'not-a-uuid'
      });
      
      expect(() => validateCheckpoint(invalidData))
        .toThrow('Invalid UUID v4 format');
    });
    
    test('should reject invalid domain', () => {
      const invalidData = createCheckpoint({
        checkpoint_id: uuidv4(),
        site_domain: 'not a domain'
      });
      
      expect(() => validateCheckpoint(invalidData))
        .toThrow('Invalid domain format');
    });
    
    test('should reject invalid job type', () => {
      const invalidData = createCheckpoint({
        checkpoint_id: uuidv4(),
        job_type: 'invalid_type'
      });
      
      expect(() => validateCheckpoint(invalidData))
        .toThrow();
    });
    
    test('should reject pipeline step out of range', () => {
      const tooLow = createCheckpoint({
        checkpoint_id: uuidv4(),
        pipeline_step: 0
      });
      
      expect(() => validateCheckpoint(tooLow))
        .toThrow('Pipeline step must be at least 1');
      
      const tooHigh = createCheckpoint({
        checkpoint_id: uuidv4(),
        pipeline_step: 5
      });
      
      expect(() => validateCheckpoint(tooHigh))
        .toThrow('Pipeline step cannot exceed 4');
    });
    
    test('should reject non-integer pipeline step', () => {
      const floatStep = createCheckpoint({
        checkpoint_id: uuidv4(),
        pipeline_step: 2.5
      });
      
      expect(() => validateCheckpoint(floatStep))
        .toThrow('Pipeline step must be an integer');
    });
    
    test('should reject invalid status', () => {
      const invalidStatus = createCheckpoint({
        checkpoint_id: uuidv4(),
        status: 'unknown'
      });
      
      expect(() => validateCheckpoint(invalidStatus))
        .toThrow();
    });
  });
  
  describe('Edge Cases', () => {
    test('should handle empty arrays in pipeline data', () => {
      const emptyArrays = {
        checkpoint_id: uuidv4(),
        site_domain: 'example.com',
        job_type: JobType.PRODUCT_CATALOG,
        pipeline_step: 1,
        pipeline_data: {
          urls_discovered: [],
          urls_processed: [],
          current_page: 1,
          pagination_state: {},
          extraction_results: []
        },
        status: CheckpointStatus.ACTIVE,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      const result = validateCheckpoint(emptyArrays);
      expect(result.pipeline_data.urls_discovered).toEqual([]);
      expect(result.pipeline_data.urls_processed).toEqual([]);
    });
    
    test('should handle missing optional fields', () => {
      const minimal = {
        checkpoint_id: uuidv4(),
        site_domain: 'example.com',
        job_type: JobType.PRODUCT_CATALOG,
        pipeline_step: 1,
        pipeline_data: {
          urls_discovered: [],
          urls_processed: [],
          current_page: 1,
          pagination_state: {},
          extraction_results: []
        },
        status: CheckpointStatus.ACTIVE,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      const result = validateCheckpoint(minimal);
      expect(result.error_details).toBeUndefined();
      expect(result.expires_at).toBeUndefined();
    });
    
    test('should coerce string dates to Date objects', () => {
      const stringDates = {
        checkpoint_id: uuidv4(),
        site_domain: 'example.com',
        job_type: JobType.PRODUCT_CATALOG,
        pipeline_step: 1,
        pipeline_data: {
          urls_discovered: [],
          urls_processed: [],
          current_page: 1,
          pagination_state: {},
          extraction_results: []
        },
        status: CheckpointStatus.ACTIVE,
        created_at: '2025-01-21T12:00:00Z',
        updated_at: '2025-01-21T12:00:00Z'
      };
      
      const result = validateCheckpoint(stringDates);
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });
  });
  
  describe('Update Validation', () => {
    test('should accept partial updates with checkpoint_id', () => {
      const update = {
        checkpoint_id: uuidv4(),
        status: CheckpointStatus.COMPLETED,
        updated_at: new Date()
      };
      
      const result = validateCheckpointUpdate(update);
      expect(result.status).toBe(CheckpointStatus.COMPLETED);
    });
    
    test('should reject updates without checkpoint_id', () => {
      const update = {
        status: CheckpointStatus.COMPLETED
      };
      
      expect(() => validateCheckpointUpdate(update))
        .toThrow();
    });
  });
  
  describe('MongoDB Preparation', () => {
    test('should add expires_at if missing', () => {
      const data = createCheckpoint({
        checkpoint_id: uuidv4()
      });
      delete data.expires_at;
      
      const prepared = prepareForMongoDB(data);
      expect(prepared.expires_at).toBeInstanceOf(Date);
      expect(prepared.expires_at.getTime()).toBeGreaterThan(Date.now());
    });
    
    test('should ensure integer types for MongoDB', () => {
      const data = createCheckpoint({
        checkpoint_id: uuidv4(),
        pipeline_step: 2.7,
        pipeline_data: {
          urls_discovered: [],
          urls_processed: [],
          current_page: 3.9,
          pagination_state: {},
          extraction_results: []
        }
      });
      
      const prepared = prepareForMongoDB(data);
      expect(prepared.pipeline_step).toBe(2);
      expect(prepared.pipeline_data.current_page).toBe(3);
    });
  });
  
  describe('Utility Functions', () => {
    test('should correctly identify expired checkpoints', () => {
      const expired = {
        expires_at: new Date(Date.now() - 1000) // 1 second ago
      };
      expect(isExpired(expired)).toBe(true);
      
      const notExpired = {
        expires_at: new Date(Date.now() + 1000) // 1 second future
      };
      expect(isExpired(notExpired)).toBe(false);
      
      const noExpiry = {};
      expect(isExpired(noExpiry)).toBe(false);
    });
    
    test('should calculate checkpoint age correctly', () => {
      const oneHourAgo = new Date(Date.now() - 3600000);
      const checkpoint = {
        created_at: oneHourAgo
      };
      
      const age = getCheckpointAge(checkpoint);
      expect(age).toBeGreaterThanOrEqual(3599);
      expect(age).toBeLessThanOrEqual(3601);
    });
  });
  
  describe('Performance Tests', () => {
    test('validation should complete within 5ms', () => {
      const testData = createCheckpoint({
        checkpoint_id: uuidv4()
      });
      
      // Run multiple validations
      for (let i = 0; i < 100; i++) {
        timer.measure(
          () => validateCheckpoint(testData),
          `perf-test-${i}`
        );
      }
      
      const stats = timer.getStats();
      console.log('Validation Performance Stats:', {
        average: `${stats.average.toFixed(2)}ms`,
        min: `${stats.min.toFixed(2)}ms`,
        max: `${stats.max.toFixed(2)}ms`,
        aboveThreshold: stats.aboveThreshold
      });
      
      expect(stats.average).toBeLessThan(5);
      expect(stats.aboveThreshold).toBeLessThan(10); // Allow up to 10% above threshold
    });
  });
  
  describe('Factory Function', () => {
    test('should create valid checkpoints with defaults', () => {
      const checkpoint = createCheckpoint({
        checkpoint_id: uuidv4()
      });
      
      expect(checkpoint.status).toBe(CheckpointStatus.ACTIVE);
      expect(checkpoint.pipeline_step).toBe(1);
      expect(checkpoint.site_domain).toBe('example.com');
    });
    
    test('should override defaults with provided values', () => {
      const checkpoint = createCheckpoint({
        checkpoint_id: uuidv4(),
        site_domain: 'custom.com',
        status: CheckpointStatus.COMPLETED,
        pipeline_step: 3
      });
      
      expect(checkpoint.site_domain).toBe('custom.com');
      expect(checkpoint.status).toBe(CheckpointStatus.COMPLETED);
      expect(checkpoint.pipeline_step).toBe(3);
    });
  });
});