#!/usr/bin/env node

/**
 * Test Selector Discovery Tool
 * 
 * Demonstrates the universal selector discovery system that can analyze
 * any e-commerce site and automatically find variant selectors and cart patterns
 */

require('dotenv').config();

const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const SelectorDiscovery = require('./src/common/SelectorDiscovery');
const { logger } = require('./src/utils/logger');

// Test URLs for different platforms
const TEST_SITES = [
  {
    name: 'Glasswing (Shopify)',
    url: 'https://glasswingshop.com/products/7115-by-szeki-cocoon-dress-shirt-off-white',
    expected_platform: 'shopify'
  },
  {
    name: 'Macy\'s (Custom)',
    url: 'https://www.macys.com/shop/product/boss-by-hugo-boss-mens-titanium-runner-sneakers?ID=20866230&swatchColor=Black',
    expected_platform: 'generic'
  }
];

async function testSelectorDiscovery() {
  console.log('🔬 Universal Selector Discovery Test');
  console.log('====================================\n');

  const browserManager = new BrowserManagerBrowserless();
  const discovery = new SelectorDiscovery(logger);
  const results = [];

  let closeSession;

  try {
    console.log('🌐 Creating browser session...');
    const { page, close } = await browserManager.createBrowser('stealth');
    closeSession = close;

    for (const site of TEST_SITES) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🧪 Testing: ${site.name}`);
      console.log(`🎯 URL: ${site.url}`);
      console.log(`📋 Expected Platform: ${site.expected_platform}`);
      console.log(`${'='.repeat(60)}\n`);

      try {
        // Navigate to product page
        console.log('📄 Loading page...');
        await page.goto(site.url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000); // Let page settle

        // Run discovery
        const pattern = await discovery.discoverPatterns(page, site.url);
        
        // Display results
        console.log('\n📊 DISCOVERY RESULTS');
        console.log('====================');
        console.log(`Platform: ${pattern.platform} ${pattern.platform === site.expected_platform ? '✅' : '⚠️'}`);
        console.log(`Confidence: ${pattern.confidence} ${pattern.confidence > 0.5 ? '✅' : '❌'}`);
        console.log(`Variant Groups: ${pattern.selectors?.variant_groups?.length || 0}`);
        console.log(`Cart Button: ${pattern.selectors?.cart_button ? '✅' : '❌'}`);
        console.log(`Price Selector: ${pattern.selectors?.price ? '✅' : '❌'}`);

        // Show detailed findings
        if (pattern.selectors?.variant_groups?.length > 0) {
          console.log('\n🎛️ VARIANT CONTROLS FOUND:');
          pattern.selectors.variant_groups.forEach((group, i) => {
            console.log(`   ${i + 1}. ${group.name} (${group.type})`);
            console.log(`      Selector: ${group.selector}`);
            console.log(`      Options: ${group.options?.length || 0} found`);
            if (group.options && group.options.length > 0) {
              console.log(`      Sample: ${group.options.slice(0, 3).map(o => o.text).join(', ')}`);
            }
          });
        }

        // Show interaction evidence
        if (pattern.interaction_evidence && Object.keys(pattern.interaction_evidence).length > 0) {
          console.log('\n🧪 INTERACTION EVIDENCE:');
          Object.entries(pattern.interaction_evidence).forEach(([group, evidence]) => {
            if (evidence.changes_detected) {
              const changes = evidence.changes_detected;
              console.log(`   ${group}:`);
              console.log(`      Cart Button State: ${changes.cart_button_changed ? '✅ CHANGED' : '❌ No change'}`);
              console.log(`      Price Changed: ${changes.price_changed ? '✅' : '❌'}`);
              console.log(`      Hidden Inputs: ${changes.hidden_inputs_changed ? '✅' : '❌'}`);
              console.log(`      Image Changed: ${changes.image_changed ? '✅' : '❌'}`);
              console.log(`      Stock Text: ${changes.stock_text_changed ? '✅' : '❌'}`);
              
              // Show cart button details if it changed
              if (changes.cart_button_changed && evidence.before_state?.cart_button && evidence.after_state?.cart_button) {
                const before = evidence.before_state.cart_button;
                const after = evidence.after_state.cart_button;
                console.log(`         Before: "${before.text}" (clickable: ${before.clickable})`);
                console.log(`         After:  "${after.text}" (clickable: ${after.clickable})`);
              }
            }
          });
        }

        // Show key selectors for extraction use
        console.log('\n🔧 KEY SELECTORS FOR EXTRACTION:');
        console.log(`   Variant Selection: ${pattern.selectors?.variant_groups?.[0]?.selector || 'None found'}`);
        console.log(`   Cart Button: ${pattern.selectors?.cart_button || 'None found'}`);
        console.log(`   Price Display: ${pattern.selectors?.price || 'None found'}`);
        console.log(`   Main Image: ${pattern.selectors?.main_image || 'None found'}`);

        // Store result
        results.push({
          site: site.name,
          pattern: pattern,
          success: pattern.confidence > 0.3
        });

        console.log(`\n✅ Discovery completed for ${site.name}`);

      } catch (error) {
        console.error(`❌ Discovery failed for ${site.name}:`, error.message);
        results.push({
          site: site.name,
          error: error.message,
          success: false
        });
      }

      // Wait between sites
      await page.waitForTimeout(2000);
    }

    // Final summary
    console.log('\n' + '='.repeat(80));
    console.log('📋 DISCOVERY SUMMARY');
    console.log('='.repeat(80));

    const successful = results.filter(r => r.success);
    console.log(`\n✅ Successful Discoveries: ${successful.length}/${results.length}`);
    
    successful.forEach(result => {
      console.log(`\n🎯 ${result.site}:`);
      console.log(`   Platform: ${result.pattern.platform}`);
      console.log(`   Confidence: ${result.pattern.confidence}`);
      console.log(`   Variant Controls: ${result.pattern.selectors?.variant_groups?.length || 0}`);
      console.log(`   Ready for extraction: ${result.pattern.confidence > 0.5 ? 'Yes' : 'No'}`);
    });

    // Save detailed results
    const fs = require('fs').promises;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `selector_discovery_results_${timestamp}.json`;
    await fs.writeFile(filename, JSON.stringify(results, null, 2));
    console.log(`\n💾 Detailed results saved to: ${filename}`);

    console.log('\n🎉 Discovery testing complete!');
    console.log('\n📝 NEXT STEPS:');
    console.log('   1. Store successful patterns in MongoDB workflow_actions');
    console.log('   2. Create utility to load and apply stored patterns');
    console.log('   3. Test on remaining target sites');
    console.log('   4. Integrate with main extraction pipeline');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (closeSession) {
      await closeSession();
    }
  }
}

if (require.main === module) {
  testSelectorDiscovery().catch(console.error);
}

module.exports = { testSelectorDiscovery };