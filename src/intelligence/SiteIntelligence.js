const WorldModel = require('./WorldModel');
const NavigationMapper = require('./NavigationMapper');
const ConcurrentExplorer = require('./ConcurrentExplorer');

class SiteIntelligence {
  constructor(logger) {
    this.logger = logger;
    this.worldModel = new WorldModel(logger);
    this.navigationMapper = new NavigationMapper(logger, this.worldModel);
    this.concurrentExplorer = new ConcurrentExplorer(logger, this.worldModel);
  }

  async initialize() {
    await this.worldModel.initialize();
    await this.navigationMapper.initialize();
    await this.concurrentExplorer.initialize();
    this.logger.info('Site Intelligence system initialized');
  }

  async buildComprehensiveSiteIntelligence(url, options = {}) {
    const domain = new URL(url).hostname;
    const startTime = Date.now();

    this.logger.info(`🧠 Building comprehensive site intelligence for ${domain}`);

    try {
      // Check if we already have recent intelligence
      const existingIntelligence = await this.worldModel.getSiteIntelligenceSummary(domain);
      if (existingIntelligence.intelligence_completeness > 80 && !options.forceRefresh) {
        this.logger.info(`✅ Using existing high-quality intelligence for ${domain} (${existingIntelligence.intelligence_completeness}% complete)`);
        return existingIntelligence;
      }

      // Phase 1: Map site navigation structure
      this.logger.info(`📍 Phase 1: Mapping navigation structure for ${domain}`);
      const navigationIntelligence = await this.navigationMapper.mapSiteNavigation(url);
      
      // Log hierarchical tree info if available
      if (navigationIntelligence.hierarchical_tree) {
        this.logger.info(`🌳 Navigation tree mapped: ${navigationIntelligence.tree_metadata.total_nodes} nodes, ${navigationIntelligence.tree_metadata.categories} main categories, depth ${navigationIntelligence.tree_metadata.max_depth}`);
      }

      // Phase 2: Concurrent deep exploration
      const sectionsToExplore = navigationIntelligence.main_sections.length;
      this.logger.info(`🔄 Phase 2: Concurrent section exploration (${sectionsToExplore} sections)`);
      const explorationResults = await this.concurrentExplorer.exploreAllSections(
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
        navigationIntelligence,
        explorationResults,
      );

      const duration = Date.now() - startTime;
      this.logger.info(`🎉 Site intelligence completed for ${domain} in ${Math.round(duration / 1000)}s`);
      this.logger.info(`📊 Intelligence Summary: ${comprehensiveIntelligence.summary.sections_mapped} sections, ${comprehensiveIntelligence.summary.products_discovered} products, ${comprehensiveIntelligence.summary.selectors_identified} working selectors`);

      return comprehensiveIntelligence;

    } catch (error) {
      this.logger.error(`❌ Site intelligence failed for ${domain}:`, error);
      throw error;
    } finally {
      // Cleanup resources
      await this.concurrentExplorer.cleanup();
    }
  }

  async compileIntelligence(domain, navigationIntelligence, explorationResults) {
    const intelligence = {
      domain,
      created_at: new Date().toISOString(),
      navigation: {
        main_sections: navigationIntelligence.main_sections.length,
        dropdown_menus: Object.keys(navigationIntelligence.dropdown_menus).length,
        sidebar_navigation: navigationIntelligence.sidebar_navigation.length,
        breadcrumb_patterns: navigationIntelligence.breadcrumb_patterns.length,
        clickable_elements: navigationIntelligence.clickable_elements.length,
      },
      exploration: {
        sections_explored: explorationResults.sections_explored,
        total_products_found: explorationResults.exploration_summary.total_products_found,
        page_types_discovered: explorationResults.exploration_summary.page_types_discovered,
        working_selectors: explorationResults.exploration_summary.working_selectors,
      },
      products: explorationResults.products || [],
      selectors: {
        library_size: Object.keys(explorationResults.selectors).length,
        success_rate: explorationResults.selectors.success_rate,
        reliability_scores: explorationResults.selectors.reliability_scores,
        categories: Object.keys(explorationResults.selectors).filter(key =>
          typeof explorationResults.selectors[key] === 'object' &&
          explorationResults.selectors[key] !== null,
        ),
      },
      url_patterns: explorationResults.urlPatterns,
      capabilities: await this.assessSiteCapabilities(navigationIntelligence, explorationResults),
      summary: {
        sections_mapped: navigationIntelligence.main_sections.length,
        products_discovered: explorationResults.exploration_summary.total_products_found,
        selectors_identified: explorationResults.exploration_summary.working_selectors.length,
        intelligence_score: this.calculateIntelligenceScore(navigationIntelligence, explorationResults),
      },
    };

    return intelligence;
  }

