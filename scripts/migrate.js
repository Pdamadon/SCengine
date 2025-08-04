#!/usr/bin/env node

// Database Migration Script for Railway Deployment
// Initializes PostgreSQL schema and MongoDB collections

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function migratePostgreSQL() {
  console.log('🐘 Starting PostgreSQL migration...');
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Read schema file
    const schemaPath = path.join(__dirname, '../database/postgresql_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute schema creation
    await client.query(schema);
    console.log('✅ PostgreSQL schema created successfully');

    // Insert initial data if needed
    await insertInitialData(client);
    
  } catch (error) {
    console.error('❌ PostgreSQL migration failed:', error);
    throw error;
  } finally {
    await client.end();
    console.log('🔌 PostgreSQL connection closed');
  }
}

async function migrateMongoDB() {
  console.log('🍃 Starting MongoDB migration...');
  
  const client = new MongoClient(process.env.MONGODB_URL);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db();

    // Create collections with validation
    const collections = [
      'domains',
      'categories', 
      'products',
      'price_history',
      'service_providers',
      'available_appointments',
      'navigation_maps',
      'selector_libraries'
    ];

    for (const collectionName of collections) {
      try {
        await db.createCollection(collectionName);
        console.log(`✅ Created collection: ${collectionName}`);
      } catch (error) {
        if (error.code === 48) {
          console.log(`⚠️  Collection ${collectionName} already exists`);
        } else {
          throw error;
        }
      }
    }

    // Create indexes
    await createMongoIndexes(db);
    console.log('✅ MongoDB indexes created');

    // Insert seed data if needed
    await insertMongoSeedData(db);
    
  } catch (error) {
    console.error('❌ MongoDB migration failed:', error);
    throw error;
  } finally {
    await client.close();
    console.log('🔌 MongoDB connection closed');
  }
}

async function insertInitialData(client) {
  console.log('📊 Inserting initial PostgreSQL data...');

  // Insert initial daily stats record
  const today = new Date().toISOString().split('T')[0];
  
  await client.query(`
    INSERT INTO daily_stats (date, total_sessions, successful_sessions, total_pages_scraped, total_training_records, unique_domains)
    VALUES ($1, 0, 0, 0, 0, 0)
    ON CONFLICT (date) DO NOTHING
  `, [today]);

  console.log('✅ Initial PostgreSQL data inserted');
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