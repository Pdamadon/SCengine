#!/usr/bin/env node

/**
 * JSON-LD First Extraction Test
 * 
 * Tests the updated extraction strategy:
 * 1. JSON-LD first (priority #1)
 * 2. SelectorDiscovery for variants 
 * 3. DOM fallbacks for missing data
 */

require('dotenv').config();

const BrowserManagerBrowserless = require('../../../src/common/BrowserManagerBrowserless');
const SelectorDiscovery = require('../../../src/common/SelectorDiscovery');
const { logger } = require('../../../src/utils/logger');
const fs = require('fs').promises;

const TEST_SITES = [
  {
    name: 'Glasswing (Shopify)',
    url: 'https://glasswingshop.com/products/7115-by-szeki-cocoon-dress-shirt-off-white',
    expected_jsonld: true
  },
  {
    name: 'Mure & Grand (Shopify)', 
    url: 'https://mureandgrand.com/products/feeling-glazy-graphic-t-shirt',
    expected_jsonld: true
  },
  {
    name: 'Liana NYC (Shopify)',
    url: 'https://liana.nyc/collections/dresses/products/aster-dress-2',
    expected_jsonld: true
  }
];

async function testJsonLdFirstExtraction() {
  console.log('🧪 JSON-LD First Extraction Test');
  console.log('='.repeat(60));
  console.log('Testing: JSON-LD → SelectorDiscovery → DOM Fallbacks\n');
  
  const browserManager = new BrowserManagerBrowserless();
  const selectorDiscovery = new SelectorDiscovery(logger);
  let closeSession;
  
  try {
    console.log('🌐 Creating browser session...');
    const { page, close } = await browserManager.createBrowser('stealth');
    closeSession = close;
    console.log('✅ Browser initialized\n');
    
    const results = [];
    
    for (const site of TEST_SITES) {
      console.log(`${'='.repeat(80)}`);
      console.log(`🔗 Testing: ${site.name}`);
      console.log(`📍 URL: ${site.url}`);
      console.log(`${'='.repeat(80)}\n`);
      
      const siteResult = {
        site: site.name,
        url: site.url,
        timestamp: new Date().toISOString(),
        extraction: {},
        selector_discovery: {},
        errors: []
      };
      
      try {
        // Navigate to product page
        await page.goto(site.url, { 
          waitUntil: 'domcontentloaded',
          timeout: 60000 
        });
        await page.waitForTimeout(3000);
        console.log('✅ Page loaded successfully\n');
        
        // PHASE 1: JSON-LD Extraction
        console.log('🎯 PHASE 1: JSON-LD Extraction');
        console.log('-'.repeat(40));
        
        const jsonLdData = await extractJsonLd(page);
        if (jsonLdData) {
          console.log(`✅ JSON-LD extraction successful!`);
          console.log(`   Fields found: ${Object.keys(jsonLdData).filter(k => jsonLdData[k] !== null).join(', ')}`);
          console.log(`   Title: ${jsonLdData.title?.substring(0, 50) || 'none'}`);
          console.log(`   Price: ${jsonLdData.price ? `$${(jsonLdData.price / 100).toFixed(2)}` : 'none'}`);
          console.log(`   Brand: ${jsonLdData.brand || 'none'}`);
          console.log(`   Images: ${jsonLdData.images?.length || 0}`);
          
          siteResult.extraction.jsonld = jsonLdData;
          siteResult.extraction.primary_strategy = 'jsonld';
        } else {
          console.log(`❌ No JSON-LD product data found`);
          siteResult.extraction.primary_strategy = 'fallback_required';
        }
        
        // PHASE 2: SelectorDiscovery (always run)
        console.log(`\n🎯 PHASE 2: SelectorDiscovery`);
        console.log('-'.repeat(40));
        
        const selectorResults = await selectorDiscovery.findSelectorCandidates(page);
        console.log(`✅ SelectorDiscovery complete`);
        console.log(`   Variant groups: ${selectorResults.variant_groups?.length || 0}`);
        console.log(`   Cart button: ${selectorResults.cart_button ? '✅' : '❌'}`);
        console.log(`   Price elements: ${selectorResults.price_elements?.length || 0}`);
        
        siteResult.selector_discovery = selectorResults;
        
        // PHASE 3: DOM Fallbacks (if JSON-LD incomplete)
        const missingFields = [];
        if (!jsonLdData?.title) missingFields.push('title');
        if (!jsonLdData?.price) missingFields.push('price');
        if (!jsonLdData?.brand) missingFields.push('brand');
        
        if (missingFields.length > 0) {
          console.log(`\n🎯 PHASE 3: DOM Fallbacks (${missingFields.join(', ')})`);
          console.log('-'.repeat(40));
          
          const fallbackData = {};
          
          if (missingFields.includes('title')) {
            fallbackData.title = await extractTitleFallback(page);
            console.log(`   Title fallback: ${fallbackData.title?.substring(0, 50) || 'failed'}`);
          }
          
          if (missingFields.includes('price')) {
            fallbackData.price = await extractPriceFallback(page);
            console.log(`   Price fallback: ${fallbackData.price ? `$${(fallbackData.price / 100).toFixed(2)}` : 'failed'}`);
          }
          
          if (missingFields.includes('brand')) {
            fallbackData.brand = await extractBrandFallback(page);
            console.log(`   Brand fallback: ${fallbackData.brand || 'failed'}`);
          }
          
          siteResult.extraction.fallback = fallbackData;
        } else {
          console.log(`\n✅ No fallbacks needed - JSON-LD provided all core data`);
        }
        
        // PHASE 4: Combined Results
        console.log(`\n📊 FINAL EXTRACTION RESULTS:`);
        console.log('-'.repeat(40));
        
        const finalData = {
          ...jsonLdData,
          ...siteResult.extraction.fallback,
          selectors: selectorResults
        };
        
        console.log(`   Title: ${finalData.title ? '✅' : '❌'} ${finalData.title?.substring(0, 50) || 'missing'}`);
        console.log(`   Price: ${finalData.price ? '✅' : '❌'} ${finalData.price ? `$${(finalData.price / 100).toFixed(2)}` : 'missing'}`);
        console.log(`   Brand: ${finalData.brand ? '✅' : '❌'} ${finalData.brand || 'missing'}`);
        console.log(`   Variants: ${finalData.selectors.variant_groups?.length || 0} groups found`);
        console.log(`   Cart button: ${finalData.selectors.cart_button ? '✅' : '❌'}`);
        
        siteResult.extraction.final = finalData;
        siteResult.success = !!(finalData.title && finalData.price);
        
        console.log(`\n🏆 EXTRACTION ${siteResult.success ? 'SUCCESS' : 'FAILED'}: ${siteResult.success ? 'Core data extracted' : 'Missing core data'}`);
        
      } catch (error) {
        console.error(`❌ Error testing ${site.name}:`, error.message);
        siteResult.errors.push(error.message);
        siteResult.success = false;
      }
      
      results.push(siteResult);
    }
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(80));
    
    const successCount = results.filter(r => r.success).length;
    const jsonLdCount = results.filter(r => r.extraction.primary_strategy === 'jsonld').length;
    
    console.log(`\n🎯 OVERALL RESULTS:`);
    console.log(`   Sites tested: ${results.length}`);
    console.log(`   Successful extractions: ${successCount}/${results.length} (${Math.round(successCount/results.length*100)}%)`);
    console.log(`   JSON-LD success rate: ${jsonLdCount}/${results.length} (${Math.round(jsonLdCount/results.length*100)}%)`);
    
    console.log(`\n🔍 PER-SITE BREAKDOWN:`);
    results.forEach(result => {
      const strategy = result.extraction.primary_strategy;
      const variants = result.selector_discovery.variant_groups?.length || 0;
      console.log(`   ${result.site}: ${result.success ? '✅' : '❌'} | Strategy: ${strategy} | Variants: ${variants}`);
    });
    
    console.log(`\n💡 INSIGHTS:`);
    if (jsonLdCount === results.length) {
      console.log(`   ✅ Perfect! All sites have JSON-LD - fastest extraction possible`);
    } else if (jsonLdCount > 0) {
      console.log(`   ⚠️  Mixed: ${jsonLdCount} sites with JSON-LD, ${results.length - jsonLdCount} need fallbacks`);
    } else {
      console.log(`   ❌ No JSON-LD found - all sites require DOM extraction`);
    }
    
    console.log(`   📈 Strategy effectiveness: JSON-LD → Fallback → SelectorDiscovery provides complete coverage`);
    
    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `jsonld_first_extraction_test_${timestamp}.json`;
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

// Helper functions (copied from UniversalProductExtractor)
async function extractJsonLd(page) {
  try {
    const jsonLdData = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          
          if (data['@type'] === 'Product') {
            return {
              name: data.name,
              price: data.offers ? (Array.isArray(data.offers) ? data.offers[0].price : data.offers.price) : null,
              currency: data.offers ? (Array.isArray(data.offers) ? data.offers[0].priceCurrency : data.offers.priceCurrency) : null,
              original_price: data.offers ? (Array.isArray(data.offers) ? data.offers[0].highPrice : data.offers.highPrice) : null,
              description: data.description,
              brand: data.brand ? (data.brand.name || data.brand) : null,
              images: data.image ? (Array.isArray(data.image) ? data.image.map(img => ({ url: img, type: 'product' })) : [{ url: data.image, type: 'product' }]) : null,
              availability: data.offers ? (Array.isArray(data.offers) ? data.offers[0].availability : data.offers.availability) : null,
              sku: data.sku,
              categories: data.category ? (Array.isArray(data.category) ? data.category : [data.category]) : null,
              reviews: data.aggregateRating ? {
                average_rating: data.aggregateRating.ratingValue,
                review_count: data.aggregateRating.reviewCount
              } : null
            };
          }
        } catch (e) {
          continue;
        }
      }
      
      return null;
    });

    if (jsonLdData) {
      // Normalize price to cents
      if (jsonLdData.price) {
        jsonLdData.price = Math.round(parseFloat(jsonLdData.price) * 100);
      }
      if (jsonLdData.original_price) {
        jsonLdData.original_price = Math.round(parseFloat(jsonLdData.original_price) * 100);
      }

      // Normalize availability
      if (jsonLdData.availability) {
        const availability = jsonLdData.availability.toLowerCase();
        if (availability.includes('instock')) {
          jsonLdData.availability = 'in_stock';
        } else if (availability.includes('outofstock')) {
          jsonLdData.availability = 'out_of_stock';
        } else {
          jsonLdData.availability = 'unknown';
        }
      }

      // Use name as title for consistency
      if (jsonLdData.name) {
        jsonLdData.title = jsonLdData.name;
        delete jsonLdData.name;
      }

      return jsonLdData;
    }

    return null;
  } catch (error) {
    return null;
  }
}

