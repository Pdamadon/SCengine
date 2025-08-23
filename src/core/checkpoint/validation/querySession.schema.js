/**
 * Query session schema validation
 * Provides Zod schemas and MongoDB validation for query_sessions collection
 * Links user queries to checkpoints and tracks search results
 */

const { z } = require('zod');
const {
  zodUUID,
  zodTimestamp,
  zodDomain,
  CheckpointStatus,
  createValidatedFactory
} = require('./validationUtils');

/**
 * Session status enum
 */
const SessionStatus = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Checkpoint reference schema - minimal info to avoid lookups
 */
const zodCheckpointRef = z.object({
  checkpoint_id: zodUUID,
  site_domain: zodDomain,
  status: z.enum(Object.values(CheckpointStatus)),
  completed_at: zodTimestamp.optional()
});

/**
 * Site search metrics schema
 */
const zodSiteSearched = z.object({
  site_domain: zodDomain,
  checkpoint_id: zodUUID.optional(), // Link back to specific checkpoint
  products_found: z.number().int().min(0),
  search_time_ms: z.number().int().min(0),
  cache_hit: z.boolean().default(false)
});

/**
 * Search result schema - capped to prevent document bloat
 */
const zodSearchResult = z.object({
  product_id: z.string(),
  site_domain: zodDomain,
  title: z.string(),
  price: z.number().min(0), // Price in cents
  url: z.string().url(),
  relevance_score: z.number().min(0).max(1),
  rank: z.number().int().min(1) // Result position
});

/**
 * Performance metrics schema
 */
const zodPerformanceMetrics = z.object({
  total_time_ms: z.number().int().min(0),
  sites_queried: z.number().int().min(0),
  products_evaluated: z.number().int().min(0),
  cache_hits: z.number().int().min(0),
  cache_ratio: z.number().min(0).max(1).optional() // Computed: cache_hits / sites_queried
}).default({
  total_time_ms: 0,
  sites_queried: 0,
  products_evaluated: 0,
  cache_hits: 0
});

/**
 * Error details schema for failed sessions
 */
const zodSessionErrorDetails = z.object({
  message: z.string(),
  code: z.string().optional(),
  failed_sites: z.array(zodDomain).optional(),
  timestamp: zodTimestamp
}).optional();

/**
 * Main query session schema for Zod validation
 */
const zodQuerySessionSchema = z.object({
  session_id: zodUUID,
  query_id: zodUUID,
  user_id: z.string().optional(), // Denormalized for convenience
  parent_session_id: zodUUID.optional(), // For recursive/branching searches
  
  checkpoints: z.array(zodCheckpointRef).default([]),
  sites_searched: z.array(zodSiteSearched).default([]),
  results: z.array(zodSearchResult)
    .default([])
    .max(500, 'Results limited to 500 to prevent document bloat'),
  
  performance_metrics: zodPerformanceMetrics,
  
  status: z.enum(Object.values(SessionStatus)),
  error_details: zodSessionErrorDetails,
  
  algorithm_version: z.string().default('1.0'),
  cache_key: z.string().optional(),
  
  created_at: zodTimestamp,
  updated_at: zodTimestamp,
  completed_at: zodTimestamp.optional(),
  expires_at: zodTimestamp.optional()
});

/**
 * Schema for session updates (partial)
 */
const zodQuerySessionUpdate = zodQuerySessionSchema.partial().required({
  session_id: true
});

/**
 * MongoDB JSON Schema for database validation
 */
const mongoQuerySessionSchema = {
  bsonType: 'object',
  required: ['session_id', 'query_id', 'status', 'created_at', 'updated_at'],
  properties: {
    session_id: {
      bsonType: 'string',
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      description: 'UUID v4 session identifier'
    },
    query_id: {
      bsonType: 'string',
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      description: 'Reference to user_queries collection'
    },
    user_id: {
      bsonType: 'string',
      description: 'Denormalized user ID for convenience'
    },
    parent_session_id: {
      bsonType: 'string',
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      description: 'Parent session for recursive searches'
    },
    checkpoints: {
      bsonType: 'array',
      maxItems: 100,
      items: {
        bsonType: 'object',
        required: ['checkpoint_id', 'site_domain', 'status'],
        properties: {
          checkpoint_id: { bsonType: 'string' },
          site_domain: { bsonType: 'string' },
          status: {
            bsonType: 'string',
            enum: Object.values(CheckpointStatus)
          },
          completed_at: { bsonType: 'date' }
        }
      },
      description: 'Associated checkpoints with status'
    },
    sites_searched: {
      bsonType: 'array',
      maxItems: 100,
      items: {
        bsonType: 'object',
        required: ['site_domain', 'products_found', 'search_time_ms'],
        properties: {
          site_domain: { bsonType: 'string' },
          checkpoint_id: { bsonType: 'string' },
          products_found: { bsonType: 'int', minimum: 0 },
          search_time_ms: { bsonType: 'int', minimum: 0 },
          cache_hit: { bsonType: 'bool' }
        }
      },
      description: 'Sites searched with metrics'
    },
    results: {
      bsonType: 'array',
      maxItems: 500,
      items: {
        bsonType: 'object',
        required: ['product_id', 'site_domain', 'title', 'price', 'url', 'relevance_score', 'rank'],
        properties: {
          product_id: { bsonType: 'string' },
          site_domain: { bsonType: 'string' },
          title: { bsonType: 'string' },
          price: { bsonType: 'number', minimum: 0 },
          url: { bsonType: 'string' },
          relevance_score: { bsonType: 'number', minimum: 0, maximum: 1 },
          rank: { bsonType: 'int', minimum: 1 }
        }
      },
      description: 'Search results (capped at 500)'
    },
    performance_metrics: {
      bsonType: 'object',
      properties: {
        total_time_ms: { bsonType: 'int', minimum: 0 },
        sites_queried: { bsonType: 'int', minimum: 0 },
        products_evaluated: { bsonType: 'int', minimum: 0 },
        cache_hits: { bsonType: 'int', minimum: 0 },
        cache_ratio: { bsonType: 'number', minimum: 0, maximum: 1 }
      },
      description: 'Aggregated performance metrics'
    },
    status: {
      bsonType: 'string',
      enum: Object.values(SessionStatus),
      description: 'Session status'
    },
    error_details: {
      bsonType: 'object',
      properties: {
        message: { bsonType: 'string' },
        code: { bsonType: 'string' },
        failed_sites: {
          bsonType: 'array',
          items: { bsonType: 'string' }
        },
        timestamp: { bsonType: 'date' }
      },
      description: 'Error information if session failed'
    },
    algorithm_version: {
      bsonType: 'string',
      description: 'Version of search algorithm used'
    },
    cache_key: {
      bsonType: 'string',
      description: 'Cache key for result reuse'
    },
    created_at: {
      bsonType: 'date',
      description: 'Session start timestamp'
    },
    updated_at: {
      bsonType: 'date',
      description: 'Last update timestamp'
    },
    completed_at: {
      bsonType: 'date',
      description: 'Session completion timestamp'
    },
    expires_at: {
      bsonType: 'date',
      description: 'TTL expiration timestamp'
    }
  }
};

