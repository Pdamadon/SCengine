/**
 * URL Canonicalization Utility
 * 
 * Extracts the proven URL canonicalization logic from working tests
 * into a reusable module for consistent deduplication across the pipeline.
 * 
 * Based on working approach: product.url.split('?')[0] 
 * Addresses the 50 → 20 unique products issue by removing query parameters.
 */

/**
 * Simple URL canonicalization - strips all query parameters and fragments
 * This matches the proven approach from test_all_filters_robust.js line 138
 * @param {string} url - The URL to canonicalize
 * @returns {string} URL without query parameters or fragments
 */
function canonicalizeUrl(url) {
    if (!url || typeof url !== 'string') {
        return url;
    }
    
    // Use the proven approach: strip everything after '?'
    return url.split('?')[0].split('#')[0];
}

/**
 * Check if two URLs are equivalent after canonicalization
 * @param {string} url1 - First URL
 * @param {string} url2 - Second URL  
 * @returns {boolean} True if URLs are equivalent
 */
function areUrlsEquivalent(url1, url2) {
    return canonicalizeUrl(url1) === canonicalizeUrl(url2);
}

/**
 * Canonicalize multiple URLs at once
 * @param {string[]} urls - Array of URLs to canonicalize
 * @returns {string[]} Array of canonicalized URLs
 */
function canonicalizeUrls(urls) {
    return urls.map(canonicalizeUrl);
}

/**
 * Get unique URLs from an array (after canonicalization)
 * @param {string[]} urls - Array of URLs
 * @returns {string[]} Array of unique canonicalized URLs
 */
function getUniqueUrls(urls) {
    const uniqueSet = new Set();
    const uniqueUrls = [];
    
    for (const url of urls) {
        const canonical = canonicalizeUrl(url);
        if (!uniqueSet.has(canonical)) {
            uniqueSet.add(canonical);
            uniqueUrls.push(canonical);
        }
    }
    
    return uniqueUrls;
}

/**
 * Advanced canonicalization class for future extensibility
 * while maintaining the simple, proven approach as default
 */
class UrlCanonicalizer {
    constructor(options = {}) {
        this.stripAllParams = options.stripAllParams !== false; // Default: true
        this.preserveParams = new Set(options.preserveParams || []);
    }

    canonicalize(url) {
        if (!url || typeof url !== 'string') {
            return url;
        }

        // Default behavior: strip all parameters (proven approach)
        if (this.stripAllParams && this.preserveParams.size === 0) {
            return canonicalizeUrl(url);
        }

        // Advanced behavior: selective parameter preservation
        try {
            const urlObj = new URL(url);
            const params = new URLSearchParams(urlObj.search);
            const newParams = new URLSearchParams();

            // Keep only preserved parameters
            for (const [key, value] of params) {
                if (this.preserveParams.has(key)) {
                    newParams.append(key, value);
                }
            }

            urlObj.search = newParams.toString();
            urlObj.hash = '';
            return urlObj.toString();
        } catch (error) {
            // Fallback to simple approach
            return canonicalizeUrl(url);
        }
    }
}

// Export both the simple functions and the class
module.exports = {
    canonicalizeUrl,
    areUrlsEquivalent, 
    canonicalizeUrls,
    getUniqueUrls,
    UrlCanonicalizer
};