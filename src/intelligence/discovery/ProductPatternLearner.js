/**
 * ProductPatternLearner - Intelligently learns product URL patterns for any site
 * 
 * This class discovers what product URLs look like by:
 * 1. Testing sample links from category pages
 * 2. Detecting if they lead to product pages
 * 3. Learning the patterns that work
 * 4. Applying patterns to find all products
 * 
 * This makes the scraper truly universal without hardcoding site-specific patterns.
 */

class ProductPatternLearner {
  constructor(logger) {
    this.logger = logger;
    this.learnedPatterns = new Map(); // domain -> patterns
    this.confidenceThreshold = 3; // Need 3+ confirmations
  }

  /**
   * Learn product URL patterns for a given page
   */
  async learnProductPatterns(page, domain) {
    this.logger.info('Starting intelligent product pattern learning', { domain });

    // Check if we already have learned patterns for this domain
    if (this.learnedPatterns.has(domain)) {
      this.logger.info('Using cached patterns for domain', { domain });
      return this.learnedPatterns.get(domain);
    }

    // Get candidate links to test
    const candidates = await this.getCandidateLinks(page);
    this.logger.info(`Found ${candidates.length} candidate links to test`);
    
    // Group links by URL pattern similarity
    const patternGroups = this.groupByUrlPattern(candidates);
    this.logger.info(`Grouped into ${Object.keys(patternGroups).length} patterns`);
    
    // Find the most common pattern (likely product URLs)
    const sortedPatterns = Object.entries(patternGroups)
      .sort(([,a], [,b]) => b.length - a.length)
      .filter(([pattern, urls]) => urls.length >= 3); // Need at least 3 similar URLs
    
    let confirmedProducts = [];
    const testedUrls = new Set();
    
    if (sortedPatterns.length > 0) {
      const [topPattern, topUrls] = sortedPatterns[0];
      this.logger.info(`Most common pattern: ${topPattern} (${topUrls.length} URLs)`);
      
      // Test just a few samples from the most common pattern
      const samplesToTest = topUrls.slice(0, 5);
      this.logger.info(`Testing ${samplesToTest.length} samples from top pattern`);
      
      for (const candidate of samplesToTest) {
        testedUrls.add(candidate.url);
        
        // Test if this is a product page
        const isProduct = await this.testIfProductPage(page, candidate.url);
        
        if (isProduct) {
          confirmedProducts.push({
            url: candidate.url,
            selector: candidate.selector,
            urlPattern: this.extractUrlPattern(candidate.url),
            containerClass: candidate.containerClass,
            linkText: candidate.linkText
          });
          
          this.logger.info('Confirmed product page', {
            url: candidate.url.substring(0, 80) + '...'
          });
        }
      }
      
      // Lower the threshold since Gap has tricky product pages
      // If even 2 samples match the pattern, trust it
      if (confirmedProducts.length >= 2 || 
          (confirmedProducts.length >= 1 && topUrls[0].hasProductKeyword)) {
        this.logger.info(`Pattern confirmed! ${confirmedProducts.length}/${samplesToTest.length} were verified as product pages`);
        this.logger.info(`Trusting pattern because URLs contain product indicators`);
        
        // Add ALL URLs from this pattern group as confirmed
        // We trust the pattern now
        topUrls.forEach(candidate => {
          confirmedProducts.push({
            url: candidate.url,
            selector: candidate.selector,
            urlPattern: this.extractUrlPattern(candidate.url),
            containerClass: candidate.containerClass,
            linkText: candidate.linkText
          });
        });
      }
    } else {
      // Fallback to original logic if no clear pattern groups
      this.logger.info('No clear pattern groups found, falling back to individual testing');
      let testsPerformed = 0;
      const maxTests = 10;
      
      for (const candidate of candidates) {
        if (testedUrls.has(candidate.url)) continue;
        if (this.isObviouslyNotProduct(candidate.url)) continue;
        
        testedUrls.add(candidate.url);
        testsPerformed++;
        
        const isProduct = await this.testIfProductPage(page, candidate.url);
        
        if (isProduct) {
          confirmedProducts.push({
            url: candidate.url,
            selector: candidate.selector,
            urlPattern: this.extractUrlPattern(candidate.url),
            containerClass: candidate.containerClass,
            linkText: candidate.linkText
          });
        }
        
        if (testsPerformed >= maxTests) break;
      }
    }

    // Consolidate and store learned patterns
    const patterns = this.consolidatePatterns(confirmedProducts);
    this.learnedPatterns.set(domain, patterns);

    this.logger.info('Pattern learning complete', {
      domain,
      patternsFound: patterns.urlPatterns.length,
      selectorsFound: patterns.selectors.length,
      confidence: patterns.confidence
    });

    return patterns;
  }

