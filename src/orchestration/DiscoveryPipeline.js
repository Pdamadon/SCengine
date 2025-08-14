/**
 * DiscoveryPipeline - Wrapper for navigation discovery components
 * 
 * Coordinates:
 * - NavigationMapper for site navigation discovery
 * - NavigationDiscoveryPipeline for strategy orchestration
 * - NavigationTreeBuilder for hierarchical structure
 * 
 * This provides a clean interface to the discovery phase
 */

const NavigationMapper = require('../intelligence/NavigationMapper');
const NavigationDebugger = require('../intelligence/NavigationDebugger');
const NavigationLearningCache = require('../cache/NavigationLearningCache');

class DiscoveryPipeline {
  constructor(logger) {
    this.logger = logger;
    this.navigationMapper = null;
    this.navigationDebugger = null;
    this.discoveryCache = new Map();
    this.navigationLearningCache = new NavigationLearningCache(logger);
  }

  /**
   * Initialize discovery components
   */
  async initialize() {
    this.navigationMapper = new NavigationMapper(this.logger, null);
    await this.navigationMapper.initialize();
    
    // Initialize navigation learning cache
    await this.navigationLearningCache.initialize();
    
    // Initialize debugger for detailed analysis if needed
    if (process.env.DEBUG_MODE === 'true') {
      this.navigationDebugger = new NavigationDebugger(this.logger);
      await this.navigationDebugger.initialize();
    }
    
    this.logger.info('DiscoveryPipeline initialized');
  }

  /**
   * Main discovery method - map site navigation and structure
   * 
   * @param {string} url - Target URL
   * @param {object} options - Discovery options
   * @returns {object} Discovery results
   */
  async discover(url, options = {}) {
    const domain = new URL(url).hostname;
    const startTime = Date.now();
    
    this.logger.info('Starting navigation discovery', {
      url,
      domain,
      options
    });

    try {
      // Check learning cache first (Redis/persistent cache)
      if (!options.forceRefresh) {
        const cachedHierarchy = await this.navigationLearningCache.cache.getFullNavigationHierarchy(domain);
        if (cachedHierarchy) {
          this.logger.info(`Using cached navigation hierarchy for ${domain}`);
          return {
            navigation: cachedHierarchy.levels.main || cachedHierarchy,
            metadata: {
              url,
              domain,
              fromCache: true,
              cacheAge: await this.navigationLearningCache.getCacheAge(domain, 'main'),
              timestamp: new Date().toISOString(),
              duration: Date.now() - startTime
            }
          };
        }
      }

      // Check memory cache
      const cacheKey = `${domain}:${options.maxDepth}:${options.maxSections}`;
      if (this.discoveryCache.has(cacheKey) && !options.forceRefresh) {
        this.logger.info('Using memory cached discovery results', { domain });
        return this.discoveryCache.get(cacheKey);
      }

      // Run navigation mapping with all strategies
      const navigationData = await this.navigationMapper.mapSiteNavigation(url);
      
      // Cache in learning cache for future use
      await this.navigationLearningCache.cache.cacheNavigation(domain, 'main', navigationData);
      
      // Debug mode: perform detailed analysis
      if (this.navigationDebugger && process.env.DEBUG_MODE === 'true') {
        const debugAnalysis = await this.navigationDebugger.analyzeNavigation(
          url,
          navigationData
        );
        navigationData.debug_analysis = debugAnalysis;
      }

      // Process and enhance navigation data
      const enhancedData = this.enhanceNavigationData(navigationData, options);
      
      // Build discovery result
      const discoveryResult = {
        navigation: enhancedData,
        metadata: {
          url,
          domain,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          options
        }
      };

      // Cache the results
      this.discoveryCache.set(cacheKey, discoveryResult);
      
      // Log summary
      this.logDiscoverySummary(discoveryResult);
      
      return discoveryResult;
      
    } catch (error) {
      this.logger.error('Discovery failed', {
        url,
        error: error.message,
        stack: error.stack
      });
      
      // Return minimal structure on error
      return {
        navigation: {
          main_sections: [],
          dropdown_menus: {},
          total_items: 0,
          error: error.message
        },
        metadata: {
          url,
          domain,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          error: true
        }
      };
    }
  }

