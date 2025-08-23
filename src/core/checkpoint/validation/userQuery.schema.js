/**
 * User query schema validation
 * Provides Zod schemas and MongoDB validation for user_queries collection
 * For future user search functionality
 */

const { z } = require('zod');
const {
  zodUUID,
  zodTimestamp,
  zodPriority,
  QueryStatus,
  createValidatedFactory
} = require('./validationUtils');

/**
 * Parsed intent schema - how we understand user queries
 */
const zodParsedIntent = z.object({
  product_type: z.string().optional(),
  attributes: z.record(z.any()).default({}),
  price_range: z.object({
    min: z.number().min(0).optional(),
    max: z.number().min(0).optional(),
    currency: z.string().length(3).default('USD')
  }).optional(),
  filters: z.record(z.any()).default({})
}).default({});

/**
 * Query metadata schema
 */
const zodQueryMetadata = z.object({
  source: z.enum(['web', 'api', 'mobile', 'internal']).optional(),
  ip_address: z.string().ip().optional(),
  user_agent: z.string().optional(),
  session_id: z.string().optional(),
  referrer: z.string().url().optional()
}).optional();

/**
 * Main user query schema for Zod validation
 */
const zodUserQuerySchema = z.object({
  query_id: zodUUID,
  user_id: z.string().optional(), // Optional for anonymous queries
  query_text: z.string()
    .min(1, 'Query text required')
    .max(500, 'Query text too long'),
  parsed_intent: zodParsedIntent,
  status: z.enum(Object.values(QueryStatus)),
  priority: zodPriority,
  metadata: zodQueryMetadata,
  created_at: zodTimestamp,
  updated_at: zodTimestamp
});

/**
 * Schema for query updates (partial)
 */
const zodUserQueryUpdate = zodUserQuerySchema.partial().required({
  query_id: true
});

/**
 * MongoDB JSON Schema for database validation
 */
const mongoUserQuerySchema = {
  bsonType: 'object',
  required: ['query_id', 'query_text', 'status', 'created_at', 'updated_at'],
  properties: {
    query_id: {
      bsonType: 'string',
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      description: 'UUID v4 query identifier'
    },
    user_id: {
      bsonType: 'string',
      description: 'User identifier (optional for anonymous)'
    },
    query_text: {
      bsonType: 'string',
      minLength: 1,
      maxLength: 500,
      description: 'Original user query text'
    },
    parsed_intent: {
      bsonType: 'object',
      properties: {
        product_type: { bsonType: 'string' },
        attributes: { bsonType: 'object' },
        price_range: {
          bsonType: 'object',
          properties: {
            min: { bsonType: 'number', minimum: 0 },
            max: { bsonType: 'number', minimum: 0 },
            currency: { bsonType: 'string', minLength: 3, maxLength: 3 }
          }
        },
        filters: { bsonType: 'object' }
      },
      description: 'Parsed query intent'
    },
    status: {
      bsonType: 'string',
      enum: Object.values(QueryStatus),
      description: 'Query processing status'
    },
    priority: {
      bsonType: 'int',
      minimum: 1,
      maximum: 10,
      description: 'Query priority (1-10)'
    },
    metadata: {
      bsonType: 'object',
      properties: {
        source: {
          bsonType: 'string',
          enum: ['web', 'api', 'mobile', 'internal']
        },
        ip_address: { bsonType: 'string' },
        user_agent: { bsonType: 'string' },
        session_id: { bsonType: 'string' },
        referrer: { bsonType: 'string' }
      },
      description: 'Query metadata'
    },
    created_at: {
      bsonType: 'date',
      description: 'Query submission timestamp'
    },
    updated_at: {
      bsonType: 'date',
      description: 'Last update timestamp'
    }
  }
};

/**
 * Default values for user query creation
 */
const userQueryDefaults = {
  status: QueryStatus.PENDING,
  priority: 5,
  parsed_intent: {},
  created_at: new Date(),
  updated_at: new Date()
};

/**
 * Validate user query data
 */
function validateUserQuery(data) {
  return zodUserQuerySchema.parse(data);
}

/**
 * Validate user query update data
 */
function validateUserQueryUpdate(data) {
  return zodUserQueryUpdate.parse(data);
}

/**
 * Create validated user query factory for testing
 */
const createUserQuery = createValidatedFactory(
  zodUserQuerySchema,
  {
    ...userQueryDefaults,
    query_id: '00000000-0000-4000-8000-000000000000',
    query_text: 'find red dress under $50'
  }
);

/**
 * Parse query text into intent (placeholder for future NLP)
 */
function parseQueryIntent(queryText) {
  // Simple keyword extraction for now
  // Future: Use NLP/LLM for proper intent parsing
  
  const intent = {
    product_type: null,
    attributes: {},
    price_range: null,
    filters: {}
  };
  
  // Extract price range
  const priceMatch = queryText.match(/under \$?(\d+)|less than \$?(\d+)|below \$?(\d+)/i);
  if (priceMatch) {
    const maxPrice = parseInt(priceMatch[1] || priceMatch[2] || priceMatch[3]);
    intent.price_range = { max: maxPrice * 100, currency: 'USD' }; // Convert to cents
  }
  
  // Extract color attributes
  const colors = ['red', 'blue', 'green', 'black', 'white', 'yellow', 'pink', 'purple'];
  for (const color of colors) {
    if (queryText.toLowerCase().includes(color)) {
      intent.attributes.color = color;
      break;
    }
  }
  
  // Extract product types
  const productTypes = ['dress', 'shirt', 'pants', 'shoes', 'jacket', 'bag'];
  for (const type of productTypes) {
    if (queryText.toLowerCase().includes(type)) {
      intent.product_type = type;
      break;
    }
  }
  
  return intent;
}

/**
 * Calculate query priority based on various factors
 */
function calculatePriority(query) {
  let priority = 5; // Default
  
  // Increase priority for logged-in users
  if (query.user_id) {
    priority += 1;
  }
  
  // Increase priority for specific price ranges (likely to convert)
  if (query.parsed_intent?.price_range?.max) {
    if (query.parsed_intent.price_range.max < 10000) { // Under $100
      priority += 1;
    }
  }
  
  // Decrease priority for very broad queries
  if (!query.parsed_intent?.product_type) {
    priority -= 1;
  }
  
  return Math.max(1, Math.min(10, priority));
}

/**
 * Check if query is still valid (not expired)
 */
function isQueryValid(query, maxAgeHours = 24) {
  const created = query.created_at instanceof Date
    ? query.created_at
    : new Date(query.created_at);
    
  const ageHours = (Date.now() - created.getTime()) / (1000 * 60 * 60);
  return ageHours < maxAgeHours;
}

module.exports = {
  // Schemas
  zodUserQuerySchema,
  zodUserQueryUpdate,
  zodParsedIntent,
  mongoUserQuerySchema,
  
  // Validation functions
  validateUserQuery,
  validateUserQueryUpdate,
  
  // Utilities
  createUserQuery,
  parseQueryIntent,
  calculatePriority,
  isQueryValid,
  
  // Constants
  userQueryDefaults,
  QueryStatus
};