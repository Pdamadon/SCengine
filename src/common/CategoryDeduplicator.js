/**
 * CategoryDeduplicator - Hybrid taxonomy-preserving category deduplication
 * 
 * Handles overlapping category structures while preserving site taxonomy:
 * - "All Clothing" → [Tops, Dresses, Pants]  
 * - "Men's" → [Men's Tops, Men's Pants]
 * - "Women's" → [Women's Tops, Women's Dresses]
 * 
 * Strategy:
 * - Preserve specific categories (Men's Tops, Women's Tops)
 * - Mark generic categories as structural-only if high overlap
 * - Deduplicate at product level across categories
 * - Use product sampling and Jaccard overlap for decisions
 */

const { logger } = require('../utils/logger');

class CategoryDeduplicator {
  constructor(options = {}) {
    this.options = {
      sampleSize: options.sampleSize || 40,          // Products to sample per category
      aliasThreshold: options.aliasThreshold || 0.9,  // Jaccard ≥ 0.9 = alias
      supersetThreshold: options.supersetThreshold || 0.8, // Parent-child detection
      incrementalThreshold: options.incrementalThreshold || 0.1, // 10% new products minimum
      logger: options.logger || logger,
      ...options
    };
    
    this.genderTokens = ['men', 'mens', "men's", 'women', 'womens', "women's", 'boys', 'girls', 'kids', 'unisex'];
    this.ageTokens = ['kids', 'baby', 'toddler', 'youth', 'junior', 'adult'];
  }

  /**
   * Main deduplication method
   * @param {Array} categories - Array of category objects {name, url, products?, metadata?}
   * @returns {Array} Deduplicated categories with crawl modes
   */
  async deduplicate(categories) {
    this.options.logger.info('🔧 Starting category deduplication', {
      inputCategories: categories.length
    });

    // Step 1: Normalize and group categories by slug
    const normalizedCategories = categories.map(cat => this.normalizeCategory(cat));
    const groupedBySlug = this.groupBySlug(normalizedCategories);

    // Step 2: Process each slug group for deduplication
    const processedCategories = [];
    
    for (const [slug, categoryGroup] of Object.entries(groupedBySlug)) {
      if (categoryGroup.length === 1) {
        // Single category - keep as is
        processedCategories.push({
          ...categoryGroup[0],
          crawlMode: 'products',
          deduplicationReason: 'single_category'
        });
      } else {
        // Multiple categories with same slug - apply deduplication logic
        const deduped = await this.processSlugGroup(slug, categoryGroup);
        processedCategories.push(...deduped);
      }
    }

    this.options.logger.info('✅ Category deduplication complete', {
      inputCategories: categories.length,
      outputCategories: processedCategories.length,
      productsCrawl: processedCategories.filter(c => c.crawlMode === 'products').length,
      structuralOnly: processedCategories.filter(c => c.crawlMode === 'structural-only').length,
      aliases: processedCategories.filter(c => c.crawlMode === 'alias').length
    });

    return processedCategories;
  }

  /**
   * Normalize category into standard format
   */
  normalizeCategory(category) {
    const normalized = {
      ...category,
      slug: this.extractSlug(category.name),
      qualifiers: this.extractQualifiers(category),
      normalizedName: this.normalizeName(category.name),
      productSample: category.products ? category.products.slice(0, this.options.sampleSize) : [],
      metadata: {
        ...category.metadata,
        originalName: category.name
      }
    };

    return normalized;
  }

