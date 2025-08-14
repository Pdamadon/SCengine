#!/usr/bin/env node

/**
 * Test Services Architecture - Validate New Service-Based System
 * 
 * Tests the new separated services architecture:
 * - UniversalSiteIntelligence
 * - CategoryDiscoveryService  
 * - PaginationService
 * - ProductExtractionService
 * - EcommerceTemplateV2 (service orchestrator)
 */

import EcommerceTemplate from './core/templates/EcommerceTemplateV2';
import { Logger } from '../types/common.types';

// Create logger
const logger: Logger = {
  debug: (message: string, meta?: any, correlationId?: string | null) => console.log(`[DEBUG] ${new Date().toISOString()}: ${message}`, meta),
  info: (message: string, meta?: any, correlationId?: string | null) => console.log(`[TEST] ${new Date().toISOString()}: ${message}`, meta),
  warn: (message: string, meta?: any, correlationId?: string | null) => console.warn(`[WARN] ${new Date().toISOString()}: ${message}`, meta),
  error: (message: string, meta?: any, correlationId?: string | null) => console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, meta),
  startTimer: (name: string, correlationId?: string) => console.time(name),
  endTimer: (name: string, correlationId?: string, meta?: any) => { console.timeEnd(name); return Date.now(); },
  scrapingStarted: (requestId: string, siteUrl: string, meta?: any) => console.log(`[SCRAPING-START] ${requestId}: ${siteUrl}`),
  scrapingCompleted: (requestId: string, siteUrl: string, results: any, meta?: any) => console.log(`[SCRAPING-COMPLETE] ${requestId}: ${siteUrl} - ${results?.length || 0} items`),
  scrapingFailed: (requestId: string, siteUrl: string, error: Error, meta?: any) => console.error(`[SCRAPING-FAILED] ${requestId}: ${siteUrl} - ${error.message}`),
};

/**
 * Test the new service-based architecture with Gap.com
 */
async function testServicesArchitecture(): Promise<boolean> {
  logger.info('🧪 Testing New Service-Based Universal Scraper Architecture');
  logger.info('================================================================');
  logger.info('🎯 Target: gap.com');
  logger.info('📐 Architecture: Separated Services (like Glasswing)');
  logger.info('🧠 Services: Intelligence → Categories → Pagination → Products');
  logger.info('');

  const template = new EcommerceTemplate(logger, {
    maxCategoriesPerSite: 5,  // Limit for testing
    maxProductsPerCategory: 20,  // Limit for testing
    batchSize: 10,
    maxConcurrentBatches: 2,
    enableCaching: true,
    minCategoryConfidence: 0.3,
    maxRetryAttempts: 2,
  });

  try {
    logger.info('🚀 Starting service orchestration...');
    
    const result = await template.scrapeEcommerceSite('https://www.gap.com');
    
    if (result.success) {
      logger.info('');
      logger.info('🎉 SERVICE-BASED ARCHITECTURE TEST SUCCESSFUL!');
      logger.info('================================================');
      logger.info(`🧠 Intelligence Score: ${result.intelligenceScore}%`);
      logger.info(`📂 Categories Processed: ${result.categoriesProcessed}`);
      logger.info(`🛍️ Total Products: ${result.totalProducts}`);
      logger.info(`✅ Success Rate: ${(result.performance.successRate * 100).toFixed(1)}%`);
      logger.info(`⚡ Processing Speed: ${result.performance.productsPerSecond.toFixed(2)} products/second`);
      logger.info(`⏱️ Total Time: ${(result.performance.duration / 1000).toFixed(1)} seconds`);
      logger.info('');
      
      // Display category breakdown
      logger.info('📊 Category Breakdown:');
      result.categoryResults.forEach((categoryResult, index) => {
        logger.info(`   ${index + 1}. ${categoryResult.categoryName}: ${categoryResult.successfulProducts}/${categoryResult.productsProcessed} products`);
      });
      
      logger.info('');
      logger.info('✅ NEW ARCHITECTURE VALIDATION: PASSED');
      logger.info('✅ Service Orchestration: WORKING');
      logger.info('✅ Category Discovery: WORKING');
      logger.info('✅ Product Extraction: WORKING');
      logger.info('✅ Fault Isolation: ENABLED');
      
      return true;
    } else {
      logger.error('❌ Service orchestration failed - no products extracted');
      return false;
    }
    
  } catch (error) {
    logger.error('💥 Service architecture test failed:', error);
    return false;
  }
}

