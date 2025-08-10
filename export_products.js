const { MongoClient } = require('mongodb');
const fs = require('fs');

async function exportAllProducts() {
  const client = new MongoClient(process.env.MONGODB_URL || process.env.MONGO_URL || 'mongodb://localhost:27017');
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('Worldmodel1');
    
    // Get all collections info
    console.log('\n📊 DATABASE OVERVIEW:');
    console.log('===================');
    
    const domains = await db.collection('domains').find({}).toArray();
    const categories = await db.collection('categories').find({}).toArray();
    const products = await db.collection('products').find({}).toArray();
    
    console.log(`• Domains: ${domains.length}`);
    console.log(`• Categories: ${categories.length}`);
    console.log(`• Products: ${products.length}`);
    
    // Export detailed data
    console.log('\n💾 EXPORTING DATA:');
    console.log('==================');
    
    // 1. Domain Intelligence
    console.log('📋 Domains...');
    fs.writeFileSync('world_model_domains.json', JSON.stringify(domains, null, 2));
    
    // 2. Categories with product relationships
    console.log('📁 Categories...');
    fs.writeFileSync('world_model_categories.json', JSON.stringify(categories, null, 2));
    
    // 3. All products with full data
    console.log('🛍️  Products...');
    fs.writeFileSync('world_model_products.json', JSON.stringify(products, null, 2));
    
    // 4. Product summary by category
    console.log('📈 Product summary by category...');
    const productsByCategory = {};
    products.forEach(product => {
      // Since the current scraper doesn't set category, we'll group by domain for now
      const key = product.domain || 'unknown';
      if (!productsByCategory[key]) {
        productsByCategory[key] = [];
      }
      productsByCategory[key].push({
        product_id: product.product_id,
        title: product.title,
        price: product.price,
        url: product.url,
        variants: product.variants || [],
        last_crawled: product.last_crawled,
        crawl_count: product.crawl_count || 1
      });
    });
    
    fs.writeFileSync('products_by_category.json', JSON.stringify(productsByCategory, null, 2));
    
    // 5. Create comprehensive export with relationships
    console.log('🔗 Creating comprehensive export...');
    const comprehensiveExport = {
      export_info: {
        timestamp: new Date().toISOString(),
        total_domains: domains.length,
        total_categories: categories.length, 
        total_products: products.length,
        scraping_source: 'glasswingshop.com'
      },
      domains: domains,
      categories: categories,
      products: products,
      product_summary: {
        by_domain: productsByCategory,
        price_range: {
          min: Math.min(...products.filter(p => p.price).map(p => p.price)),
          max: Math.max(...products.filter(p => p.price).map(p => p.price)),
          average: products.filter(p => p.price).reduce((sum, p) => sum + p.price, 0) / products.filter(p => p.price).length
        },
        total_variants: products.reduce((sum, p) => sum + (p.variants?.length || 0), 0)
      }
    };
    
    fs.writeFileSync('comprehensive_world_model_export.json', JSON.stringify(comprehensiveExport, null, 2));
    
    console.log('\n✅ EXPORT COMPLETE!');
    console.log('📁 Files created:');
    console.log('   • world_model_domains.json - Domain intelligence');
    console.log('   • world_model_categories.json - Category data');
    console.log('   • world_model_products.json - All product data');
    console.log('   • products_by_category.json - Products grouped by domain');
    console.log('   • comprehensive_world_model_export.json - Complete export');
    
    // Show sample data
    console.log('\n📊 SAMPLE DATA PREVIEW:');
    console.log('======================');
    
    if (domains.length > 0) {
      console.log('🌐 Domain Intelligence:');
      const domain = domains[0];
      console.log(`   Domain: ${domain.domain}`);
      console.log(`   Platform: ${domain.platform}`);
      console.log(`   Intelligence Score: ${domain.intelligence_score}`);
      console.log(`   Capabilities: ${Object.keys(domain.capabilities || {}).length} features`);
    }
    
    if (products.length > 0) {
      console.log('\n🛍️  Sample Products:');
      products.slice(0, 3).forEach((product, i) => {
        console.log(`   ${i + 1}. ${product.title}`);
        console.log(`      Price: $${product.price}`);
        console.log(`      Variants: ${product.variants?.length || 0}`);
        console.log(`      URL: ${product.url}`);
      });
    }
    
    console.log(`\n📈 Price Analysis:`);
    const prices = products.filter(p => p.price).map(p => p.price);
    if (prices.length > 0) {
      console.log(`   Range: $${Math.min(...prices)} - $${Math.max(...prices)}`);
      console.log(`   Average: $${(prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)}`);
    }
    
  } catch (error) {
    console.error('❌ Export failed:', error);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  exportAllProducts().then(() => {
    console.log('\n🎉 Export completed successfully!');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Export failed:', error);
    process.exit(1);
  });
}

module.exports = { exportAllProducts };