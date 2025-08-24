/**
 * SimpleCategoryDeduplicator - URL-based deduplication to prevent duplicate crawls
 * 
 * Simple approach:
 * 1. Normalize URLs (remove query params, trailing slashes, etc.)
 * 2. Group by normalized URL  
 * 3. Keep one representative per URL to avoid wasting FilterNavigationStrategy resources
 * 4. Track all sources that pointed to the same URL
 */

const { logger } = require('../utils/logger');

class SimpleCategoryDeduplicator {
  constructor(options = {}) {
    this.options = {
      logger: options.logger || logger,
      ...options
    };
  }

  /**
   * Simple URL-based deduplication to prevent duplicate crawls
   * @param {Array} categories - Array of category objects {name, url, source?}
   * @returns {Array} Deduplicated categories (one per unique URL)
   */
  deduplicate(categories) {
    this.options.logger.info('🔧 Starting URL-based category deduplication', {
      inputCategories: categories.length
    });

    // Step 1: Group by normalized URL
    const urlGroups = this.groupByUrl(categories);
    
    // Step 2: Keep one representative per URL
    const results = [];
    for (const [url, categoryGroup] of Object.entries(urlGroups)) {
      const representative = this.selectRepresentative(categoryGroup);
      results.push(representative);
    }

    this.options.logger.info('✅ URL-based category deduplication complete', {
      inputCategories: categories.length,
      outputCategories: results.length,
      duplicatesRemoved: categories.length - results.length
    });

    return results;
  }

  /**
   * Group categories by normalized URL
   */
  groupByUrl(categories) {
    const urlGroups = {};

    for (const category of categories) {
      const normalizedUrl = this.normalizeUrl(category.url);
      
      if (!urlGroups[normalizedUrl]) {
        urlGroups[normalizedUrl] = [];
      }
      
      urlGroups[normalizedUrl].push(category);
    }

    return urlGroups;
  }

  /**
   * Select the best representative from a group of categories with the same URL
   */
  selectRepresentative(categoryGroup) {
    if (categoryGroup.length === 1) {
      return {
        ...categoryGroup[0],
        sources: [categoryGroup[0].source || 'unknown'],
        duplicateNames: []
      };
    }

    // Sort by preference - shorter, cleaner names preferred
    const sorted = categoryGroup.sort((a, b) => {
      // Prefer names without "All", "New", etc.
      const aHasGeneric = /\b(all|new|shop|browse)\b/i.test(a.name);
      const bHasGeneric = /\b(all|new|shop|browse)\b/i.test(b.name);
      
      if (aHasGeneric !== bHasGeneric) {
        return aHasGeneric ? 1 : -1; // Prefer names without generic terms
      }
      
      // Prefer shorter names
      return a.name.length - b.name.length;
    });

    const representative = sorted[0];
    const allSources = [...new Set(categoryGroup.map(c => c.source || 'unknown'))];
    const duplicateNames = categoryGroup.slice(1).map(c => c.name);

    return {
      ...representative,
      sources: allSources,
      duplicateNames: duplicateNames
    };
  }

  /**
   * Normalize URL for comparison (remove query params, trailing slashes, etc.)
   */
  normalizeUrl(url) {
    if (!url) return '';
    
    try {
      const urlObj = new URL(url);
      // Remove query parameters and fragment, normalize path
      return urlObj.origin + urlObj.pathname.toLowerCase().replace(/\/$/, '');
    } catch {
      // Fallback for relative URLs
      return url.toLowerCase().replace(/\/$/, '').split('?')[0].split('#')[0];
    }
  }

  /**
   * Get simple statistics
   */
  getStats(results) {
    return {
      total: results.length,
      duplicatesRemoved: results.reduce((total, result) => {
        return total + (result.duplicateNames ? result.duplicateNames.length : 0);
      }, 0)
    };
  }
}

module.exports = SimpleCategoryDeduplicator;