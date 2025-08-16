#!/usr/bin/env node

const SiteIntelligence = require('./src/intelligence/SiteIntelligence');

const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args)
};

async function testFullPipeline() {
  console.log('🧠 Testing Complete SiteIntelligence Pipeline\n');
  
  const siteIntelligence = new SiteIntelligence(logger);
  await siteIntelligence.initialize();
  
  const testSites = [
    {
      name: 'Glasswing Shop (Easy Site)',
      url: 'https://glasswingshop.com',
      expectedSections: 5,
      expectedProducts: 20
    },
    {
      name: 'Macy\'s (Enterprise Site)',
      url: 'https://www.macys.com',
      expectedSections: 6,
      expectedProducts: 50
    }
  ];
  
  for (const site of testSites) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 Testing: ${site.name}`);
    console.log(`URL: ${site.url}`);
    console.log(`${'='.repeat(60)}\n`);
    
    try {
      const startTime = Date.now();
      
      // Run complete SiteIntelligence pipeline with forced refresh
      const intelligence = await siteIntelligence.buildComprehensiveSiteIntelligence(site.url, {
        maxConcurrent: 2,  // Limit concurrency for testing
        maxSubcategories: 2, // Limit depth for testing
        forceRefresh: true  // Force fresh discovery, ignore cache
      });
      
      const duration = Date.now() - startTime;
      
      // Display results
      console.log('📊 PIPELINE RESULTS:');
      console.log(`  Duration: ${Math.round(duration / 1000)}s`);
      console.log(`  Domain: ${intelligence.domain}`);
      
      console.log('\n🧭 Navigation Discovery:');
      console.log(`  Main sections: ${intelligence.navigation.main_sections}`);
      console.log(`  Dropdown menus: ${intelligence.navigation.dropdown_menus}`);
      console.log(`  Sidebar navigation: ${intelligence.navigation.sidebar_navigation}`);
      console.log(`  Clickable elements: ${intelligence.navigation.clickable_elements}`);
      
      console.log('\n🔄 Concurrent Exploration:');
      console.log(`  Sections explored: ${intelligence.exploration.sections_explored}`);
      console.log(`  Total products found: ${intelligence.exploration.total_products_found}`);
      console.log(`  Page types discovered: ${intelligence.exploration.page_types_discovered.join(', ')}`);
      console.log(`  Working selectors: ${intelligence.exploration.working_selectors.length}`);
      
      console.log('\n🎯 Site Capabilities:');
      console.log(`  Can navigate categories: ${intelligence.capabilities.can_navigate_categories}`);
      console.log(`  Can extract products: ${intelligence.capabilities.can_extract_products}`);
      console.log(`  Can extract prices: ${intelligence.capabilities.can_extract_prices}`);
      console.log(`  Has dropdown navigation: ${intelligence.capabilities.has_dropdown_navigation}`);
      console.log(`  Overall capability score: ${(intelligence.capabilities.overall_score * 100).toFixed(1)}%`);
      
      console.log('\n📈 Intelligence Summary:');
      console.log(`  Sections mapped: ${intelligence.summary.sections_mapped}`);
      console.log(`  Products discovered: ${intelligence.summary.products_discovered}`);
      console.log(`  Selectors identified: ${intelligence.summary.selectors_identified}`);
      console.log(`  Intelligence score: ${intelligence.summary.intelligence_score}/100`);
      
      // Check if AdaptiveNavigationStrategy was used
      if (intelligence.navigation._pipeline_metadata) {
        console.log('\n🚀 Pipeline Metadata:');
        const strategies = intelligence.navigation._pipeline_metadata.strategies_used || [];
        console.log(`  Strategies used: ${strategies.join(', ')}`);
        console.log(`  Discovery confidence: ${(intelligence.navigation._pipeline_metadata.confidence * 100).toFixed(1)}%`);
        
        if (strategies.includes('AdaptiveNavigationStrategy')) {
          console.log('  ✅ AdaptiveNavigationStrategy was used!');
        } else {
          console.log('  ⚠️ AdaptiveNavigationStrategy was not used');
        }
      }
      
      // Show sample products
      if (intelligence.products && intelligence.products.length > 0) {
        console.log(`\n🛍️ Sample Products (${Math.min(5, intelligence.products.length)}):`);
        intelligence.products.slice(0, 5).forEach((product, i) => {
          console.log(`  ${i + 1}. ${product.url}`);
        });
        
        if (intelligence.products.length > 5) {
          console.log(`  ... and ${intelligence.products.length - 5} more products`);
        }
      }
      
      // Assessment
      const success = intelligence.summary.sections_mapped >= Math.min(site.expectedSections, 3) &&
                     intelligence.summary.products_discovered >= Math.min(site.expectedProducts, 10);
      
      console.log(`\n${success ? '✅ SUCCESS' : '❌ NEEDS IMPROVEMENT'}: Pipeline completed for ${site.name}`);
      
      if (!success) {
        console.log(`Expected: ${site.expectedSections}+ sections, ${site.expectedProducts}+ products`);
        console.log(`Actual: ${intelligence.summary.sections_mapped} sections, ${intelligence.summary.products_discovered} products`);
      }
      
    } catch (error) {
      console.error(`❌ Pipeline failed for ${site.name}:`, error.message);
      console.error('Stack:', error.stack);
    }
  }
  
  await siteIntelligence.close();
  console.log('\n🎉 Full pipeline testing completed!');
}

if (require.main === module) {
  testFullPipeline().catch(error => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = { testFullPipeline };