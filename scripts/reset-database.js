#!/usr/bin/env node

/**
 * Database Reset Script
 * Drops existing databases and creates a clean structure for the AI Shopping Scraper
 */

const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config();

async function resetDatabase() {
  const mongoUrl = process.env.MONGO_URL || process.env.MONGODB_URL;
  
  if (!mongoUrl) {
    console.error('❌ No MongoDB URL found in environment variables');
    process.exit(1);
  }

  console.log('🔄 Connecting to MongoDB...');
  const client = new MongoClient(mongoUrl);
  
  try {
    await client.connect();
    
    // List current databases
    const admin = client.db().admin();
    const dbList = await admin.listDatabases();
    
    console.log('\n📋 Current databases:');
    dbList.databases.forEach(db => {
      console.log(`  - ${db.name} (${(db.sizeOnDisk / 1024).toFixed(1)} KB)`);
    });
    
    // Drop problematic databases
    const databasesToDelete = ['Worldmodel1', 'ai_shopping_scraper'];
    
    for (const dbName of databasesToDelete) {
      if (dbList.databases.some(db => db.name === dbName)) {
        console.log(`\n🗑️  Dropping database: ${dbName}`);
        await client.db(dbName).dropDatabase();
        console.log(`✅ Dropped ${dbName}`);
      }
    }
    
    // Create new clean database
    const newDbName = 'ai_shopping_scraper';
    console.log(`\n🏗️  Creating fresh database: ${newDbName}`);
    
    const db = client.db(newDbName);
    
    // Create collections with proper structure
    const collections = [
      // Job management
      'scraping_jobs',
      'scraping_job_results',
      
      // Core data
      'products',
      'categories',
      'category_hierarchy',
      'product_categories',
      
      // Site management
      'domains',
      'sites',
      
      // Migration tracking
      'migration_locks',
      'schema_migrations'
    ];
    
    console.log('\n📦 Creating collections:');
    for (const collectionName of collections) {
      await db.createCollection(collectionName);
      console.log(`  ✅ Created ${collectionName}`);
    }
    
    // Create indexes for performance
    console.log('\n🔍 Creating indexes:');
    
    // Job indexes
    await db.collection('scraping_jobs').createIndex({ job_id: 1 }, { unique: true });
    await db.collection('scraping_jobs').createIndex({ status: 1 });
    await db.collection('scraping_jobs').createIndex({ priority: 1 });
    await db.collection('scraping_jobs').createIndex({ submitted_at: -1 });
    console.log('  ✅ Created scraping_jobs indexes');
    
    // Result indexes
    await db.collection('scraping_job_results').createIndex({ job_id: 1 }, { unique: true });
    console.log('  ✅ Created scraping_job_results indexes');
    
    // Product indexes
    await db.collection('products').createIndex({ url: 1 }, { unique: true });
    await db.collection('products').createIndex({ site_domain: 1 });
    await db.collection('products').createIndex({ category: 1 });
    console.log('  ✅ Created products indexes');
    
    // Category indexes
    await db.collection('categories').createIndex({ name: 1, site_domain: 1 }, { unique: true });
    await db.collection('categories').createIndex({ canonical_category: 1 });
    console.log('  ✅ Created categories indexes');
    
    console.log('\n🎉 Database reset complete!');
    console.log(`📊 New database: ${newDbName}`);
    console.log(`📝 Collections created: ${collections.length}`);
    
  } catch (error) {
    console.error('❌ Error resetting database:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

resetDatabase();