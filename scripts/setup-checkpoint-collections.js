/**
 * Setup script for checkpoint system collections
 * Creates three collections with proper indexes and validation
 */

const mongoDBClient = require('../src/database/MongoDBClient');
const { logger } = require('../src/utils/logger');

async function setupCheckpointCollections() {
  try {
    console.log('🚀 Setting up checkpoint system collections...');
    
    // Connect to MongoDB
    await mongoDBClient.connect();
    const db = mongoDBClient.getDatabase();
    
    // Get existing collections
    const existingCollections = await db.listCollections().toArray();
    const existingNames = new Set(existingCollections.map(c => c.name));
    
    // 1. Create checkpoints collection (internal)
    if (!existingNames.has('checkpoints')) {
      console.log('Creating checkpoints collection...');
      
      await db.createCollection('checkpoints', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['checkpoint_id', 'site_domain', 'job_type', 'pipeline_step', 'status', 'created_at', 'updated_at'],
            properties: {
              checkpoint_id: {
                bsonType: 'string',
                description: 'Unique checkpoint identifier (UUID)'
              },
              site_domain: {
                bsonType: 'string',
                description: 'Domain of the site being scraped'
              },
              job_type: {
                bsonType: 'string',
                enum: ['product_catalog', 'product_detail', 'category_discovery', 'search_results'],
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
                properties: {
                  urls_discovered: {
                    bsonType: 'array',
                    items: { bsonType: 'string' }
                  },
                  urls_processed: {
                    bsonType: 'array',
                    items: { bsonType: 'string' }
                  },
                  current_page: {
                    bsonType: 'int',
                    minimum: 1
                  },
                  pagination_state: {
                    bsonType: 'object'
                  },
                  extraction_results: {
                    bsonType: 'array'
                  }
                }
              },
              status: {
                bsonType: 'string',
                enum: ['active', 'completed', 'failed', 'expired'],
                description: 'Checkpoint status'
              },
              error_details: {
                bsonType: 'object',
                properties: {
                  message: { bsonType: 'string' },
                  stack: { bsonType: 'string' },
                  timestamp: { bsonType: 'date' }
                }
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
                description: 'Expiration timestamp for TTL'
              }
            }
          }
        }
      });
      
      // Create indexes for checkpoints
      const checkpointsCollection = db.collection('checkpoints');
      
      // Unique index on checkpoint_id
      await checkpointsCollection.createIndex(
        { checkpoint_id: 1 },
        { unique: true, name: 'idx_checkpoint_id' }
      );
      
      // Compound index for efficient queries
      await checkpointsCollection.createIndex(
        { site_domain: 1, job_type: 1, status: 1 },
        { name: 'idx_site_job_status' }
      );
      
      // TTL index for automatic expiration
      await checkpointsCollection.createIndex(
        { expires_at: 1 },
        { expireAfterSeconds: 0, name: 'idx_ttl_expires' }
      );
      
      // Index for finding active checkpoints
      await checkpointsCollection.createIndex(
        { status: 1, updated_at: -1 },
        { name: 'idx_status_updated' }
      );
      
      console.log('✅ Checkpoints collection created with indexes');
    } else {
      console.log('⏭️  Checkpoints collection already exists');
    }
    
    // 2. Create user_queries collection (external)
    if (!existingNames.has('user_queries')) {
      console.log('Creating user_queries collection...');
      
      await db.createCollection('user_queries', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['query_id', 'query_text', 'status', 'created_at', 'updated_at'],
            properties: {
              query_id: {
                bsonType: 'string',
                description: 'Unique query identifier (UUID)'
              },
              user_id: {
                bsonType: 'string',
                description: 'User identifier (optional for anonymous queries)'
              },
              query_text: {
                bsonType: 'string',
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
                      min: { bsonType: 'number' },
                      max: { bsonType: 'number' },
                      currency: { bsonType: 'string' }
                    }
                  },
                  filters: { bsonType: 'object' }
                }
              },
              status: {
                bsonType: 'string',
                enum: ['pending', 'processing', 'completed', 'failed'],
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
                  source: { bsonType: 'string' },
                  ip_address: { bsonType: 'string' },
                  user_agent: { bsonType: 'string' }
                }
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
          }
        }
      });
      
      // Create indexes for user_queries
      const queriesCollection = db.collection('user_queries');
      
      // Unique index on query_id
      await queriesCollection.createIndex(
        { query_id: 1 },
        { unique: true, name: 'idx_query_id' }
      );
      
      // Index for user queries
      await queriesCollection.createIndex(
        { user_id: 1, created_at: -1 },
        { name: 'idx_user_created' }
      );
      
      // Index for status queries
      await queriesCollection.createIndex(
        { status: 1, priority: -1, created_at: 1 },
        { name: 'idx_status_priority' }
      );
      
      // Text index for query search
      await queriesCollection.createIndex(
        { query_text: 'text' },
        { name: 'idx_query_text' }
      );
      
      console.log('✅ User queries collection created with indexes');
    } else {
      console.log('⏭️  User queries collection already exists');
    }
    
    // 3. Create query_sessions collection (linking)
    if (!existingNames.has('query_sessions')) {
      console.log('Creating query_sessions collection...');
      
      await db.createCollection('query_sessions', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['session_id', 'query_id', 'created_at'],
            properties: {
              session_id: {
                bsonType: 'string',
                description: 'Unique session identifier (UUID)'
              },
              query_id: {
                bsonType: 'string',
                description: 'Reference to user_queries collection'
              },
              checkpoint_ids: {
                bsonType: 'array',
                items: { bsonType: 'string' },
                description: 'Associated checkpoint IDs'
              },
              sites_searched: {
                bsonType: 'array',
                items: {
                  bsonType: 'object',
                  properties: {
                    domain: { bsonType: 'string' },
                    products_found: { bsonType: 'int' },
                    search_time_ms: { bsonType: 'int' }
                  }
                }
              },
              results: {
                bsonType: 'array',
                items: {
                  bsonType: 'object',
                  properties: {
                    product_id: { bsonType: 'string' },
                    site_domain: { bsonType: 'string' },
                    title: { bsonType: 'string' },
                    price: { bsonType: 'number' },
                    url: { bsonType: 'string' },
                    relevance_score: { bsonType: 'number' }
                  }
                }
              },
              performance_metrics: {
                bsonType: 'object',
                properties: {
                  total_time_ms: { bsonType: 'int' },
                  sites_queried: { bsonType: 'int' },
                  products_evaluated: { bsonType: 'int' },
                  cache_hits: { bsonType: 'int' }
                }
              },
              created_at: {
                bsonType: 'date',
                description: 'Session start timestamp'
              },
              completed_at: {
                bsonType: 'date',
                description: 'Session completion timestamp'
              }
            }
          }
        }
      });
      
      // Create indexes for query_sessions
      const sessionsCollection = db.collection('query_sessions');
      
      // Unique index on session_id
      await sessionsCollection.createIndex(
        { session_id: 1 },
        { unique: true, name: 'idx_session_id' }
      );
      
      // Index for query lookup
      await sessionsCollection.createIndex(
        { query_id: 1 },
        { name: 'idx_query_lookup' }
      );
      
      // Index for checkpoint association
      await sessionsCollection.createIndex(
        { checkpoint_ids: 1 },
        { name: 'idx_checkpoint_assoc' }
      );
      
      // Index for performance analysis
      await sessionsCollection.createIndex(
        { created_at: -1, 'performance_metrics.total_time_ms': 1 },
        { name: 'idx_performance' }
      );
      
      console.log('✅ Query sessions collection created with indexes');
    } else {
      console.log('⏭️  Query sessions collection already exists');
    }
    
    // Update collections configuration
    const collectionsConfig = require('../src/config/mongodb');
    const updatedCollections = {
      ...collectionsConfig.collections,
      checkpoints: 'checkpoints',
      userQueries: 'user_queries',
      querySessions: 'query_sessions'
    };
    
    console.log('\n📊 Collection Summary:');
    console.log('------------------------');
    console.log('Internal: checkpoints');
    console.log('External: user_queries');
    console.log('Linking:  query_sessions');
    console.log('------------------------');
    
    console.log('\n✅ Checkpoint system collections setup complete!');
    console.log('\n💡 Next steps:');
    console.log('1. Run tests: npm run test:checkpoint');
    console.log('2. Enable feature flag: ENABLE_CHECKPOINTS=true');
    console.log('3. Monitor performance metrics');
    
    return {
      success: true,
      collections: ['checkpoints', 'user_queries', 'query_sessions']
    };
    
  } catch (error) {
    console.error('❌ Error setting up checkpoint collections:', error);
    logger.error('Checkpoint setup failed', error);
    throw error;
  } finally {
    await mongoDBClient.disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  setupCheckpointCollections()
    .then(result => {
      console.log('Setup completed:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Setup failed:', error);
      process.exit(1);
    });
}

module.exports = setupCheckpointCollections;