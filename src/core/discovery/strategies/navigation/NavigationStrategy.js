/**
 * NavigationStrategy.js
 *
 * Base class for all navigation discovery strategies
 * Defines the interface and common functionality for strategies
 *
 * Each strategy must implement:
 * - execute(page) - Returns discovered navigation elements
 * - getName() - Returns strategy name for tracking
 *
 * Standard result format:
 * {
 *   items: [...],      // Array of discovered navigation elements
 *   confidence: 0-1,   // Confidence in the results
 *   metadata: {}       // Additional strategy-specific data
 * }
 */

class NavigationStrategy {
  constructor(logger, options = {}) {
    this.logger = logger || console;
    this.options = options;
    this.performanceMetrics = {
      executionTime: 0,
      elementsFound: 0,
      lastRun: null,
    };
  }

  /**
   * Execute the strategy on the given page
   * Must be implemented by subclasses
   *
   * @param {Page} page - Playwright page object
   * @returns {Promise<Object>} Discovery results
   */
  async execute(page) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Get the strategy name
   * @returns {string} Strategy name
   */
  getName() {
    return this.constructor.name;
  }

  /**
   * Helper method to measure execution time
   */
  async measureExecution(fn) {
    const startTime = Date.now();
    try {
      const result = await fn();
      this.performanceMetrics.executionTime = Date.now() - startTime;
      this.performanceMetrics.lastRun = new Date().toISOString();
      return result;
    } catch (error) {
      this.performanceMetrics.executionTime = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * Standard format for navigation items
   */
  formatNavigationItem(element) {
    return {
      name: element.text || element.name || '',
      text: element.text || element.innerText || '',
      url: element.href || element.url || null,
      selector: element.selector || null,
      element_type: element.tagName || element.type || 'unknown',
      has_dropdown: element.has_dropdown || false,
      is_visible: element.is_visible !== false,
      attributes: element.attributes || {},
      children: element.children || [],
      type: element.nav_type || 'navigation', // main_section, dropdown, sidebar, etc.
      purpose: element.purpose || 'navigation',
      discovered_at: new Date().toISOString(),
    };
  }

  /**
   * Check if an element is likely a navigation element
   */
  isNavigationElement(element) {
    if (!element) {return false;}

    const text = (element.text || element.innerText || '').toLowerCase();
    const url = (element.href || element.url || '').toLowerCase();

    // Exclude non-navigation items
    const excludePatterns = [
      'cookie', 'privacy', 'terms', 'copyright', 'legal',
      'facebook', 'twitter', 'instagram', 'youtube', 'pinterest',
      'email', 'newsletter', 'subscribe',
    ];

    if (excludePatterns.some(pattern => text.includes(pattern) || url.includes(pattern))) {
      return false;
    }

    // Include navigation items
    const includePatterns = [
      'shop', 'product', 'category', 'collection', 'browse',
      'men', 'women', 'kids', 'baby', 'home', 'sale', 'new',
      'clothing', 'shoes', 'accessories', 'bags', 'jewelry',
    ];

    return includePatterns.some(pattern => text.includes(pattern) || url.includes(pattern)) ||
           (url && url.includes('/') && !url.includes('#'));
  }

  /**
   * Deduplicate navigation items by URL
   */
  deduplicateItems(items) {
    const seen = new Set();
    return items.filter(item => {
      const key = item.url || item.selector || item.text;
      if (seen.has(key)) {return false;}
      seen.add(key);
      return true;
    });
  }

  /**
   * Calculate confidence score based on various factors
   */
  calculateConfidence(items, factors = {}) {
    const {
      minItems = 3,
      expectedPatterns = [],
      requiredAttributes = [],
      penaltyForDuplicates = 0.1,
    } = factors;

    let confidence = 0.5; // Base confidence

    // More items = higher confidence
    if (items.length >= minItems) {
      confidence += Math.min(items.length / 20, 0.3);
    }

    // Check for expected patterns
    if (expectedPatterns.length > 0) {
      const matchedPatterns = expectedPatterns.filter(pattern =>
        items.some(item =>
          item.text?.includes(pattern) ||
          item.url?.includes(pattern),
        ),
      );
      confidence += (matchedPatterns.length / expectedPatterns.length) * 0.2;
    }

    // Check for required attributes
    if (requiredAttributes.length > 0) {
      const hasAttributes = items.some(item =>
        requiredAttributes.every(attr => item[attr]),
      );
      if (hasAttributes) {confidence += 0.1;}
    }

    // Penalize if many duplicates were removed
    const uniqueCount = new Set(items.map(i => i.url)).size;
    if (uniqueCount < items.length * 0.8) {
      confidence -= penaltyForDuplicates;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Log strategy execution results
   */
  logResults(items, confidence, duration) {
    this.logger.debug(`${this.getName()} completed:`, {
      itemsFound: items.length,
      confidence: confidence.toFixed(2),
      duration: `${duration}ms`,
      sampleItems: items.slice(0, 3).map(i => i.text || i.name),
    });
  }

  /**
   * Helper to safely evaluate in page context
   */
  async safeEvaluate(page, fn, ...args) {
    try {
      return await page.evaluate(fn, ...args);
    } catch (error) {
      this.logger.warn(`${this.getName()} evaluation error: ${error.message}`);
      return null;
    }
  }

  /**
   * Wait for navigation elements to be ready
   */
  async waitForNavigation(page, timeout = 10000) {
    try {
      // Try common navigation selectors
      const selectors = [
        'nav', '[role="navigation"]', '.navigation', '.menu',
        '.navbar', 'header', '[class*="nav"]',
      ];

      for (const selector of selectors) {
        try {
          await page.waitForSelector(selector, {
            timeout: timeout / selectors.length,
            state: 'attached',
          });
          return true;
        } catch {
          // Try next selector
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Extract text content safely
   */
  extractText(element) {
    if (typeof element === 'string') {return element;}
    return element?.text ||
           element?.innerText ||
           element?.textContent ||
           element?.name ||
           '';
  }

  /**
   * Generate a CSS selector for an element
   */
  generateSelector(element) {
    if (element.selector) {return element.selector;}

    if (element.id) {
      return `#${element.id}`;
    }

    if (element.className) {
      const classes = element.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        return `.${classes[0]}`;
      }
    }

    if (element.tagName) {
      return element.tagName.toLowerCase();
    }

    return null;
  }
}

module.exports = NavigationStrategy;
