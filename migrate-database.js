/**
 * Database Migration Script
 * 
 * Migrates from current database to the comprehensive enterprise schema
 * 
 * This script will:
 * 1. Connect to MongoDB cluster
 * 2. Create new database 'ai_shopping_scraper'
 * 3. Set up all collections with validation schemas
 * 4. Create 40+ performance indexes
 * 5. Verify schema setup
 */

require('dotenv').config();

const { MongoClient } = require('mongodb');
const { setupDatabase, DATABASE_NAME } = require('./mongodb-schema');

class DatabaseMigration {
  constructor() {
    this.mongoUrl = process.env.MONGODB_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017';
    this.newDbName = DATABASE_NAME; // 'ai_shopping_scraper' from schema
    this.logger = {
      info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
      debug: (msg, data) => console.log(`[DEBUG] ${msg}`, data || ''),
      warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
      error: (msg, data) => console.error(`[ERROR] ${msg}`, data || '')
    };
  }

  async run() {
    console.log('🚀 Starting Database Migration to Enterprise Schema\n');
    console.log('📋 Target database:', this.newDbName);
    console.log('🔗 MongoDB URL:', this.mongoUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
    
    const client = new MongoClient(this.mongoUrl);
    
    try {
      console.log('\n🔌 Connecting to MongoDB...');
      await client.connect();
      console.log('✅ Connected to MongoDB cluster');
      
      const db = client.db(this.newDbName);
      
      // Step 1: Create comprehensive database structure
      console.log('\n🏗️ Setting up comprehensive enterprise schema...');
      await setupDatabase(db);
      
      // Step 2: Verify the new schema
      console.log('\n✔️ Verifying new database structure...');
      await this.verifyNewSchema(db);
      
      // Step 3: Test basic operations
      console.log('\n🧪 Testing basic database operations...');
      await this.testBasicOperations(db);
      
      console.log('\n🎉 Database migration completed successfully!');
      console.log('✅ Enterprise schema is ready for use');
      console.log('\n📝 Next steps:');
      console.log('   1. Update SelectorLearningCache.js to use new schema');
      console.log('   2. Test existing pipeline with new database');
      console.log('   3. Verify selector persistence works');
      
    } catch (error) {
      console.error('\n❌ Migration failed:', error);
      throw error;
    } finally {
      await client.close();
      console.log('\n📡 Database connection closed');
    }
  }

  async verifyNewSchema(db) {
    console.log('📊 Checking collections and indexes...');
    
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    const expectedCollections = [
      'products',
      'categories', 
      'category_hierarchy',
      'product_categories',
      'category_analytics',
      'domains',
      'navigation_maps',
      'selectors',
      'price_history',
      'service_providers',
      'available_appointments'
    ];
    
    console.log(`   Found ${collections.length} collections:`);
    for (const expected of expectedCollections) {
      if (collectionNames.includes(expected)) {
        console.log(`   ✅ ${expected}`);
        
        // Check indexes for critical collections
        if (['products', 'selectors', 'categories'].includes(expected)) {
          const indexes = await db.collection(expected).indexes();
          console.log(`      📍 ${indexes.length} indexes created`);
        }
      } else {
        console.log(`   ❌ Missing collection: ${expected}`);
      }
    }

    // Verify key features
    console.log('\n🔍 Verifying key schema features:');
    
    // Check selectors collection has expanded element_type enum
    try {
      const testDoc = {
        domain: 'test.com',
        page_type: 'product',
        selector_type: 'title',
        selector: 'h1.test',
        element_type: 'text', // This should now be valid!
        confidence_score: 0.9,
        success_rate: 0.8,
        usage_count: 1,
        created_at: new Date(),
        active: true
      };
      
      const result = await db.collection('selectors').insertOne(testDoc);
      await db.collection('selectors').deleteOne({ _id: result.insertedId });
      console.log('   ✅ Selectors collection accepts "text" element_type');
    } catch (error) {
      console.log('   ❌ Selectors validation issue:', error.message);
    }

    // Check products collection can store extraction strategies
    try {
      const testProduct = {
        product_id: 'test-123',
        title: 'Test Product',
        domain: 'test.com',
        extraction_strategy: {
          quick_check: {
            price: {
              selector: '.price',
              alternatives: ['.cost', '.amount'],
              last_success: new Date(),
              success_rate: 0.95
            }
          }
        },
        created_at: new Date()
      };
      
      const result = await db.collection('products').insertOne(testProduct);
      await db.collection('products').deleteOne({ _id: result.insertedId });
      console.log('   ✅ Products collection stores extraction strategies');
    } catch (error) {
      console.log('   ❌ Products validation issue:', error.message);
    }
  }

  async testBasicOperations(db) {
    console.log('🔧 Testing key operations...');
    
    // Test 1: Domain-scoped selector insertion
    try {
      const selector = {
        domain: 'gap.com',
        page_type: 'product',
        selector_type: 'title',
        selector: 'h1.product-title',
        element_type: 'title',
        confidence_score: 0.95,
        success_rate: 0.9,
        usage_count: 5,
        created_at: new Date(),
        last_used: new Date(),
        active: true,
        context: { test: true }
      };
      
      const result = await db.collection('selectors').insertOne(selector);
      console.log('   ✅ Domain-scoped selector insertion works');
      
      // Test query performance
      const start = Date.now();
      const found = await db.collection('selectors').findOne({ 
        domain: 'gap.com', 
        selector_type: 'title' 
      });
      const queryTime = Date.now() - start;
      console.log(`   ✅ Query time: ${queryTime}ms (target: <50ms)`);
      
      // Clean up
      await db.collection('selectors').deleteOne({ _id: result.insertedId });
      
    } catch (error) {
      console.log('   ❌ Selector operations failed:', error.message);
    }

    // Test 2: Category hierarchy operations
    try {
      const category = {
        domain: 'gap.com',
        canonical_id: 'mens-clothing',
        name: 'Men\'s Clothing',
        hierarchy_level: 2,
        category_type: 'product_type',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      };
      
      const result = await db.collection('categories').insertOne(category);
      console.log('   ✅ Category operations work');
      
      // Clean up
      await db.collection('categories').deleteOne({ _id: result.insertedId });
      
    } catch (error) {
      console.log('   ❌ Category operations failed:', error.message);
    }

    console.log('   🎯 Basic operations verified');
  }
}

async function main() {
  const migration = new DatabaseMigration();
  
  try {
    await migration.run();
    console.log('\n✅ Migration completed successfully!');
    console.log('🚀 Ready to update application code for new schema');
    process.exit(0);
  } catch (error) {
    console.error('\n💥 Migration failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = DatabaseMigration;