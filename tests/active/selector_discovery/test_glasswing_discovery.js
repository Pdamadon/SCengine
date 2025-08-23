#!/usr/bin/env node

/**
 * Test Glasswing Selector Discovery
 * 
 * Quick test of the universal selector discovery on just Glasswing
 */

require('dotenv').config();

const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const SelectorDiscovery = require('./src/common/SelectorDiscovery');
const { logger } = require('./src/utils/logger');

const TEST_URL = 'https://glasswingshop.com/products/7115-by-szeki-cocoon-dress-shirt-off-white';

async function testGlasswingDiscovery() {
  console.log('🔬 Glasswing Selector Discovery Test');
  console.log('=====================================\n');

  const browserManager = new BrowserManagerBrowserless();
  const discovery = new SelectorDiscovery(logger);
  let closeSession;

  try {
    console.log('🌐 Creating browser session...');
    const { page, close } = await browserManager.createBrowser('stealth');
    closeSession = close;

    console.log('📄 Loading Glasswing product page...');
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    console.log('🔍 Running selector discovery...');
    const pattern = await discovery.discoverPatterns(page, TEST_URL);
    
    // Display results
    console.log('\n📊 DISCOVERY RESULTS');
    console.log('====================');
    console.log(`Platform: ${pattern.platform}`);
    console.log(`Confidence: ${pattern.confidence}`);
    console.log(`Error: ${pattern.error || 'None'}`);

    if (pattern.selectors) {
      console.log('\n🎛️ VARIANT CONTROLS:');
      if (pattern.selectors.variant_groups?.length > 0) {
        pattern.selectors.variant_groups.forEach((group, i) => {
          console.log(`   ${i + 1}. ${group.name}: ${group.selector}`);
          console.log(`      Type: ${group.type}`);
          console.log(`      Options: ${group.options?.length || 0}`);
          if (group.options?.length > 0) {
            console.log(`      Sample options: ${group.options.slice(0, 3).map(o => `"${o.text}"`).join(', ')}`);
          }
        });
      } else {
        console.log('   No variant groups found');
      }

      console.log('\n🔧 OTHER SELECTORS:');
      console.log(`   Cart Button: ${pattern.selectors.cart_button || 'Not found'}`);
      console.log(`   Price: ${pattern.selectors.price || 'Not found'}`);
      console.log(`   Main Image: ${pattern.selectors.main_image || 'Not found'}`);
    }

    if (pattern.interaction_evidence) {
      console.log('\n🧪 INTERACTION TESTS:');
      Object.entries(pattern.interaction_evidence).forEach(([group, evidence]) => {
        console.log(`\n   ${group}:`);
        if (evidence.error) {
          console.log(`      ❌ Error: ${evidence.error}`);
        } else if (evidence.changes_detected) {
          const changes = evidence.changes_detected;
          console.log(`      Cart Button: ${changes.cart_button_changed ? '✅ CHANGED' : '❌ No change'}`);
          console.log(`      Price: ${changes.price_changed ? '✅ CHANGED' : '❌ No change'}`);
          console.log(`      Hidden Inputs: ${changes.hidden_inputs_changed ? '✅ CHANGED' : '❌ No change'}`);
          console.log(`      Stock Text: ${changes.stock_text_changed ? '✅ CHANGED' : '❌ No change'}`);
          
          if (changes.cart_button_changed) {
            const before = evidence.before_state?.cart_button;
            const after = evidence.after_state?.cart_button;
            if (before && after) {
              console.log(`         Before: "${before.text}" (enabled: ${before.clickable})`);
              console.log(`         After:  "${after.text}" (enabled: ${after.clickable})`);
            }
          }
        }
      });
    }

    // Save results
    const fs = require('fs').promises;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `glasswing_discovery_${timestamp}.json`;
    await fs.writeFile(filename, JSON.stringify(pattern, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);

    console.log('\n✅ Discovery test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (closeSession) {
      await closeSession();
    }
  }
}

if (require.main === module) {
  testGlasswingDiscovery().catch(console.error);
}

module.exports = { testGlasswingDiscovery };