  /**
   * Enhance navigation data with additional processing
   */
  enhanceNavigationData(navigationData, options) {
    const enhanced = { ...navigationData };
    
    // Calculate total items
    let totalItems = 0;
    
    // Count main sections
    if (enhanced.main_sections) {
      totalItems += enhanced.main_sections.length;
      
      // Filter by max sections if specified
      if (options.maxSections && enhanced.main_sections.length > options.maxSections) {
        enhanced.main_sections = this.prioritizeSections(
          enhanced.main_sections,
          options.maxSections
        );
      }
    }
    
    // Count dropdown items
    if (enhanced.dropdown_menus) {
      Object.values(enhanced.dropdown_menus).forEach(dropdown => {
        if (dropdown.items) {
          totalItems += dropdown.items.length;
        }
      });
    }
    
    // Count sidebar navigation
    if (enhanced.sidebar_navigation) {
      totalItems += enhanced.sidebar_navigation.length;
    }
    
    // Count clickable elements
    if (enhanced.clickable_elements) {
      totalItems += enhanced.clickable_elements.length;
    }
    
    // Add total count
    enhanced.total_items = totalItems;
    
    // Add categorization
    enhanced.categories = this.categorizeSections(enhanced.main_sections || []);
    
    // Add hierarchy depth info
    if (enhanced.hierarchical_tree) {
      enhanced.hierarchy_depth = enhanced.hierarchical_tree.metadata?.max_depth_reached || 0;
      enhanced.hierarchy_nodes = enhanced.hierarchical_tree.metadata?.total_items || 0;
    }
    
    return enhanced;
  }

  /**
   * Prioritize sections for exploration
   */
  prioritizeSections(sections, maxCount) {
    // Priority order:
    // 1. Department sections (Women, Men, Kids, etc.)
    // 2. Category sections (Clothing, Shoes, etc.)
    // 3. Sale/New sections
    // 4. Other sections
    
    const departmentPattern = /^(women|men|kids|girls|boys|baby|home)/i;
    const categoryPattern = /(clothing|shoes|accessories|bags|jewelry)/i;
    const priorityPattern = /(sale|new|clearance)/i;
    
    const prioritized = sections.sort((a, b) => {
      const aText = (a.name || a.text || '').toLowerCase();
      const bText = (b.name || b.text || '').toLowerCase();
      
      // Check department priority
      const aDept = departmentPattern.test(aText);
      const bDept = departmentPattern.test(bText);
      if (aDept && !bDept) return -1;
      if (!aDept && bDept) return 1;
      
      // Check category priority
      const aCat = categoryPattern.test(aText);
      const bCat = categoryPattern.test(bText);
      if (aCat && !bCat) return -1;
      if (!aCat && bCat) return 1;
      
      // Check priority sections
      const aPriority = priorityPattern.test(aText);
      const bPriority = priorityPattern.test(bText);
      if (aPriority && !bPriority) return -1;
      if (!aPriority && bPriority) return 1;
      
      return 0;
    });
    
    return prioritized.slice(0, maxCount);
  }

  /**
   * Categorize sections by type
   */
  categorizeSections(sections) {
    const categories = {
      departments: [],
      categories: [],
      brands: [],
      utility: [],
      other: []
    };
    
    sections.forEach(section => {
      const text = (section.name || section.text || '').toLowerCase();
      
      if (/^(women|men|kids|girls|boys|baby|home)/i.test(text)) {
        categories.departments.push(section);
      } else if (/(clothing|shoes|accessories|bags|jewelry)/i.test(text)) {
        categories.categories.push(section);
      } else if (/brand|designer/i.test(text)) {
        categories.brands.push(section);
      } else if (/(account|cart|help|contact|about)/i.test(text)) {
        categories.utility.push(section);
      } else {
        categories.other.push(section);
      }
    });
    
    return categories;
  }