  /**
   * Group URLs by their pattern similarity
   */
  groupByUrlPattern(candidates) {
    const groups = {};
    
    candidates.forEach(candidate => {
      try {
        const url = new URL(candidate.url);
        
        // Create a pattern key based on URL structure
        // Replace numbers with # and specific IDs with *
        const pathPattern = url.pathname
          .replace(/\d+/g, '#')  // Replace numbers with #
          .replace(/[a-f0-9]{8,}/gi, '*'); // Replace long hex strings with *
        
        // Include key query parameters in the pattern
        const hasProductParam = url.searchParams.has('pid') || 
                               url.searchParams.has('id') || 
                               url.searchParams.has('sku');
        
        const patternKey = `${pathPattern}${hasProductParam ? '?product_param' : ''}`;
        
        if (!groups[patternKey]) {
          groups[patternKey] = [];
        }
        groups[patternKey].push(candidate);
      } catch (e) {
        // Invalid URL, skip
      }
    });
    
    return groups;
  }

  /**
   * Get all candidate links from the current page with smart prioritization
   */
  async getCandidateLinks(page) {
    // Wait a bit for dynamic content to load
    await page.waitForTimeout(2000);
    
    return await page.evaluate(() => {
      const links = [];
      const seen = new Set();

      // Strategy 1: Find links in product containers
      const productContainers = document.querySelectorAll([
        '[class*="product-card"]',
        '[class*="product-item"]',
        '[class*="product-tile"]',
        '[class*="product_card"]',
        '[class*="product_item"]',
        '[class*="product_tile"]',
        '[data-testid*="product"]',
        '[data-product-id]',
        'article[class*="product"]',
        '[class*="grid"] [class*="item"]',
        '[class*="grid"] > div > a',
        // More generic patterns
        '[class*="card"][class*="link"]',
        '[class*="tile"][class*="link"]',
        'div[class*="result"] a'
      ].join(', '));

      productContainers.forEach(container => {
        // Find all links within this product container
        const containerLinks = container.tagName === 'A' ? [container] : container.querySelectorAll('a[href]');
        
        containerLinks.forEach(link => {
          const href = link.href;
          if (!seen.has(href) && href.includes(window.location.hostname) && !href.includes('#')) {
            seen.add(href);
            
            const urlObj = new URL(href);
            links.push({
              url: href,
              linkText: link.textContent.trim().substring(0, 50),
              selector: link.className ? `.${link.className.split(' ')[0]}` : 'a',
              containerClass: container.className || '',
              hasImage: !!container.querySelector('img'),
              depth: urlObj.pathname.split('/').filter(s => s).length,
              hasProductKeyword: href.includes('product') || href.includes('/p/') || href.includes('/pd/') || href.includes('?pid='),
              hasParams: urlObj.search.length > 0,
              paramKeys: Array.from(urlObj.searchParams.keys()),
              fromProductContainer: true
            });
          }
        });
      });

      // Strategy 2: Find all other links on the page (fallback)
      document.querySelectorAll('a[href]').forEach(link => {
        const href = link.href;
        
        // Skip if we've seen this URL
        if (seen.has(href)) return;
        seen.add(href);

        // Skip external links and anchors
        if (!href.includes(window.location.hostname) || href.includes('#')) return;

        // Get context about the link
        const parent = link.closest('[class*="product"], [class*="item"], [class*="card"], article, li, div');
        
        // Get URL object for analysis
        const urlObj = new URL(href);
        
        links.push({
          url: href,
          linkText: link.textContent.trim().substring(0, 50),
          selector: link.className ? `.${link.className.split(' ')[0]}` : 'a',
          containerClass: parent ? parent.className : '',
          hasImage: !!link.querySelector('img'),
          depth: urlObj.pathname.split('/').filter(s => s).length,
          hasProductKeyword: href.includes('product') || href.includes('/p/') || href.includes('/pd/') || href.includes('?pid='),
          hasParams: urlObj.search.length > 0,
          paramKeys: Array.from(urlObj.searchParams.keys()),
          fromProductContainer: false
        });
      });

      // Smart prioritization - links more likely to be products get higher scores
      return links.sort((a, b) => {
        let aScore = 0, bScore = 0;
        
        // Highest priority: links from product containers
        if (a.fromProductContainer) aScore += 30;
        if (b.fromProductContainer) bScore += 30;
        
        // Strong indicators (URL patterns)
        if (a.hasProductKeyword) aScore += 20;
        if (b.hasProductKeyword) bScore += 20;
        
        // Has product ID parameter
        if (a.paramKeys.some(k => k.includes('pid') || k.includes('id') || k.includes('sku'))) aScore += 15;
        if (b.paramKeys.some(k => k.includes('pid') || k.includes('id') || k.includes('sku'))) bScore += 15;
        
        // Container indicates product
        if (a.containerClass.match(/product|item|card|tile/i)) aScore += 10;
        if (b.containerClass.match(/product|item|card|tile/i)) bScore += 10;
        
        // Has image (products often have images)
        if (a.hasImage) aScore += 5;
        if (b.hasImage) bScore += 5;
        
        // Appropriate URL depth (not too shallow, not too deep)
        if (a.depth >= 2 && a.depth <= 4) aScore += 5;
        if (b.depth >= 2 && b.depth <= 4) bScore += 5;
        
        // Has parameters (products often have params)
        if (a.hasParams) aScore += 3;
        if (b.hasParams) bScore += 3;
        
        // Negative indicators (likely not products)
        if (a.url.includes('/category') || a.url.includes('/collection')) aScore -= 10;
        if (b.url.includes('/category') || b.url.includes('/collection')) bScore -= 10;
        
        return bScore - aScore;
      });
    });
  }

