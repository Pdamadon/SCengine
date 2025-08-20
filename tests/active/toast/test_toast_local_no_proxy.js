/**
 * Test Toast extractor locally without proxy 
 * To verify extraction logic works before dealing with Cloudflare
 */

require('dotenv').config();
const { chromium } = require('playwright');
const ToastExtractor = require('./src/extractors/ToastExtractor');
const fs = require('fs').promises;

async function testToastLocal() {
  console.log('🍜 Testing Toast Extractor Locally (No Proxy)');
  console.log('=' .repeat(60));
  console.log('⚠️  WARNING: This uses your real IP - only for testing!');
  console.log('=' .repeat(60));
  
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });
  
  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    
    // Test URL
    const testUrl = "https://www.toasttab.com/local/order/biang-biang-noodles-601-e-pike-st";
    
    console.log(`\n🎯 Testing: ${testUrl}`);
    console.log('-'.repeat(40));
    
    const extractor = new ToastExtractor();
    const startTime = Date.now();
    
    try {
      const menuData = await extractor.extract(page, testUrl);
      const duration = Date.now() - startTime;
      
      console.log(`\n✅ Extraction completed in ${duration}ms`);
      
      if (menuData.status === 'closed') {
        console.log(`⚠️ Restaurant closed: ${menuData.message}`);
      } else {
        console.log(`📂 Total items: ${menuData.itemCount}`);
        
        // Show sample items
        if (menuData.items && menuData.items.length > 0) {
          console.log('\n📋 Sample items:');
          menuData.items.slice(0, 5).forEach(item => {
            console.log(`  • ${item.name} (${item.category}): ${item.basePrice}`);
            if (item.modifiers && item.modifiers.length > 0) {
              console.log(`    ${item.modifiers.length} modifier groups`);
            }
          });
        }
      }
      
      // Save results
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `data/output/data/toast_local_test_${timestamp}.json`;
      
      await fs.writeFile(
        filename,
        JSON.stringify(menuData, null, 2)
      );
      
      console.log(`\n💾 Results saved to: ${filename}`);
      
    } catch (error) {
      console.error(`\n❌ Extraction failed: ${error.message}`);
      
      // Check if it's a Cloudflare block
      const pageContent = await page.content();
      if (pageContent.includes('cf-mitigated') || pageContent.includes('challenge')) {
        console.log('\n🛡️ Cloudflare Challenge Detected!');
        console.log('The site is protected by Cloudflare and requires solving a challenge.');
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
    console.log('\n✅ Test complete!');
  }
}

// Run test
testToastLocal().catch(console.error);