/**
 * Site Intelligence System
 * Core orchestrator for building comprehensive site understanding
 * Coordinates WorldModel, NavigationMapper, and ConcurrentExplorer
 */

import { 
  SiteIntelligence as ISiteIntelligence,
  IntelligenceGenerationResult,
  NavigationMap,
  SiteCapabilities,
  SelectorSet,
  PlatformDetectionResult 
} from '../types/intelligence.types';
import { Domain, URL, Timestamp } from '../types/common.types';

// Legacy imports (will be converted to TypeScript later)
const WorldModel = require('./WorldModel');
const NavigationMapper = require('./NavigationMapper');
const ConcurrentExplorer = require('./ConcurrentExplorer');

interface SiteIntelligenceOptions {
  forceRefresh?: boolean;
  maxConcurrent?: number;
  maxSubcategories?: number;
  includeProductSampling?: boolean;
  generateSelectors?: boolean;
}

interface ExistingIntelligence {
  intelligence_completeness: number;
  domain: Domain;
  last_updated: Timestamp;
  navigation_mapped: boolean;
  selectors_validated: boolean;
}

interface ExplorationResults {
  sections_explored: number;
  total_links_found: number;
  categorization_confidence: number;
  product_pages_sampled: number;
  selector_patterns_discovered: string[];
  performance_metrics: {
    avg_response_time: number;
    success_rate: number;
    errors_encountered: number;
  };
}

class SiteIntelligence {
  private logger: any;
  public worldModel: any;
  private navigationMapper: any;
  private concurrentExplorer: any;

  constructor(logger: any) {
    this.logger = logger;
    this.worldModel = new WorldModel(logger);
    this.navigationMapper = new NavigationMapper(logger, this.worldModel);
    this.concurrentExplorer = new ConcurrentExplorer(logger, this.worldModel);
  }

  async initialize(): Promise<void> {
    await this.worldModel.initialize();
    await this.navigationMapper.initialize();
    await this.concurrentExplorer.initialize();
    this.logger.info('Site Intelligence system initialized');
  }