async function extractTitleFallback(page) {
  const selectors = [
    'h1.product-title, h1[class*="product-title"]',
    'h1.product-name, h1[class*="product-name"]', 
    '.product-title, .product-name',
    '[data-product-title]',
    '[itemprop="name"]',
    'h1',
    'meta[property="og:title"]'
  ];

  for (const selector of selectors) {
    try {
      let title;
      if (selector.includes('meta')) {
        title = await page.$eval(selector, el => el.getAttribute('content'));
      } else {
        title = await page.$eval(selector, el => el.textContent?.trim());
      }
      
      if (title && title.length > 2) {
        return title;
      }
    } catch (e) {
      // Try next selector
    }
  }

  return await page.title();
}

async function extractBrandFallback(page) {
  const selectors = [
    '[itemprop="brand"] [itemprop="name"]',
    '[itemprop="brand"]',
    '.product-brand, .brand-name',
    '.breadcrumb a:first-child, .breadcrumbs a:first-child',
    'meta[property="product:brand"]',
    '[data-brand]'
  ];

  for (const selector of selectors) {
    try {
      let brand;
      if (selector.includes('meta')) {
        brand = await page.$eval(selector, el => el.getAttribute('content'));
      } else {
        brand = await page.$eval(selector, el => el.textContent?.trim());
      }
      
      if (brand && brand.length > 1 && brand.toLowerCase() !== 'home') {
        return brand;
      }
    } catch (e) {
      // Try next selector
    }
  }

  return null;
}

async function extractPriceFallback(page) {
  const selectors = [
    '.price:not(.old-price):not(.was-price)',
    '.product-price .price',
    '.current-price, .sale-price',
    '[data-price]',
    '[itemprop="price"]',
    '.price-now',
    'meta[property="product:price:amount"]'
  ];

  for (const selector of selectors) {
    try {
      let priceText;
      if (selector.includes('meta')) {
        priceText = await page.$eval(selector, el => el.getAttribute('content'));
      } else {
        priceText = await page.$eval(selector, el => el.textContent?.trim());
      }
      
      if (priceText) {
        const match = priceText.match(/[\d,]+\.?\d*/);
        if (match) {
          const price = parseFloat(match[0].replace(/,/g, ''));
          if (!isNaN(price) && price > 0) {
            return Math.round(price * 100); // Convert to cents
          }
        }
      }
    } catch (e) {
      // Try next selector
    }
  }

  return null;
}

if (require.main === module) {
  testJsonLdFirstExtraction().catch(console.error);
}

module.exports = { testJsonLdFirstExtraction };