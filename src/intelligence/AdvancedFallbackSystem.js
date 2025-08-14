/**
 * AdvancedFallbackSystem - Contextual fallback generation for failed selectors
 * Implements visual similarity, structural relationships, platform patterns, and content-based alternatives
 */
class AdvancedFallbackSystem {
  constructor(logger = null) {
    this.logger = logger;

    // Performance tracking for fallback generation
    this.performanceMetrics = {
      totalFallbacksGenerated: 0,
      successfulFallbacks: 0,
      averageGenerationTime: 0,
      strategySuccessRates: {
        'visual-similarity': 0,
        'structural': 0,
        'platform-specific': 0,
        'content-based': 0,
        'adaptive-pattern': 0,
      },
    };

    // Learning system for continuous improvement
    this.learningData = {
      successfulPatterns: new Map(),
      failedPatterns: new Map(),
      contextSuccessRates: new Map(),
    };

    // Platform-specific fallback patterns
    this.platformPatterns = {
      shopify: {
        productContainer: ['.product-form', '.grid__item', '.card-wrapper', '.product-card-wrapper'],
        productTitle: ['.product__title', '.card__heading', '.product-form__title', 'h1', 'h2'],
        productPrice: ['.price', '.price__current', '.money', '.price-item--regular'],
        productImage: ['.product__media img', '.card__media img', '.grid-product__image'],
        addToCart: ['[name="add"]', '.btn--add-to-cart', '.product-form__cart-submit'],
        navigation: ['.site-nav', '.main-nav', '.navigation', '.header__navigation'],
      },
      woocommerce: {
        productContainer: ['.product', '.woocommerce-LoopProduct-link', '.product-small'],
        productTitle: ['.woocommerce-loop-product__title', '.product-title', 'h2.woocommerce-loop-product__title'],
        productPrice: ['.price', '.woocommerce-Price-amount', '.amount'],
        productImage: ['.wp-post-image', '.product-small img', '.woocommerce-LoopProduct-link img'],
        addToCart: ['.add_to_cart_button', '.single_add_to_cart_button', '.button.product_type_simple'],
        navigation: ['.woocommerce-breadcrumb', '.product-categories', '.widget_product_categories'],
      },
      magento: {
        productContainer: ['.product-item', '.product-item-info', '.product-item-details'],
        productTitle: ['.product-item-name', '.product-item-link', '.product-name'],
        productPrice: ['.price-box', '.price', '.regular-price'],
        productImage: ['.product-image-photo', '.product-item-photo img'],
        addToCart: ['#product-addtocart-button', '.action.tocart', '.btn-cart'],
        navigation: ['.breadcrumbs', '.navigation', '.category-menu'],
      },
      generic: {
        productContainer: ['.product', '.item', '.card', '.grid-item', '[data-product]'],
        productTitle: ['h1', 'h2', 'h3', '.title', '.name', '.product-title'],
        productPrice: ['.price', '.cost', '.amount', '.money', '.pricing'],
        productImage: ['img', '.image', '.photo', '.picture'],
        addToCart: ['button[type="submit"]', '.add-cart', '.buy-now', '.purchase'],
        navigation: ['nav', '.nav', '.navigation', '.menu', '.breadcrumb'],
      },
    };

    // Visual similarity patterns for element matching
    this.visualPatterns = {
      size: {
        large: { minWidth: 200, minHeight: 40 },
        medium: { minWidth: 100, minHeight: 20 },
        small: { minWidth: 50, minHeight: 10 },
      },
      position: {
        header: { maxTop: 150 },
        sidebar: { maxLeft: 300 },
        footer: { minBottomFromViewport: 100 },
      },
      styling: {
        primary: ['primary', 'main', 'important', 'featured'],
        secondary: ['secondary', 'sub', 'alternate'],
        accent: ['accent', 'highlight', 'special'],
      },
    };

    // Content-based patterns for semantic matching
    this.contentPatterns = {
      pricing: {
        patterns: [/\$[\d,]+\.?\d*/, /£[\d,]+\.?\d*/, /€[\d,]+\.?\d*/, /[\d,]+\.?\d*\s*(USD|EUR|GBP|CAD)/, /Price:?\s*[\d,]+/i],
        indicators: ['price', 'cost', 'amount', 'total', 'money', '$', '€', '£'],
      },
      titles: {
        patterns: [/^[A-Z]/, /\b[A-Z][a-z]+(\s+[A-Z][a-z]+)*\b/],
        indicators: ['title', 'name', 'heading', 'product', 'item'],
      },
      buttons: {
        patterns: [/add to cart/i, /buy now/i, /purchase/i, /add to bag/i, /shop now/i],
        indicators: ['button', 'btn', 'action', 'submit', 'add', 'buy', 'purchase'],
      },
      navigation: {
        patterns: [/home/i, /shop/i, /category/i, /products/i, /about/i, /contact/i],
        indicators: ['nav', 'menu', 'link', 'breadcrumb', 'tab'],
      },
    };

    // Structural relationship patterns
    this.structuralPatterns = {
      productContext: {
        siblingSelectors: [
          '.product + .product',
          '.item + .item',
          '.card + .card',
          '.grid-item + .grid-item',
        ],
        parentSelectors: [
          '.products > *',
          '.grid > *',
          '.listing > *',
          '.collection > *',
        ],
        childSelectors: [
          '* > .title',
          '* > .price',
          '* > .image',
          '* > .button',
        ],
      },
    };
  }

