/**
 * NavigationLearningCache.js
 * 
 * Intelligent caching system for navigation structures that learns and improves over time
 * Handles recursive navigation discovery and caching at each level
 */

const RedisCacheFactory = require('./RedisCacheFactory');

class NavigationLearningCache {
  constructor(logger) {
    this.logger = logger;
    this.cache = RedisCacheFactory.getInstance(logger, 'NavigationLearningCache');
    this.learningData = new Map(); // Track success rates and patterns
  }

  async initialize() {
    await this.cache.connect();
    this.logger.info('NavigationLearningCache initialized');
  }

  /**
   * Get cached navigation or discover and cache it
   */
  async getOrDiscoverNavigation(domain, level = 'main', discoveryFn = null) {
    try {
      // First, check cache
      const cached = await this.cache.getCachedNavigation(domain, level);
      
      if (cached) {
        this.logger.info(`Using cached navigation for ${domain}:${level}`);
        this.trackCacheHit(domain, level);
        return {
          navigation: cached,
          fromCache: true,
          cacheAge: await this.getCacheAge(domain, level)
        };
      }

      // If no cache and we have a discovery function, run it
      if (discoveryFn) {
        this.logger.info(`No cache found for ${domain}:${level}, discovering...`);
        const discovered = await discoveryFn();
        
        if (discovered) {
          // Cache the discovery
          await this.cache.cacheNavigation(domain, level, discovered);
          this.trackCacheMiss(domain, level);
          
          return {
            navigation: discovered,
            fromCache: false,
            discovered: true
          };
        }
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to get/discover navigation for ${domain}:${level}:`, error);
      return null;
    }
  }

  /**
   * Build navigation hierarchy recursively with caching
   */
  async buildCachedHierarchy(domain, options = {}) {
    const {
      maxDepth = 3,
      discoveryFn = null,
      forceRefresh = false
    } = options;

    try {
      // Clear cache if forced refresh
      if (forceRefresh) {
        await this.cache.clearNavigationCache(domain);
      }

      // Check for existing complete hierarchy
      const existingHierarchy = await this.cache.getFullNavigationHierarchy(domain);
      if (existingHierarchy && !forceRefresh) {
        this.logger.info(`Found complete cached hierarchy for ${domain}`);
        return existingHierarchy;
      }

      // Build hierarchy level by level
      const hierarchy = {
        domain,
        levels: {},
        discovered_at: new Date().toISOString()
      };

      // Start with main navigation
      const mainNav = await this.getOrDiscoverNavigation(domain, 'main', 
        discoveryFn ? () => discoveryFn('main', null) : null
      );

      if (!mainNav || !mainNav.navigation) {
        this.logger.warn(`No main navigation found for ${domain}`);
        return null;
      }

      hierarchy.levels.main = mainNav.navigation;

      // Extract departments from main navigation
      const departments = this.extractDepartments(mainNav.navigation);
      
      if (maxDepth > 1 && departments.length > 0 && discoveryFn) {
        // Discover each department's subcategories
        for (const dept of departments) {
          const deptLevel = dept.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
          
          const deptNav = await this.getOrDiscoverNavigation(
            domain, 
            deptLevel,
            () => discoveryFn(deptLevel, dept)
          );

          if (deptNav && deptNav.navigation) {
            hierarchy.levels[deptLevel] = deptNav.navigation;

            // Go deeper if needed
            if (maxDepth > 2) {
              const subcategories = this.extractSubcategories(deptNav.navigation);
              
              for (const subcat of subcategories) {
                const subcatLevel = `${deptLevel}:${subcat.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                
                const subcatNav = await this.getOrDiscoverNavigation(
                  domain,
                  subcatLevel,
                  () => discoveryFn(subcatLevel, subcat)
                );

                if (subcatNav && subcatNav.navigation) {
                  hierarchy.levels[subcatLevel] = subcatNav.navigation;
                }
              }
            }
          }
        }
      }

      this.logger.info(`Built hierarchy for ${domain} with ${Object.keys(hierarchy.levels).length} levels`);
      return hierarchy;

    } catch (error) {
      this.logger.error(`Failed to build cached hierarchy for ${domain}:`, error);
      return null;
    }
  }

  /**
   * Extract department links from main navigation
   */
  extractDepartments(navigation) {
    const departments = [];
    
    // Handle different navigation formats
    if (navigation.main_sections) {
      navigation.main_sections.forEach(section => {
        if (this.isDepartment(section)) {
          departments.push(section);
        }
      });
    } else if (navigation.categories && navigation.categories.departments) {
      departments.push(...navigation.categories.departments);
    } else if (Array.isArray(navigation)) {
      navigation.forEach(item => {
        if (this.isDepartment(item)) {
          departments.push(item);
        }
      });
    }

    return departments;
  }

  /**
   * Extract subcategory links
   */
  extractSubcategories(navigation) {
    const subcategories = [];
    
    if (navigation.main_sections) {
      subcategories.push(...navigation.main_sections);
    } else if (navigation.dropdown_menus) {
      Object.values(navigation.dropdown_menus).forEach(menu => {
        if (menu.items) {
          subcategories.push(...menu.items);
        }
      });
    } else if (Array.isArray(navigation)) {
      subcategories.push(...navigation);
    }

    return subcategories;
  }

  /**
   * Check if a navigation item is a department
   */
  isDepartment(item) {
    if (!item || !item.name) return false;
    
    const departmentPatterns = [
      'women', 'men', 'kids', 'girls', 'boys', 'baby', 'toddler',
      'home', 'furniture', 'electronics', 'toys', 'sports',
      'beauty', 'shoes', 'accessories', 'sale', 'new'
    ];

    const name = item.name.toLowerCase();
    return departmentPatterns.some(pattern => 
      name === pattern || name === pattern + 's' || name.includes(pattern)
    );
  }

  /**
   * Get cache age in days
   */
  async getCacheAge(domain, level) {
    try {
      const key = `nav:${domain}:${level}`;
      let data = null;

      if (this.cache.connected && this.cache.redis) {
        const cached = await this.cache.redis.get(key);
        if (cached) data = JSON.parse(cached);
      } else if (this.cache.memoryCache) {
        data = this.cache.memoryCache.get(key);
      }

      if (data && data.cached_at) {
        return (Date.now() - new Date(data.cached_at).getTime()) / (1000 * 60 * 60 * 24);
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Track cache performance
   */
  trackCacheHit(domain, level) {
    const key = `${domain}:${level}`;
    if (!this.learningData.has(key)) {
      this.learningData.set(key, { hits: 0, misses: 0 });
    }
    this.learningData.get(key).hits++;
  }

  trackCacheMiss(domain, level) {
    const key = `${domain}:${level}`;
    if (!this.learningData.has(key)) {
      this.learningData.set(key, { hits: 0, misses: 0 });
    }
    this.learningData.get(key).misses++;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const stats = {
      domains: new Set(),
      totalHits: 0,
      totalMisses: 0,
      hitRate: 0,
      levelStats: {}
    };

    for (const [key, data] of this.learningData) {
      const [domain, level] = key.split(':');
      stats.domains.add(domain);
      stats.totalHits += data.hits;
      stats.totalMisses += data.misses;
      
      if (!stats.levelStats[level]) {
        stats.levelStats[level] = { hits: 0, misses: 0 };
      }
      stats.levelStats[level].hits += data.hits;
      stats.levelStats[level].misses += data.misses;
    }

    if (stats.totalHits + stats.totalMisses > 0) {
      stats.hitRate = stats.totalHits / (stats.totalHits + stats.totalMisses);
    }

    return stats;
  }

  /**
   * Preload navigation for known sites
   */
  async preloadKnownSites(sites) {
    const results = {};
    
    for (const site of sites) {
      const domain = new URL(site).hostname;
      const hasCache = await this.cache.hasValidNavigationCache(domain);
      results[domain] = hasCache;
      
      if (hasCache) {
        this.logger.info(`Navigation pre-loaded for ${domain}`);
      }
    }

    return results;
  }

  async close() {
    await this.cache.close();
  }
}

module.exports = NavigationLearningCache;