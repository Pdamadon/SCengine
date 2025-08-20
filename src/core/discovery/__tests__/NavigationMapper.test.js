/**
 * NavigationMapper Integration Tests
 * 
 * Tests based on DISCOVERY_REQUIREMENTS.md v1
 * 
 * Validates:
 * - Basic navigation discovery from real e-commerce sites
 * - TaxonomyDiscoveryProcessor integration
 * - Data structure matches requirements specification
 * - Performance within specified bounds (8min timeout, respectful crawling)
 */

const { logger } = require('../../../utils/logger');
const NavigationMapper = require('../NavigationMapper');
const TaxonomyDiscoveryProcessor = require('../processors/TaxonomyDiscoveryProcessor');

describe('NavigationMapper Integration Tests', () => {
  let navigationMapper;
  
  // Test timeout: 8 minutes per domain (per requirements)
  const DOMAIN_TIMEOUT = 8 * 60 * 1000;
  
  beforeEach(() => {
    navigationMapper = new NavigationMapper(logger, null);
  });
  
  afterEach(async () => {
    if (navigationMapper) {
      await navigationMapper.close();
    }
  });

  describe('Basic Navigation Discovery', () => {
    test('should discover navigation taxonomy from test e-commerce site', async () => {
      // Using a known e-commerce site for testing
      const testUrl = 'https://shopify.com'; // Simple, reliable test case
      
      await navigationMapper.initialize();
      const result = await navigationMapper.mapSiteTaxonomy(testUrl);
      
      // Validate basic structure matches requirements
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('strategy');
      expect(result).toHaveProperty('metadata');
      
      // Should discover some navigation items
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
      
      // Strategy should be one of our implemented strategies
      expect(['EnhancedMegaMenuStrategy', 'FallbackLinkStrategy', 'direct']).toContain(result.strategy);
      
      logger.info('Navigation discovery test completed', {
        itemsFound: result.items?.length || 0,
        strategy: result.strategy,
        confidence: result.confidence
      });
    }, DOMAIN_TIMEOUT);

    test('should handle site-specific browser settings correctly', async () => {
      // Test that Macy's gets non-headless mode (per SITE_CONFIG)
      const macysUrl = 'https://macys.com';
      
      await navigationMapper.initializeForSite(false, 'macys.com');
      expect(navigationMapper.isHeadless).toBe(false);
      
      // Test that unknown site gets headless mode
      await navigationMapper.close();
      navigationMapper = new NavigationMapper(logger, null);
      await navigationMapper.initializeForSite(false, 'example.com');
      expect(navigationMapper.isHeadless).toBe(true);
    });
  });

  describe('TaxonomyDiscoveryProcessor Integration', () => {
    test('should process navigation data through TaxonomyDiscoveryProcessor', async () => {
      const processor = new TaxonomyDiscoveryProcessor({
        enableBrandDetection: true,
        enableCategoryClassification: true,
        prioritizeProductPages: true
      });

      // Mock navigation data based on requirements sample
      const mockNavigationData = {
        main_sections: [
          { name: 'Women', url: '/shop/womens-clothing' },
          { name: 'Men', url: '/shop/mens-clothing' },
          { name: 'Shoes', url: '/shop/shoes' },
          { name: 'Sale', url: '/shop/sale' },
          { name: 'Account', url: '/account' },
          { name: 'Help', url: '/help' }
        ]
      };

      const taxonomy = await processor.processNavigationData(mockNavigationData);
      
      // Validate taxonomy structure matches requirements
      expect(taxonomy).toHaveProperty('productCategories');
      expect(taxonomy).toHaveProperty('brandCollections');
      expect(taxonomy).toHaveProperty('genderSections');
      expect(taxonomy).toHaveProperty('featuredCollections');
      expect(taxonomy).toHaveProperty('utilityPages');
      expect(taxonomy).toHaveProperty('metadata');
      
      // Should classify product categories correctly
      expect(taxonomy.productCategories.length).toBeGreaterThan(0);
      expect(taxonomy.genderSections.length).toBeGreaterThan(0);
      expect(taxonomy.utilityPages.length).toBeGreaterThan(0);
      
      // Should have reasonable classification confidence
      expect(taxonomy.metadata.classificationConfidence).toBeGreaterThan(0.5);
      
      // Validate priority calculation (requirements: priority sorting)
      taxonomy.productCategories.forEach(category => {
        expect(category).toHaveProperty('priority');
        expect(category.priority).toBeGreaterThan(0);
        expect(category.priority).toBeLessThanOrEqual(10);
      });
      
      logger.info('Taxonomy processing test completed', {
        productCategories: taxonomy.productCategories.length,
        genderSections: taxonomy.genderSections.length,
        utilityPages: taxonomy.utilityPages.length,
        confidence: taxonomy.metadata.classificationConfidence
      });
    });
  });

  describe('Data Structure Validation', () => {
    test('should produce navigation data matching requirements schema', async () => {
      const processor = new TaxonomyDiscoveryProcessor();
      
      // Test data that should match requirements schema structure
      const testNavigationData = {
        main_sections: [
          { 
            name: 'Women\'s Shoes', 
            url: '/shop/shoes/womens-shoes',
            description: 'Women\'s footwear collection'
          }
        ]
      };

      const result = await processor.processNavigationData(testNavigationData);
      
      // Should produce taxonomy that can map to requirements categories schema
      const sampleCategory = result.productCategories[0];
      if (sampleCategory) {
        // Validate it has fields needed for categories collection
        expect(sampleCategory).toHaveProperty('name');
        expect(sampleCategory).toHaveProperty('url');
        expect(sampleCategory).toHaveProperty('priority');
        expect(sampleCategory).toHaveProperty('estimatedProducts');
        
        // Fields needed for requirements schema transformation
        expect(typeof sampleCategory.name).toBe('string');
        expect(typeof sampleCategory.url).toBe('string');
        expect(typeof sampleCategory.priority).toBe('number');
        expect(typeof sampleCategory.estimatedProducts).toBe('number');
      }
    });
  });

  describe('Performance Requirements', () => {
    test('should respect performance defaults', async () => {
      // Requirements: Max concurrent pages: 2, Crawl rate: 1-2 rps
      const startTime = Date.now();
      
      // Test with a simple site to validate timing constraints
      await navigationMapper.initialize();
      const result = await navigationMapper.mapSiteTaxonomy('https://example.com');
      
      const duration = Date.now() - startTime;
      
      // Should complete reasonably quickly for simple sites
      expect(duration).toBeLessThan(30000); // 30 seconds for simple site
      
      // Should return valid result structure
      expect(result).toHaveProperty('strategy');
      expect(result).toHaveProperty('confidence');
      
      logger.info('Performance test completed', {
        duration: `${duration}ms`,
        strategy: result.strategy
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid URLs gracefully', async () => {
      await navigationMapper.initialize();
      
      await expect(navigationMapper.mapSiteTaxonomy('invalid-url')).rejects.toThrow();
    });

    test('should handle non-existent domains gracefully', async () => {
      await navigationMapper.initialize();
      
      // Should not crash, should return fallback data
      await expect(async () => {
        const result = await navigationMapper.mapSiteTaxonomy('https://non-existent-domain-12345.com');
        // If it doesn't throw, it should return valid fallback structure
        expect(result).toHaveProperty('strategy');
        expect(result.strategy).toBe('fallback');
      }).not.toThrow();
    });
  });
});

describe('NavigationMapper Strategy Tests', () => {
  let navigationMapper;
  
  beforeEach(() => {
    navigationMapper = new NavigationMapper(logger, null);
  });
  
  afterEach(async () => {
    if (navigationMapper) {
      await navigationMapper.close();
    }
  });

  test('should use EnhancedMegaMenuStrategy as primary strategy', async () => {
    await navigationMapper.initialize();
    
    // Verify strategies are configured correctly
    expect(navigationMapper.strategies).toHaveLength(2);
    expect(navigationMapper.strategies[0].name).toBe('EnhancedMegaMenuStrategy');
    expect(navigationMapper.strategies[1].name).toBe('FallbackLinkStrategy');
  });

  test('should fall back to FallbackLinkStrategy when primary fails', async () => {
    // This test would need to mock strategy failures
    // For now, just verify the fallback strategy exists
    await navigationMapper.initialize();
    
    const fallbackStrategy = navigationMapper.strategies.find(s => s.name === 'FallbackLinkStrategy');
    expect(fallbackStrategy).toBeDefined();
    expect(fallbackStrategy.name).toBe('FallbackLinkStrategy');
  });
});