/**
 * Filter Pattern Utility
 * 
 * Extracts the proven filter exclusion logic from working tests
 * into a reusable module for consistent filter handling across strategies.
 * 
 * Based on working patterns from test_all_filters_robust.js lines 59-77
 */

/**
 * Default patterns for non-product filters that should be excluded
 * These are proven patterns from the working test
 */
const DEFAULT_EXCLUDE_PATTERNS = [
    // Stock/availability filters (not product-defining)
    /in\s*stock/i,
    /out\s*of\s*stock/i,
    /availability/i,
    
    // Control/utility filters
    /clear\s*all/i,
    /reset/i,
    
    // Price range filters (creates noise, not product discovery)
    /price/i,
    /\$\d+/, // Price ranges like "$100-$200"
    
    // Sorting options (not filters)
    /sort/i,
    /order\s*by/i,
    
    // Store/pickup options
    /pickup/i,
    /store/i,
    /delivery/i,
    /shipping/i,
    
    // Reviews/ratings (not product-defining)
    /rating/i,
    /review/i,
    /star/i
];

/**
 * Patterns for product-related filters that should be kept
 * These help discover actual product variations
 */
const DEFAULT_INCLUDE_PATTERNS = [
    // Product categories/types
    /brand/i,
    /category/i,
    /type/i,
    /style/i,
    
    // Product attributes (only if exploring variants)
    /color/i,
    /size/i,
    /material/i,
    /collection/i
];

/**
 * Filter pattern matcher class
 */
class FilterPatterns {
    constructor(options = {}) {
        this.excludePatterns = [...DEFAULT_EXCLUDE_PATTERNS];
        this.includePatterns = [...DEFAULT_INCLUDE_PATTERNS];
        this.caseSensitive = options.caseSensitive || false;
        
        // Add custom patterns if provided
        if (options.additionalExclude) {
            this.excludePatterns.push(...options.additionalExclude);
        }
        if (options.additionalInclude) {
            this.includePatterns.push(...options.additionalInclude);
        }
    }

    /**
     * Check if a filter should be excluded (matches exclusion patterns)
     * @param {string} filterLabel - The filter label/text to check
     * @returns {boolean} True if filter should be excluded
     */
    shouldExclude(filterLabel) {
        if (!filterLabel || typeof filterLabel !== 'string') {
            return true; // Exclude invalid filters
        }

        const label = this.caseSensitive ? filterLabel : filterLabel.toLowerCase();
        
        return this.excludePatterns.some(pattern => {
            if (pattern instanceof RegExp) {
                return pattern.test(filterLabel); // RegExp already handles case sensitivity
            }
            const patternStr = this.caseSensitive ? pattern : pattern.toLowerCase();
            return label.includes(patternStr);
        });
    }

    /**
     * Check if a filter is product-related (matches inclusion patterns)
     * @param {string} filterLabel - The filter label/text to check  
     * @returns {boolean} True if filter is product-related
     */
    isProductRelated(filterLabel) {
        if (!filterLabel || typeof filterLabel !== 'string') {
            return false;
        }

        const label = this.caseSensitive ? filterLabel : filterLabel.toLowerCase();
        
        return this.includePatterns.some(pattern => {
            if (pattern instanceof RegExp) {
                return pattern.test(filterLabel);
            }
            const patternStr = this.caseSensitive ? pattern : pattern.toLowerCase();
            return label.includes(patternStr);
        });
    }

    /**
     * Filter an array of filter candidates, removing excluded ones
     * @param {Array} filters - Array of filter objects with 'label' property
     * @returns {Array} Filtered array without excluded filters
     */
    filterValidCandidates(filters) {
        if (!Array.isArray(filters)) {
            return [];
        }

        return filters.filter(filter => {
            const label = filter.label || filter.text || filter.name || '';
            const shouldExclude = this.shouldExclude(label);
            
            if (shouldExclude) {
                console.log(`⏭️  Skipping non-product filter: "${label}"`);
            }
            
            return !shouldExclude;
        });
    }

    /**
     * Add new exclusion pattern
     * @param {RegExp|string} pattern - Pattern to add to exclusion list
     */
    addExclusionPattern(pattern) {
        this.excludePatterns.push(pattern);
    }

    /**
     * Add new inclusion pattern  
     * @param {RegExp|string} pattern - Pattern to add to inclusion list
     */
    addInclusionPattern(pattern) {
        this.includePatterns.push(pattern);
    }

    /**
     * Get stats about filter processing
     * @param {Array} originalFilters - Original filter list
     * @param {Array} filteredFilters - Filtered result
     * @returns {Object} Processing statistics
     */
    getFilterStats(originalFilters, filteredFilters) {
        const excluded = originalFilters.length - filteredFilters.length;
        return {
            total: originalFilters.length,
            kept: filteredFilters.length,
            excluded: excluded,
            exclusionRate: originalFilters.length > 0 ? 
                ((excluded / originalFilters.length) * 100).toFixed(1) + '%' : '0%'
        };
    }
}

/**
 * Simple function to check if a filter should be excluded
 * Matches the proven logic from test_all_filters_robust.js
 * @param {string} filterLabel - Filter label to check
 * @returns {boolean} True if should be excluded
 */
function shouldExcludeFilter(filterLabel) {
    return DEFAULT_EXCLUDE_PATTERNS.some(pattern => pattern.test(filterLabel));
}

/**
 * Filter an array of filters using the proven exclusion patterns
 * @param {Array} filters - Array of filter objects with 'label' property
 * @returns {Array} Filtered array
 */
function filterValidFilters(filters) {
    const patterns = new FilterPatterns();
    return patterns.filterValidCandidates(filters);
}

// Export both the simple functions and the class
module.exports = {
    shouldExcludeFilter,
    filterValidFilters,
    FilterPatterns,
    DEFAULT_EXCLUDE_PATTERNS,
    DEFAULT_INCLUDE_PATTERNS
};