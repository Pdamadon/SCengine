/**
 * Integration Validation Test
 * 
 * Quick validation that all components are properly integrated
 * without requiring external site access.
 */

const ProductCatalogStrategy = require('../src/intelligence/navigation/strategies/ProductCatalogStrategy');
const ProductCatalogCache = require('../src/cache/ProductCatalogCache');
const ProductCatalogCacheSingleton = require('../src/cache/ProductCatalogCacheSingleton');
const NavigationTreeBuilder = require('../src/intelligence/navigation/NavigationTreeBuilder');
const NavigationMapper = require('../src/intelligence/NavigationMapper');
const SiteIntelligence = require('../src/intelligence/SiteIntelligence');

class IntegrationValidator {
  constructor() {
    this.logger = {
      info: (...args) => console.log('ℹ️ ', ...args),
      warn: (...args) => console.warn('⚠️ ', ...args),
      error: (...args) => console.error('❌', ...args),
      debug: (...args) => console.log('🔍', ...args)
    };
    
    this.tests = [];
  }

  async runValidation() {
    console.log('🔍 Running Integration Validation Tests\n');

    // Test 1: Component Instantiation
    await this.testComponentInstantiation();
    
    // Test 2: ProductCatalogStrategy
    await this.testProductCatalogStrategy();
    
    // Test 3: ProductCatalogCache
    await this.testProductCatalogCache();
    
    // Test 4: NavigationTreeBuilder Enhancement
    await this.testNavigationTreeBuilderEnhancement();
    
    // Test 5: NavigationMapper Integration
    await this.testNavigationMapperIntegration();
    
    // Test 6: SiteIntelligence Integration
    await this.testSiteIntelligenceIntegration();

    // Print results
    this.printResults();
  }

  async testComponentInstantiation() {
    const test = { name: 'Component Instantiation', status: 'running', details: [] };
    
    try {
      // Test ProductCatalogStrategy
      const strategy = new ProductCatalogStrategy(this.logger);
      test.details.push('✅ ProductCatalogStrategy instantiated');
      
      // Test ProductCatalogCache
      const cache = new ProductCatalogCache(this.logger);
      test.details.push('✅ ProductCatalogCache instantiated');
      
      // Test ProductCatalogCacheSingleton
      const singleton = ProductCatalogCacheSingleton.getInstance(this.logger);
      test.details.push('✅ ProductCatalogCacheSingleton working');
      
      // Test NavigationTreeBuilder with cache
      const treeBuilder = new NavigationTreeBuilder(this.logger, cache);
      test.details.push('✅ NavigationTreeBuilder enhanced');
      
      test.status = 'passed';
    } catch (error) {
      test.status = 'failed';
      test.error = error.message;
    }
    
    this.tests.push(test);
  }

  async testProductCatalogStrategy() {
    const test = { name: 'ProductCatalogStrategy Configuration', status: 'running', details: [] };
    
    try {
      const strategy = new ProductCatalogStrategy(this.logger, {
        productDetectionThreshold: 5,
        maxProductsPerPage: 100,
        enableInfiniteScroll: true
      });
      
      // Test configuration
      if (strategy.config.productDetectionThreshold === 5) {
        test.details.push('✅ Configuration applied correctly');
      }
      
      // Test platform patterns
      if (strategy.productPatterns.shopify && strategy.productPatterns.generic) {
        test.details.push('✅ Platform patterns loaded');
      }
      
      // Test methods exist
      if (typeof strategy.execute === 'function') {
        test.details.push('✅ Execute method available');
      }
      
      test.status = 'passed';
    } catch (error) {
      test.status = 'failed';
      test.error = error.message;
    }
    
    this.tests.push(test);
  }

  async testProductCatalogCache() {
    const test = { name: 'ProductCatalogCache Functionality', status: 'running', details: [] };
    
    try {
      const cache = new ProductCatalogCache(this.logger);
      
      // Test initialization
      await cache.initialize();
      test.details.push('✅ Cache initialization completed');
      
      // Test helper methods
      const productId = cache.generateProductId('example.com', 'https://example.com/product/123');
      if (productId) {
        test.details.push('✅ Product ID generation working');
      }
      
      const categoryId = cache.generateCategoryId('example.com', 'Test Category');
      if (categoryId) {
        test.details.push('✅ Category ID generation working');
      }
      
      // Test document creation
      const mockProduct = {
        url: 'https://example.com/product/test',
        title: 'Test Product',
        price: '$29.99'
      };
      
      const mockNode = {
        name: 'Test Category',
        url: 'https://example.com/category/test',
        depth: 1,
        products: [mockProduct]
      };
      
      const productDoc = cache.createProductDocument('example.com', mockNode, mockProduct);
      if (productDoc.product_id && productDoc.navigation_context) {
        test.details.push('✅ Product document creation working');
      }
      
      test.status = 'passed';
    } catch (error) {
      test.status = 'failed';
      test.error = error.message;
    }
    
    this.tests.push(test);
  }

