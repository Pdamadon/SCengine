/**
 * LearningSelectorStrategy - Learn from successful extractions
 * 
 * Instead of hardcoding, we:
 * 1. Try multiple approaches
 * 2. Remember what worked
 * 3. Apply learned patterns to similar sites
 */

const fs = require('fs').promises;
const path = require('path');

class LearningSelectorStrategy {
  constructor(logger) {
    this.logger = logger;
    this.learnedPatterns = new Map();
    this.patternsFile = path.join(__dirname, '../../../data/learned_selectors.json');
    this.loadLearnedPatterns();
  }

  async loadLearnedPatterns() {
    try {
      const data = await fs.readFile(this.patternsFile, 'utf-8');
      const patterns = JSON.parse(data);
      this.learnedPatterns = new Map(patterns);
    } catch (error) {
      // File doesn't exist yet, start with empty patterns
      this.learnedPatterns = new Map();
    }
  }

  async discoverAndLearn(page, domain) {
    // Check if we've learned this domain before
    if (this.learnedPatterns.has(domain)) {
      const learned = this.learnedPatterns.get(domain);
      this.logger.info(`Using learned selectors for ${domain}`);
      return await this.extractWithSelectors(page, learned.selectors);
    }

    // Try to discover patterns
    const discoveryMethods = [
      this.tryCommonPatterns.bind(this),
      this.tryStructuralAnalysis.bind(this),
      this.tryVisualClustering.bind(this),
      this.trySemanticAnalysis.bind(this)
    ];

    for (const method of discoveryMethods) {
      const result = await method(page);
      if (result.products.length > 0) {
        // Success! Learn from it
        await this.learnFromSuccess(domain, result);
        return result.products;
      }
    }

    return [];
  }

  async tryCommonPatterns(page) {
    // Start with most common patterns across all e-commerce
    const commonSelectors = [
      '[class*="product"]:has(a):has(img)',
      '[class*="item"]:has(a):has([class*="price"])',
      '[class*="card"]:has(a):has(img)',
      'article:has(a):has(img)',
      '.grid > *:has(a):has(img)'
    ];

    for (const selector of commonSelectors) {
      const products = await this.extractWithSelector(page, selector);
      if (products.length >= 3) {  // At least 3 products to be valid
        return { products, selector, method: 'common-patterns' };
      }
    }

    return { products: [] };
  }

  async tryStructuralAnalysis(page) {
    // Analyze DOM structure to find repeating patterns
    const analysis = await page.evaluate(() => {
      // Find elements that repeat with similar structure
      const allElements = Array.from(document.querySelectorAll('*'));
      const structureMap = new Map();
      
      allElements.forEach(el => {
        // Create a structure signature
        const signature = {
          tag: el.tagName,
          childTags: Array.from(el.children).map(c => c.tagName).sort().join(','),
          hasLink: el.querySelector('a') !== null,
          hasImage: el.querySelector('img') !== null,
          hasPrice: /[\$€£]\d+/.test(el.textContent || '')
        };
        
        const key = JSON.stringify(signature);
        if (!structureMap.has(key)) {
          structureMap.set(key, []);
        }
        structureMap.get(key).push(el);
      });
      
      // Find structures that repeat 3+ times with product-like characteristics
      const candidates = [];
      structureMap.forEach((elements, signatureStr) => {
        const sig = JSON.parse(signatureStr);
        if (elements.length >= 3 && sig.hasLink && (sig.hasImage || sig.hasPrice)) {
          candidates.push({
            elements: elements.map(el => ({
              className: el.className,
              id: el.id,
              path: getPathTo(el)
            })),
            signature: sig
          });
        }
      });
      
      function getPathTo(element) {
        if (element.id) return '#' + element.id;
        if (element.className) return '.' + element.className.split(' ')[0];
        return element.tagName.toLowerCase();
      }
      
      return candidates;
    });

    // Test the most promising candidate
    if (analysis.length > 0) {
      const selector = analysis[0].elements[0].path;
      const products = await this.extractWithSelector(page, selector);
      if (products.length >= 3) {
        return { products, selector, method: 'structural-analysis' };
      }
    }

    return { products: [] };
  }

  async tryVisualClustering(page) {
    // Find visually similar elements (similar size, position pattern)
    // This would identify products by their visual layout
    return { products: [] }; // Simplified for example
  }

  async trySemanticAnalysis(page) {
    // Use semantic HTML and ARIA roles
    const semanticSelectors = [
      '[role="article"]:has(a)',
      '[itemtype*="Product"]',
      '[data-product]',
      '[aria-label*="product"]'
    ];

    for (const selector of semanticSelectors) {
      const products = await this.extractWithSelector(page, selector);
      if (products.length >= 3) {
        return { products, selector, method: 'semantic' };
      }
    }

    return { products: [] };
  }

  async extractWithSelector(page, selector) {
    try {
      return await page.evaluate((sel) => {
        const elements = document.querySelectorAll(sel);
        return Array.from(elements).map(el => ({
          url: el.querySelector('a')?.href,
          title: el.querySelector('h1,h2,h3,h4,h5,h6,[class*="title"]')?.textContent?.trim(),
          price: (el.textContent || '').match(/[\$€£]\d+\.?\d*/)?.[0],
          image: el.querySelector('img')?.src
        })).filter(p => p.url);
      }, selector);
    } catch (error) {
      return [];
    }
  }

  async extractWithSelectors(page, selectors) {
    for (const selector of selectors) {
      const products = await this.extractWithSelector(page, selector);
      if (products.length > 0) return products;
    }
    return [];
  }

  async learnFromSuccess(domain, result) {
    this.learnedPatterns.set(domain, {
      selector: result.selector,
      method: result.method,
      productCount: result.products.length,
      learnedAt: new Date().toISOString()
    });

    // Persist to file
    await fs.writeFile(
      this.patternsFile,
      JSON.stringify(Array.from(this.learnedPatterns.entries()), null, 2)
    );

    this.logger.info(`Learned selector for ${domain}: ${result.selector} via ${result.method}`);
  }
}

module.exports = LearningSelectorStrategy;