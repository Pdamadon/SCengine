#!/usr/bin/env node

/**
 * Collection JSON-LD Parser Test
 * 
 * Tests JSON-LD parsing on Glasswing's men's collection page
 * to see what structured data is available at the collection level
 */

require('dotenv').config();

const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const { logger } = require('./src/utils/logger');
const fs = require('fs').promises;

const COLLECTION_URL = 'https://glasswingshop.com/collections/mens-collection';

async function testCollectionJsonLd() {
  console.log('🛍️ Collection JSON-LD Parser Test');
  console.log('==================================\n');
  console.log(`🎯 Testing: ${COLLECTION_URL}\n`);
  
  const browserManager = new BrowserManagerBrowserless();
  let closeSession;
  
  try {
    console.log('🌐 Creating browser session...');
    const { page, close } = await browserManager.createBrowser('stealth');
    closeSession = close;
    
    await page.goto(COLLECTION_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000); // Wait for dynamic content
    
    console.log('✅ Collection page loaded\n');
    
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
    
    // 2. Look for Collection-specific data
    console.log('2️⃣ Collection Data Analysis');
    console.log('===========================');
    
    const collectionData = allJsonLd.find(item => 
      item.type === 'CollectionPage' || 
      item.type === 'ItemList' || 
      (item.data && (item.data.name?.includes('collection') || item.data.url?.includes('collection')))
    );
    
    if (collectionData) {
      console.log('✅ Found collection-specific JSON-LD:');
      console.log(`   Type: ${collectionData.type}`);
      console.log(`   Data: ${JSON.stringify(collectionData.data, null, 2)}`);
    } else {
      console.log('❌ No collection-specific JSON-LD found');
    }
    
    // 3. Look for Product data in collection
    console.log('\n3️⃣ Product Data in Collection');
    console.log('=============================');
    
    const productData = allJsonLd.filter(item => item.type === 'Product');
    
    if (productData.length > 0) {
      console.log(`✅ Found ${productData.length} product(s) in JSON-LD:`);
      
      productData.forEach((product, i) => {
        console.log(`\n   Product ${i + 1}:`);
        console.log(`      Name: ${product.data.name}`);
        console.log(`      URL: ${product.data.url}`);
        
        if (product.data.offers) {
          const offers = Array.isArray(product.data.offers) ? product.data.offers : [product.data.offers];
          console.log(`      Offers: ${offers.length} variant(s)`);
          console.log(`      Price: ${offers[0].priceCurrency}${offers[0].price}`);
        }
        
        if (product.data.image) {
          const images = Array.isArray(product.data.image) ? product.data.image : [product.data.image];
          console.log(`      Images: ${images.length} image(s)`);
        }
      });
    } else {
      console.log('❌ No individual product JSON-LD found on collection page');
    }
    
    // 4. Extract product links from DOM and test a few
    console.log('\n4️⃣ DOM Product Links Analysis');
    console.log('=============================');
    
    const productLinks = await page.evaluate(() => {
      // Look for product links in the collection
      const links = document.querySelectorAll('a[href*="/products/"]');
      const uniqueLinks = new Set();
      
      links.forEach(link => {
        const href = link.href;
        if (href && href.includes('/products/')) {
          uniqueLinks.add(href);
        }
      });
      
      return Array.from(uniqueLinks).slice(0, 10); // Limit to first 10
    });
    
    console.log(`Found ${productLinks.length} product links in DOM:`);
    productLinks.forEach((link, i) => {
      const productName = link.split('/products/')[1]?.split('?')[0] || 'unknown';
      console.log(`   ${i + 1}. ${productName}`);
      console.log(`      URL: ${link}`);
    });
    
    // 5. Test JSON-LD extraction on a few individual products
    console.log('\n5️⃣ Individual Product JSON-LD Test');
    console.log('==================================');
    
    const testProducts = productLinks.slice(0, 3); // Test first 3 products
    const productExtractions = [];
    
    for (let i = 0; i < testProducts.length; i++) {
      const productUrl = testProducts[i];
      const productName = productUrl.split('/products/')[1]?.split('?')[0] || 'unknown';
      
      console.log(`\nTesting product ${i + 1}: ${productName}`);
      console.log(`URL: ${productUrl}`);
      
      try {
        await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        
        const productJsonLd = await page.evaluate(() => {
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (const script of scripts) {
            try {
              const data = JSON.parse(script.textContent);
              if (data['@type'] === 'Product') {
                return {
                  name: data.name,
                  price: data.offers ? (Array.isArray(data.offers) ? data.offers[0].price : data.offers.price) : null,
                  currency: data.offers ? (Array.isArray(data.offers) ? data.offers[0].priceCurrency : data.offers.priceCurrency) : null,
                  variants: Array.isArray(data.offers) ? data.offers.length : 1,
                  images: Array.isArray(data.image) ? data.image.length : (data.image ? 1 : 0),
                  brand: data.brand ? (data.brand.name || data.brand) : null,
                  availability: data.offers ? (Array.isArray(data.offers) ? data.offers[0].availability : data.offers.availability) : null
                };
              }
            } catch (e) {
              continue;
            }
          }
          return null;
        });
        
        if (productJsonLd) {
          console.log(`   ✅ JSON-LD extraction successful:`);
          console.log(`      Name: ${productJsonLd.name}`);
          console.log(`      Price: ${productJsonLd.currency}${productJsonLd.price}`);
          console.log(`      Variants: ${productJsonLd.variants}`);
          console.log(`      Images: ${productJsonLd.images}`);
          console.log(`      Brand: ${productJsonLd.brand}`);
          console.log(`      Available: ${productJsonLd.availability?.includes('InStock') ? '✅' : '❌'}`);
          
          productExtractions.push({
            url: productUrl,
            name: productName,
            extraction: productJsonLd,
            success: true
          });
        } else {
          console.log(`   ❌ No product JSON-LD found`);
          productExtractions.push({
            url: productUrl,
            name: productName,
            success: false
          });
        }
        
      } catch (error) {
        console.log(`   ❌ Error testing product: ${error.message}`);
        productExtractions.push({
          url: productUrl,
          name: productName,
          error: error.message,
          success: false
        });
      }
    }
    
    // 6. Summary and Results
    console.log('\n' + '='.repeat(60));
    console.log('📊 COLLECTION JSON-LD TEST SUMMARY');
    console.log('='.repeat(60));
    
    const results = {
      collection_url: COLLECTION_URL,
      timestamp: new Date().toISOString(),
      
      collection_jsonld: {
        total_scripts: allJsonLd.length,
        parsed_successfully: allJsonLd.filter(item => item.type !== 'parse_error').length,
        parse_errors: allJsonLd.filter(item => item.type === 'parse_error').length,
        has_collection_data: !!collectionData,
        has_product_data: productData.length > 0,
        scripts: allJsonLd
      },
      
      product_links: {
        total_found: productLinks.length,
        links: productLinks
      },
      
      individual_tests: {
        products_tested: testProducts.length,
        successful_extractions: productExtractions.filter(p => p.success).length,
        failed_extractions: productExtractions.filter(p => !p.success).length,
        results: productExtractions
      }
    };
    
    console.log(`\n🎯 COLLECTION PAGE ANALYSIS:`);
    console.log(`   JSON-LD scripts found: ${results.collection_jsonld.total_scripts}`);
    console.log(`   Successfully parsed: ${results.collection_jsonld.parsed_successfully}`);
    console.log(`   Parse errors: ${results.collection_jsonld.parse_errors}`);
    console.log(`   Has collection data: ${results.collection_jsonld.has_collection_data ? '✅' : '❌'}`);
    console.log(`   Has product data: ${results.collection_jsonld.has_product_data ? '✅' : '❌'}`);
    
    console.log(`\n🔗 PRODUCT LINKS:`);
    console.log(`   Product links found: ${results.product_links.total_found}`);
    
    console.log(`\n🧪 INDIVIDUAL PRODUCT TESTS:`);
    console.log(`   Products tested: ${results.individual_tests.products_tested}`);
    console.log(`   Successful extractions: ${results.individual_tests.successful_extractions}`);
    console.log(`   Failed extractions: ${results.individual_tests.failed_extractions}`);
    console.log(`   Success rate: ${((results.individual_tests.successful_extractions / results.individual_tests.products_tested) * 100).toFixed(1)}%`);
    
    console.log(`\n🏆 RECOMMENDATIONS:`);
    if (results.collection_jsonld.has_product_data) {
      console.log(`   ✅ Use collection page JSON-LD for bulk product data`);
    } else {
      console.log(`   ⚠️  Collection page has no product JSON-LD - must visit individual pages`);
    }
    
    if (results.individual_tests.successful_extractions > 0) {
      console.log(`   ✅ Individual product JSON-LD extraction works (${((results.individual_tests.successful_extractions / results.individual_tests.products_tested) * 100).toFixed(1)}% success)`);
    }
    
    console.log(`   📝 Strategy: Extract product links from collection, then visit each for JSON-LD data`);
    
    // Save detailed results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `collection_jsonld_test_${timestamp}.json`;
    await fs.writeFile(filename, JSON.stringify(results, null, 2));
    console.log(`\n💾 Detailed results saved to: ${filename}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (closeSession) {
      await closeSession();
    }
  }
}

if (require.main === module) {
  testCollectionJsonLd().catch(console.error);
}

module.exports = { testCollectionJsonLd };