  /**
   * Test if a URL leads to a product page
   */
  async testIfProductPage(currentPage, url) {
    // Create a new page for testing
    const browser = currentPage.context().browser();
    const context = await browser.newContext();
    const testPage = await context.newPage();

    try {
      // Navigate to the URL with timeout
      await testPage.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 10000 
      });

      // Check for product page indicators using COUNTING logic
      const indicators = await testPage.evaluate(() => {
        // First, try to identify the main product area vs recommendations
        // Look for the FIRST major product section, before recommendations
        const mainProductArea = document.querySelector([
          '[class*="product-detail"]:not([class*="recommendation"])',
          '[class*="product-info"]:not([class*="recommendation"])',
          '[class*="pdp-content"]',
          '[class*="product-main"]',
          '[data-testid="product-detail"]',
          // Gap specific patterns
          '[class*="pdp-pricing"]',
          'div[class*="product"]:has(h1)',
          // Generic: area with h1 title and price
          'main > div:has(h1):has([class*="price"])'
        ].join(', '));
        
        // Count key elements - ONLY in the main product area, not recommendations
        const priceElements = mainProductArea.querySelectorAll([
          '[class*="price"]:not(s):not(del):not([class*="old"])',
          '[data-testid*="price"]',
          '[itemprop="price"]',
          '.money:not(s):not(del)',
          '[class*="cost"]:not(s)'
        ].join(', '));
        
        // Look for add-to-cart ONLY in main product area, exclude recommendations
        const allAddToCart = mainProductArea.querySelectorAll([
          '[class*="add-to-cart"], [class*="add_to_cart"], [class*="addtocart"]',
          '[class*="add-to-bag"], [class*="add_to_bag"], [class*="addtobag"]',
          'button[class*="add"][class*="cart"], button[class*="add"][class*="bag"]',
          '[data-testid*="add-to-cart"], [data-testid*="add-to-bag"]',
          '[id*="add-to-cart"], [id*="AddToCart"]',
          'button[type="submit"][name*="add"]',
          'form[action*="cart"] button[type="submit"]'
        ].join(', '));
        
        // Filter out add-to-cart buttons that are in recommendation sections
        const addToCartButtons = Array.from(allAddToCart).filter(btn => {
          const parent = btn.closest('[class*="recommendation"], [class*="similar"], [class*="also-like"], [class*="carousel"], [class*="slider"]');
          return !parent; // Only count if NOT in a recommendation section
        });

        const productTitles = document.querySelectorAll('h1, h2[class*="product"], h2[class*="title"]');
        
        // Look for product grid/list containers (category page indicator)
        const productGrids = document.querySelectorAll([
          '[class*="product-grid"], [class*="product-list"]',
          '[class*="products-grid"], [class*="products-list"]',
          '[class*="item-grid"], [class*="items-grid"]',
          '[class*="collection-grid"], [class*="category-grid"]',
          '[role="list"][class*="product"]',
          '[data-testid*="product-grid"], [data-testid*="product-list"]'
        ].join(', '));
        
        const productCards = document.querySelectorAll([
          '[class*="product-card"], [class*="product-item"], [class*="product-tile"]',
          '[class*="grid"] > [class*="product"]',
          '[class*="grid"] > [class*="item"]',
          '[data-testid*="product-card"]',
          'article[class*="product"]',
          // Also look for repeated product structures
          'a[href*="product"] > div > img',
          '[class*="grid"] a[href*="/p/"], [class*="grid"] a[href*="/pd/"]'
        ].join(', '));

        // Check for variant selectors (strong single product indicator)
        const variantSelectors = document.querySelectorAll([
          'select[name*="size"], select[name*="Size"]',
          'select[name*="color"], select[name*="Color"]',
          'select[name*="variant"], select[name*="option"]',
          '[class*="variant-selector"], [class*="option-selector"]',
          'input[type="radio"][name*="size"], input[type="radio"][name*="color"]',
          '[data-testid*="variant"], [data-testid*="size-selector"]'
        ].join(', '));

        // Check for quantity selector (strong single product indicator)
        const quantitySelector = document.querySelector([
          'input[type="number"][name*="quantity"]',
          'select[name*="quantity"], select[name*="qty"]',
          '[class*="quantity-selector"]',
          'input[id*="quantity"], input[id*="qty"]'
        ].join(', '));

        // Check for category page indicators
        const hasFilters = !!document.querySelector([
          '[class*="filter"], [class*="facet"]',
          '[data-testid*="filter"]',
          'aside[class*="filter"], div[class*="filter-menu"]'
        ].join(', '));
        
        const hasSorting = !!document.querySelector([
          'select[name*="sort"], select[class*="sort"]',
          '[class*="sort-by"], [class*="sortby"]',
          '[data-testid*="sort"]'
        ].join(', '));

        const hasPagination = !!document.querySelector([
          '[class*="pagination"], [class*="paging"]',
          '[class*="load-more"], button[class*="more"]',
          'nav[aria-label*="pagination"]'
        ].join(', '));

        // Product image galleries
        const galleryImages = document.querySelectorAll([
          '[class*="gallery"] img, [class*="Gallery"] img',
          '[class*="slider"] img, [class*="carousel"] img',
          '[class*="product-image"], [class*="product-photo"]',
          '[data-testid*="product-image"]'
        ].join(', '));

        // Analysis
        const analysis = {
          // Counts
          priceCount: priceElements.length,
          addToCartCount: addToCartButtons.length,
          productTitleCount: productTitles.length,
          productCardCount: productCards.length,
          productGridCount: productGrids.length,
          variantSelectorCount: variantSelectors.length,
          galleryImageCount: galleryImages.length,
          
          // Booleans
          hasProductGrid: productGrids.length > 0,
          hasQuantitySelector: !!quantitySelector,
          hasFilters: hasFilters,
          hasSorting: hasSorting,
          hasPagination: hasPagination,
          
          // URL analysis
          urlHasProductKeyword: window.location.href.includes('product') ||
                               window.location.href.includes('/p/') ||
                               window.location.href.includes('/pd/') ||
                               window.location.href.includes('/item/') ||
                               window.location.href.includes('?pid=') ||
                               window.location.href.includes('&pid=')
        };

        // Decision logic based on counts
        const isSingleProduct = 
          // NO product grid is the key - if no grid, likely a product page
          (!analysis.hasProductGrid && (
            analysis.urlHasProductKeyword ||  // URL suggests product
            analysis.hasQuantitySelector ||    // Has quantity selector
            analysis.variantSelectorCount > 5  // Has many size/color options
          ));

        const isMultipleProducts = 
          // HAS product grid (strongest category indicator)
          analysis.hasProductGrid ||
          // Many product cards
          analysis.productCardCount > 3 ||
          // Many prices or add-to-cart buttons
          analysis.priceCount > 5 ||
          analysis.addToCartCount > 2 ||
          // Has category page features
          (analysis.hasFilters && analysis.priceCount > 2) ||
          (analysis.hasPagination && analysis.productCardCount > 1);

        // Calculate confidence score
        let score = 0;
        
        // STRONGEST negative: Has product grid
        if (analysis.hasProductGrid) {
          score -= 50; // Product grid = definitely category page
        }
        
        // Positive indicators (product page)
        if (!analysis.hasProductGrid && analysis.addToCartCount === 1) {
          score += 40; // Single add-to-cart without grid
        }
        if (analysis.hasQuantitySelector) score += 30;
        if (analysis.galleryImageCount > 1 && !analysis.hasProductGrid) score += 15;
        if (analysis.urlHasProductKeyword) score += 10;
        
        // Negative indicators (category page)
        if (analysis.productCardCount > 3) score -= 30;
        if (analysis.addToCartCount >= 3) score -= 30;
        if (analysis.hasFilters) score -= 20;
        if (analysis.hasPagination) score -= 20;
        if (analysis.hasSorting) score -= 15;

        // Special case: if URL strongly indicates product, be more lenient
        const isLikelyProduct = analysis.urlHasProductKeyword && !analysis.hasProductGrid;
        
        return {
          ...analysis,
          isSingleProduct,
          isMultipleProducts,
          score,
          isProduct: (isSingleProduct && !isMultipleProducts) || 
                    (isLikelyProduct && score >= -10) // More lenient for product URLs
        };
      });

