/**
 * Setup MongoDB Collections with Proper Schema
 * Creates all collections with validation rules and indexes
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const { setupDatabase, DATABASE_NAME } = require('./config/database/mongodb_schema');

async function setupCollections() {
  console.log('\n🏗️  MongoDB Collection Setup\n');
  console.log('=' .repeat(60));
  
  const uri = process.env.MONGODB_URL || process.env.MONGODB_URI;
  const dbName = DATABASE_NAME || 'ai_shopping_scraper';
  
  if (!uri) {
    console.error('❌ No MongoDB URI found in environment!');
    return;
  }
  
  console.log('📋 Configuration:');
  console.log(`   URI: ${uri.replace(/:[^:]*@/, ':****@')}`);
  console.log(`   Database: ${dbName}`);
  
  const client = new MongoClient(uri);
  
  try {
    console.log('\n🔄 Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected successfully');
    
    const db = client.db(dbName);
    
    // Drop existing collections if they exist (clean slate)
    console.log('\n🧹 Checking for existing collections...');
    const existingCollections = await db.listCollections().toArray();
    
    if (existingCollections.length > 0) {
      console.log(`   Found ${existingCollections.length} existing collections`);
      console.log('   Collections:', existingCollections.map(c => c.name).join(', '));
    } else {
      console.log('   No existing collections found (clean database)');
    }
    
    // Setup database with schema
    console.log('\n📐 Creating collections with schema validation...');
    await setupDatabase(db);
    console.log('✅ All collections created with proper schema');
    
    // Verify collections were created
    console.log('\n🔍 Verifying collections...');
    const collections = await db.listCollections().toArray();
    console.log(`   Created ${collections.length} collections:`);
    
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(`   ✓ ${col.name} (${count} documents)`);
    }
    
    // Test extraction strategy fields
    console.log('\n🧪 Testing extraction strategy storage...');
    const testProduct = {
      product_id: 'test_' + Date.now(),
      domain: 'test.com',
      title: 'Test Product',
      url: 'https://test.com/product',
      price: {
        current: 99.99,
        currency: 'USD'
      },
      extraction_strategy: {
        quick_check: {
          price: {
            selector: '.price',
            success_rate: 0.95
          }
        },
        platform_hints: {
          detected_platform: 'shopify'
        }
      },
      quick_check_config: {
        enabled: true,
        check_interval_ms: 3600000
      },
      created_at: new Date(),
      updated_at: new Date()
    };
    
    const result = await db.collection('products').insertOne(testProduct);
    console.log('   ✅ Test product inserted with extraction strategy');
    
    // Retrieve and verify
    const retrieved = await db.collection('products').findOne({ product_id: testProduct.product_id });
    console.log('   ✅ Product retrieved successfully');
    console.log(`   - Has extraction_strategy: ${!!retrieved.extraction_strategy}`);
    console.log(`   - Has quick_check_config: ${!!retrieved.quick_check_config}`);
    
    // Clean up test
    await db.collection('products').deleteOne({ product_id: testProduct.product_id });
    console.log('   ✅ Test product cleaned up');
    
    console.log('\n' + '=' .repeat(60));
    console.log('✅ MongoDB setup complete!');
    console.log('   All collections created with extraction strategy support');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await client.close();
    console.log('\n🔌 Connection closed');
  }
}

// Run setup
setupCollections().catch(console.error);