  /**
   * Generate fallback selectors when primary selector fails
   * @param {Element} originalElement - The originally targeted element
   * @param {string} failedSelector - The selector that failed
   * @param {string} context - Context type (e.g., 'product.title')
   * @param {Document} document - Document context
   * @param {Object} options - Generation options
   * @returns {Promise<Array>} Array of fallback selector candidates
   */
  async generateFallbackSelectors(originalElement, failedSelector, context, document, options = {}) {
    if (!originalElement || !document) {
      return [];
    }

    const fallbackCandidates = [];

    try {
      // 1. Visual similarity fallbacks
      const visualFallbacks = await this.generateVisualSimilarityFallbacks(
        originalElement, context, document, options,
      );
      fallbackCandidates.push(...visualFallbacks);

      // 2. Structural relationship fallbacks
      const structuralFallbacks = await this.generateStructuralFallbacks(
        originalElement, context, document, options,
      );
      fallbackCandidates.push(...structuralFallbacks);

      // 3. Platform-specific fallbacks
      const platformFallbacks = await this.generatePlatformFallbacks(
        context, document, options,
      );
      fallbackCandidates.push(...platformFallbacks);

      // 4. Content-based fallbacks
      const contentFallbacks = await this.generateContentBasedFallbacks(
        originalElement, context, document, options,
      );
      fallbackCandidates.push(...contentFallbacks);

      // 5. Generic fallbacks as last resort
      const genericFallbacks = await this.generateGenericFallbacks(
        originalElement, context, document, options,
      );
      fallbackCandidates.push(...genericFallbacks);

      // Score and sort candidates
      const scoredCandidates = await this.scoreFallbackCandidates(
        fallbackCandidates, originalElement, context, document,
      );

      return this.deduplicateAndLimit(scoredCandidates, options.maxFallbacks || 10);

    } catch (error) {
      this.logger?.error('Fallback generation failed:', error);
      return [];
    }
  }

  /**
   * Generate fallbacks based on visual similarity
   * @param {Element} originalElement - Original element
   * @param {string} context - Context type
   * @param {Document} document - Document context
   * @param {Object} options - Options
   * @returns {Promise<Array>} Visual similarity fallbacks
   */
  async generateVisualSimilarityFallbacks(originalElement, context, document, options) {
    const fallbacks = [];
    const originalRect = originalElement.getBoundingClientRect();
    const originalStyle = window.getComputedStyle(originalElement);

    // Find elements with similar dimensions
    const allElements = document.querySelectorAll('*');
    const similarElements = [];

    for (const element of allElements) {
      if (element === originalElement) {continue;}

      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      // Check size similarity
      const widthSimilarity = this.calculateSimilarity(rect.width, originalRect.width);
      const heightSimilarity = this.calculateSimilarity(rect.height, originalRect.height);

      // Check position similarity (relative to viewport)
      const positionSimilarity = this.calculatePositionalSimilarity(rect, originalRect);

      // Check styling similarity
      const stylingSimilarity = this.calculateStyingSimilarity(style, originalStyle);

      const overallSimilarity = (widthSimilarity + heightSimilarity + positionSimilarity + stylingSimilarity) / 4;

      if (overallSimilarity > 0.6) {
        similarElements.push({
          element,
          similarity: overallSimilarity,
          selector: this.generateElementSelector(element),
        });
      }
    }

    // Sort by similarity and create fallback candidates
    similarElements
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
      .forEach(item => {
        fallbacks.push({
          selector: item.selector,
          confidence: item.similarity * 0.7, // Visual similarity has good confidence
          strategy: 'visual-similarity',
          details: { similarity: item.similarity },
        });
      });

    return fallbacks;
  }

  /**
   * Generate fallbacks based on structural relationships
   * @param {Element} originalElement - Original element
   * @param {string} context - Context type
   * @param {Document} document - Document context
   * @param {Object} options - Options
   * @returns {Promise<Array>} Structural fallbacks
   */
  async generateStructuralFallbacks(originalElement, context, document, options) {
    const fallbacks = [];

    try {
      // 1. Sibling-based fallbacks
      const siblings = Array.from(originalElement.parentElement?.children || []);
      const siblingIndex = siblings.indexOf(originalElement);

      // Find similar siblings
      siblings.forEach((sibling, index) => {
        if (index !== siblingIndex && sibling.tagName === originalElement.tagName) {
          const selector = this.generateRelativeSelector(sibling, originalElement);
          fallbacks.push({
            selector,
            confidence: 0.6,
            strategy: 'sibling-based',
            details: { siblingIndex: index, originalIndex: siblingIndex },
          });
        }
      });

      // 2. Parent-based fallbacks
      let parent = originalElement.parentElement;
      let depth = 0;
      while (parent && depth < 3) {
        const parentSelector = this.generateElementSelector(parent);
        const contextualSelector = this.generateContextualChildSelector(parent, context);

        if (contextualSelector) {
          fallbacks.push({
            selector: `${parentSelector} ${contextualSelector}`,
            confidence: 0.5 - (depth * 0.1),
            strategy: 'parent-based',
            details: { depth, parentTag: parent.tagName },
          });
        }

        parent = parent.parentElement;
        depth++;
      }

      // 3. Ancestor-descendant relationships
      const ancestors = this.getAncestors(originalElement, 3);
      ancestors.forEach((ancestor, depth) => {
        const ancestorClasses = ancestor.className.split(' ').filter(c => c.trim());
        ancestorClasses.forEach(cls => {
          if (this.isSemanticClass(cls)) {
            const selector = `.${cls} ${originalElement.tagName.toLowerCase()}`;
            fallbacks.push({
              selector,
              confidence: 0.4 - (depth * 0.05),
              strategy: 'ancestor-descendant',
              details: { ancestorClass: cls, depth },
            });
          }
        });
      });

    } catch (error) {
      this.logger?.warn('Structural fallback generation failed:', error);
    }

    return fallbacks;
  }

