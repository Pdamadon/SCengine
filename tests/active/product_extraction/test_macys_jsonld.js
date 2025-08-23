#!/usr/bin/env node

/**
 * Macy's JSON-LD Parser Test
 * 
 * Tests JSON-LD parsing on Macy's product page with headful browser
 * to see what structured data is available compared to Glasswing
 */

require('dotenv').config();

const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const { logger } = require('./src/utils/logger');
const fs = require('fs').promises;

const MACYS_URL = 'https://www.macys.com/shop/product/boss-by-hugo-boss-mens-titanium-runner-sneakers?ID=20866230&swatchColor=Black';

async function testMacysJsonLd() {
  console.log('🛍️ Macy\'s JSON-LD Parser Test');
  console.log('===============================\n');
  console.log(`🎯 Testing: ${MACYS_URL}\n`);
  
  const browserManager = new BrowserManagerBrowserless();
  let closeSession;
  
  try {
    console.log('🌐 Creating browser session (headful)...');
    const { page, close } = await browserManager.createBrowser('stealth', {
      headless: false // Set to headful
    });
    closeSession = close;
    
    await page.goto(MACYS_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000); // Wait longer for Macy's dynamic content
    
    console.log('✅ Macy\'s page loaded\n');
    
    // 1. Extract all JSON-LD scripts
    console.log('1️⃣ JSON-LD Data Extraction');
    console.log('===========================');
    
    const allJsonLd = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      const jsonData = [];
      
      scripts.forEach((script, index) => {
        try {
          const data = JSON.parse(script.textContent);
          jsonData.push({
            index: index,
            type: data['@type'],
            context: data['@context'],
            data: data
          });
        } catch (e) {
          jsonData.push({
            index: index,
            type: 'parse_error',
            error: e.message,
            content: script.textContent.substring(0, 200) + '...'
          });
        }
      });
      
      return jsonData;
    });
    
    console.log(`Found ${allJsonLd.length} JSON-LD scripts:\n`);
    
    allJsonLd.forEach((item, i) => {
      console.log(`Script ${i + 1}:`);
      console.log(`   Type: ${item.type}`);
      console.log(`   Context: ${item.context || 'none'}`);
      
      if (item.type === 'parse_error') {
        console.log(`   ❌ Parse Error: ${item.error}`);
        console.log(`   Content preview: ${item.content}`);
      } else {
        console.log(`   ✅ Parsed successfully`);
        
        // Show key properties for each type
        if (item.data) {
          const keys = Object.keys(item.data).filter(key => !key.startsWith('@')).slice(0, 5);
          console.log(`   Properties: ${keys.join(', ')}`);
        }
      }
      console.log('');
    });
    
    // 2. Look for Product-specific data
    console.log('2️⃣ Product Data Analysis');
    console.log('========================');
    
    const productData = allJsonLd.find(item => item.type === 'Product');
    
    if (productData) {
      console.log('✅ Found Product JSON-LD:');
      console.log(`   Name: ${productData.data.name}`);
      console.log(`   Brand: ${productData.data.brand?.name || productData.data.brand}`);
      console.log(`   Description: ${productData.data.description ? 'Present' : 'Missing'}`);
      
      if (productData.data.offers) {
        const offers = Array.isArray(productData.data.offers) ? productData.data.offers : [productData.data.offers];
        console.log(`   Offers: ${offers.length} variant(s)`);
        offers.slice(0, 3).forEach((offer, i) => {
          console.log(`      ${i + 1}. ${offer.priceCurrency || '$'}${offer.price} - ${offer.availability?.split('/').pop() || 'unknown'}`);
          if (offer.sku) console.log(`         SKU: ${offer.sku}`);
          if (offer.name) console.log(`         Name: ${offer.name}`);
        });
      }
      
      if (productData.data.image) {
        const images = Array.isArray(productData.data.image) ? productData.data.image : [productData.data.image];
        console.log(`   Images: ${images.length} image(s)`);
        images.slice(0, 3).forEach((img, i) => {
          console.log(`      ${i + 1}. ${typeof img === 'string' ? img : img.url || JSON.stringify(img)}`);
        });
      }
      
      // Check for additional properties
      console.log(`\n   Additional Properties:`);
      const additionalProps = ['color', 'size', 'model', 'mpn', 'gtin', 'category', 'aggregateRating'];
      additionalProps.forEach(prop => {
        if (productData.data[prop]) {
          console.log(`      ${prop}: ${JSON.stringify(productData.data[prop])}`);
        }
      });
      
    } else {
      console.log('❌ No Product JSON-LD found');
    }
    
    // 3. Check for other e-commerce relevant structured data
    console.log('\n3️⃣ Other Structured Data');
    console.log('========================');
    
    const otherData = allJsonLd.filter(item => 
      item.type !== 'Product' && 
      item.type !== 'parse_error' && 
      ['Organization', 'WebSite', 'BreadcrumbList', 'ItemList'].includes(item.type)
    );
    
    if (otherData.length > 0) {
      otherData.forEach(item => {
        console.log(`   ${item.type}:`);
        if (item.type === 'BreadcrumbList' && item.data.itemListElement) {
          console.log(`      Breadcrumb: ${item.data.itemListElement.map(el => el.name).join(' > ')}`);
        } else if (item.type === 'Organization') {
          console.log(`      Name: ${item.data.name}`);
          console.log(`      URL: ${item.data.url}`);
        } else if (item.type === 'WebSite') {
          console.log(`      URL: ${item.data.url}`);
          if (item.data.potentialAction) {
            console.log(`      Search: ${item.data.potentialAction.target ? 'Available' : 'Not available'}`);
          }
        }
      });
    } else {
      console.log('   No other relevant structured data found');
    }
    
    // 4. Check DOM for fallback data
    console.log('\n4️⃣ DOM Fallback Data Check');
    console.log('==========================');
    
    const domData = await page.evaluate(() => {
      const fallbackData = {};
      
      // Title
      const title = document.querySelector('h1')?.textContent?.trim() ||
                   document.querySelector('.product-title')?.textContent?.trim() ||
                   document.querySelector('[data-auto="product-title"]')?.textContent?.trim();
      if (title) fallbackData.title = title;
      
      // Price
      const price = document.querySelector('.price')?.textContent?.trim() ||
                   document.querySelector('[data-auto="product-price"]')?.textContent?.trim() ||
                   document.querySelector('.selling-price')?.textContent?.trim();
      if (price) fallbackData.price = price;
      
      // Images
      const images = document.querySelectorAll('img[src*="product"], img[alt*="product"]');
      fallbackData.imageCount = images.length;
      
      // Brand
      const brand = document.querySelector('.brand')?.textContent?.trim() ||
                   document.querySelector('[data-auto="product-brand"]')?.textContent?.trim();
      if (brand) fallbackData.brand = brand;
      
      // Meta tags
      const metaTags = {};
      document.querySelectorAll('meta[property^="og:"], meta[name^="product:"]').forEach(meta => {
        const key = meta.getAttribute('property') || meta.getAttribute('name');
        const value = meta.getAttribute('content');
        if (key && value) metaTags[key] = value;
      });
      fallbackData.metaTags = metaTags;
      
      return fallbackData;
    });
    
    console.log('DOM Fallback Data:');
    Object.entries(domData).forEach(([key, value]) => {
      if (key === 'metaTags') {
        console.log(`   Meta Tags: ${Object.keys(value).length} found`);
        Object.entries(value).slice(0, 5).forEach(([metaKey, metaValue]) => {
          console.log(`      ${metaKey}: ${metaValue}`);
        });
      } else {
        console.log(`   ${key}: ${value}`);
      }
    });
    
    // 5. Compare extraction methods
    console.log('\n5️⃣ Extraction Method Comparison');
    console.log('===============================');
    
    const comparison = {
      jsonld: {
        available: !!productData,
        fields: productData ? {
          name: !!productData.data.name,
          price: !!productData.data.offers,
          images: !!productData.data.image,
          brand: !!productData.data.brand,
          description: !!productData.data.description,
          variants: productData.data.offers ? (Array.isArray(productData.data.offers) ? productData.data.offers.length > 1 : false) : false
        } : {}
      },
      dom: {
        available: Object.keys(domData).length > 1, // More than just imageCount
        fields: {
          name: !!domData.title,
          price: !!domData.price,
          images: domData.imageCount > 0,
          brand: !!domData.brand
        }
      },
      meta: {
        available: Object.keys(domData.metaTags || {}).length > 0,
        fields: domData.metaTags || {}
      }
    };
    
    console.log('Method Comparison:');
    console.log(`   JSON-LD: ${comparison.jsonld.available ? '✅ Available' : '❌ Not Available'}`);
    if (comparison.jsonld.available) {
      Object.entries(comparison.jsonld.fields).forEach(([field, hasData]) => {
        console.log(`      ${field}: ${hasData ? '✅' : '❌'}`);
      });
    }
    
    console.log(`   DOM: ${comparison.dom.available ? '✅ Available' : '❌ Not Available'}`);
    Object.entries(comparison.dom.fields).forEach(([field, hasData]) => {
      console.log(`      ${field}: ${hasData ? '✅' : '❌'}`);
    });
    
    console.log(`   Meta Tags: ${comparison.meta.available ? '✅ Available' : '❌ Not Available'}`);
    if (comparison.meta.available) {
      console.log(`      Tags found: ${Object.keys(comparison.meta.fields).length}`);
    }
    
    // 6. Summary and Recommendations
    console.log('\n' + '='.repeat(60));
    console.log('📊 MACY\'S EXTRACTION ANALYSIS');
    console.log('='.repeat(60));
    
    const results = {
      url: MACYS_URL,
      timestamp: new Date().toISOString(),
      
      jsonld_analysis: {
        total_scripts: allJsonLd.length,
        has_product_data: !!productData,
        product_completeness: comparison.jsonld.fields
      },
      
      fallback_analysis: {
        dom_available: comparison.dom.available,
        meta_available: comparison.meta.available,
        dom_fields: comparison.dom.fields,
        meta_fields: comparison.meta.fields
      },
      
      recommendation: null
    };
    
    // Generate recommendation
    if (comparison.jsonld.available) {
      const jsonldScore = Object.values(comparison.jsonld.fields).filter(Boolean).length;
      const domScore = Object.values(comparison.dom.fields).filter(Boolean).length;
      
      if (jsonldScore >= domScore) {
        results.recommendation = 'Use JSON-LD as primary extraction method';
      } else {
        results.recommendation = 'Use DOM as primary, JSON-LD as fallback';
      }
    } else {
      results.recommendation = 'Use DOM extraction with meta tag fallbacks';
    }
    
    console.log(`\n🎯 EXTRACTION STRATEGY:`);
    console.log(`   ${results.recommendation}`);
    
    console.log(`\n📊 DATA AVAILABILITY:`);
    console.log(`   JSON-LD Scripts: ${results.jsonld_analysis.total_scripts}`);
    console.log(`   Product JSON-LD: ${results.jsonld_analysis.has_product_data ? '✅' : '❌'}`);
    console.log(`   DOM Fallback: ${results.fallback_analysis.dom_available ? '✅' : '❌'}`);
    console.log(`   Meta Tags: ${results.fallback_analysis.meta_available ? '✅' : '❌'}`);
    
    console.log(`\n🔧 NEXT STEPS:`);
    if (results.jsonld_analysis.has_product_data) {
      console.log(`   ✅ Macy's supports JSON-LD - implement similar to Glasswing approach`);
    } else {
      console.log(`   ⚠️  Macy's requires DOM/Meta extraction - build fallback strategy`);
    }
    
    console.log(`   📝 Test extraction success rate with identified method`);
    console.log(`   🔄 Compare with Glasswing approach for consistency`);
    
    // Save detailed results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `macys_jsonld_test_${timestamp}.json`;
    await fs.writeFile(filename, JSON.stringify(results, null, 2));
    console.log(`\n💾 Detailed results saved to: ${filename}`);
    
    // Keep browser open for manual inspection
    console.log(`\n👁️  Browser remains open for manual inspection...`);
    console.log(`   Press Ctrl+C to close when finished`);
    
    // Wait for user to manually close
    await new Promise(() => {}); // Infinite wait
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (closeSession) {
      await closeSession();
    }
  }
}

if (require.main === module) {
  testMacysJsonLd().catch(console.error);
}

module.exports = { testMacysJsonLd };