      this.logger.debug('Product page test result', {
        url,
        score: indicators.score,
        isProduct: indicators.isProduct,
        hasProductGrid: indicators.hasProductGrid,
        productGridCount: indicators.productGridCount,
        productCardCount: indicators.productCardCount,
        priceCount: indicators.priceCount,
        addToCartCount: indicators.addToCartCount,
        variantSelectorCount: indicators.variantSelectorCount,
        isSingleProduct: indicators.isSingleProduct,
        isMultipleProducts: indicators.isMultipleProducts
      });

      return indicators.isProduct;

    } catch (error) {
      this.logger.warn('Failed to test URL', { url, error: error.message });
      return false;

    } finally {
      await testPage.close();
      await context.close();
    }
  }

  /**
   * Check if URL is obviously not a product
   */
  isObviouslyNotProduct(url) {
    const nonProductPatterns = [
      /\/category\//i,
      /\/categories\//i,
      /\/collections?\//i,
      /\/pages?\//i,
      /\/account/i,
      /\/cart/i,
      /\/checkout/i,
      /\/login/i,
      /\/register/i,
      /\/search/i,
      /\/blog/i,
      /\/about/i,
      /\/contact/i,
      /\/privacy/i,
      /\/terms/i,
      /\/help/i,
      /\/faq/i,
      /#/,
      /javascript:/i,
      /mailto:/i,
      /tel:/i
    ];

    return nonProductPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Extract URL pattern from a confirmed product URL
   */
  extractUrlPattern(url) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      const params = urlObj.search;

      // Extract patterns
      const patterns = {
        // Path-based patterns
        pathPattern: path.replace(/[\w-]+/g, '*').replace(/\d+/g, '#'),
        
        // Parameter patterns
        hasParams: params.length > 0,
        paramKeys: params ? Array.from(urlObj.searchParams.keys()) : [],
        
        // Specific patterns
        productKeyword: null
      };

      // Identify product keyword in path
      if (path.includes('/product')) patterns.productKeyword = '/product';
      else if (path.includes('/p/')) patterns.productKeyword = '/p/';
      else if (path.includes('/pd/')) patterns.productKeyword = '/pd/';
      else if (path.includes('/item/')) patterns.productKeyword = '/item/';
      else if (path.includes('.do')) patterns.productKeyword = '.do';

      return patterns;

    } catch (error) {
      return null;
    }
  }

  /**
   * Find consistent pattern across confirmed products
   */
  findConsistentPattern(confirmedProducts) {
    if (confirmedProducts.length < 2) return null;

    // Count pattern occurrences
    const patternCounts = {};
    
    confirmedProducts.forEach(product => {
      const key = JSON.stringify(product.urlPattern);
      patternCounts[key] = (patternCounts[key] || 0) + 1;
    });

    // Find most common pattern
    const mostCommon = Object.entries(patternCounts)
      .sort(([,a], [,b]) => b - a)[0];

    if (mostCommon && mostCommon[1] >= 2) {
      return JSON.parse(mostCommon[0]);
    }

    return null;
  }

  /**
   * Verify a pattern by testing additional URLs that match it
   */
  async verifyPattern(page, pattern, remainingCandidates, testedUrls) {
    const verification = {
      verified: false,
      confirmations: 0,
      failures: 0,
      confidence: 0,
      reason: '',
      confirmedProducts: []
    };

    // Find URLs that match this pattern
    const matchingUrls = remainingCandidates.filter(candidate => {
      // Skip already tested URLs
      if (testedUrls.has(candidate.url)) return false;
      
      // Check if URL matches the pattern
      const urlPattern = this.extractUrlPattern(candidate.url);
      return this.patternsMatch(pattern, urlPattern);
    });

    if (matchingUrls.length === 0) {
      verification.reason = 'No matching URLs found for verification';
      return verification;
    }

    // Test up to 5 matching URLs
    const samplesToTest = Math.min(5, matchingUrls.length);
    
    for (let i = 0; i < samplesToTest; i++) {
      const candidate = matchingUrls[i];
      testedUrls.add(candidate.url);
      
      const isProduct = await this.testIfProductPage(page, candidate.url);
      
      if (isProduct) {
        verification.confirmations++;
        verification.confirmedProducts.push({
          url: candidate.url,
          selector: candidate.selector,
          urlPattern: this.extractUrlPattern(candidate.url),
          containerClass: candidate.containerClass,
          linkText: candidate.linkText
        });
        
        this.logger.debug('Pattern verification: confirmed', {
          url: candidate.url,
          confirmations: verification.confirmations
        });
      } else {
        verification.failures++;
        this.logger.debug('Pattern verification: failed', {
          url: candidate.url,
          failures: verification.failures
        });
        
        // If we have too many failures, pattern is not reliable
        if (verification.failures >= 2) {
          verification.reason = 'Too many verification failures';
          return verification;
        }
      }
    }

    // Determine if pattern is verified
    if (verification.confirmations >= 3) {
      verification.verified = true;
      verification.confidence = (verification.confirmations / (verification.confirmations + verification.failures)) * 100;
    } else if (verification.confirmations >= 2 && verification.failures === 0) {
      verification.verified = true;
      verification.confidence = 100;
    } else {
      verification.reason = 'Not enough confirmations';
    }

    return verification;
  }

  /**
   * Check if two URL patterns match
   */
  patternsMatch(pattern1, pattern2) {
    if (!pattern1 || !pattern2) return false;
    
    // Check if product keywords match
    if (pattern1.productKeyword !== pattern2.productKeyword) return false;
    
    // Check if parameter patterns match
    if (pattern1.hasParams !== pattern2.hasParams) return false;
    
    if (pattern1.hasParams && pattern2.hasParams) {
      // Check if they have similar parameter keys
      const keys1 = new Set(pattern1.paramKeys);
      const keys2 = new Set(pattern2.paramKeys);
      
      // At least one common key
      const commonKeys = pattern1.paramKeys.filter(k => keys2.has(k));
      if (commonKeys.length === 0) return false;
    }
    
    // Check path pattern similarity
    if (pattern1.pathPattern && pattern2.pathPattern) {
      // Simple check: same number of path segments
      if (pattern1.pathPattern.split('/').length !== pattern2.pathPattern.split('/').length) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Consolidate learned patterns into actionable rules
   */
  consolidatePatterns(confirmedProducts) {
    const patterns = {
      urlPatterns: [],
      selectors: [],
      confidence: 0,
      samples: []
    };

    if (confirmedProducts.length === 0) {
      return patterns;
    }

    // Extract unique URL patterns
    const urlPatternMap = new Map();
    confirmedProducts.forEach(product => {
      const key = JSON.stringify(product.urlPattern);
      if (!urlPatternMap.has(key)) {
        urlPatternMap.set(key, {
          pattern: product.urlPattern,
          count: 0,
          examples: []
        });
      }
      const entry = urlPatternMap.get(key);
      entry.count++;
      entry.examples.push(product.url);
    });

    // Extract unique selectors
    const selectorMap = new Map();
    confirmedProducts.forEach(product => {
      if (!selectorMap.has(product.selector)) {
        selectorMap.set(product.selector, {
          selector: product.selector,
          count: 0
        });
      }
      selectorMap.get(product.selector).count++;
    });

    // Convert to arrays and sort by frequency
    patterns.urlPatterns = Array.from(urlPatternMap.values())
      .sort((a, b) => b.count - a.count);
    
    patterns.selectors = Array.from(selectorMap.values())
      .sort((a, b) => b.count - a.count)
      .map(s => s.selector);

    // Calculate confidence based on consistency
    const topPatternCount = patterns.urlPatterns[0]?.count || 0;
    patterns.confidence = Math.min(100, (topPatternCount / confirmedProducts.length) * 100);

    // Store sample URLs for reference
    patterns.samples = confirmedProducts.slice(0, 5).map(p => p.url);

    return patterns;
  }

  /**
   * Apply learned patterns to find all product URLs on a page
   */
  async findAllProductUrls(page, patterns) {
    if (!patterns || patterns.urlPatterns.length === 0) {
      this.logger.warn('No patterns to apply');
      return [];
    }

    const topPattern = patterns.urlPatterns[0].pattern;
    
    return await page.evaluate((pattern) => {
      const productUrls = new Set();
      
      // Find all links
      document.querySelectorAll('a[href]').forEach(link => {
        const href = link.href;
        
        // Check if URL matches learned pattern
        let matches = false;
        
        // Check for product keyword
        if (pattern.productKeyword && href.includes(pattern.productKeyword)) {
          matches = true;
        }
        
        // Check for parameter patterns
        if (pattern.hasParams && pattern.paramKeys.length > 0) {
          const url = new URL(href);
          const hasRequiredParams = pattern.paramKeys.some(key => 
            url.searchParams.has(key)
          );
          if (hasRequiredParams) matches = true;
        }
        
        // Check path pattern (simplified)
        if (pattern.pathPattern) {
          const path = new URL(href).pathname;
          // This is simplified - in production would use more sophisticated matching
          if (path.split('/').length === pattern.pathPattern.split('/').length) {
            matches = true;
          }
        }
        
        if (matches) {
          productUrls.add(href);
        }
      });
      
      return Array.from(productUrls);
    }, topPattern);
  }
}

module.exports = ProductPatternLearner;