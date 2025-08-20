/**
 * UniversalProductDiscovery - Pattern-based product detection
 * 
 * Instead of hardcoding selectors, we discover products by:
 * 1. Identifying repeating DOM structures
 * 2. Looking for product indicators (price, image, title patterns)
 * 3. Learning from successful extractions
 */

class UniversalProductDiscovery {
  constructor(logger) {
    this.logger = logger;
    
    // Universal indicators that work across most sites
    this.productIndicators = {
      // Price patterns work universally
      pricePatterns: [
        /\$\d+\.?\d*/,  // $19.99
        /USD\s*\d+/,     // USD 20
        /€\d+/,          // €19
        /£\d+/,          // £19
      ],
      
      // Structure patterns - products usually have these
      structuralRequirements: {
        minElements: 2,  // At least image + text
        maxElements: 20, // Not too complex
        mustHave: ['link', 'text'], // Minimum requirements
        likelyHave: ['image', 'price'], // Common but not required
      }
    };
  }

  /**
   * Discover products without hardcoded selectors
   */
  async discoverProducts(page) {
    // Step 1: Find repeating structures
    const repeatingStructures = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      const classFrequency = {};
      
      // Count class frequencies
      elements.forEach(el => {
        if (el.className && typeof el.className === 'string') {
          el.className.split(' ').forEach(cls => {
            if (cls) {
              classFrequency[cls] = (classFrequency[cls] || 0) + 1;
            }
          });
        }
      });
      
      // Find classes that repeat 3+ times (likely product containers)
      return Object.entries(classFrequency)
        .filter(([cls, count]) => count >= 3 && count <= 100)
        .map(([cls]) => `.${cls}`);
    });

    // Step 2: Test each repeating structure for product indicators
    const products = [];
    for (const selector of repeatingStructures) {
      const candidates = await this.testSelector(page, selector);
      if (candidates.length > 0) {
        products.push(...candidates);
        this.logger.debug(`Found ${candidates.length} products with selector: ${selector}`);
        break; // Use first working selector
      }
    }

    return products;
  }

  async testSelector(page, selector) {
    return await page.evaluate((sel, priceRegexStrings) => {
      const elements = document.querySelectorAll(sel);
      const products = [];
      
      // Convert regex strings back to RegExp
      const pricePatterns = priceRegexStrings.map(p => new RegExp(p));
      
      elements.forEach(el => {
        // Look for product indicators
        const text = el.textContent || '';
        const hasPrice = pricePatterns.some(pattern => pattern.test(text));
        const hasLink = el.querySelector('a');
        const hasImage = el.querySelector('img');
        
        // If it looks like a product, extract it
        if ((hasPrice || hasImage) && hasLink) {
          products.push({
            url: hasLink.href,
            title: el.querySelector('h1,h2,h3,h4,h5,h6,[class*="title"],[class*="name"]')?.textContent?.trim(),
            price: text.match(/[\$€£]\d+\.?\d*/)?.[0],
            image: hasImage?.src,
            selector: sel
          });
        }
      });
      
      return products;
    }, selector, this.productIndicators.pricePatterns.map(r => r.source));
  }
}

module.exports = UniversalProductDiscovery;