#!/usr/bin/env node

require('dotenv').config();

const BrowserManagerBrowserless = require('../../src/common/browser/managers/BrowserManagerBrowserless');
const { logger } = require('../../src/utils/logger');

async function testPaginationFix() {
  console.log('🧪 Testing Pagination Navigation Fix');
  console.log('====================================\n');

  const browserManager = new BrowserManagerBrowserless({
    logger: logger,
    maxConcurrentPages: 1,
    browserTimeout: 30000
  });

  try {
    const { page, close } = await browserManager.createBrowser('stealth');
    
    console.log('📄 Page 1: Navigating to first page...');
    await page.goto('https://shopfigandwillow.com/collections/tops', { 
      waitUntil: 'domcontentloaded', 
      timeout: 30000 
    });
    await page.waitForTimeout(3000);
    
    // Extract products from page 1
    const page1Products = await extractProducts(page);
    console.log(`Page 1: Found ${page1Products.length} unique products`);
    console.log(`Sample: ${page1Products.slice(0, 3).join(', ')}\n`);
    
    // Find next page URL
    const nextPageUrl = await findNextPageUrl(page);
    if (!nextPageUrl) {
      console.log('❌ No next page found - test failed');
      return false;
    }
    
    console.log(`🔗 Next page URL detected: ${nextPageUrl}\n`);
    
    console.log('📄 Page 2: Navigating to second page...');
    const fullNextUrl = new URL(nextPageUrl, page.url()).toString();
    await page.goto(fullNextUrl, { 
      waitUntil: 'domcontentloaded', 
      timeout: 30000 
    });
    await page.waitForTimeout(3000);
    
    // Extract products from page 2
    const page2Products = await extractProducts(page);
    console.log(`Page 2: Found ${page2Products.length} unique products`);
    console.log(`Sample: ${page2Products.slice(0, 3).join(', ')}\n`);
    
    // Check if we got different products
    const page1Set = new Set(page1Products);
    const page2Set = new Set(page2Products);
    const overlap = page1Products.filter(product => page2Set.has(product));
    const uniqueToPage2 = page2Products.filter(product => !page1Set.has(product));
    
    console.log('📊 Pagination Analysis:');
    console.log('======================');
    console.log(`Products overlap: ${overlap.length}/${page1Products.length} (${Math.round(100 * overlap.length / page1Products.length)}%)`);
    console.log(`Unique to page 2: ${uniqueToPage2.length}`);
    
    if (uniqueToPage2.length > 0) {
      console.log('✅ SUCCESS: Pagination working - found new products on page 2!');
      console.log(`New products: ${uniqueToPage2.slice(0, 3).join(', ')}`);
      return true;
    } else {
      console.log('❌ FAIL: Same products on both pages - pagination broken');
      return false;
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    return false;
  }
}

async function extractProducts(page) {
  try {
    const products = await page.$$eval('a[href*="/products/"]', links => 
      links.map(link => link.href)
    );
    return [...new Set(products)]; // Deduplicate
  } catch (error) {
    console.warn('Error extracting products:', error.message);
    return [];
  }
}

async function findNextPageUrl(page) {
  const selectors = [
    'a[rel="next"]',
    'a[href*="page=2"]',
    '.pagination .next a',
    'a[aria-label*="next"]'
  ];
  
  for (const selector of selectors) {
    try {
      const nextLink = await page.$(selector);
      if (nextLink) {
        const href = await nextLink.getAttribute('href');
        if (href && !href.includes('#')) {
          return href;
        }
      }
    } catch (e) {
      // Try next selector
    }
  }
  
  return null;
}

// Run the test
if (require.main === module) {
  testPaginationFix()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test crashed:', error);
      process.exit(1);
    });
}

module.exports = { testPaginationFix };