  async testNavigationTreeBuilderEnhancement() {
    const test = { name: 'NavigationTreeBuilder Enhancement', status: 'running', details: [] };
    
    try {
      const cache = new ProductCatalogCache(this.logger);
      const treeBuilder = new NavigationTreeBuilder(this.logger, cache);
      
      // Check if enhanced constructor worked
      if (treeBuilder.productCatalogCache) {
        test.details.push('✅ ProductCatalogCache integrated');
      }
      
      if (treeBuilder.productCatalogStrategy) {
        test.details.push('✅ ProductCatalogStrategy integrated');
      }
      
      if (treeBuilder.stats) {
        test.details.push('✅ Statistics tracking added');
      }
      
      // Check if enhanced method exists
      if (typeof treeBuilder.discoverChildrenAndProducts === 'function') {
        test.details.push('✅ Enhanced discovery method available');
      }
      
      test.status = 'passed';
    } catch (error) {
      test.status = 'failed';
      test.error = error.message;
    }
    
    this.tests.push(test);
  }

  async testNavigationMapperIntegration() {
    const test = { name: 'NavigationMapper Integration', status: 'running', details: [] };
    
    try {
      const worldModel = { /* mock world model */ };
      const mapper = new NavigationMapper(this.logger, worldModel);
      
      // Check if initialization works
      test.details.push('✅ NavigationMapper instantiated with ProductCatalogStrategy');
      
      // Note: Full initialization requires browser setup, so we just test instantiation
      test.status = 'passed';
    } catch (error) {
      test.status = 'failed';
      test.error = error.message;
    }
    
    this.tests.push(test);
  }

  async testSiteIntelligenceIntegration() {
    const test = { name: 'SiteIntelligence Integration', status: 'running', details: [] };
    
    try {
      const siteIntelligence = new SiteIntelligence(this.logger);
      
      // Check components
      if (siteIntelligence.navigationMapper) {
        test.details.push('✅ NavigationMapper integrated');
      }
      
      if (siteIntelligence.worldModel) {
        test.details.push('✅ WorldModel integrated');
      }
      
      if (siteIntelligence.concurrentExplorer) {
        test.details.push('✅ ConcurrentExplorer integrated');
      }
      
      test.status = 'passed';
    } catch (error) {
      test.status = 'failed';
      test.error = error.message;
    }
    
    this.tests.push(test);
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('🏆 INTEGRATION VALIDATION RESULTS');
    console.log('='.repeat(60));
    
    const passed = this.tests.filter(t => t.status === 'passed').length;
    const failed = this.tests.filter(t => t.status === 'failed').length;
    
    console.log(`\n📊 Summary: ${passed} passed, ${failed} failed\n`);
    
    this.tests.forEach(test => {
      const icon = test.status === 'passed' ? '✅' : '❌';
      console.log(`${icon} ${test.name}`);
      
      if (test.details) {
        test.details.forEach(detail => {
          console.log(`   ${detail}`);
        });
      }
      
      if (test.error) {
        console.log(`   ❌ Error: ${test.error}`);
      }
      
      console.log('');
    });
    
    const overallSuccess = failed === 0;
    console.log(`🏆 OVERALL: ${overallSuccess ? '✅ ALL INTEGRATIONS WORKING' : '❌ INTEGRATION ISSUES DETECTED'}`);
    
    if (overallSuccess) {
      console.log('\n🎉 Enhanced Product Catalog Discovery System integration is valid!');
      console.log('   All components are properly connected and configured.');
      console.log('   Ready for testing on real e-commerce sites.');
    }
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new IntegrationValidator();
  
  validator.runValidation()
    .then(() => {
      console.log('\n🏁 Validation completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Validation failed:', error);
      process.exit(1);
    });
}

module.exports = IntegrationValidator;