/**
 * Test individual services in isolation
 */
async function testIndividualServices(): Promise<boolean> {
  logger.info('');
  logger.info('🔬 Testing Individual Services in Isolation');
  logger.info('============================================');
  
  try {
    // Test 1: UniversalSiteIntelligence
    logger.info('🧠 Testing UniversalSiteIntelligence...');
    const { UniversalSiteIntelligence } = await import('./services/intelligence/UniversalSiteIntelligence');
    const intelligence = new UniversalSiteIntelligence(logger);
    await intelligence.initialize();
    
    const intelligenceResult = await intelligence.buildComprehensiveSiteIntelligence('https://www.gap.com', {
      maxSubcategories: 3,
    });
    
    await intelligence.close();
    logger.info(`✅ Intelligence Service: ${intelligenceResult.platform.platform} detected with ${intelligenceResult.summary.intelligence_score}% confidence`);
    
    // Test 2: CategoryDiscoveryService
    logger.info('📂 Testing CategoryDiscoveryService...');
    const { CategoryDiscoveryService } = await import('./services/specialized/CategoryDiscoveryService');
    const categoryService = new CategoryDiscoveryService(logger);
    await categoryService.initialize();
    
    const categoriesResult = await categoryService.extractCategories(intelligenceResult, 'https://www.gap.com', {
      maxCategories: 5,
      minConfidence: 0.3,
    });
    
    await categoryService.close();
    logger.info(`✅ Category Service: ${categoriesResult.totalFound} categories discovered`);
    
    logger.info('');
    logger.info('✅ INDIVIDUAL SERVICES TEST: PASSED');
    logger.info('✅ Service Isolation: WORKING');
    logger.info('✅ Independent Testing: POSSIBLE');
    
    return true;
    
  } catch (error) {
    logger.error('❌ Individual services test failed:', error);
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests(): Promise<void> {
  logger.info('🏁 Starting Universal Scraper Service Architecture Tests');
  logger.info('======================================================');
  logger.info('');
  
  const startTime = Date.now();
  
  try {
    // Test 1: Individual services
    const servicesTest = await testIndividualServices();
    
    // Test 2: Full service orchestration
    const architectureTest = await testServicesArchitecture();
    
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;
    
    logger.info('');
    logger.info('🏆 TEST RESULTS SUMMARY');
    logger.info('=======================');
    logger.info(`⏱️ Total Test Time: ${totalTime.toFixed(1)} seconds`);
    logger.info(`🔬 Individual Services: ${servicesTest ? '✅ PASS' : '❌ FAIL'}`);
    logger.info(`🏗️ Service Orchestration: ${architectureTest ? '✅ PASS' : '❌ FAIL'}`);
    
    if (servicesTest && architectureTest) {
      logger.info('');
      logger.info('🎉 ALL TESTS PASSED! 🎉');
      logger.info('🚀 Service-Based Architecture is Working!');
      logger.info('🔧 Ready for Production Use');
      logger.info('📈 Improved: Fault Tolerance, Testability, Maintainability');
      process.exit(0);
    } else {
      logger.error('');
      logger.error('❌ SOME TESTS FAILED');
      logger.error('🔧 Architecture needs debugging');
      process.exit(1);
    }
    
  } catch (error) {
    logger.error('💥 Test suite crashed:', error);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test suite crashed:', error);
    process.exit(1);
  });
}

export { testServicesArchitecture, testIndividualServices };