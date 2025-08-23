/**
 * Checkpoint schema validation
 * Provides Zod schemas and MongoDB validation for checkpoint collection
 */

const { z } = require('zod');
const {
  zodUUID,
  zodTimestamp,
  zodDomain,
  zodPipelineStep,
  zodURLArray,
  CheckpointStatus,
  JobType,
  createValidatedFactory
} = require('./validationUtils');

/**
 * Pipeline data schema - the core checkpoint state
 */
const zodPipelineData = z.object({
  urls_discovered: z.array(z.string()).default([]),
  urls_processed: z.array(z.string()).default([]),
  current_page: z.number().int().min(1).default(1),
  main_categories: z.array(z.string()).optional(),
  subcategories: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  pagination_state: z.object({
    hasNext: z.boolean().optional(),
    totalPages: z.number().int().min(1).optional(),
    nextPageUrl: z.string().url().optional(),
    currentOffset: z.number().int().min(0).optional()
  }).default({}),
  extraction_results: z.array(z.object({
    url: z.string().url(),
    title: z.string().optional(),
    price: z.number().optional(),
    extracted_at: zodTimestamp.optional()
  })).default([])
});

/**
 * Error details schema for failed checkpoints
 */
const zodErrorDetails = z.object({
  message: z.string(),
  stack: z.string().optional(),
  code: z.string().optional(),
  timestamp: zodTimestamp
}).optional();

/**
 * Main checkpoint schema for Zod validation
 */
const zodCheckpointSchema = z.object({
  checkpoint_id: zodUUID,
  job_id: z.string().optional(), // Job identifier for checkpoint retrieval
  site_domain: zodDomain,
  job_type: z.enum(Object.values(JobType)),
  pipeline_step: zodPipelineStep,
  pipeline_data: zodPipelineData,
  status: z.enum(Object.values(CheckpointStatus)),
  metadata: z.object({}).passthrough().optional(), // Additional metadata
  error_details: zodErrorDetails,
  created_at: zodTimestamp,
  updated_at: zodTimestamp,
  expires_at: zodTimestamp.optional()
});

/**
 * Schema for checkpoint updates (partial)
 */
const zodCheckpointUpdate = zodCheckpointSchema.partial().required({
  checkpoint_id: true
});

/**
 * MongoDB JSON Schema for database validation
 */
const mongoCheckpointSchema = {
  bsonType: 'object',
  required: [
    'checkpoint_id',
    'site_domain',
    'job_type',
    'pipeline_step',
    'pipeline_data',
    'status',
    'created_at',
    'updated_at'
  ],
  properties: {
    checkpoint_id: {
      bsonType: 'string',
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      description: 'UUID v4 checkpoint identifier'
    },
    job_id: {
      bsonType: 'string',
      description: 'Job identifier for checkpoint retrieval'
    },
    site_domain: {
      bsonType: 'string',
      minLength: 4,
      maxLength: 253,
      pattern: '^([a-z0-9]+(-[a-z0-9]+)*\\.)+[a-z]{2,}$',
      description: 'Domain of the site being scraped'
    },
    job_type: {
      bsonType: 'string',
      enum: Object.values(JobType),
      description: 'Type of scraping job'
    },
    pipeline_step: {
      bsonType: 'int',
      minimum: 1,
      maximum: 4,
      description: 'Current pipeline step (1-4)'
    },
    pipeline_data: {
      bsonType: 'object',
      required: ['urls_discovered', 'urls_processed', 'current_page'],
      properties: {
        urls_discovered: {
          bsonType: 'array',
          items: { bsonType: 'string' },
          description: 'URLs found during discovery'
        },
        urls_processed: {
          bsonType: 'array',
          items: { bsonType: 'string' },
          description: 'URLs that have been processed'
        },
        current_page: {
          bsonType: 'int',
          minimum: 1,
          description: 'Current pagination page'
        },
        pagination_state: {
          bsonType: 'object',
          properties: {
            hasNext: { bsonType: 'bool' },
            totalPages: { bsonType: 'int', minimum: 1 },
            nextPageUrl: { bsonType: 'string' },
            currentOffset: { bsonType: 'int', minimum: 0 }
          },
          description: 'Pagination tracking state'
        },
        extraction_results: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['url'],
            properties: {
              url: { bsonType: 'string' },
              title: { bsonType: 'string' },
              price: { bsonType: 'number' },
              extracted_at: { bsonType: 'date' }
            }
          },
          description: 'Extracted product data'
        }
      },
      description: 'Pipeline state data'
    },
    status: {
      bsonType: 'string',
      enum: Object.values(CheckpointStatus),
      description: 'Checkpoint status'
    },
    metadata: {
      bsonType: 'object',
      description: 'Additional metadata'
    },
    error_details: {
      bsonType: 'object',
      properties: {
        message: { bsonType: 'string' },
        stack: { bsonType: 'string' },
        code: { bsonType: 'string' },
        timestamp: { bsonType: 'date' }
      },
      description: 'Error information if checkpoint failed'
    },
    created_at: {
      bsonType: 'date',
      description: 'Creation timestamp'
    },
    updated_at: {
      bsonType: 'date',
      description: 'Last update timestamp'
    },
    expires_at: {
      bsonType: 'date',
      description: 'TTL expiration timestamp'
    }
  }
};

