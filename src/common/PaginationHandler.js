/**
 * PaginationHandler - Reusable pagination utility
 * 
 * Extracts core pagination logic from ProductPaginationStrategy into a 
 * focused, reusable module for consistent pagination across strategies.
 * 
 * Based on zen's guidance for minimal interface with canonicalized visited set.
 */

const { canonicalizeUrl } = require('./UrlCanonicalizer');

class PaginationHandler {
    constructor(options = {}) {
        this.options = {
            maxPages: options.maxPages || 20,
            maxDurationMs: options.maxDurationMs || 300000, // 5 minutes
            sleepBetweenMs: options.sleepBetweenMs || 2000,
            retryPolicy: options.retryPolicy || { maxRetries: 2, backoffMs: 1000 },
            logger: options.logger || console
        };
        
        this.stats = {
            pagesVisited: 0,
            duplicateUrls: 0,
            errors: 0,
            startTime: null
        };
    }

    /**
     * Paginate through pages using a callback for each page
     * @param {Object} config - Pagination configuration
     * @param {Function} config.getNextUrl - Function that returns next URL or null: (page) => string|null
     * @param {Function} config.fetchPage - Function that navigates to URL and returns page: (url, page) => Promise<page>
     * @param {Function} config.onPage - Callback for each page: (page, url, pageNumber) => Promise<void>
     * @param {Object} config.page - Playwright page object
     * @param {string} config.startUrl - Starting URL
     * @returns {Promise<Object>} Pagination results
     */
    async paginate(config) {
        const { getNextUrl, fetchPage, onPage, page, startUrl } = config;
        
        if (!getNextUrl || !fetchPage || !onPage || !page || !startUrl) {
            throw new Error('Missing required pagination config: getNextUrl, fetchPage, onPage, page, startUrl');
        }

        this.stats = {
            pagesVisited: 0,
            duplicateUrls: 0,
            errors: 0,
            startTime: Date.now()
        };

        const visited = new Set(); // Canonicalized URLs
        const errors = [];
        let currentUrl = startUrl;
        let pageNumber = 1;

        this.options.logger.info('Starting pagination', {
            startUrl,
            maxPages: this.options.maxPages,
            maxDurationMs: this.options.maxDurationMs
        });

        while (currentUrl && pageNumber <= this.options.maxPages) {
            // Check timeout
            if (Date.now() - this.stats.startTime > this.options.maxDurationMs) {
                this.options.logger.warn('Pagination timeout reached', { 
                    duration: Date.now() - this.stats.startTime,
                    maxDuration: this.options.maxDurationMs
                });
                break;
            }

            // Check for duplicate URL (after canonicalization)
            const canonicalUrl = canonicalizeUrl(currentUrl);
            if (visited.has(canonicalUrl)) {
                this.stats.duplicateUrls++;
                this.options.logger.debug('Skipping duplicate URL', { 
                    url: currentUrl,
                    canonical: canonicalUrl,
                    pageNumber 
                });
                break;
            }

            visited.add(canonicalUrl);

            try {
                // Navigate to page
                await fetchPage(currentUrl, page);
                
                // Wait between requests
                if (this.options.sleepBetweenMs > 0) {
                    await this.sleep(this.options.sleepBetweenMs);
                }

                // Call user callback
                await onPage(page, currentUrl, pageNumber);
                
                this.stats.pagesVisited++;
                
                this.options.logger.debug('Page processed', {
                    url: currentUrl,
                    pageNumber,
                    totalVisited: this.stats.pagesVisited
                });

                // Get next URL
                let nextUrl = null;
                let retryCount = 0;
                
                while (retryCount <= this.options.retryPolicy.maxRetries) {
                    try {
                        nextUrl = await getNextUrl(page);
                        break; // Success
                    } catch (error) {
                        retryCount++;
                        if (retryCount <= this.options.retryPolicy.maxRetries) {
                            this.options.logger.warn('Retrying getNextUrl', {
                                error: error.message,
                                attempt: retryCount,
                                maxRetries: this.options.retryPolicy.maxRetries
                            });
                            await this.sleep(this.options.retryPolicy.backoffMs * retryCount);
                        } else {
                            throw error; // Final failure
                        }
                    }
                }

                // Move to next URL
                currentUrl = nextUrl;
                pageNumber++;
                
            } catch (error) {
                this.stats.errors++;
                const errorInfo = {
                    url: currentUrl,
                    pageNumber,
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
                
                errors.push(errorInfo);
                this.options.logger.error('Pagination error', errorInfo);
                
                // Stop on critical errors
                if (this.isCriticalError(error)) {
                    this.options.logger.error('Critical pagination error, stopping', { error: error.message });
                    break;
                }
                
                // Continue on non-critical errors
                break;
            }
        }

        const duration = Date.now() - this.stats.startTime;
        const results = {
            ...this.stats,
            duration,
            errors,
            visitedUrls: Array.from(visited),
            completedNormally: currentUrl === null, // True if we ran out of pages vs hitting limits
            stoppedReason: this.getStoppedReason(currentUrl, pageNumber, duration)
        };

        this.options.logger.info('Pagination complete', results);
        return results;
    }

    /**
     * Sleep for specified milliseconds
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Check if error should stop pagination
     */
    isCriticalError(error) {
        const criticalPatterns = [
            /network.*error/i,
            /timeout/i,
            /browser.*closed/i,
            /page.*crashed/i
        ];
        
        return criticalPatterns.some(pattern => pattern.test(error.message));
    }

    /**
     * Determine why pagination stopped
     */
    getStoppedReason(currentUrl, pageNumber, duration) {
        if (!currentUrl) return 'no_more_pages';
        if (pageNumber > this.options.maxPages) return 'max_pages_reached';
        if (duration > this.options.maxDurationMs) return 'timeout';
        if (this.stats.errors > 0) return 'error';
        return 'unknown';
    }
}

/**
 * Simple pagination helper functions for common patterns
 */

/**
 * Get next URL for numbered pagination
 * @param {Object} page - Playwright page
 * @returns {Promise<string|null>} Next URL or null if no more pages
 */
async function getNextNumberedPage(page) {
    try {
        // Look for "Next" button or next page number
        const nextSelectors = [
            'a[rel="next"]',
            '.pagination .next:not(.disabled) a',
            '.page-numbers .next:not(.disabled)',
            'a[aria-label*="next"]:not([disabled])',
            '.pagination-next:not(.disabled) a'
        ];
        
        for (const selector of nextSelectors) {
            const nextLink = await page.$(selector);
            if (nextLink) {
                const href = await nextLink.getAttribute('href');
                if (href && !href.includes('#')) {
                    // Convert relative URLs to absolute
                    return new URL(href, page.url()).toString();
                }
            }
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Get next URL for load-more button pagination
 * @param {Object} page - Playwright page
 * @returns {Promise<string|null>} Same URL if more content loaded, null otherwise
 */
async function getNextLoadMorePage(page) {
    try {
        const loadMoreSelectors = [
            'button[class*="load-more"]:visible:not([disabled])',
            'button[class*="show-more"]:visible:not([disabled])',
            '.load-more-button:visible:not([disabled])',
            'button[aria-label*="load more"]:visible:not([disabled])'
        ];
        
        // Get current product count
        const beforeCount = await page.$$eval('[href*="/product/"], [href*="/item/"], [href*="/p/"]', 
            els => els.length);
        
        // Click load more
        for (const selector of loadMoreSelectors) {
            const button = await page.$(selector);
            if (button) {
                await button.click();
                await page.waitForTimeout(2000); // Wait for content to load
                
                // Check if new content loaded
                const afterCount = await page.$$eval('[href*="/product/"], [href*="/item/"], [href*="/p/"]', 
                    els => els.length);
                
                if (afterCount > beforeCount) {
                    return page.url(); // Same URL, but with more content
                }
                break;
            }
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Basic fetch page function
 * @param {string} url - URL to navigate to
 * @param {Object} page - Playwright page
 * @returns {Promise<Object>} The page object
 */
async function basicFetchPage(url, page) {
    await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
    });
    return page;
}

module.exports = {
    PaginationHandler,
    getNextNumberedPage,
    getNextLoadMorePage,
    basicFetchPage
};