  /**
   * Extract base slug from category name (remove gender/age qualifiers)
   */
  extractSlug(name) {
    let slug = name.toLowerCase()
      .replace(/['']/g, '') // Remove apostrophes
      .replace(/[^a-z0-9\s]/g, ' ') // Replace special chars with spaces
      .trim();

    // Remove gender/age tokens
    for (const token of [...this.genderTokens, ...this.ageTokens]) {
      const regex = new RegExp(`\\b${token}\\b`, 'gi');
      slug = slug.replace(regex, '').trim();
    }

    // Clean up multiple spaces and create slug
    return slug.replace(/\s+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
  }

  /**
   * Extract qualifiers (gender, age) from category
   */
  extractQualifiers(category) {
    const text = `${category.name} ${category.url || ''}`.toLowerCase();
    const qualifiers = {};

    // Gender detection
    for (const token of this.genderTokens) {
      const regex = new RegExp(`\\b${token.replace("'", "'?")}\\b`, 'i');
      if (regex.test(text)) {
        if (['men', 'mens', "men's", 'boys'].includes(token)) {
          qualifiers.gender = 'men';
        } else if (['women', 'womens', "women's", 'girls'].includes(token)) {
          qualifiers.gender = 'women';
        } else if (token === 'unisex') {
          qualifiers.gender = 'unisex';
        }
        break;
      }
    }

    // Age group detection
    for (const token of this.ageTokens) {
      const regex = new RegExp(`\\b${token}\\b`, 'i');
      if (regex.test(text)) {
        if (['kids', 'boys', 'girls', 'youth', 'junior'].includes(token)) {
          qualifiers.ageGroup = 'kids';
        } else if (['baby', 'toddler'].includes(token)) {
          qualifiers.ageGroup = 'baby';
        } else {
          qualifiers.ageGroup = 'adult';
        }
        break;
      }
    }

    // Default to unisex adult if no qualifiers found
    if (!qualifiers.gender) qualifiers.gender = 'unisex';
    if (!qualifiers.ageGroup) qualifiers.ageGroup = 'adult';

    return qualifiers;
  }

  /**
   * Normalize name for comparison
   */
  normalizeName(name) {
    return name.toLowerCase()
      .replace(/['']/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Group categories by their base slug
   */
  groupBySlug(categories) {
    const groups = {};
    
    for (const category of categories) {
      const slug = category.slug;
      if (!groups[slug]) {
        groups[slug] = [];
      }
      groups[slug].push(category);
    }

    return groups;
  }

  /**
   * Process a group of categories with the same slug
   */
  async processSlugGroup(slug, categories) {
    this.options.logger.info(`🔍 Processing slug group: ${slug}`, {
      categories: categories.length,
      names: categories.map(c => c.name)
    });

    // Identify generic vs specific categories
    const generic = categories.filter(c => this.isGenericCategory(c));
    const specific = categories.filter(c => !this.isGenericCategory(c));

    // If no product samples available, use name-based deduplication
    if (categories.every(c => c.productSample.length === 0)) {
      return this.nameBasedDeduplication(slug, generic, specific);
    }

    // Use product sampling for overlap analysis
    return await this.sampleBasedDeduplication(slug, generic, specific);
  }

  /**
   * Check if category is generic (no specific qualifiers)
   */
  isGenericCategory(category) {
    const { qualifiers, name, url } = category;
    
    // Check if contains generic indicators
    const genericIndicators = ['all', 'shop', 'browse', 'clothing'];
    const hasGenericIndicator = genericIndicators.some(indicator => 
      name.toLowerCase().includes(indicator) || (url && url.toLowerCase().includes(indicator))
    );

    // Generic if: unisex + adult + (has generic indicator OR no specific path structure)
    return qualifiers.gender === 'unisex' && 
           qualifiers.ageGroup === 'adult' && 
           (hasGenericIndicator || !this.hasSpecificPathStructure(url));
  }

  /**
   * Check if URL has specific path structure (e.g., /mens/, /womens/)
   */
  hasSpecificPathStructure(url) {
    if (!url) return false;
    
    const pathSpecificTokens = ['/mens/', '/women/', '/kids/', '/boys/', '/girls/'];
    return pathSpecificTokens.some(token => url.toLowerCase().includes(token));
  }

  /**
   * Name-based deduplication when no product samples available
   */
  nameBasedDeduplication(slug, generic, specific) {
    const results = [];

    // Keep all specific categories
    specific.forEach(category => {
      results.push({
        ...category,
        crawlMode: 'products',
        deduplicationReason: 'specific_category'
      });
    });

    // Handle generic categories
    if (generic.length > 0 && specific.length > 0) {
      // Generic exists with specific variants - mark generic as structural
      generic.forEach(category => {
        results.push({
          ...category,
          crawlMode: 'structural-only',
          deduplicationReason: 'generic_with_specific_variants',
          children: specific.map(s => s.name)
        });
      });
    } else if (generic.length > 0) {
      // Only generic categories - keep them
      generic.forEach(category => {
        results.push({
          ...category,
          crawlMode: 'products',
          deduplicationReason: 'only_generic_available'
        });
      });
    }

    return results;
  }

  /**
   * Sample-based deduplication using product overlap analysis
   */
  async sampleBasedDeduplication(slug, generic, specific) {
    const results = [];
    
    // Keep all specific categories (they provide valuable taxonomy)
    specific.forEach(category => {
      results.push({
        ...category,
        crawlMode: 'products',
        deduplicationReason: 'specific_taxonomy_preserved'
      });
    });

    // Analyze generic categories against specific ones
    for (const genericCategory of generic) {
      if (specific.length === 0) {
        // No specific variants - keep generic
        results.push({
          ...genericCategory,
          crawlMode: 'products',
          deduplicationReason: 'no_specific_variants'
        });
        continue;
      }

      // Calculate overlap with specific categories
      const overlaps = specific.map(specificCat => ({
        category: specificCat,
        overlap: this.calculateJaccardOverlap(
          genericCategory.productSample,
          specificCat.productSample
        )
      }));

      const avgOverlap = overlaps.length > 0 ? overlaps.reduce((sum, o) => sum + o.overlap, 0) / overlaps.length : 0;
      const maxOverlap = overlaps.length > 0 ? Math.max(...overlaps.map(o => o.overlap)) : 0;

      // Calculate combined product sample from all specific categories
      const allSpecificProducts = new Set();
      specific.forEach(cat => {
        cat.productSample.forEach(product => {
          allSpecificProducts.add(this.normalizeProductUrl(product));
        });
      });
      
      const genericProducts = new Set(genericCategory.productSample.map(p => this.normalizeProductUrl(p)));
      const unionSize = new Set([...allSpecificProducts, ...genericProducts]).size;
      const intersectionSize = [...genericProducts].filter(p => allSpecificProducts.has(p)).length;
      const combinedOverlap = unionSize > 0 ? intersectionSize / unionSize : 0;

      // Debug logging
      this.options.logger.debug('Overlap analysis', {
        generic: genericCategory.name,
        genericProducts: [...genericProducts],
        allSpecificProducts: [...allSpecificProducts],
        intersectionSize,
        unionSize,
        combinedOverlap,
        maxOverlap,
        avgOverlap
      });

      // Decision logic
      if (maxOverlap >= this.options.aliasThreshold) {
        // High overlap - generic is alias of specific
        results.push({
          ...genericCategory,
          crawlMode: 'alias',
          deduplicationReason: 'high_overlap_alias',
          aliasOf: overlaps.find(o => o.overlap === maxOverlap).category.name,
          maxOverlap: maxOverlap
        });
      } else if (combinedOverlap >= this.options.supersetThreshold) {
        // Generic is superset but adds minimal value
        results.push({
          ...genericCategory,
          crawlMode: 'structural-only',
          deduplicationReason: 'superset_minimal_value',
          combinedOverlap: combinedOverlap,
          children: specific.map(s => s.name)
        });
      } else {
        // Generic adds significant unique products
        results.push({
          ...genericCategory,
          crawlMode: 'products',
          deduplicationReason: 'significant_unique_products',
          combinedOverlap: combinedOverlap
        });
      }
    }

    return results;
  }

  /**
   * Calculate Jaccard overlap between two product sample sets
   */
  calculateJaccardOverlap(sample1, sample2) {
    if (!sample1 || !sample2 || sample1.length === 0 || sample2.length === 0) {
      return 0;
    }

    // Normalize product URLs for comparison
    const set1 = new Set(sample1.map(url => this.normalizeProductUrl(url)));
    const set2 = new Set(sample2.map(url => this.normalizeProductUrl(url)));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Normalize product URL for comparison (remove tracking params, etc.)
   */
  normalizeProductUrl(url) {
    if (typeof url !== 'string') return url;
    
    try {
      const urlObj = new URL(url);
      // Remove common tracking parameters
      const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', '_', 'variant'];
      paramsToRemove.forEach(param => urlObj.searchParams.delete(param));
      
      // Return canonical form
      return urlObj.origin + urlObj.pathname + (urlObj.search || '');
    } catch (error) {
      // If URL parsing fails, return as-is
      return url;
    }
  }

  /**
   * Get statistics about deduplication results
   */
  getStats(results) {
    const stats = {
      total: results.length,
      products: results.filter(r => r.crawlMode === 'products').length,
      structuralOnly: results.filter(r => r.crawlMode === 'structural-only').length,
      aliases: results.filter(r => r.crawlMode === 'alias').length,
      byGender: {},
      byAgeGroup: {},
      reasonCounts: {}
    };

    // Count by qualifiers
    results.forEach(result => {
      const gender = result.qualifiers?.gender || 'unknown';
      const ageGroup = result.qualifiers?.ageGroup || 'unknown';
      const reason = result.deduplicationReason || 'unknown';

      stats.byGender[gender] = (stats.byGender[gender] || 0) + 1;
      stats.byAgeGroup[ageGroup] = (stats.byAgeGroup[ageGroup] || 0) + 1;
      stats.reasonCounts[reason] = (stats.reasonCounts[reason] || 0) + 1;
    });

    return stats;
  }
}

module.exports = CategoryDeduplicator;