/**
 * Default values for checkpoint creation
 */
const checkpointDefaults = {
  status: CheckpointStatus.ACTIVE,
  pipeline_step: 1,
  pipeline_data: {
    urls_discovered: [],
    urls_processed: [],
    current_page: 1,
    pagination_state: {},
    extraction_results: []
  },
  created_at: new Date(),
  updated_at: new Date()
};

/**
 * Validate checkpoint data
 * @param {Object} data - Checkpoint data to validate
 * @returns {Object} Validated data or throws ZodError
 */
function validateCheckpoint(data) {
  return zodCheckpointSchema.parse(data);
}

/**
 * Validate checkpoint update data
 * @param {Object} data - Partial checkpoint data to validate
 * @returns {Object} Validated data or throws ZodError
 */
function validateCheckpointUpdate(data) {
  return zodCheckpointUpdate.parse(data);
}

/**
 * Create validated checkpoint factory for testing
 */
const createCheckpoint = createValidatedFactory(
  zodCheckpointSchema,
  {
    ...checkpointDefaults,
    checkpoint_id: '00000000-0000-4000-8000-000000000000', // Will be overridden
    site_domain: 'example.com',
    job_type: JobType.PRODUCT_CATALOG
  }
);

/**
 * Validate checkpoint for Redis storage
 * Strips MongoDB-specific fields and validates core data
 */
function validateForRedis(data) {
  const { _id, ...checkpointData } = data;
  return zodCheckpointSchema.parse(checkpointData);
}

/**
 * Prepare checkpoint for MongoDB insertion
 * Ensures all required fields are present with proper types
 */
function prepareForMongoDB(data) {
  const validated = validateCheckpoint(data);
  
  // Ensure expires_at is set for TTL
  if (!validated.expires_at) {
    validated.expires_at = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
  }
  
  // Ensure integer types for MongoDB
  validated.pipeline_step = Math.floor(validated.pipeline_step);
  validated.pipeline_data.current_page = Math.floor(validated.pipeline_data.current_page);
  
  return validated;
}

/**
 * Check if checkpoint has expired
 */
function isExpired(checkpoint) {
  if (!checkpoint.expires_at) return false;
  
  const expiresAt = checkpoint.expires_at instanceof Date 
    ? checkpoint.expires_at 
    : new Date(checkpoint.expires_at);
    
  return expiresAt < new Date();
}

/**
 * Calculate checkpoint age in seconds
 */
function getCheckpointAge(checkpoint) {
  const created = checkpoint.created_at instanceof Date
    ? checkpoint.created_at
    : new Date(checkpoint.created_at);
    
  return Math.floor((Date.now() - created.getTime()) / 1000);
}

module.exports = {
  // Schemas
  zodCheckpointSchema,
  zodCheckpointUpdate,
  zodPipelineData,
  mongoCheckpointSchema,
  
  // Validation functions
  validateCheckpoint,
  validateCheckpointUpdate,
  validateForRedis,
  prepareForMongoDB,
  
  // Utilities
  createCheckpoint,
  isExpired,
  getCheckpointAge,
  
  // Constants
  checkpointDefaults,
  CheckpointStatus,
  JobType
};