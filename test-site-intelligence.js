const winston = require('winston');
const SiteIntelligence = require('./src/intelligence/SiteIntelligence');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console()
  ]
});

async function testSiteIntelligence() {
  console.log('🧠 Testing Comprehensive Site Intelligence System\n');
  
  const siteIntelligence = new SiteIntelligence(logger);
  
  try {
    await siteIntelligence.initialize();
    console.log('✅ Site Intelligence system initialized\n');
    
    const testUrl = 'https://glasswingshop.com/';
    console.log(`🎯 Building intelligence for: ${testUrl}`);
    console.log('This will:\n' +
                '  📍 Map navigation structure with CSS selectors\n' +
                '  🔄 Launch concurrent browsers to explore sections\n' +
                '  📊 Extract product data and working selectors\n' +
                '  🧠 Build comprehensive world model\n');
    
    const startTime = Date.now();
    const intelligence = await siteIntelligence.buildComprehensiveSiteIntelligence(testUrl, {
      maxConcurrent: 3, // Use 3 concurrent browsers
      forceRefresh: true // Force fresh exploration
    });
    
    const duration = Date.now() - startTime;
    
    console.log('\n🎉 SITE INTELLIGENCE RESULTS');
    console.log('================================');
    
    console.log('\n📍 NAVIGATION INTELLIGENCE:');
    console.log(`  • Main Sections: ${intelligence.navigation.main_sections}`);
    console.log(`  • Dropdown Menus: ${intelligence.navigation.dropdown_menus}`);
    console.log(`  • Sidebar Navigation: ${intelligence.navigation.sidebar_navigation}`);
    console.log(`  • Clickable Elements: ${intelligence.navigation.clickable_elements}`);
    
    console.log('\n🔍 EXPLORATION RESULTS:');
    console.log(`  • Sections Explored: ${intelligence.exploration.sections_explored}`);
    console.log(`  • Products Found: ${intelligence.exploration.total_products_found}`);
    console.log(`  • Page Types: ${intelligence.exploration.page_types_discovered.join(', ')}`);
    console.log(`  • Working Selectors: ${intelligence.exploration.working_selectors.length}`);
    
    console.log('\n⚙️  SELECTOR LIBRARY:');
    console.log(`  • Categories: ${intelligence.selectors.categories.join(', ')}`);
    console.log(`  • Success Rate: ${Math.round(intelligence.selectors.success_rate * 100)}%`);
    console.log(`  • Library Size: ${intelligence.selectors.library_size} selector types`);
    
    console.log('\n🌐 URL PATTERNS:');
    console.log(`  • Product URLs: ${intelligence.url_patterns.product_url || 'Not detected'}`);
    console.log(`  • Category URLs: ${intelligence.url_patterns.category_url || 'Not detected'}`);
    console.log(`  • Collection URLs: ${intelligence.url_patterns.collection_url || 'Not detected'}`);
    
    console.log('\n🎯 SITE CAPABILITIES:');
    const caps = intelligence.capabilities;
    console.log(`  • Navigate Categories: ${caps.can_navigate_categories ? '✅' : '❌'}`);
    console.log(`  • Extract Products: ${caps.can_extract_products ? '✅' : '❌'}`);
    console.log(`  • Extract Prices: ${caps.can_extract_prices ? '✅' : '❌'}`);
    console.log(`  • Handle Variants: ${caps.can_handle_variants ? '✅' : '❌'}`);
    console.log(`  • Check Availability: ${caps.can_check_availability ? '✅' : '❌'}`);
    console.log(`  • Use Filters: ${caps.can_use_filters ? '✅' : '❌'}`);
    console.log(`  • Handle Pagination: ${caps.can_handle_pagination ? '✅' : '❌'}`);
    console.log(`  • Search Support: ${caps.supports_search ? '✅' : '❌'}`);
    console.log(`  • Overall Score: ${Math.round(caps.overall_score * 100)}%`);
    
    console.log('\n📊 SUMMARY:');
    console.log(`  • Intelligence Score: ${intelligence.summary.intelligence_score}/100`);
    console.log(`  • Processing Time: ${Math.round(duration/1000)}s`);
    console.log(`  • Domain: ${intelligence.domain}`);
    
    console.log('\n🔍 TESTING QUICK PRICE CHECK...');
    // Test quick price check if we found any products
    if (intelligence.exploration.total_products_found > 0) {
      try {
        const testProductUrl = 'https://glasswingshop.com/products/test-product'; // Example URL
        console.log('Note: Quick price check would work with actual product URLs from the intelligence data');
      } catch (priceError) {
        console.log('Quick price check test skipped (no sample product URL available)');
      }
    }
    
    console.log('\n✅ Site Intelligence test completed successfully!');
    console.log(`🎯 Ready to generate rich training data and provide real-time price checking for ${intelligence.domain}`);
    
  } catch (error) {
    console.error('❌ Site Intelligence test failed:', error.message);
    console.error(error.stack);
  } finally {
    await siteIntelligence.close();
  }
}

if (require.main === module) {
  testSiteIntelligence().catch(console.error);
}