/**
 * Default values for session creation
 */
const querySessionDefaults = {
  status: SessionStatus.RUNNING,
  checkpoints: [],
  sites_searched: [],
  results: [],
  performance_metrics: {
    total_time_ms: 0,
    sites_queried: 0,
    products_evaluated: 0,
    cache_hits: 0
  },
  algorithm_version: '1.0',
  created_at: new Date(),
  updated_at: new Date()
};

/**
 * Validate query session data
 */
function validateQuerySession(data) {
  return zodQuerySessionSchema.parse(data);
}

/**
 * Validate query session update data
 */
function validateQuerySessionUpdate(data) {
  return zodQuerySessionUpdate.parse(data);
}

/**
 * Create validated query session factory for testing
 */
const createQuerySession = createValidatedFactory(
  zodQuerySessionSchema,
  {
    ...querySessionDefaults,
    session_id: '00000000-0000-4000-8000-000000000000',
    query_id: '00000000-0000-4000-8000-000000000001'
  }
);

/**
 * Calculate session duration in milliseconds
 */
function getSessionDuration(session) {
  if (!session.completed_at) return null;
  
  const start = session.created_at instanceof Date
    ? session.created_at
    : new Date(session.created_at);
    
  const end = session.completed_at instanceof Date
    ? session.completed_at
    : new Date(session.completed_at);
    
  return end.getTime() - start.getTime();
}

/**
 * Calculate average search time per site
 */
function getAverageSearchTime(session) {
  if (!session.sites_searched || session.sites_searched.length === 0) {
    return 0;
  }
  
  const totalTime = session.sites_searched.reduce(
    (sum, site) => sum + site.search_time_ms,
    0
  );
  
  return Math.round(totalTime / session.sites_searched.length);
}

/**
 * Calculate cache hit ratio
 */
function getCacheRatio(session) {
  if (session.performance_metrics.sites_queried === 0) {
    return 0;
  }
  
  return session.performance_metrics.cache_hits / session.performance_metrics.sites_queried;
}

/**
 * Get session success rate (completed checkpoints / total)
 */
function getSuccessRate(session) {
  if (!session.checkpoints || session.checkpoints.length === 0) {
    return 0;
  }
  
  const completed = session.checkpoints.filter(
    cp => cp.status === CheckpointStatus.COMPLETED
  ).length;
  
  return completed / session.checkpoints.length;
}

/**
 * Check if session has expired
 */
function isSessionExpired(session) {
  if (!session.expires_at) return false;
  
  const expiresAt = session.expires_at instanceof Date
    ? session.expires_at
    : new Date(session.expires_at);
    
  return expiresAt < new Date();
}

/**
 * Prepare session for MongoDB insertion with TTL
 */
function prepareForMongoDB(data) {
  const validated = validateQuerySession(data);
  
  // Set default TTL if not specified (7 days for sessions)
  if (!validated.expires_at) {
    validated.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
  
  // Calculate cache ratio if not set
  if (validated.performance_metrics && !validated.performance_metrics.cache_ratio) {
    validated.performance_metrics.cache_ratio = getCacheRatio(validated);
  }
  
  return validated;
}

module.exports = {
  // Schemas
  zodQuerySessionSchema,
  zodQuerySessionUpdate,
  zodCheckpointRef,
  zodSiteSearched,
  zodSearchResult,
  mongoQuerySessionSchema,
  
  // Validation functions
  validateQuerySession,
  validateQuerySessionUpdate,
  prepareForMongoDB,
  
  // Utilities
  createQuerySession,
  getSessionDuration,
  getAverageSearchTime,
  getCacheRatio,
  getSuccessRate,
  isSessionExpired,
  
  // Constants
  querySessionDefaults,
  SessionStatus
};