  async assessSiteCapabilities(navigationIntelligence, explorationResults) {
    const capabilities = {
      can_navigate_categories: navigationIntelligence.main_sections.length > 0,
      can_extract_products: explorationResults.exploration_summary.total_products_found > 0,
      can_extract_prices: this.hasWorkingSelectors(explorationResults.selectors, 'pricing'),
      can_handle_variants: this.hasWorkingSelectors(explorationResults.selectors, 'variants'),
      can_check_availability: this.hasWorkingSelectors(explorationResults.selectors, 'availability'),
      can_use_filters: this.hasWorkingSelectors(explorationResults.selectors, 'filters'),
      can_handle_pagination: this.hasWorkingSelectors(explorationResults.selectors, 'pagination'),
      supports_search: navigationIntelligence.clickable_elements.some(el =>
        el.page_purpose === 'search',
      ),
      has_dropdown_navigation: Object.keys(navigationIntelligence.dropdown_menus).length > 0,
      mobile_responsive: this.assessMobileResponsiveness(navigationIntelligence),
    };

    // Calculate overall capability score
    const capabilityCount = Object.values(capabilities).filter(Boolean).length;
    capabilities.overall_score = capabilityCount / Object.keys(capabilities).length;

    return capabilities;
  }

  hasWorkingSelectors(selectors, category) {
    return selectors[category] &&
           typeof selectors[category] === 'object' &&
           Object.keys(selectors[category]).length > 0;
  }

  assessMobileResponsiveness(navigationIntelligence) {
    return navigationIntelligence.clickable_elements.some(el =>
      el.text.toLowerCase().includes('menu') &&
      el.classes.includes('mobile'),
    );
  }

  calculateIntelligenceScore(navigationIntelligence, explorationResults) {
    let score = 0;
    const maxScore = 100;

    // Navigation coverage (30 points)
    const navSections = navigationIntelligence.main_sections.length;
    score += Math.min(navSections * 3, 30);

    // Product discovery (25 points)
    const productsFound = explorationResults.exploration_summary.total_products_found;
    score += Math.min(productsFound * 2, 25);

    // Selector reliability (25 points)
    const selectorScore = explorationResults.selectors.success_rate * 25;
    score += selectorScore;

    // Feature coverage (20 points)
    const selectorCategories = Object.keys(explorationResults.selectors).filter(key =>
      typeof explorationResults.selectors[key] === 'object' && explorationResults.selectors[key] !== null,
    ).length;
    score += Math.min(selectorCategories * 2.5, 20);

    return Math.round(score);
  }

  // Quick price check using cached intelligence
  async quickPriceCheck(productUrl) {
    try {
      const priceData = await this.worldModel.getQuickPriceCheck(productUrl);

      if (priceData.cached) {
        return priceData;
      }

      if (priceData.needs_scraping) {
        // Use cached selectors for targeted scraping
        const quickResult = await this.performQuickScrape(productUrl, priceData.selectors);

        // Cache the result
        await this.worldModel.storeProductIntelligence(productUrl, quickResult);

        return {
          url: productUrl,
          price: quickResult.price,
          availability: quickResult.availability,
          variants: quickResult.variants,
          cached: false,
          last_updated: new Date().toISOString(),
        };
      }

    } catch (error) {
      this.logger.error('Quick price check failed:', error);
      throw error;
    }
  }

  async performQuickScrape(productUrl, selectors) {
    const browser = await require('playwright').chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    try {
      await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000);

      const result = await page.evaluate((selectors) => {
        const data = {
          price: null,
          availability: null,
          variants: [],
          extraction_success: {},
        };

        // Extract price
        if (selectors.pricing?.price) {
          const priceEl = document.querySelector(selectors.pricing.price);
          if (priceEl) {
            data.price = priceEl.textContent.trim();
            data.extraction_success.price = true;
          }
        }

        // Extract availability
        if (selectors.availability?.status) {
          const availEl = document.querySelector(selectors.availability.status);
          if (availEl) {
            data.availability = availEl.textContent.trim();
            data.extraction_success.availability = true;
          }
        }

        // Extract variants
        if (selectors.variants?.dropdown) {
          const variantEl = document.querySelector(selectors.variants.dropdown);
          if (variantEl && variantEl.tagName === 'SELECT') {
            const options = variantEl.querySelectorAll('option');
            options.forEach(option => {
              if (option.value && option.textContent.trim()) {
                data.variants.push({
                  name: option.textContent.trim(),
                  value: option.value,
                  available: !option.disabled,
                });
              }
            });
            data.extraction_success.variants = data.variants.length > 0;
          }
        }

        return data;
      }, selectors);

      this.logger.info(`Quick scrape completed for ${productUrl}: ${result.price || 'no price'}, ${result.variants.length} variants`);
      return result;

    } finally {
      await page.close();
      await browser.close();
    }
  }

  async getSiteIntelligenceSummary(domain) {
    return await this.worldModel.getSiteIntelligenceSummary(domain);
  }

  async close() {
    await this.navigationMapper.close();
    await this.concurrentExplorer.cleanup();
    await this.worldModel.close();
    this.logger.info('Site Intelligence system closed');
  }
}

module.exports = SiteIntelligence;