  /**
   * Log discovery summary
   */
  logDiscoverySummary(discoveryResult) {
    const nav = discoveryResult.navigation;
    
    this.logger.info('Discovery summary', {
      totalItems: nav.total_items || 0,
      mainSections: nav.main_sections?.length || 0,
      dropdowns: Object.keys(nav.dropdown_menus || {}).length,
      hierarchyDepth: nav.hierarchy_depth || 0,
      hierarchyNodes: nav.hierarchy_nodes || 0,
      categories: {
        departments: nav.categories?.departments?.length || 0,
        categories: nav.categories?.categories?.length || 0,
        brands: nav.categories?.brands?.length || 0,
        other: nav.categories?.other?.length || 0
      },
      duration: discoveryResult.metadata.duration
    });
  }

  /**
   * Recursively discover navigation hierarchy
   * Visits each department page to discover subcategories
   */
  async discoverRecursive(url, options = {}) {
    const {
      maxDepth = 3,
      breadthFirst = true,
      saveProgress = true
    } = options;
    
    const domain = new URL(url).hostname;
    const startTime = Date.now();
    
    this.logger.info(`Starting recursive navigation discovery for ${domain}`, {
      maxDepth,
      breadthFirst
    });

    // Discovery function for each level
    const discoveryFn = async (level, parentItem) => {
      try {
        if (level === 'main') {
          // Discover main navigation
          const navData = await this.navigationMapper.mapSiteNavigation(url);
          return navData;
        } else if (parentItem && parentItem.url) {
          // Discover subcategories for a department
          this.logger.info(`Discovering subcategories for ${parentItem.name} at ${parentItem.url}`);
          const navData = await this.navigationMapper.mapSiteNavigation(parentItem.url);
          return navData;
        }
        return null;
      } catch (error) {
        this.logger.error(`Failed to discover ${level}:`, error);
        return null;
      }
    };

    // Build cached hierarchy with recursive discovery
    const hierarchy = await this.navigationLearningCache.buildCachedHierarchy(
      domain,
      {
        maxDepth,
        discoveryFn,
        forceRefresh: options.forceRefresh
      }
    );

    const duration = Date.now() - startTime;
    
    if (hierarchy) {
      this.logger.info(`Recursive discovery completed for ${domain}`, {
        levels: Object.keys(hierarchy.levels).length,
        duration: `${duration}ms`,
        fromCache: hierarchy.fromCache || false
      });
      
      // Log hierarchy summary
      for (const [level, data] of Object.entries(hierarchy.levels)) {
        const itemCount = Array.isArray(data) ? data.length : 
                         (data.main_sections ? data.main_sections.length : 0);
        this.logger.info(`  Level "${level}": ${itemCount} items`);
      }
    } else {
      this.logger.warn(`Failed to build hierarchy for ${domain}`);
    }

    return hierarchy;
  }

  /**
   * Get cached navigation stats
   */
  getCacheStats() {
    return this.navigationLearningCache.getCacheStats();
  }

  /**
   * Clear navigation cache for a domain
   */
  async clearCache(domain) {
    await this.navigationLearningCache.cache.clearNavigationCache(domain);
    
    // Also clear memory cache
    const keysToDelete = [];
    for (const key of this.discoveryCache.keys()) {
      if (key.startsWith(domain)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.discoveryCache.delete(key));
    
    this.logger.info(`Cleared all caches for ${domain}`);
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.navigationMapper) {
      await this.navigationMapper.close();
    }
    
    if (this.navigationDebugger) {
      await this.navigationDebugger.cleanup();
    }
    
    if (this.navigationLearningCache) {
      await this.navigationLearningCache.close();
    }
    
    this.discoveryCache.clear();
    
    this.logger.info('DiscoveryPipeline cleaned up');
  }
}

module.exports = DiscoveryPipeline;