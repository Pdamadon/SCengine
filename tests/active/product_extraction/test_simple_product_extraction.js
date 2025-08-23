#!/usr/bin/env node

/**
 * Simple Product Extraction Test
 * 
 * Tests basic product extraction on a single product page using BrowserManagerBrowserless
 * No complex intelligence systems - just direct DOM extraction with logging
 */

require('dotenv').config();

const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const { logger } = require('./src/utils/logger');

// Test with Glasswing product
const TEST_URL = 'https://glasswingshop.com/products/7115-by-szeki-cocoon-dress-shirt-off-white';

async function testSimpleProductExtraction() {
  console.log('🧪 Simple Product Extraction Test');
  console.log('=================================\n');
  console.log(`🎯 Testing: ${TEST_URL}\n`);
  
  const browserManager = new BrowserManagerBrowserless();
  
  let closeSession;
  
  try {
    // Create browser session
    console.log('🌐 Creating browser session...');
    const { page, close } = await browserManager.createBrowser('stealth');
    closeSession = close;
    
    // Navigate to product page
    console.log('📄 Navigating to product page...');
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
    
    // Wait for content to load
    await page.waitForTimeout(2000);
    
    console.log('✅ Page loaded successfully\n');
    
    // Test basic extraction strategies
    const extractionResults = {
      url: TEST_URL,
      extraction_time: Date.now(),
      fields: {}
    };
    
    // Strategy 1: JSON-LD Structured Data (Primary)
    console.log('1️⃣ Testing JSON-LD Structured Data');
    console.log('===================================');
    
    // Extract from JSON-LD (most reliable for Glasswing)
    const jsonLdData = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (data['@type'] === 'Product') {
            return data;
          }
        } catch (e) {
          continue;
        }
      }
      return null;
    });
    
    if (jsonLdData) {
      console.log('   ✅ Found product JSON-LD data');
      
      // Extract structured data fields
      if (jsonLdData.name) {
        extractionResults.fields.title = {
          value: jsonLdData.name,
          selector: 'script[type="application/ld+json"]',
          strategy: 'json_ld'
        };
        console.log(`   📝 Title: "${jsonLdData.name}"`);
      }
      
      if (jsonLdData.offers) {
        const offer = Array.isArray(jsonLdData.offers) ? jsonLdData.offers[0] : jsonLdData.offers;
        if (offer.price) {
          extractionResults.fields.price = {
            value: `${offer.priceCurrency || '$'}${offer.price}`,
            numeric: parseFloat(offer.price),
            currency: offer.priceCurrency || 'USD',
            selector: 'script[type="application/ld+json"]',
            strategy: 'json_ld'
          };
          console.log(`   💰 Price: ${offer.priceCurrency || '$'}${offer.price}`);
        }
        
        if (offer.availability) {
          const availability = offer.availability.includes('InStock') ? 'in_stock' : 'out_of_stock';
          extractionResults.fields.availability = {
            value: availability,
            raw: offer.availability,
            selector: 'script[type="application/ld+json"]',
            strategy: 'json_ld'
          };
          console.log(`   📦 Availability: ${availability}`);
        }
      }
      
      if (jsonLdData.image) {
        const images = Array.isArray(jsonLdData.image) ? jsonLdData.image : [jsonLdData.image];
        extractionResults.fields.images = {
          value: images.map(url => ({ src: url, type: 'structured_data' })),
          count: images.length,
          selector: 'script[type="application/ld+json"]',
          strategy: 'json_ld'
        };
        console.log(`   📷 Images: ${images.length} found in structured data`);
      }
      
      if (jsonLdData.description) {
        extractionResults.fields.description = {
          value: jsonLdData.description,
          selector: 'script[type="application/ld+json"]',
          strategy: 'json_ld'
        };
        console.log(`   📋 Description: Found in structured data`);
      }
      
      if (jsonLdData.brand) {
        extractionResults.fields.brand = {
          value: jsonLdData.brand.name || jsonLdData.brand,
          selector: 'script[type="application/ld+json"]',
          strategy: 'json_ld'
        };
        console.log(`   🏷️  Brand: ${jsonLdData.brand.name || jsonLdData.brand}`);
      }
    } else {
      console.log('   ❌ No product JSON-LD found');
    }
    
    // Strategy 2: DOM Selectors (Fallback)
    console.log('\n2️⃣ Testing DOM Selectors (Fallback)');
    console.log('===================================');
    
    // Only test these if JSON-LD didn't provide the data
    const titleSelectors = [
      'h1',
      '.product__title',
      '.product-title',
      '.product-name'
    ];
    
    // Only try DOM selectors for missing fields
    if (!extractionResults.fields.title) {
      console.log('🏷️  Extracting title from DOM...');
      for (const selector of titleSelectors) {
        try {
          const title = await page.$eval(selector, el => el.textContent?.trim());
          if (title && title.length > 0) {
            extractionResults.fields.title = {
              value: title,
              selector: selector,
              strategy: 'dom_fallback'
            };
            console.log(`   ✅ Found with "${selector}": "${title}"`);
            break;
          }
        } catch (e) {
          console.log(`   ❌ Failed with "${selector}"`);
        }
      }
    } else {
      console.log('🏷️  Title already extracted from JSON-LD');
    }
    
    // Images from DOM if not in JSON-LD
    if (!extractionResults.fields.images) {
      console.log('\n📷 Extracting images from DOM...');
      const imageSelectors = [
        '.product__media img',
        '.product-image img',
        'img[src*="product"]',
        '.media img'
      ];
      
      for (const selector of imageSelectors) {
        try {
          const images = await page.$$eval(selector, elements => 
            elements.map(img => ({
              src: img.src,
              alt: img.alt || '',
              width: img.naturalWidth || img.width,
              height: img.naturalHeight || img.height
            })).filter(img => img.src && !img.src.includes('data:') && img.src.includes('product'))
          );
          
          if (images.length > 0) {
            extractionResults.fields.images = {
              value: images,
              count: images.length,
              selector: selector,
              strategy: 'dom_fallback'
            };
            console.log(`   ✅ Found ${images.length} images with "${selector}"`);
            images.slice(0, 3).forEach((img, i) => {
              console.log(`      ${i + 1}. ${img.src.split('/').pop()} (${img.width}x${img.height})`);
            });
            break;
          }
        } catch (e) {
          console.log(`   ❌ Failed with "${selector}"`);
        }
      }
    } else {
      console.log('📷 Images already extracted from JSON-LD');
    }
    
    // Strategy 3: Page Analysis & Additional Data  
    console.log('\n3️⃣ Page Analysis & Additional Data');
    console.log('==================================');
    
    // Page structure analysis and e-commerce indicators
    
    try {
      const pageAnalysis = await page.evaluate(() => {
        const analysis = {
          total_elements: document.querySelectorAll('*').length,
          images: document.querySelectorAll('img').length,
          forms: document.querySelectorAll('form').length,
          buttons: document.querySelectorAll('button').length,
          inputs: document.querySelectorAll('input').length,
          links: document.querySelectorAll('a').length
        };
        
        // Look for e-commerce indicators
        const bodyText = document.body.innerText.toLowerCase();
        analysis.ecommerce_indicators = {
          add_to_cart: bodyText.includes('add to cart'),
          buy_now: bodyText.includes('buy now'),
          price_mentioned: /\$[\d,]+\.?\d*/.test(bodyText),
          size_options: bodyText.includes('size'),
          color_options: bodyText.includes('color'),
          quantity: bodyText.includes('quantity')
        };
        
        return analysis;
      });
      
      console.log(`   📊 Page elements: ${pageAnalysis.total_elements} total`);
      console.log(`   📷 Images: ${pageAnalysis.images}`);
      console.log(`   🔘 Buttons: ${pageAnalysis.buttons}`);
      console.log(`   🔗 Links: ${pageAnalysis.links}`);
      
      console.log(`   🛒 E-commerce indicators:`);
      Object.entries(pageAnalysis.ecommerce_indicators).forEach(([key, value]) => {
        console.log(`      ${value ? '✅' : '❌'} ${key.replace(/_/g, ' ')}`);
      });
      
      extractionResults.fields.page_analysis = {
        value: pageAnalysis,
        strategy: 'page_analysis'
      };
      
    } catch (error) {
      console.log(`   ❌ Page analysis failed: ${error.message}`);
    }
    
    // Calculate extraction success
    console.log('\n' + '='.repeat(50));
    console.log('📊 EXTRACTION RESULTS SUMMARY');
    console.log('='.repeat(50));
    
    const extractedFields = Object.keys(extractionResults.fields);
    const requiredFields = ['title', 'price', 'images'];
    const successfulRequired = requiredFields.filter(field => extractedFields.includes(field));
    
    console.log(`\n🎯 EXTRACTION SUCCESS:`);
    console.log(`   Required fields extracted: ${successfulRequired.length}/${requiredFields.length}`);
    console.log(`   Total fields extracted: ${extractedFields.length}`);
    console.log(`   Success rate: ${((successfulRequired.length / requiredFields.length) * 100).toFixed(1)}%`);
    
    console.log(`\n✅ EXTRACTED FIELDS:`);
    extractedFields.forEach(field => {
      const data = extractionResults.fields[field];
      console.log(`   ${field}: ${data.strategy} (${data.selector || 'N/A'})`);
      if (field === 'title' || field === 'price') {
        console.log(`      Value: "${data.value}"`);
      } else if (field === 'images') {
        console.log(`      Count: ${data.count} images`);
      }
    });
    
    const missingFields = requiredFields.filter(field => !extractedFields.includes(field));
    if (missingFields.length > 0) {
      console.log(`\n❌ MISSING REQUIRED FIELDS:`);
      missingFields.forEach(field => {
        console.log(`   ${field}: No working selector found`);
      });
    }
    
    // Save results
    const fs = require('fs').promises;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `simple_extraction_${timestamp}.json`;
    await fs.writeFile(filename, JSON.stringify(extractionResults, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);
    
    console.log(`\n🔧 NEXT STEPS:`);
    if (successfulRequired.length >= 2) {
      console.log(`   ✅ Basic extraction working! Ready to build on this foundation`);
      console.log(`   1. Create reusable extraction utilities from working selectors`);
      console.log(`   2. Test on more Glasswing products`);
      console.log(`   3. Build site-specific patterns`);
    } else {
      console.log(`   ⚠️  Need to improve selector strategies`);
      console.log(`   1. Investigate page structure more deeply`);
      console.log(`   2. Try alternative selector patterns`);
      console.log(`   3. Add browser console debugging`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (closeSession) {
      await closeSession();
    }
  }
}

if (require.main === module) {
  testSimpleProductExtraction().catch(console.error);
}

module.exports = { testSimpleProductExtraction };