  /**
   * Generate platform-specific fallbacks
   * @param {string} context - Context type
   * @param {Document} document - Document context
   * @param {Object} options - Options
   * @returns {Promise<Array>} Platform-specific fallbacks
   */
  async generatePlatformFallbacks(context, document, options) {
    const fallbacks = [];
    const detectedPlatform = this.detectPlatform(document);
    const contextType = context.split('.')[1]; // e.g., 'title' from 'product.title'

    const platformConfig = this.platformPatterns[detectedPlatform] || this.platformPatterns.generic;
    const contextPatterns = platformConfig[contextType] || [];

    contextPatterns.forEach((pattern, index) => {
      fallbacks.push({
        selector: pattern,
        confidence: 0.7 - (index * 0.1), // Earlier patterns have higher confidence
        strategy: 'platform-specific',
        details: { platform: detectedPlatform, pattern },
      });
    });

    return fallbacks;
  }

  /**
   * Generate content-based fallbacks
   * @param {Element} originalElement - Original element
   * @param {string} context - Context type
   * @param {Document} document - Document context
   * @param {Object} options - Options
   * @returns {Promise<Array>} Content-based fallbacks
   */
  async generateContentBasedFallbacks(originalElement, context, document, options) {
    const fallbacks = [];
    const contextType = context.split('.')[1];
    const originalText = originalElement.textContent?.trim();

    if (!originalText || !this.contentPatterns[contextType]) {
      return fallbacks;
    }

    const patterns = this.contentPatterns[contextType];

    // Find elements with similar content patterns
    const allElements = document.querySelectorAll('*');
    for (const element of allElements) {
      if (element === originalElement) {continue;}

      const elementText = element.textContent?.trim();
      if (!elementText) {continue;}

      // Check if content matches expected patterns
      const patternMatches = patterns.patterns.some(pattern => pattern.test(elementText));
      const indicatorMatches = patterns.indicators.some(indicator =>
        elementText.toLowerCase().includes(indicator) ||
        element.className.toLowerCase().includes(indicator),
      );

      if (patternMatches || indicatorMatches) {
        const selector = this.generateElementSelector(element);
        const similarity = this.calculateTextSimilarity(originalText, elementText);

        fallbacks.push({
          selector,
          confidence: 0.5 + (similarity * 0.3),
          strategy: 'content-based',
          details: {
            textSimilarity: similarity,
            patternMatch: patternMatches,
            indicatorMatch: indicatorMatches,
          },
        });
      }
    }

    return fallbacks.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  /**
   * Generate generic fallbacks as last resort
   * @param {Element} originalElement - Original element
   * @param {string} context - Context type
   * @param {Document} document - Document context
   * @param {Object} options - Options
   * @returns {Promise<Array>} Generic fallbacks
   */
  async generateGenericFallbacks(originalElement, context, document, options) {
    const fallbacks = [];
    const tagName = originalElement.tagName.toLowerCase();

    // Tag-based fallbacks
    fallbacks.push({
      selector: tagName,
      confidence: 0.2,
      strategy: 'generic-tag',
      details: { tag: tagName },
    });

    // Role-based fallbacks
    const role = originalElement.getAttribute('role');
    if (role) {
      fallbacks.push({
        selector: `[role="${role}"]`,
        confidence: 0.3,
        strategy: 'generic-role',
        details: { role },
      });
    }

    // Type-based fallbacks for inputs
    if (tagName === 'input') {
      const type = originalElement.getAttribute('type') || 'text';
      fallbacks.push({
        selector: `input[type="${type}"]`,
        confidence: 0.4,
        strategy: 'generic-input-type',
        details: { inputType: type },
      });
    }

    return fallbacks;
  }

  /**
   * Score fallback candidates based on various factors
   * @param {Array} candidates - Fallback candidates
   * @param {Element} originalElement - Original element
   * @param {string} context - Context type
   * @param {Document} document - Document context
   * @returns {Promise<Array>} Scored candidates
   */
  async scoreFallbackCandidates(candidates, originalElement, context, document) {
    const scoredCandidates = [];

    for (const candidate of candidates) {
      try {
        const elements = document.querySelectorAll(candidate.selector);

        // Base score from generation strategy
        let score = candidate.confidence;

        // Adjust score based on element count
        if (elements.length === 0) {
          score = 0; // Invalid selector
        } else if (elements.length === 1) {
          score += 0.2; // Unique selector bonus
        } else if (elements.length > 10) {
          score -= 0.3; // Too generic penalty
        }

        // Bonus for elements that are visible
        let visibleCount = 0;
        elements.forEach(el => {
          if (this.isElementVisible(el)) {visibleCount++;}
        });

        if (visibleCount > 0) {
          score += (visibleCount / elements.length) * 0.1;
        }

        // Context appropriateness bonus
        if (this.isContextAppropriate(elements[0], context)) {
          score += 0.1;
        }

        candidate.finalScore = Math.max(0, Math.min(1, score));
        candidate.elementCount = elements.length;
        candidate.visibleCount = visibleCount;

        scoredCandidates.push(candidate);

      } catch (error) {
        this.logger?.warn(`Failed to score candidate ${candidate.selector}:`, error);
        candidate.finalScore = 0;
        scoredCandidates.push(candidate);
      }
    }

    return scoredCandidates.sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Calculate similarity between two numerical values
   * @param {number} value1 - First value
   * @param {number} value2 - Second value
   * @returns {number} Similarity score (0-1)
   */
  calculateSimilarity(value1, value2) {
    if (value1 === 0 && value2 === 0) {return 1;}
    if (value1 === 0 || value2 === 0) {return 0;}

    const larger = Math.max(value1, value2);
    const smaller = Math.min(value1, value2);
    return smaller / larger;
  }

  /**
   * Calculate positional similarity between two rectangles
   * @param {DOMRect} rect1 - First rectangle
   * @param {DOMRect} rect2 - Second rectangle
   * @returns {number} Positional similarity score (0-1)
   */
  calculatePositionalSimilarity(rect1, rect2) {
    const xSimilarity = this.calculateSimilarity(rect1.left, rect2.left);
    const ySimilarity = this.calculateSimilarity(rect1.top, rect2.top);
    return (xSimilarity + ySimilarity) / 2;
  }

  /**
   * Calculate styling similarity between two computed styles
   * @param {CSSStyleDeclaration} style1 - First style
   * @param {CSSStyleDeclaration} style2 - Second style
   * @returns {number} Styling similarity score (0-1)
   */
  calculateStyingSimilarity(style1, style2) {
    const properties = ['fontSize', 'fontWeight', 'color', 'backgroundColor', 'display'];
    let matches = 0;

    properties.forEach(prop => {
      if (style1[prop] === style2[prop]) {
        matches++;
      }
    });

    return matches / properties.length;
  }

  /**
   * Calculate text content similarity
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {number} Text similarity score (0-1)
   */
  calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) {return 0;}

    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);

