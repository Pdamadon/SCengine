/**
 * Shared validation utilities for checkpoint system
 * Provides common validators used across multiple schemas
 */

const { z } = require('zod');

/**
 * UUID v4 validation
 */
const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const zodUUID = z.string().regex(uuidV4Regex, 'Invalid UUID v4 format');

/**
 * Status enums for different collections
 */
const CheckpointStatus = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
  EXPIRED: 'expired'
};

const QueryStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

const JobType = {
  PRODUCT_CATALOG: 'product_catalog',
  PRODUCT_DETAIL: 'product_detail',
  CATEGORY_DISCOVERY: 'category_discovery',
  SEARCH_RESULTS: 'search_results'
};

/**
 * Timestamp validators
 */
const zodTimestamp = z.union([
  z.date(),
  z.string().datetime({ offset: true })
]).transform(val => {
  if (typeof val === 'string') {
    return new Date(val);
  }
  return val;
});

/**
 * Domain validator (basic hostname validation)
 */
const zodDomain = z.string()
  .min(4, 'Domain too short')
  .max(253, 'Domain too long')
  .regex(/^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i, 'Invalid domain format');

/**
 * Pipeline step validator (1-4 for 4-step pipeline)
 */
const zodPipelineStep = z.number()
  .int('Pipeline step must be an integer')
  .min(1, 'Pipeline step must be at least 1')
  .max(4, 'Pipeline step cannot exceed 4');

/**
 * URL array validator with uniqueness check
 */
const zodURLArray = z.array(z.string().url())
  .refine(
    urls => new Set(urls).size === urls.length,
    'Duplicate URLs not allowed'
  );

/**
 * Price validator (positive number in cents)
 */
const zodPrice = z.number()
  .int('Price must be in cents (integer)')
  .min(0, 'Price cannot be negative');

/**
 * Priority validator (1-10 scale)
 */
const zodPriority = z.number()
  .int('Priority must be an integer')
  .min(1, 'Priority must be at least 1')
  .max(10, 'Priority cannot exceed 10')
  .default(5);

/**
 * Percentage validator (0-100)
 */
const zodPercentage = z.number()
  .min(0, 'Percentage cannot be negative')
  .max(100, 'Percentage cannot exceed 100');

/**
 * Convert Zod schema to MongoDB JSON Schema
 * Note: This is a basic converter for common types
 */
function zodToMongoSchema(zodSchema, required = true) {
  // This is a simplified converter - extend as needed
  const schemaType = zodSchema._def.typeName;
  
  switch (schemaType) {
    case 'ZodString':
      return { bsonType: 'string' };
    
    case 'ZodNumber':
      const numberDef = zodSchema._def;
      const mongoNumber = { bsonType: numberDef.checks?.some(c => c.kind === 'int') ? 'int' : 'number' };
      
      numberDef.checks?.forEach(check => {
        if (check.kind === 'min') mongoNumber.minimum = check.value;
        if (check.kind === 'max') mongoNumber.maximum = check.value;
      });
      
      return mongoNumber;
    
    case 'ZodBoolean':
      return { bsonType: 'bool' };
    
    case 'ZodDate':
      return { bsonType: 'date' };
    
    case 'ZodArray':
      return {
        bsonType: 'array',
        items: zodToMongoSchema(zodSchema._def.type, false)
      };
    
    case 'ZodObject':
      const properties = {};
      const required = [];
      
      Object.entries(zodSchema.shape).forEach(([key, value]) => {
        properties[key] = zodToMongoSchema(value, false);
        if (!value.isOptional()) {
          required.push(key);
        }
      });
      
      return {
        bsonType: 'object',
        properties,
        required: required.length > 0 ? required : undefined
      };
    
    case 'ZodEnum':
      return {
        bsonType: 'string',
        enum: zodSchema._def.values
      };
    
    case 'ZodUnion':
      // For unions like date/string, default to the most permissive
      return { bsonType: ['date', 'string'] };
    
    default:
      return { bsonType: 'mixed' };
  }
}

/**
 * Create a validated test data factory
 */
function createValidatedFactory(schema, defaults = {}) {
  return (overrides = {}) => {
    const data = { ...defaults, ...overrides };
    return schema.parse(data);
  };
}

/**
 * Format validation errors for user-friendly messages
 */
function formatValidationError(error) {
  if (error instanceof z.ZodError) {
    return error.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message,
      code: err.code
    }));
  }
  return [{ path: '', message: error.message, code: 'UNKNOWN' }];
}

/**
 * Performance timer for validation benchmarking
 */
class ValidationTimer {
  constructor(threshold = 5) {
    this.threshold = threshold; // ms
    this.measurements = [];
  }

  measure(fn, label = 'validation') {
    const start = process.hrtime.bigint();
    const result = fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to ms
    
    this.measurements.push({ label, duration });
    
    if (duration > this.threshold) {
      console.warn(`Validation '${label}' took ${duration.toFixed(2)}ms (threshold: ${this.threshold}ms)`);
    }
    
    return result;
  }

  getStats() {
    if (this.measurements.length === 0) return null;
    
    const durations = this.measurements.map(m => m.duration);
    const sum = durations.reduce((a, b) => a + b, 0);
    
    return {
      count: this.measurements.length,
      total: sum,
      average: sum / this.measurements.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      aboveThreshold: this.measurements.filter(m => m.duration > this.threshold).length
    };
  }

  reset() {
    this.measurements = [];
  }
}

module.exports = {
  // Validators
  zodUUID,
  zodTimestamp,
  zodDomain,
  zodPipelineStep,
  zodURLArray,
  zodPrice,
  zodPriority,
  zodPercentage,
  
  // Enums
  CheckpointStatus,
  QueryStatus,
  JobType,
  
  // Utilities
  zodToMongoSchema,
  createValidatedFactory,
  formatValidationError,
  ValidationTimer,
  
  // Regex patterns
  uuidV4Regex
};