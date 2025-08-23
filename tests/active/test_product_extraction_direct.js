#!/usr/bin/env node

/**
 * Direct Product Page Extraction Testing
 * 
 * Tests UniversalProductExtractor on real product URLs from our target sites
 * Measures current extraction success rates to establish baseline before optimization
 */

require('dotenv').config();

const UniversalProductExtractor = require('./src/core/extraction/UniversalProductExtractor');
const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const { logger } = require('./src/utils/logger');
const fs = require('fs').promises;

// Target sites and sample product URLs for testing
const TEST_PRODUCTS = {
  glasswing: [
    'https://glasswingshop.com/products/7115-by-szeki-cocoon-dress-shirt-off-white',
    'https://glasswingshop.com/products/kapital-14oz-5p-monkey-cisco-denim-1-2-year-fade',
    'https://glasswingshop.com/products/brain-dead-california-design-long-brim-hat-khaki'
  ],
  // Add more sites as we expand testing
  // target: [
  //   'https://www.target.com/p/...',
  // ],
  // nike: [
  //   'https://www.nike.com/t/...',
  // ]
};

async function testProductExtraction() {
  console.log('🧪 Direct Product Page Extraction Testing');
  console.log('=========================================\n');
  
  const browserManager = new BrowserManagerBrowserless();
  
  // We'll manually create a browser session for the extractor
  // Note: UniversalProductExtractor expects a Playwright browser, not our BrowserManager
  const { chromium } = require('playwright');
  
  let browser;
  try {
    // Use Playwright directly for now - we may need to adapt UniversalProductExtractor later
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });
    
    const extractor = new UniversalProductExtractor(logger);
    extractor.browser = browser; // Inject our browser
    
    const results = {
      summary: {
        totalProducts: 0,
        successfulExtractions: 0,
        failedExtractions: 0,
        averageQuality: 0,
        siteBreakdown: {}
      },
      extractionResults: [],
      errors: []
    };
    
    // Test each site
    for (const [siteName, productUrls] of Object.entries(TEST_PRODUCTS)) {
      console.log(`\n🏪 Testing ${siteName.toUpperCase()} (${productUrls.length} products)`);
      console.log('='.repeat(50));
      
      const siteResults = {
        site: siteName,
        totalProducts: productUrls.length,
        successful: 0,
        failed: 0,
        averageQuality: 0,
        extractionTimes: [],
        products: []
      };
      
      for (let i = 0; i < productUrls.length; i++) {
        const url = productUrls[i];
        console.log(`\n🔗 Testing product ${i + 1}/${productUrls.length}: ${url}`);
        
        const startTime = Date.now();
        
        try {
          // Extract product data
          const productData = await extractor.extractProduct(url);
          const extractionTime = Date.now() - startTime;
          
          siteResults.extractionTimes.push(extractionTime);
          siteResults.successful++;
          results.successfulExtractions++;
          
          // Log key extracted fields
          console.log(`   ✅ Success (${extractionTime}ms)`);
          console.log(`   📊 Quality Score: ${productData.extraction_quality}%`);
          console.log(`   📝 Title: ${productData.title ? '✓' : '✗'} ${productData.title ? `"${productData.title.substring(0, 50)}..."` : ''}`);
          console.log(`   💰 Price: ${productData.price ? '✓' : '✗'} ${productData.price ? `$${(productData.price.amount || productData.price / 100).toFixed(2)}` : ''}`);
          console.log(`   📷 Images: ${productData.images ? '✓' : '✗'} ${productData.images ? `(${productData.images.length} images)` : ''}`);
          console.log(`   📋 Description: ${productData.description ? '✓' : '✗'} ${productData.description ? `(${productData.description.length} chars)` : ''}`);
          console.log(`   🏷️  Availability: ${productData.availability ? '✓' : '✗'} ${productData.availability || ''}`);
          console.log(`   🎨 Variants: ${productData.variants ? '✓' : '✗'} ${productData.variants ? `(${productData.variants.length} options)` : ''}`);
          
          siteResults.products.push({
            url,
            success: true,
            quality: productData.extraction_quality,
            extractionTime,
            fieldsExtracted: {
              title: !!productData.title,
              price: !!productData.price,
              images: !!(productData.images && productData.images.length > 0),
              description: !!productData.description,
              availability: !!productData.availability,
              variants: !!(productData.variants && productData.variants.length > 0),
              brand: !!productData.brand
            },
            extractedData: {
              title: productData.title,
              price: productData.price,
              platform: productData.platform,
              quality: productData.extraction_quality
            }
          });
          
        } catch (error) {
          const extractionTime = Date.now() - startTime;
          siteResults.failed++;
          results.failedExtractions++;
          
          console.log(`   ❌ Failed (${extractionTime}ms): ${error.message}`);
          
          siteResults.products.push({
            url,
            success: false,
            error: error.message,
            extractionTime
          });
          
          results.errors.push({
            site: siteName,
            url,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
        
        results.totalProducts++;
        
        // Small delay between products to be respectful
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Calculate site averages
      const qualityScores = siteResults.products
        .filter(p => p.success && p.quality)
        .map(p => p.quality);
      
      siteResults.averageQuality = qualityScores.length > 0 
        ? Math.round(qualityScores.reduce((sum, q) => sum + q, 0) / qualityScores.length)
        : 0;
      
      siteResults.averageExtractionTime = siteResults.extractionTimes.length > 0
        ? Math.round(siteResults.extractionTimes.reduce((sum, t) => sum + t, 0) / siteResults.extractionTimes.length)
        : 0;
      
      results.siteBreakdown[siteName] = siteResults;
      results.extractionResults.push(siteResults);
      
      console.log(`\n📊 ${siteName.toUpperCase()} Results:`);
      console.log(`   Success Rate: ${siteResults.successful}/${siteResults.totalProducts} (${((siteResults.successful / siteResults.totalProducts) * 100).toFixed(1)}%)`);
      console.log(`   Average Quality: ${siteResults.averageQuality}%`);
      console.log(`   Average Time: ${siteResults.averageExtractionTime}ms`);
    }
    
    // Calculate overall averages
    const allQualityScores = results.extractionResults
      .flatMap(site => site.products)
      .filter(p => p.success && p.quality)
      .map(p => p.quality);
    
    results.summary.averageQuality = allQualityScores.length > 0
      ? Math.round(allQualityScores.reduce((sum, q) => sum + q, 0) / allQualityScores.length)
      : 0;
    
    results.summary.overallSuccessRate = ((results.successfulExtractions / results.totalProducts) * 100).toFixed(1);
    
    // Save detailed results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `product_extraction_test_${timestamp}.json`;
    await fs.writeFile(filename, JSON.stringify(results, null, 2));
    
    // Print final summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 PRODUCT EXTRACTION TEST SUMMARY');
    console.log('='.repeat(70));
    
    console.log(`\n🎯 OVERALL PERFORMANCE:`);
    console.log(`   Total Products Tested: ${results.totalProducts}`);
    console.log(`   Successful Extractions: ${results.successfulExtractions}`);
    console.log(`   Failed Extractions: ${results.failedExtractions}`);
    console.log(`   Success Rate: ${results.summary.overallSuccessRate}%`);
    console.log(`   Average Quality Score: ${results.summary.averageQuality}%`);
    
    console.log(`\n🏪 BY SITE BREAKDOWN:`);
    for (const [siteName, siteData] of Object.entries(results.siteBreakdown)) {
      const successRate = ((siteData.successful / siteData.totalProducts) * 100).toFixed(1);
      console.log(`   ${siteName.toUpperCase()}: ${successRate}% success, ${siteData.averageQuality}% avg quality`);
    }
    
    console.log(`\n🚨 COMMON FAILURE PATTERNS:`);
    if (results.errors.length > 0) {
      const errorCounts = {};
      results.errors.forEach(err => {
        const shortError = err.error.split('\n')[0]; // First line only
        errorCounts[shortError] = (errorCounts[shortError] || 0) + 1;
      });
      
      Object.entries(errorCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([error, count]) => {
          console.log(`   ${count}x: ${error}`);
        });
    } else {
      console.log(`   No errors encountered!`);
    }
    
    console.log(`\n💾 Detailed results saved to: ${filename}`);
    console.log(`\n🎯 NEXT STEPS:`);
    console.log(`   1. Analyze failing fields to identify extraction gaps`);
    console.log(`   2. Create site-specific extraction patterns for low-performing sites`);
    console.log(`   3. Target improvement from ${results.summary.overallSuccessRate}% → 70%+`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

if (require.main === module) {
  testProductExtraction().catch(console.error);
}

module.exports = { testProductExtraction, TEST_PRODUCTS };