  /**
   * Build comprehensive site intelligence with full navigation mapping and exploration
   */
  async buildComprehensiveSiteIntelligence(
    url: URL, 
    options: SiteIntelligenceOptions = {}
  ): Promise<IntelligenceGenerationResult> {
    const domain = new URL(url).hostname as Domain;
    const startTime = Date.now();

    this.logger.info(`🧠 Building comprehensive site intelligence for ${domain}`);

    try {
      // Check if we already have recent intelligence
      const existingIntelligence = await this.worldModel.getSiteIntelligenceSummary(domain);
      if (existingIntelligence.intelligence_completeness > 80 && !options.forceRefresh) {
        this.logger.info(`✅ Using existing high-quality intelligence for ${domain} (${existingIntelligence.intelligence_completeness}% complete)`);
        
        return {
          intelligence: await this.getExistingIntelligence(domain),
          summary: {
            sections_mapped: existingIntelligence.sections_mapped || 0,
            intelligence_score: existingIntelligence.intelligence_completeness,
            platform_detected: existingIntelligence.platform || 'unknown',
            confidence: existingIntelligence.platform_confidence || 0,
            generation_time_ms: Date.now() - startTime,
          },
        };
      }

      // Phase 1: Map site navigation structure
      this.logger.info(`📍 Phase 1: Mapping navigation structure for ${domain}`);
      const navigationIntelligence = await this.navigationMapper.mapSiteNavigation(url);

      // Phase 2: Concurrent deep exploration
      this.logger.info(`🔄 Phase 2: Concurrent section exploration (${navigationIntelligence.main_sections.length} sections)`);
      const explorationResults: ExplorationResults = await this.concurrentExplorer.exploreAllSections(
        url,
        navigationIntelligence,
        {
          maxConcurrent: options.maxConcurrent || 4,
          maxSubcategories: options.maxSubcategories || 3,
        },
      );

      // Phase 3: Compile comprehensive intelligence
      const comprehensiveIntelligence = await this.compileIntelligence(
        domain,
        url,
        navigationIntelligence,
        explorationResults,
        options
      );

      // Phase 4: Save to world model
      await this.worldModel.saveSiteIntelligence(domain, comprehensiveIntelligence);

      const generationTime = Date.now() - startTime;

      this.logger.info(`🎉 Site intelligence generation complete for ${domain}`, {
        generation_time_ms: generationTime,
        intelligence_score: comprehensiveIntelligence.intelligence_score,
        sections_mapped: navigationIntelligence.main_sections.length,
        links_discovered: explorationResults.total_links_found,
      });

      return {
        intelligence: comprehensiveIntelligence,
        summary: {
          sections_mapped: navigationIntelligence.main_sections.length,
          intelligence_score: comprehensiveIntelligence.intelligence_score,
          platform_detected: comprehensiveIntelligence.platform,
          confidence: this.calculatePlatformConfidence(comprehensiveIntelligence),
          generation_time_ms: generationTime,
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      this.logger.error(`❌ Site intelligence generation failed for ${domain}`, {
        error: errorMessage,
        stack: errorStack,
        generation_time_ms: Date.now() - startTime,
      });

      throw new Error(`Site intelligence generation failed: ${errorMessage}`);
    }
  }

  /**
   * Quick platform detection without full intelligence generation
   */
  async detectPlatform(url: URL): Promise<PlatformDetectionResult> {
    const domain = new URL(url).hostname as Domain;
    
    this.logger.info(`🔍 Quick platform detection for ${domain}`);

    try {
      // Use NavigationMapper for quick platform fingerprinting
      const platformInfo = await this.navigationMapper.detectPlatform(url);
      
      return {
        platform: platformInfo.platform,
        confidence: platformInfo.confidence,
        detected_features: platformInfo.features || [],
        selectors: platformInfo.selectors,
        api_endpoints: platformInfo.api_endpoints,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.warn(`Platform detection failed for ${domain}`, {
        error: errorMessage,
      });

      return {
        platform: 'unknown',
        confidence: 0,
        detected_features: [],
      };
    }
  }

  /**
   * Get cached site intelligence if available
   */
  async getCachedIntelligence(domain: Domain): Promise<ISiteIntelligence | null> {
    try {
      return await this.worldModel.getSiteIntelligence(domain);
    } catch (error) {
      this.logger.warn(`Failed to retrieve cached intelligence for ${domain}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Compile comprehensive intelligence from navigation and exploration results
   */
  private async compileIntelligence(
    domain: Domain,
    url: URL,
    navigationData: NavigationMap,
    explorationResults: ExplorationResults,
    options: SiteIntelligenceOptions
  ): Promise<ISiteIntelligence> {
    
    // Determine platform based on exploration results
    const platform = this.determinePlatform(navigationData, explorationResults);
    
    // Generate site capabilities assessment
    const capabilities = this.assessSiteCapabilities(navigationData, explorationResults);
    
    // Compile selectors from exploration
    const selectors = this.compileSelectors(explorationResults);
    
    // Calculate intelligence score
    const intelligenceScore = this.calculateIntelligenceScore(
      navigationData,
      explorationResults,
      capabilities
    );

    const now = new Date();

    return {
      domain,
      platform,
      site_type: 'ecommerce', // TODO: Make this dynamic based on detection
      intelligence_score: intelligenceScore,
      capabilities,
      selectors,
      navigation_map: navigationData,
      performance_metrics: {
        average_load_time: explorationResults.performance_metrics.avg_response_time,
        success_rate: explorationResults.performance_metrics.success_rate,
        total_scrapes: explorationResults.sections_explored,
        error_count: explorationResults.performance_metrics.errors_encountered,
      },
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Determine platform based on navigation and exploration patterns
   */
  private determinePlatform(
    navigationData: NavigationMap,
    explorationResults: ExplorationResults
  ): ISiteIntelligence['platform'] {
    // Check for Shopify indicators
    const shopifyIndicators = [
      'shopify',
      'cdn.shopify.com',
      'checkout.shopify.com',
      '/cart/add',
      'Shopify.theme'
    ];
    
    const hasShopifyIndicators = explorationResults.selector_patterns_discovered.some(pattern =>
      shopifyIndicators.some(indicator => pattern.includes(indicator))
    );
    
    if (hasShopifyIndicators) {
      return 'shopify';
    }

    // Check for WooCommerce indicators
    const wooIndicators = [
      'woocommerce',
      '/wp-content/plugins/woocommerce',
      'wc-ajax',
      'add-to-cart'
    ];
    
    const hasWooIndicators = explorationResults.selector_patterns_discovered.some(pattern =>
      wooIndicators.some(indicator => pattern.includes(indicator))
    );
    
    if (hasWooIndicators) {
      return 'woocommerce';
    }

    // Check for Magento indicators
    const magentoIndicators = [
      'magento',
      '/skin/frontend',
      'Mage.Cookies',
      'checkout/cart/add'
    ];
    
    const hasMagentoIndicators = explorationResults.selector_patterns_discovered.some(pattern =>
      magentoIndicators.some(indicator => pattern.includes(indicator))
    );
    
    if (hasMagentoIndicators) {
      return 'magento';
    }

    return 'custom';
  }

  /**
   * Assess site capabilities based on exploration results
   */
  private assessSiteCapabilities(
    navigationData: NavigationMap,
    explorationResults: ExplorationResults
  ): SiteCapabilities {
    return {
      can_extract_products: explorationResults.product_pages_sampled > 0,
      can_extract_pricing: explorationResults.selector_patterns_discovered.some(p => 
        p.includes('price') || p.includes('cost') || p.includes('$')
      ),
      can_extract_variants: explorationResults.selector_patterns_discovered.some(p => 
        p.includes('variant') || p.includes('size') || p.includes('color')
      ),
      can_navigate_categories: navigationData.main_sections.length > 0,
      can_add_to_cart: explorationResults.selector_patterns_discovered.some(p => 
        p.includes('cart') || p.includes('add-to-cart')
      ),
      can_checkout: explorationResults.selector_patterns_discovered.some(p => 
        p.includes('checkout') || p.includes('purchase')
      ),
      can_search: explorationResults.selector_patterns_discovered.some(p => 
        p.includes('search') || p.includes('query')
      ),
      can_filter: explorationResults.selector_patterns_discovered.some(p => 
        p.includes('filter') || p.includes('sort')
      ),
      can_check_availability: explorationResults.selector_patterns_discovered.some(p => 
        p.includes('stock') || p.includes('availability')
      ),
    };
  }

  /**
   * Compile selectors from exploration results
   */
  private compileSelectors(explorationResults: ExplorationResults): SelectorSet {
    // TODO: Implement intelligent selector compilation from exploration results
    // For now, return basic structure
    return {
      navigation: {
        main_menu: '.nav, .navigation, header nav',
        categories: '.nav-item, .menu-item, .category-link',
        search_box: 'input[type="search"], .search-input, #search',
      },
      products: {
        product_card: '.product, .product-item, .product-card',
        product_title: '.product-title, .product-name, h3, h4',
        product_price: '.price, .product-price, .cost',
        product_image: '.product-image img, .product-photo img',
      },
      cart: {
        add_to_cart_button: '.add-to-cart, button[name="add"], .buy-button',
        cart_icon: '.cart, .shopping-cart, .cart-link',
      },
    };
  }

  /**
   * Calculate overall intelligence score
   */
  private calculateIntelligenceScore(
    navigationData: NavigationMap,
    explorationResults: ExplorationResults,
    capabilities: SiteCapabilities
  ): number {
    let score = 0;

    // Navigation completeness (30%)
    const navigationScore = Math.min(navigationData.main_sections.length / 8, 1) * 30;
    score += navigationScore;

    // Exploration success rate (25%)
    const explorationScore = explorationResults.performance_metrics.success_rate * 25;
    score += explorationScore;

    // Capabilities coverage (25%)
    const capabilityCount = Object.values(capabilities).filter(Boolean).length;
    const capabilityScore = (capabilityCount / Object.keys(capabilities).length) * 25;
    score += capabilityScore;

    // Selector pattern richness (20%)
    const selectorScore = Math.min(explorationResults.selector_patterns_discovered.length / 20, 1) * 20;
    score += selectorScore;

    return Math.round(score);
  }

  /**
   * Calculate platform detection confidence
   */
  private calculatePlatformConfidence(intelligence: ISiteIntelligence): number {
    if (intelligence.platform === 'unknown') {
      return 0;
    }

    // Higher confidence for well-known platforms with clear indicators
    const platformConfidenceMap = {
      shopify: 0.9,
      woocommerce: 0.85,
      magento: 0.8,
      custom: 0.6,
    };

    return platformConfidenceMap[intelligence.platform] || 0.5;
  }

  /**
   * Get existing intelligence from world model
   */
  private async getExistingIntelligence(domain: Domain): Promise<ISiteIntelligence> {
    const intelligence = await this.worldModel.getSiteIntelligence(domain);
    if (!intelligence) {
      throw new Error(`No existing intelligence found for ${domain}`);
    }
    return intelligence;
  }

  /**
   * Close resources and cleanup
   */
  async close(): Promise<void> {
    try {
      await this.worldModel.close();
      await this.navigationMapper.close();
      await this.concurrentExplorer.close();
      this.logger.info('Site Intelligence system closed');
    } catch (error) {
      this.logger.error('Error closing Site Intelligence system', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export default SiteIntelligence;