#!/usr/bin/env node

/**
 * Database Migration CLI Tool
 * Handles database schema migrations and rollbacks
 */

const { MigrationManager } = require('../src/database/migrationManager');
const { logger } = require('../src/utils/logger');
require('dotenv').config();

class MigrationCLI {
  constructor() {
    this.connectionUri = process.env.MONGO_URL || process.env.MONGODB_URL || 'mongodb://localhost:27017';
    this.dbName = process.env.DB_NAME || 'ai_shopping_scraper';
    this.migrationManager = new MigrationManager(this.connectionUri, this.dbName);
  }

  async run() {
    const command = process.argv[2];
    const args = process.argv.slice(3);

    try {
      await this.migrationManager.initialize();

      switch (command) {
        case 'status':
          await this.showStatus();
          break;
          
        case 'migrate':
          await this.migrate(args[0]);
          break;
          
        case 'rollback':
          await this.rollback(args[0]);
          break;
          
        case 'create':
          await this.createMigration(args.join(' '));
          break;
          
        case 'list':
          await this.listMigrations();
          break;
          
        case 'force-unlock':
          await this.forceUnlock();
          break;
          
        default:
          this.showHelp();
      }

    } catch (error) {
      console.error('❌ Migration command failed:', error.message);
      process.exit(1);
    } finally {
      await this.migrationManager.close();
    }
  }

  async showStatus() {
    console.log('📊 MIGRATION STATUS');
    console.log('==================');

    const status = await this.migrationManager.getStatus();

    console.log(`Current Version: ${status.current_version}`);
    console.log(`Applied Migrations: ${status.applied_migrations}`);
    console.log(`Pending Migrations: ${status.pending_migrations}`);
    console.log(`Migration Lock: ${status.is_locked ? '🔒 LOCKED' : '🔓 Unlocked'}`);

    if (status.lock_info) {
      console.log(`  - Acquired by: ${status.lock_info.acquired_by}`);
      console.log(`  - Acquired at: ${status.lock_info.acquired_at}`);
      console.log(`  - Expires at: ${status.lock_info.expires_at}`);
    }

    if (status.last_applied) {
      console.log(`\nLast Applied Migration:`);
      console.log(`  - Version: ${status.last_applied.version}`);
      console.log(`  - Description: ${status.last_applied.description}`);
      console.log(`  - Applied at: ${status.last_applied.applied_at}`);
      console.log(`  - Duration: ${status.last_applied.duration_ms}ms`);
    }

    if (status.pending_list.length > 0) {
      console.log('\nPending Migrations:');
      status.pending_list.forEach(migration => {
        console.log(`  📄 ${migration.version}: ${migration.description}`);
      });
    } else {
      console.log('\n✅ No pending migrations');
    }
  }

async function createMongoIndexes(db) {
  console.log('🔍 Creating MongoDB indexes...');

  // Domain indexes
  await db.collection('domains').createIndex({ "domain": 1 }, { unique: true });
  await db.collection('domains').createIndex({ "platform": 1 });
  await db.collection('domains').createIndex({ "site_type": 1 });
  await db.collection('domains').createIndex({ "intelligence_score": -1 });

  // Product indexes
  await db.collection('products').createIndex({ "domain": 1, "product_id": 1 }, { unique: true });
  await db.collection('products').createIndex({ "domain": 1 });
  await db.collection('products').createIndex({ "pricing.current_price": 1 });
  await db.collection('products').createIndex({ "availability.in_stock": 1 });

  // Price history indexes
  await db.collection('price_history').createIndex({ "product_id": 1, "timestamp": -1 });
  await db.collection('price_history').createIndex({ "timestamp": -1 });

  // Service provider indexes
  await db.collection('service_providers').createIndex({ "domain": 1 }, { unique: true });
  await db.collection('service_providers').createIndex({ "service_type": 1 });
  await db.collection('service_providers').createIndex({ "location.city": 1, "location.state": 1 });

  // Selector library indexes
  await db.collection('selector_libraries').createIndex({ "domain": 1, "element_type": 1 });
  await db.collection('selector_libraries').createIndex({ "reliability_score": -1 });

  console.log('✅ MongoDB indexes created successfully');
}

async function insertMongoSeedData(db) {
  console.log('🌱 Inserting MongoDB seed data...');

  // Insert sample domain for testing
  const sampleDomain = {
    domain: "example-shop.com",
    platform: "shopify",
    site_type: "ecommerce",
    intelligence_score: 0,
    capabilities: {
      can_extract_products: false,
      can_extract_pricing: false,
      can_extract_variants: false,
      can_navigate_categories: false,
      can_add_to_cart: false,
      can_checkout: false,
      can_search: false,
      can_filter: false,
      can_book_appointments: false,
      can_check_availability: false
    },
    selectors: {
      navigation: {},
      products: {},
      cart: {},
      booking: {}
    },
    performance_metrics: {
      average_load_time: 0,
      success_rate: 0,
      total_scrapes: 0,
      error_count: 0
    },
    created_at: new Date(),
    updated_at: new Date()
  };

  try {
    await db.collection('domains').insertOne(sampleDomain);
    console.log('✅ Sample domain inserted');
  } catch (error) {
    if (error.code === 11000) {
      console.log('⚠️  Sample domain already exists');
    } else {
      throw error;
    }
  }
}

async function testConnections() {
  console.log('🔍 Testing database connections...');

  // Test PostgreSQL
  try {
    const pgClient = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    await pgClient.connect();
    const result = await pgClient.query('SELECT NOW()');
    await pgClient.end();
    console.log('✅ PostgreSQL connection test passed:', result.rows[0].now);
  } catch (error) {
    console.error('❌ PostgreSQL connection test failed:', error.message);
    throw error;
  }

  // Test MongoDB
  try {
    const mongoClient = new MongoClient(process.env.MONGODB_URL);
    await mongoClient.connect();
    const db = mongoClient.db();
    const result = await db.admin().ping();
    await mongoClient.close();
    console.log('✅ MongoDB connection test passed:', result);
  } catch (error) {
    console.error('❌ MongoDB connection test failed:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting database migration...');
  console.log('Environment:', process.env.NODE_ENV || 'development');

  try {
    // Wait a bit for services to be ready (helpful in Railway)
    if (process.env.NODE_ENV === 'production') {
      console.log('⏳ Waiting for services to be ready...');
      await sleep(5000);
    }

    // Test connections first
    await testConnections();

    // Run migrations
    await migratePostgreSQL();
    await migrateMongoDB();

    console.log('🎉 Database migration completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⚠️  Migration interrupted');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Migration terminated');
  process.exit(1);
});

// Run migration if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = { migratePostgreSQL, migrateMongoDB, testConnections };