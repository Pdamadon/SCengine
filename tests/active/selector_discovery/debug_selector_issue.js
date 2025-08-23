#!/usr/bin/env node
/**
 * Debug Selector Issue
 * 
 * Simple script to see what's actually on the Glasswing page
 */
require('dotenv').config();
const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');

const TEST_URL = 'https://glasswingshop.com/products/7115-by-szeki-cocoon-dress-shirt-off-white';

async function debugSelectors() {
  console.log('🔍 Debug Selector Issue');
  console.log('========================');

  const browserManager = new BrowserManagerBrowserless();
  let closeSession;

  try {
    console.log('🌐 Creating browser session...');
    const { page, close } = await browserManager.createBrowser('stealth');
    closeSession = close;

    console.log('📄 Navigating to product page...');
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Check if page loaded correctly
    const title = await page.title();
    console.log(`📋 Page title: "${title}"`);

    // Get basic page info
    const pageInfo = await page.evaluate(() => {
      return {
        url: window.location.href,
        has_jquery: typeof window.$ !== 'undefined',
        has_shopify: typeof window.Shopify !== 'undefined',
        body_classes: document.body.className,
        all_select_count: document.querySelectorAll('select').length,
        all_form_count: document.querySelectorAll('form').length,
        select_names: Array.from(document.querySelectorAll('select')).map(s => s.name || s.id || 'unnamed'),
        forms: Array.from(document.querySelectorAll('form')).map(f => ({
          action: f.action,
          method: f.method,
          id: f.id,
          class: f.className
        }))
      };
    });

    console.log('\n📊 Page Analysis:');
    console.log(`   URL: ${pageInfo.url}`);
    console.log(`   jQuery: ${pageInfo.has_jquery ? '✅' : '❌'}`);
    console.log(`   Shopify: ${pageInfo.has_shopify ? '✅' : '❌'}`);
    console.log(`   Body classes: ${pageInfo.body_classes}`);
    console.log(`   Total selects: ${pageInfo.all_select_count}`);
    console.log(`   Total forms: ${pageInfo.all_form_count}`);
    console.log(`   Select names: ${pageInfo.select_names.join(', ')}`);

    // Look for all elements containing money/price patterns
    const priceElements = await page.evaluate(() => {
      const results = [];
      const allElements = document.querySelectorAll('*');
      
      allElements.forEach(el => {
        const text = el.textContent?.trim();
        if (text && (text.includes('$') || text.includes('USD') || /\d+\.\d+/.test(text))) {
          results.push({
            tag: el.tagName,
            class: el.className,
            id: el.id,
            text: text.substring(0, 50),
            selector: el.tagName.toLowerCase() + 
                     (el.id ? '#' + el.id : '') + 
                     (el.className ? '.' + el.className.split(' ').slice(0, 2).join('.') : '')
          });
        }
      });
      
      return results.slice(0, 10); // First 10 matches
    });

    console.log('\n💰 Elements with price-like content:');
    priceElements.forEach((el, i) => {
      console.log(`   ${i + 1}. ${el.selector} - "${el.text}"`);
    });

    // Look for all img elements
    const imageElements = await page.evaluate(() => {
      const results = [];
      const images = document.querySelectorAll('img');
      
      images.forEach(img => {
        results.push({
          src: img.src,
          alt: img.alt,
          class: img.className,
          selector: 'img' + (img.className ? '.' + img.className.split(' ').slice(0, 2).join('.') : '')
        });
      });
      
      return results.slice(0, 5); // First 5 images
    });

    console.log('\n📷 Image elements:');
    imageElements.forEach((img, i) => {
      console.log(`   ${i + 1}. ${img.selector} - ${img.alt || 'no alt'}`);
      console.log(`      src: ${img.src.split('/').pop()}`);
    });

    console.log('\n✅ Debug complete!');

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    if (closeSession) {
      await closeSession();
    }
  }
}

if (require.main === module) {
  debugSelectors();
}

module.exports = { debugSelectors };