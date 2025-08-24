#!/usr/bin/env node

require('dotenv').config();

const BrowserManagerBrowserless = require('../../src/common/browser/managers/BrowserManagerBrowserless');
const { logger } = require('../../src/utils/logger');

async function debugGlasswingPagination() {
  console.log('🔍 Debugging Glasswing Pagination Structure');
  console.log('==========================================\n');

  const glasswingUrl = 'https://glasswingshop.com/collections/mens-collection?filter.p.tag=PANTS';
  console.log(`Inspecting: ${glasswingUrl}\n`);

  const browserManager = new BrowserManagerBrowserless({
    logger: logger,
    maxConcurrentPages: 1,
    browserTimeout: 30000
  });

  try {
    const { page, close } = await browserManager.createBrowser('stealth');
    
    await page.goto(glasswingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Check for various pagination indicators
    console.log('🔍 Looking for pagination elements...\n');
    
    // Check for numbered pagination
    const numberedPagination = await page.$$('.pagination a, .page-numbers a, [class*="pagination"] a');
    console.log(`Numbered pagination links found: ${numberedPagination.length}`);
    
    if (numberedPagination.length > 0) {
      const paginationTexts = await page.$$eval('.pagination a, .page-numbers a, [class*="pagination"] a', 
        els => els.map(el => ({ text: el.textContent.trim(), href: el.href })).slice(0, 5)
      );
      console.log('Sample pagination links:', paginationTexts);
    }
    
    // Check for next buttons
    const nextButtons = await page.$$('a[rel="next"], .next-page, button[aria-label*="next"], a:has-text("Next")');
    console.log(`Next buttons found: ${nextButtons.length}`);
    
    // Check for load more buttons  
    const loadMoreButtons = await page.$$('button[class*="load-more"], button[class*="show-more"], .load-more-button');
    console.log(`Load more buttons found: ${loadMoreButtons.length}`);
    
    // Check the next button we found
    console.log('\n🔍 Analyzing the next button found...');
    if (nextButtons.length > 0) {
      const nextButtonInfo = await page.$eval('a[rel="next"], .next-page, button[aria-label*="next"], a:has-text("Next")', el => ({
        tag: el.tagName,
        text: el.textContent?.trim() || '',
        href: el.href || '',
        className: el.className || '',
        id: el.id || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        rel: el.getAttribute('rel') || ''
      }));
      
      console.log('Next button details:', nextButtonInfo);
    }
    
    // Check total product count
    console.log('\n📦 Product count analysis...');
    const productLinks = await page.$$eval('a[href*="/products/"]', els => els.length);
    console.log(`Total product links found: ${productLinks}`);
    
    // Look for any indication of more products
    const moreIndicators = await page.$$eval('*', els => {
      const indicators = [];
      for (const el of els) {
        const text = el.textContent?.toLowerCase() || '';
        if (text.includes('showing') && (text.includes('of') || text.includes('results'))) {
          indicators.push(text.trim());
        }
      }
      return indicators.slice(0, 3);
    });
    
    if (moreIndicators.length > 0) {
      console.log('Product count indicators found:');
      moreIndicators.forEach(indicator => console.log(`  "${indicator}"`));
    } else {
      console.log('No "showing X of Y" indicators found');
    }
    
    // Check URL for pagination parameters
    console.log('\n🔗 URL analysis...');
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);
    
    if (currentUrl.includes('page=') || currentUrl.includes('offset=') || currentUrl.includes('cursor=')) {
      console.log('✅ URL contains pagination parameters');
    } else {
      console.log('❌ No pagination parameters in URL');
    }
    
    await close();
    
    // Summary
    console.log('\n📋 SUMMARY:');
    console.log('===========');
    if (numberedPagination.length > 0 || nextButtons.length > 0 || loadMoreButtons.length > 0) {
      console.log('🔄 Pagination elements detected - should have multiple pages');
    } else {
      console.log('📄 No pagination elements found - single page confirmed');
    }
    
    console.log(`📦 Found ${productLinks} product links total`);
    
    return true;
    
  } catch (error) {
    console.error('💥 Debug failed:', error.message);
    return false;
  }
}

// Run the debug
if (require.main === module) {
  debugGlasswingPagination()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Debug crashed:', error);
      process.exit(1);
    });
}

module.exports = { debugGlasswingPagination };