    const commonWords = words1.filter(word => words2.includes(word));
    const totalUniqueWords = new Set([...words1, ...words2]).size;

    return totalUniqueWords > 0 ? commonWords.length / totalUniqueWords : 0;
  }

  /**
   * Generate a basic selector for an element
   * @param {Element} element - Element to generate selector for
   * @returns {string} Basic selector
   */
  generateElementSelector(element) {
    if (element.id) {return `#${element.id}`;}

    if (element.className) {
      const classes = element.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        return `.${classes[0]}`;
      }
    }

    return element.tagName.toLowerCase();
  }

  /**
   * Generate a relative selector based on relationship to another element
   * @param {Element} targetElement - Target element
   * @param {Element} referenceElement - Reference element
   * @returns {string} Relative selector
   */
  generateRelativeSelector(targetElement, referenceElement) {
    const targetSelector = this.generateElementSelector(targetElement);
    const referenceSelector = this.generateElementSelector(referenceElement);

    // If same parent, use sibling selector
    if (targetElement.parentElement === referenceElement.parentElement) {
      return `${referenceSelector} ~ ${targetElement.tagName.toLowerCase()}`;
    }

    return targetSelector;
  }

  /**
   * Generate contextual child selector for a parent element
   * @param {Element} parent - Parent element
   * @param {string} context - Context type
   * @returns {string} Contextual selector
   */
  generateContextualChildSelector(parent, context) {
    const contextType = context.split('.')[1];

    const contextSelectors = {
      title: 'h1, h2, h3, h4, h5, h6, .title, .name',
      price: '.price, .cost, .money, .amount',
      image: 'img, .image, .photo',
      button: 'button, .btn, .button',
      link: 'a, .link',
    };

    return contextSelectors[contextType] || '*';
  }

  /**
   * Get ancestors of an element up to specified depth
   * @param {Element} element - Starting element
   * @param {number} maxDepth - Maximum depth to traverse
   * @returns {Array} Array of ancestor elements
   */
  getAncestors(element, maxDepth = 5) {
    const ancestors = [];
    let current = element.parentElement;
    let depth = 0;

    while (current && depth < maxDepth) {
      ancestors.push(current);
      current = current.parentElement;
      depth++;
    }

    return ancestors;
  }

  /**
   * Check if a class name is semantic (meaningful)
   * @param {string} className - Class name to check
   * @returns {boolean} Whether class is semantic
   */
  isSemanticClass(className) {
    const semanticKeywords = [
      'product', 'title', 'price', 'image', 'button', 'container', 'wrapper',
      'content', 'header', 'footer', 'navigation', 'menu', 'card', 'item',
    ];

    return semanticKeywords.some(keyword =>
      className.toLowerCase().includes(keyword),
    );
  }

  /**
   * Detect platform type from document
   * @param {Document} document - Document to analyze
   * @returns {string} Platform identifier
   */
  detectPlatform(document) {
    const platformIndicators = {
      shopify: ['.shopify-section', 'meta[content*="Shopify"]', '[data-shopify]'],
      woocommerce: ['.woocommerce', 'body.woocommerce', '.wc-block'],
      magento: ['.catalog-product-view', 'body.catalog-product-view', '.minicart-wrapper'],
    };

    for (const [platform, selectors] of Object.entries(platformIndicators)) {
      for (const selector of selectors) {
        if (document.querySelector(selector)) {
          return platform;
        }
      }
    }

    return 'generic';
  }

  /**
   * Check if an element is visible
   * @param {Element} element - Element to check
   * @returns {boolean} Whether element is visible
   */
  isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return rect.width > 0 &&
           rect.height > 0 &&
           style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           parseFloat(style.opacity) > 0;
  }

  /**
   * Check if elements are appropriate for the given context
   * @param {Element} element - Element to check
   * @param {string} context - Expected context
   * @returns {boolean} Whether element is appropriate
   */
  isContextAppropriate(element, context) {
    if (!element || !context) {return false;}

    const contextType = context.split('.')[1];
    const tagName = element.tagName.toLowerCase();

    const appropriateTags = {
      title: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'p'],
      price: ['span', 'div', 'p', 'strong', 'em'],
      image: ['img'],
      button: ['button', 'a', 'input'],
      link: ['a', 'button'],
    };

    return appropriateTags[contextType]?.includes(tagName) || false;
  }

  /**
   * Remove duplicate selectors and limit results
   * @param {Array} candidates - Candidate array
   * @param {number} maxResults - Maximum number of results
   * @returns {Array} Deduplicated and limited candidates
   */
  deduplicateAndLimit(candidates, maxResults = 10) {
    const seen = new Set();
    const unique = [];

    for (const candidate of candidates) {
      if (!seen.has(candidate.selector)) {
        seen.add(candidate.selector);
        unique.push(candidate);

        if (unique.length >= maxResults) {break;}
      }
    }

    return unique;
  }

  /**
   * Generate adaptive fallbacks based on previous successes/failures
   * @param {Array} previousAttempts - Previous selector attempts with results
   * @param {string} context - Context type
   * @param {Document} document - Document context
   * @returns {Promise<Array>} Adaptive fallback candidates
   */
  async generateAdaptiveFallbacks(previousAttempts, context, document) {
    const adaptiveFallbacks = [];

    // Analyze successful patterns from previous attempts
    const successfulPatterns = previousAttempts
      .filter(attempt => attempt.success)
      .map(attempt => this.extractPattern(attempt.selector));

    // Generate new candidates based on successful patterns
    successfulPatterns.forEach(pattern => {
      const candidates = this.generateFromPattern(pattern, context, document);
      adaptiveFallbacks.push(...candidates);
    });

    return adaptiveFallbacks;
  }

  /**
   * Extract pattern from a successful selector
   * @param {string} selector - Successful selector
   * @returns {Object} Extracted pattern
   */
  extractPattern(selector) {
    return {
      hasId: selector.includes('#'),
      hasClass: selector.includes('.'),
      hasAttribute: selector.includes('['),
      hasDescendant: selector.includes(' '),
      hasChild: selector.includes('>'),
      complexity: selector.split(/[\s>~+]/).length,
    };
  }

  /**
   * Generate candidates from a pattern
   * @param {Object} pattern - Pattern to use
   * @param {string} context - Context type
   * @param {Document} document - Document context
   * @returns {Array} Generated candidates
   */
  generateFromPattern(pattern, context, document) {
    // This is a simplified implementation - in practice, this would be more sophisticated
    const candidates = [];

    if (pattern.hasClass) {
      const contextType = context.split('.')[1];
      candidates.push({
        selector: `.${contextType}`,
        confidence: 0.5,
        strategy: 'adaptive-pattern',
        details: { pattern: 'class-based' },
      });
    }

    return candidates;
  }

  /**
   * Score fallback candidates with ML insights
   * @param {Array} candidates - Fallback candidates
   * @param {Element} originalElement - Original element
   * @param {string} context - Context type
   * @param {Document} document - Document context
   * @returns {Promise<Array>} Scored candidates with ML insights
   */
  async scoreWithMLInsights(candidates, originalElement, context, document) {
    const scoredCandidates = [];
    const contextSuccessRates = this.learningData.contextSuccessRates.get(context) || new Map();

    for (const candidate of candidates) {
      try {
        const elements = document.querySelectorAll(candidate.selector);

        // Base score from generation strategy
        let score = candidate.confidence;

        // ML-enhanced scoring

        // 1. Historical success rate for this selector pattern
        const pattern = this.extractPattern(candidate.selector);
        const historicalSuccessRate = this.getHistoricalSuccessRate(pattern, context);
        if (historicalSuccessRate > 0) {
          score *= (0.7 + (historicalSuccessRate * 0.3)); // Blend with historical data
        }

        // 2. Context-specific success rates
        const contextRate = contextSuccessRates.get(candidate.strategy) || 0.5;
        score *= (0.8 + (contextRate * 0.2));

        // 3. Element count optimization
        if (elements.length === 0) {
          score = 0;
        } else if (elements.length === 1) {
          score += 0.25; // Increased bonus for unique selectors
        } else if (elements.length <= 3) {
          score += 0.1; // Bonus for low-count selectors
        } else if (elements.length > 15) {
          score -= 0.4; // Stronger penalty for overly generic selectors
        } else if (elements.length > 8) {
          score -= 0.2;
        }

        // 4. Advanced visibility and interactability scoring
        let visibleCount = 0;
        let interactableCount = 0;

        elements.forEach(el => {
          if (this.isElementVisible(el)) {
            visibleCount++;
            if (this.isElementInteractable(el)) {
              interactableCount++;
            }
          }
        });

        if (visibleCount > 0) {
          const visibilityRatio = visibleCount / elements.length;
          score += visibilityRatio * 0.15;

          // Bonus for interactable elements in interactive contexts
          if (this.isInteractiveContext(context) && interactableCount > 0) {
            const interactabilityRatio = interactableCount / elements.length;
            score += interactabilityRatio * 0.1;
          }
        }

        // 5. Semantic appropriateness
        const semanticScore = this.calculateSemanticAppropriatenessScore(
          elements[0], context, candidate.strategy,
        );
        score += semanticScore * 0.1;

        candidate.finalScore = Math.max(0, Math.min(1, score));
        candidate.elementCount = elements.length;
        candidate.visibleCount = visibleCount;
        candidate.interactableCount = interactableCount;
        candidate.mlInsights = {
          historicalSuccessRate,
          contextSuccessRate: contextRate,
          semanticScore,
        };

        scoredCandidates.push(candidate);

      } catch (error) {
        this.logger?.warn(`Failed to score candidate ${candidate.selector}:`, error);
        candidate.finalScore = 0;
        candidate.mlInsights = { error: error.message };
        scoredCandidates.push(candidate);
      }
    }

    return scoredCandidates.sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Get historical success rate for a pattern
   * @param {Object} pattern - Pattern object
   * @param {string} context - Context type
   * @returns {number} Success rate (0-1)
   */
  getHistoricalSuccessRate(pattern, context) {
    const successfulPatterns = this.learningData.successfulPatterns.get(context) || [];
    const matchingPattern = successfulPatterns.find(p =>
      this.calculatePatternSimilarity(pattern, this.extractPattern(p.selector)) > 0.8,
    );

    return matchingPattern ? matchingPattern.successRate : 0;
  }

  /**
   * Calculate semantic appropriateness score
   * @param {Element} element - Element to score
   * @param {string} context - Context type
   * @param {string} strategy - Generation strategy
   * @returns {number} Appropriateness score (0-1)
   */
  calculateSemanticAppropriatenessScore(element, context, strategy) {
    if (!element || !context) {return 0.5;}

    const contextType = context.split('.')[1];
    const tagName = element.tagName.toLowerCase();
    const className = element.className.toLowerCase();
    const textContent = element.textContent?.trim().toLowerCase();

    let score = 0.5; // Base score

    // Tag name appropriateness
    const appropriateTags = {
      title: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'p', 'a'],
      price: ['span', 'div', 'p', 'strong', 'em'],
      image: ['img'],
      button: ['button', 'a', 'input'],
      link: ['a'],
    };

    if (appropriateTags[contextType]?.includes(tagName)) {
      score += 0.3;
    }

    // Class name semantic relevance
    const semanticKeywords = {
      title: ['title', 'name', 'heading', 'product'],
      price: ['price', 'cost', 'money', 'amount'],
      image: ['image', 'img', 'photo', 'picture'],
      button: ['button', 'btn', 'add', 'buy', 'cart'],
      link: ['link', 'url', 'anchor'],
    };

    const keywords = semanticKeywords[contextType] || [];
    const matchingKeywords = keywords.filter(keyword => className.includes(keyword));
    if (matchingKeywords.length > 0) {
      score += Math.min(0.3, matchingKeywords.length * 0.1);
    }

    // Text content relevance for certain contexts
    if (contextType === 'button' && textContent) {
      const buttonKeywords = ['add to cart', 'buy', 'purchase', 'add to bag', 'checkout'];
      if (buttonKeywords.some(keyword => textContent.includes(keyword))) {
        score += 0.2;
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Check if element is interactable
   * @param {Element} element - Element to check
   * @returns {boolean} Whether element is interactable
   */
  isElementInteractable(element) {
    const style = window.getComputedStyle(element);
    const tagName = element.tagName.toLowerCase();

    // Basic interactability checks
    if (element.disabled || style.pointerEvents === 'none') {return false;}

    // Interactive elements
    const interactiveTags = ['button', 'a', 'input', 'select', 'textarea'];
    if (interactiveTags.includes(tagName)) {return true;}

    // Elements with click handlers or role
    if (element.onclick || element.getAttribute('role') === 'button') {return true;}

    return false;
  }

  /**
   * Check if context is interactive
   * @param {string} context - Context string
   * @returns {boolean} Whether context is interactive
   */
  isInteractiveContext(context) {
    const interactiveContexts = ['button', 'link', 'menu', 'dropdown', 'controls'];
    return interactiveContexts.some(ctx => context.includes(ctx));
  }

  /**
   * Record successful pattern for learning
   * @param {string} selector - Successful selector
   * @param {string} context - Context type
   */
  recordSuccessfulPattern(selector, context) {
    if (!this.learningData.successfulPatterns.has(context)) {
      this.learningData.successfulPatterns.set(context, []);
    }

    const patterns = this.learningData.successfulPatterns.get(context);
    const existingPattern = patterns.find(p => p.selector === selector);

    if (existingPattern) {
      existingPattern.count++;
      existingPattern.lastUsed = Date.now();
      existingPattern.successRate = Math.min(1.0, existingPattern.successRate + 0.1);
    } else {
      patterns.push({
        selector,
        count: 1,
        successRate: 0.8, // Initial success rate
        firstUsed: Date.now(),
        lastUsed: Date.now(),
      });
    }

    // Keep only top performing patterns
    if (patterns.length > 20) {
      patterns.sort((a, b) => b.successRate - a.successRate);
      this.learningData.successfulPatterns.set(context, patterns.slice(0, 15));
    }

    // Update performance metrics
    this.performanceMetrics.successfulFallbacks++;
  }

  /**
   * Update performance metrics
   * @param {number} generationTime - Time taken to generate fallbacks
   * @param {number} candidateCount - Number of candidates generated
   */
  updatePerformanceMetrics(generationTime, candidateCount) {
    this.performanceMetrics.totalFallbacksGenerated += candidateCount;

    // Update average generation time
    const totalCalls = this.performanceMetrics.successfulFallbacks + 1;
    this.performanceMetrics.averageGenerationTime =
      (this.performanceMetrics.averageGenerationTime * (totalCalls - 1) + generationTime) / totalCalls;
  }

  /**
   * Get performance insights
   * @returns {Object} Performance metrics and insights
   */
  getPerformanceInsights() {
    const totalSuccess = this.performanceMetrics.successfulFallbacks;
    const totalGenerated = this.performanceMetrics.totalFallbacksGenerated;

    return {
      ...this.performanceMetrics,
      overallSuccessRate: totalGenerated > 0 ? totalSuccess / totalGenerated : 0,
      averageGenerationTime: this.performanceMetrics.averageGenerationTime,
      learningDataSize: {
        successfulPatterns: Array.from(this.learningData.successfulPatterns.values()).reduce((sum, patterns) => sum + patterns.length, 0),
        failedPatterns: Array.from(this.learningData.failedPatterns.values()).reduce((sum, patterns) => sum + patterns.length, 0),
      },
    };
  }

  /**
   * Persist learning data to WorldModel for cross-session use
   * @param {string} domain - Domain to store learning for
   * @param {Object} learningData - Learning data to persist
   */
  async persistLearning(domain, learningData = null) {
    try {
      if (!this.worldModel) {
        // Initialize WorldModel if not available
        const WorldModel = require('./WorldModel');
        this.worldModel = new WorldModel(this.logger);
        await this.worldModel.initialize();
      }

      const patterns = {
        successful_selectors: Array.from(this.learningData.successfulPatterns.entries()),
        failed_patterns: Array.from(this.learningData.failedPatterns.entries()),
        strategy_success_rates: this.performanceMetrics.strategySuccessRates,
        context_success_rates: Array.from(this.learningData.contextSuccessRates.entries()),
        
        // Additional learning metadata
        total_fallbacks_generated: this.performanceMetrics.totalFallbacksGenerated,
        successful_fallbacks: this.performanceMetrics.successfulFallbacks,
        average_generation_time: this.performanceMetrics.averageGenerationTime,
        
        // Custom learning data if provided
        ...(learningData || {}),
        
        // Metadata
        last_updated: new Date().toISOString(),
        version: '1.0'
      };

      await this.worldModel.storeLearningPatterns(domain, patterns);
      
      this.logger?.info('Learning patterns persisted successfully', {
        domain,
        successful_patterns: this.learningData.successfulPatterns.size,
        failed_patterns: this.learningData.failedPatterns.size,
        strategy_rates: Object.keys(this.performanceMetrics.strategySuccessRates).length
      });

    } catch (error) {
      this.logger?.error('Failed to persist learning patterns', {
        domain,
        error: error.message
      });
    }
  }

  /**
   * Load existing learning patterns from WorldModel
   * @param {string} domain - Domain to load learning for
   */
  async loadExistingLearning(domain) {
    try {
      if (!this.worldModel) {
        const WorldModel = require('./WorldModel');
        this.worldModel = new WorldModel(this.logger);
        await this.worldModel.initialize();
      }

      const patterns = await this.worldModel.getLearningPatterns(domain);
      
      if (patterns) {
        // Restore successful patterns
        if (patterns.successful_selectors) {
          this.learningData.successfulPatterns = new Map(patterns.successful_selectors);
        }
        
        // Restore failed patterns
        if (patterns.failed_patterns) {
          this.learningData.failedPatterns = new Map(patterns.failed_patterns);
        }
        
        // Restore strategy success rates
        if (patterns.strategy_success_rates) {
          this.performanceMetrics.strategySuccessRates = {
            ...this.performanceMetrics.strategySuccessRates,
            ...patterns.strategy_success_rates
          };
        }
        
        // Restore context success rates
        if (patterns.context_success_rates) {
          this.learningData.contextSuccessRates = new Map(patterns.context_success_rates);
        }
        
        // Restore performance metrics
        if (patterns.total_fallbacks_generated) {
          this.performanceMetrics.totalFallbacksGenerated = patterns.total_fallbacks_generated;
        }
        if (patterns.successful_fallbacks) {
          this.performanceMetrics.successfulFallbacks = patterns.successful_fallbacks;
        }
        if (patterns.average_generation_time) {
          this.performanceMetrics.averageGenerationTime = patterns.average_generation_time;
        }

        this.logger?.info('Existing learning patterns loaded successfully', {
          domain,
          successful_patterns: this.learningData.successfulPatterns.size,
          failed_patterns: this.learningData.failedPatterns.size,
          last_updated: patterns.last_updated
        });

        return true;
      }

    } catch (error) {
      this.logger?.warn('Failed to load existing learning patterns', {
        domain,
        error: error.message
      });
    }

    return false;
  }

  /**
   * Apply cross-site learning patterns to current domain
   * @param {string} domain - Current domain
   * @param {string} elementType - Type of element to get patterns for
   * @returns {Array} Cross-site patterns applicable to current context
   */
  async applyCrossSiteLearning(domain, elementType) {
    try {
      if (!this.worldModel) {
        const WorldModel = require('./WorldModel');
        this.worldModel = new WorldModel(this.logger);
        await this.worldModel.initialize();
      }

      // Get patterns from similar sites
      const similarPatterns = await this.worldModel.getCrossSitePatterns(domain, elementType);
      
      if (!similarPatterns || similarPatterns.length === 0) {
        return [];
      }

      // Generate fallbacks based on cross-site patterns
      const crossSiteFallbacks = this.generateFallbacksFromPatterns(similarPatterns, elementType);
      
      this.logger?.info('Applied cross-site learning patterns', {
        domain,
        elementType,
        patterns_found: similarPatterns.length,
        fallbacks_generated: crossSiteFallbacks.length
      });

      return crossSiteFallbacks;

    } catch (error) {
      this.logger?.warn('Failed to apply cross-site learning', {
        domain,
        elementType,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Generate fallbacks from learned patterns
   * @param {Array} patterns - Patterns from other sites
   * @param {string} elementType - Type of element
   * @returns {Array} Generated fallback selectors
   */
  generateFallbacksFromPatterns(patterns, elementType) {
    const fallbacks = [];
    
    patterns.forEach((pattern, index) => {
      if (pattern.selector && pattern.success_rate > 0.5) {
        fallbacks.push({
          selector: pattern.selector,
          confidence: pattern.success_rate * 0.8, // Slightly lower confidence for cross-site patterns
          strategy: 'cross-site-learning',
          details: {
            source_domain: pattern.domain,
            success_rate: pattern.success_rate,
            usage_count: pattern.usage_count || 1,
            element_type: elementType
          }
        });
      }
    });

    // Sort by confidence and limit results
    return fallbacks
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5); // Top 5 cross-site patterns
  }

  /**
   * Learn from successful selector usage
   * @param {string} selector - Successful selector
   * @param {string} context - Context where it was used
   * @param {string} strategy - Strategy that generated it
   */
  recordSuccessfulSelector(selector, context, strategy) {
    // Record successful pattern
    const patternKey = `${context}:${selector}`;
    const currentCount = this.learningData.successfulPatterns.get(patternKey) || 0;
    this.learningData.successfulPatterns.set(patternKey, currentCount + 1);

    // Update strategy success rate
    const strategyKey = strategy || 'unknown';
    if (!this.performanceMetrics.strategySuccessRates[strategyKey]) {
      this.performanceMetrics.strategySuccessRates[strategyKey] = 0;
    }
    this.performanceMetrics.strategySuccessRates[strategyKey] += 0.1; // Increment success

    // Update context success rate
    const contextCount = this.learningData.contextSuccessRates.get(context) || { success: 0, total: 0 };
    contextCount.success += 1;
    contextCount.total += 1;
    this.learningData.contextSuccessRates.set(context, contextCount);

    // Update performance metrics
    this.performanceMetrics.successfulFallbacks += 1;

    this.logger?.debug('Recorded successful selector usage', {
      selector,
      context,
      strategy,
      usage_count: this.learningData.successfulPatterns.get(patternKey)
    });
  }

  /**
   * Learn from failed selector usage
   * @param {string} selector - Failed selector
   * @param {string} context - Context where it failed
   * @param {string} strategy - Strategy that generated it
   * @param {string} error - Error message
   */
  recordFailedSelector(selector, context, strategy, error = null) {
    // Record failed pattern
    const patternKey = `${context}:${selector}`;
    const currentCount = this.learningData.failedPatterns.get(patternKey) || 0;
    this.learningData.failedPatterns.set(patternKey, currentCount + 1);

    // Update context failure rate
    const contextCount = this.learningData.contextSuccessRates.get(context) || { success: 0, total: 0 };
    contextCount.total += 1;
    this.learningData.contextSuccessRates.set(context, contextCount);

    this.logger?.debug('Recorded failed selector usage', {
      selector,
      context,
      strategy,
      error,
      failure_count: this.learningData.failedPatterns.get(patternKey)
    });
  }

  /**
   * Get learning statistics for reporting
   * @returns {Object} Learning statistics
   */
  getLearningStats() {
    const totalSuccessful = Array.from(this.learningData.successfulPatterns.values())
      .reduce((sum, count) => sum + count, 0);
    
    const totalFailed = Array.from(this.learningData.failedPatterns.values())
      .reduce((sum, count) => sum + count, 0);

    const contextStats = {};
    for (const [context, stats] of this.learningData.contextSuccessRates.entries()) {
      contextStats[context] = {
        success_rate: stats.total > 0 ? (stats.success / stats.total).toFixed(3) : 0,
        total_attempts: stats.total,
        successful_attempts: stats.success
      };
    }

    return {
      successful_patterns: this.learningData.successfulPatterns.size,
      failed_patterns: this.learningData.failedPatterns.size,
      total_successful_uses: totalSuccessful,
      total_failed_uses: totalFailed,
      overall_success_rate: (totalSuccessful + totalFailed) > 0 ? 
        (totalSuccessful / (totalSuccessful + totalFailed)).toFixed(3) : 0,
      strategy_success_rates: this.performanceMetrics.strategySuccessRates,
      context_statistics: contextStats,
      performance_metrics: {
        total_fallbacks_generated: this.performanceMetrics.totalFallbacksGenerated,
        successful_fallbacks: this.performanceMetrics.successfulFallbacks,
        average_generation_time: this.performanceMetrics.averageGenerationTime
      }
    };
  }

  /**
   * Reset learning data (useful for testing or fresh starts)
   */
  resetLearning() {
    this.learningData.successfulPatterns.clear();
    this.learningData.failedPatterns.clear();
    this.learningData.contextSuccessRates.clear();
    
    this.performanceMetrics.strategySuccessRates = {
      'visual-similarity': 0,
      'structural': 0,
      'platform-specific': 0,
      'content-based': 0,
      'adaptive-pattern': 0
    };

    this.logger?.info('Learning data reset');
  }
}

module.exports = AdvancedFallbackSystem;
