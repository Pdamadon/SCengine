#!/usr/bin/env node

/**
 * Glasswing DOM Inspector
 * 
 * Investigates the actual DOM structure of Glasswing product pages
 * to find the correct selectors for price, images, and other fields
 */

require('dotenv').config();

const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const { logger } = require('./src/utils/logger');

const TEST_URL = 'https://glasswingshop.com/products/7115-by-szeki-cocoon-dress-shirt-off-white';

async function inspectGlasswingDOM() {
  console.log('🔍 Glasswing DOM Inspector');
  console.log('=========================\n');
  console.log(`🎯 Inspecting: ${TEST_URL}\n`);
  
  const browserManager = new BrowserManagerBrowserless();
  let closeSession;
  
  try {
    console.log('🌐 Creating browser session...');
    const { page, close } = await browserManager.createBrowser('stealth');
    closeSession = close;
    
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000); // Wait for dynamic content
    
    console.log('✅ Page loaded, inspecting DOM structure...\n');
    
    // 1. Find all elements that might contain price
    console.log('💰 PRICE ELEMENT INVESTIGATION');
    console.log('==============================');
    
    const priceElements = await page.evaluate(() => {
      const elements = [];
      
      // Look for elements containing dollar signs or price-like patterns
      const allElements = document.querySelectorAll('*');
      const pricePattern = /\$[\d,]+\.?\d*/;
      
      allElements.forEach(el => {
        const text = el.textContent?.trim();
        if (text && pricePattern.test(text)) {
          elements.push({
            tagName: el.tagName.toLowerCase(),
            className: el.className,
            id: el.id,
            textContent: text,
            selector: el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase(),
            parentClass: el.parentElement?.className,
            attributes: Array.from(el.attributes).map(attr => ({ name: attr.name, value: attr.value }))
          });
        }
      });
      
      return elements;
    });
    
    console.log(`Found ${priceElements.length} potential price elements:`);
    priceElements.forEach((el, i) => {
      console.log(`   ${i + 1}. <${el.tagName}> ${el.className ? `class="${el.className}"` : ''}`);
      console.log(`      Text: "${el.textContent}"`);
      console.log(`      Selector: ${el.selector}`);
      console.log(`      Parent: ${el.parentClass}`);
    });
    
    // 2. Find all product images
    console.log('\n📷 IMAGE ELEMENT INVESTIGATION');
    console.log('==============================');
    
    const imageElements = await page.evaluate(() => {
      const images = [];
      const imgElements = document.querySelectorAll('img');
      
      imgElements.forEach(img => {
        if (img.src && !img.src.includes('data:') && img.src.includes('product')) {
          images.push({
            src: img.src,
            alt: img.alt,
            className: img.className,
            id: img.id,
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
            parentClass: img.parentElement?.className,
            selector: img.className ? `.${img.className.split(' ')[0]}` : 'img'
          });
        }
      });
      
      return images;
    });
    
    console.log(`Found ${imageElements.length} product images:`);
    imageElements.slice(0, 5).forEach((img, i) => {
      console.log(`   ${i + 1}. ${img.src.split('/').pop()}`);
      console.log(`      Class: ${img.className || 'none'}`);
      console.log(`      Alt: ${img.alt || 'none'}`);
      console.log(`      Size: ${img.width}x${img.height}`);
      console.log(`      Parent: ${img.parentClass}`);
    });
    
    // 3. Look for structured data and meta tags
    console.log('\n📋 STRUCTURED DATA INVESTIGATION');
    console.log('=================================');
    
    const structuredData = await page.evaluate(() => {
      const data = {};
      
      // Meta tags
      const metaTags = document.querySelectorAll('meta');
      data.metaTags = Array.from(metaTags).map(meta => ({
        name: meta.name,
        property: meta.property,
        content: meta.content
      })).filter(meta => meta.content && (meta.name || meta.property));
      
      // JSON-LD
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      data.jsonLd = [];
      jsonLdScripts.forEach(script => {
        try {
          const parsed = JSON.parse(script.textContent);
          data.jsonLd.push(parsed);
        } catch (e) {
          // Skip invalid JSON
        }
      });
      
      return data;
    });
    
    console.log(`Meta tags with content: ${structuredData.metaTags.length}`);
    structuredData.metaTags.filter(meta => 
      meta.name?.includes('price') || 
      meta.property?.includes('price') || 
      meta.content?.includes('$')
    ).forEach(meta => {
      console.log(`   ${meta.name || meta.property}: "${meta.content}"`);
    });
    
    console.log(`\nJSON-LD scripts: ${structuredData.jsonLd.length}`);
    structuredData.jsonLd.forEach((data, i) => {
      console.log(`   ${i + 1}. Type: ${data['@type'] || 'unknown'}`);
      if (data.offers) {
        console.log(`      Price: ${JSON.stringify(data.offers)}`);
      }
      if (data.image) {
        console.log(`      Images: ${Array.isArray(data.image) ? data.image.length : 1} found`);
      }
    });
    
    // 4. Look for form elements and interactive components
    console.log('\n🛒 INTERACTIVE ELEMENTS INVESTIGATION');
    console.log('====================================');
    
    const interactiveElements = await page.evaluate(() => {
      const elements = {};
      
      // Forms
      elements.forms = Array.from(document.querySelectorAll('form')).map(form => ({
        id: form.id,
        className: form.className,
        action: form.action,
        method: form.method
      }));
      
      // Buttons
      elements.buttons = Array.from(document.querySelectorAll('button')).map(btn => ({
        type: btn.type,
        className: btn.className,
        textContent: btn.textContent?.trim(),
        disabled: btn.disabled
      }));
      
      // Inputs
      elements.inputs = Array.from(document.querySelectorAll('input')).map(input => ({
        type: input.type,
        name: input.name,
        className: input.className,
        placeholder: input.placeholder
      }));
      
      // Select dropdowns
      elements.selects = Array.from(document.querySelectorAll('select')).map(select => ({
        name: select.name,
        className: select.className,
        options: Array.from(select.options).map(opt => opt.textContent?.trim())
      }));
      
      return elements;
    });
    
    console.log(`Forms: ${interactiveElements.forms.length}`);
    interactiveElements.forms.forEach(form => {
      console.log(`   Action: ${form.action || 'none'}, Method: ${form.method || 'GET'}`);
    });
    
    console.log(`\nButtons: ${interactiveElements.buttons.length}`);
    interactiveElements.buttons.forEach(btn => {
      console.log(`   "${btn.textContent}" (${btn.type || 'button'})`);
    });
    
    console.log(`\nSelect dropdowns: ${interactiveElements.selects.length}`);
    interactiveElements.selects.forEach(select => {
      console.log(`   ${select.name || 'unnamed'}: ${select.options.length} options`);
      select.options.slice(0, 3).forEach(opt => console.log(`      - ${opt}`));
    });
    
    // 5. Test improved selectors based on findings
    console.log('\n🧪 TESTING IMPROVED SELECTORS');
    console.log('=============================');
    
    // Try to extract price with better selectors
    const testSelectors = {
      price: [
        'script[type="application/ld+json"]', // Try JSON-LD
        '.money',
        '.price-regular',
        '.price-current',
        '[data-price]',
        'meta[property="product:price:amount"]'
      ],
      images: [
        '.product__media img',
        '.product-image img', 
        'img[src*="product"]',
        '.media img',
        '[data-media] img'
      ]
    };
    
    for (const [field, selectors] of Object.entries(testSelectors)) {
      console.log(`\n${field.toUpperCase()}:`);
      
      for (const selector of selectors) {
        try {
          if (selector.includes('script')) {
            // Special handling for JSON-LD
            const jsonData = await page.evaluate(() => {
              const scripts = document.querySelectorAll('script[type="application/ld+json"]');
              for (const script of scripts) {
                try {
                  const data = JSON.parse(script.textContent);
                  if (data.offers && data.offers.price) {
                    return data.offers.price;
                  }
                  if (data['@type'] === 'Product' && data.offers) {
                    return data.offers;
                  }
                } catch (e) {
                  continue;
                }
              }
              return null;
            });
            
            if (jsonData) {
              console.log(`   ✅ ${selector}: Found structured data`);
              console.log(`      Value: ${JSON.stringify(jsonData)}`);
            } else {
              console.log(`   ❌ ${selector}: No price in JSON-LD`);
            }
          } else if (field === 'images') {
            const count = await page.$$eval(selector, elements => elements.length);
            if (count > 0) {
              console.log(`   ✅ ${selector}: ${count} images found`);
            } else {
              console.log(`   ❌ ${selector}: No images`);
            }
          } else {
            const value = await page.$eval(selector, el => el.textContent?.trim() || el.getAttribute('content'));
            if (value) {
              console.log(`   ✅ ${selector}: "${value}"`);
            } else {
              console.log(`   ❌ ${selector}: Empty`);
            }
          }
        } catch (e) {
          console.log(`   ❌ ${selector}: Not found`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('🎯 RECOMMENDED SELECTORS FOR GLASSWING');
    console.log('='.repeat(50));
    
    console.log('\nBased on investigation, try these selectors:');
    console.log('💰 Price: JSON-LD structured data or .money class');
    console.log('📷 Images: .product__media img or img[src*="product"]');
    console.log('📝 Description: Look for .product-description or product JSON-LD');
    
  } catch (error) {
    console.error('❌ Investigation failed:', error);
  } finally {
    if (closeSession) {
      await closeSession();
    }
  }
}

if (require.main === module) {
  inspectGlasswingDOM().catch(console.error);
}

module.exports = { inspectGlasswingDOM };