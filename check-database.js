#!/usr/bin/env node

/**
 * Quick Database Check - See what data we've successfully stored
 */

const mongoDBClient = require('./src/database/MongoDBClient');

async function checkDatabase() {
  console.log('🔍 Checking MongoDB for Glasswing data...\n');
  
  try {
    const db = await mongoDBClient.connect();
    if (!db) {
      console.log('❌ MongoDB not connected');
      return;
    }
    
    console.log('✅ MongoDB connected\n');
    
    // Check products collection
    const products = db.collection('products');
    const productCount = await products.countDocuments({ domain: 'glasswingshop.com' });
    console.log(`📦 Products stored for glasswingshop.com: ${productCount}`);
    
    if (productCount > 0) {
      const sampleProducts = await products.find({ domain: 'glasswingshop.com' }).limit(5).toArray();
      console.log('\n📋 Sample products:');
      sampleProducts.forEach((product, i) => {
        console.log(`   ${i + 1}. ${product.title || 'Unknown'}`);
        console.log(`      URL: ${product.source_url}`);
        if (product.navigation_context?.parent_category) {
          console.log(`      Category: ${product.navigation_context.parent_category}`);
        }
      });
    }
    
    // Check categories collection  
    const categories = db.collection('categories');
    const categoryCount = await categories.countDocuments({ domain: 'glasswingshop.com' });
    console.log(`\n📂 Categories stored for glasswingshop.com: ${categoryCount}`);
    
    if (categoryCount > 0) {
      const sampleCategories = await categories.find({ domain: 'glasswingshop.com' }).limit(5).toArray();
      console.log('\n📋 Sample categories:');
      sampleCategories.forEach((category, i) => {
        console.log(`   ${i + 1}. ${category.name} (Level ${category.level})`);
        console.log(`      URL: ${category.url_path}`);
        console.log(`      Products: ${category.estimated_product_count || 0}`);
      });
    }
    
    // Check navigation maps
    const navigationMaps = db.collection('navigation_maps');
    const navigationCount = await navigationMaps.countDocuments({ domain: 'glasswingshop.com' });
    console.log(`\n🗺️ Navigation maps for glasswingshop.com: ${navigationCount}`);
    
    // Check product-category relationships
    const productCategories = db.collection('product_categories');
    const relationshipCount = await productCategories.countDocuments({});
    console.log(`\n🔗 Product-category relationships: ${relationshipCount}`);
    
    await mongoDBClient.disconnect();
    
    console.log('\n🏁 Database check completed');
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  }
}

checkDatabase();