/**
 * IntelligentSelectorGenerator - Advanced CSS selector generation with semantic analysis
 * Implements intelligent selector generation strategies prioritizing stability and uniqueness
 */
class IntelligentSelectorGenerator {
  constructor(logger = null) {
    this.logger = logger;

    // BEM methodology patterns for semantic class identification
    this.bemPatterns = [
      /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,              // block
      /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*__[a-z0-9]+(?:-[a-z0-9]+)*$/, // element
      /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*$/, // modifier
    ];

    // Semantic keywords that indicate meaningful class names
    this.semanticKeywords = [
      'product', 'title', 'price', 'image', 'button', 'link', 'card', 'item',
      'container', 'wrapper', 'content', 'header', 'footer', 'sidebar', 'main',
      'navigation', 'menu', 'form', 'input', 'select', 'checkbox', 'radio',
      'modal', 'dropdown', 'tooltip', 'alert', 'badge', 'tag', 'label',
    ];

    // Generic/framework classes to deprioritize
    this.genericClasses = [
      'col', 'row', 'container', 'fluid', 'clearfix', 'pull-left', 'pull-right',
      'text-center', 'text-left', 'text-right', 'hidden', 'visible', 'show', 'hide',
      'd-flex', 'd-block', 'd-none', 'flex', 'block', 'inline', 'relative', 'absolute',
    ];

    // Platform-specific patterns
    this.platformPatterns = {
      shopify: {
        selectors: [
          '[data-product-id]', '.product-form', '.shopify-section',
          '.grid__item', '.card-wrapper', '.product-card-wrapper',
        ],
        classes: ['shopify', 'grid__item', 'card-wrapper', 'product-form'],
      },
      woocommerce: {
        selectors: [
          '.woocommerce', '.product', '.shop_table', '.cart-item',
          '.wc-block-grid__product', '.wc-block-components-product-title',
        ],
        classes: ['woocommerce', 'product', 'shop_table', 'wc-block'],
      },
      magento: {
        selectors: [
          '.product-item', '.catalog-product-view', '.minicart-wrapper',
          '.product-item-info', '.product-item-details',
        ],
        classes: ['product-item', 'catalog', 'minicart'],
      },
    };
  }

  /**
   * Main method to generate the most reliable selector for an element
   * @param {Element} element - The DOM element to generate selector for
   * @param {Object} options - Generation options
   * @returns {Object} Selector result with selector string and confidence score
   */
  generateOptimalSelector(element, options = {}) {
    if (!element) {return { selector: null, confidence: 0, strategy: 'none' };}

    // Use weighted approach for better context-aware selection
    if (options.context || options.useWeighted) {
      const weightedResult = this.generateWeightedSelector(element, options);
      if (weightedResult.selector && weightedResult.confidence > 0.5) {
        return weightedResult;
      }
    }

    // Try hybrid approach first for complex elements
    if (element.className && element.className.split(' ').length > 1) {
      const hybridResult = this.generateHybridSelector(element, options);
      if (hybridResult.selector && hybridResult.confidence > 0.6) {
        return hybridResult;
      }
    }

    const strategies = [
      () => this.generateDataAttributeSelector(element),
      () => this.generateSemanticClassSelector(element),
      () => this.generateStablePathSelector(element, options),
      () => this.generatePositionalSelector(element),
      () => this.generateContentBasedSelector(element),
    ];

    // Try each strategy and return the best one
    let bestResult = { selector: null, confidence: 0, strategy: 'fallback' };

    for (const strategy of strategies) {
      try {
        const result = strategy();
        if (result && result.confidence > bestResult.confidence) {
          bestResult = result;
          // If we have a high-confidence result, use it
          if (result.confidence >= 0.8) {break;}
        }
      } catch (error) {
        this.logger?.warn('Selector generation strategy failed:', error.message);
      }
    }

    // Final fallback to basic selector
    if (!bestResult.selector) {
      bestResult = this.generateFallbackSelector(element);
    }

    // Add metadata for debugging and improvement
    bestResult.metadata = {
      elementTag: element.tagName.toLowerCase(),
      hasId: !!element.id,
      classCount: element.className ? element.className.split(' ').filter(c => c.trim()).length : 0,
      hasDataAttrs: Array.from(element.attributes).some(attr => attr.name.startsWith('data-')),
      context: options.context,
      generationTime: Date.now(),
    };

    return bestResult;
  }

  /**
   * Generate selector based on data attributes (highest priority)
   * @param {Element} element - Target element
   * @returns {Object} Selector result
   */
  generateDataAttributeSelector(element) {
    const dataAttributes = [
      'data-testid', 'data-test', 'data-cy', 'data-id', 'data-product-id',
      'data-component', 'data-element', 'data-role', 'data-type', 'data-name',
    ];

    for (const attr of dataAttributes) {
      const value = element.getAttribute(attr);
      if (value) {
        const selector = `[${attr}="${value}"]`;
        return {
          selector,
          confidence: 0.95,
          strategy: 'data-attribute',
          attribute: attr,
          value,
        };
      }
    }

    // Check for any data-* attribute with priority scoring
    const dataAttrs = [];
    const allAttributes = element.attributes;
    for (let i = 0; i < allAttributes.length; i++) {
      const attr = allAttributes[i];
      if (attr.name.startsWith('data-') && attr.value) {
        let confidence = 0.75; // Base confidence for generic data attributes

        // Boost confidence for semantic data attributes
        if (attr.name.includes('test') || attr.name.includes('id') || attr.name.includes('component')) {
          confidence = 0.90;
        }

        // Boost for stable-looking values (not random numbers)
        if (!/^\d+$/.test(attr.value) && attr.value.length > 2) {
          confidence += 0.05;
        }

        dataAttrs.push({
          selector: `[${attr.name}="${attr.value}"]`,
          confidence,
          strategy: 'data-attribute',
          attribute: attr.name,
          value: attr.value,
        });
      }
    }

    // Return the highest confidence data attribute
    if (dataAttrs.length > 0) {
      return dataAttrs.sort((a, b) => b.confidence - a.confidence)[0];
    }

    return { selector: null, confidence: 0, strategy: 'data-attribute' };
  }

  /**
   * Generate selector using semantic class analysis
   * @param {Element} element - Target element
   * @returns {Object} Selector result
   */
  generateSemanticClassSelector(element) {
    if (!element.className) {
      return { selector: null, confidence: 0, strategy: 'semantic-class' };
    }

    const classes = element.className.split(' ')
      .filter(cls => cls.trim())
      .map(cls => cls.trim());

    if (classes.length === 0) {
      return { selector: null, confidence: 0, strategy: 'semantic-class' };
    }

    // Score classes by semantic value
    const scoredClasses = classes.map(cls => ({
      class: cls,
      score: this.scoreClassSemantically(cls),
    })).sort((a, b) => b.score - a.score);

    // Build selector using top semantic classes with improved combination logic
    const highScoreClasses = scoredClasses.filter(item => item.score > 0.6);
    const mediumScoreClasses = scoredClasses.filter(item => item.score > 0.3 && item.score <= 0.6);

    let topClasses = [];

    // Prefer fewer high-quality classes over many medium-quality ones
    if (highScoreClasses.length > 0) {
      topClasses = highScoreClasses.slice(0, 2).map(item => item.class);
    } else if (mediumScoreClasses.length > 0) {
      topClasses = mediumScoreClasses.slice(0, 1).map(item => item.class);
      // Add one more if it significantly improves specificity
      if (mediumScoreClasses.length > 1 && mediumScoreClasses[1].score > 0.4) {
        topClasses.push(mediumScoreClasses[1].class);
      }
    } else {
      // Use highest scoring class even if low score
      topClasses.push(scoredClasses[0].class);
    }

    const selector = '.' + topClasses.join('.');
    const avgScore = topClasses.reduce((sum, cls) => {
      const scoreObj = scoredClasses.find(item => item.class === cls);
      return sum + (scoreObj ? scoreObj.score : 0);
    }, 0) / topClasses.length;

    return {
      selector,
      confidence: Math.min(0.9, avgScore + 0.1),
      strategy: 'semantic-class',
      classes: topClasses,
      classScores: scoredClasses,
    };
  }

  /**
   * Generate stable DOM path selector
   * @param {Element} element - Target element
   * @param {Object} options - Path generation options
   * @returns {Object} Selector result
   */
  generateStablePathSelector(element, options = {}) {
    const maxDepth = options.maxDepth || 5;
    const path = [];
    let current = element;
    let depth = 0;

    while (current && current.nodeType === Node.ELEMENT_NODE && depth < maxDepth) {
      const segment = this.generateStableSegment(current);
      path.unshift(segment);

      // If we found a unique identifier, stop here
      if (segment.isUnique) {break;}

      current = current.parentElement;
      depth++;
    }

    if (path.length === 0) {
      return { selector: null, confidence: 0, strategy: 'stable-path' };
    }

    const selector = path.map(seg => seg.selector).join(' > ');
    const confidence = this.calculatePathConfidence(path);

    return {
      selector,
      confidence,
      strategy: 'stable-path',
      path,
      depth: path.length,
    };
  }

  /**
   * Generate positional selector as fallback
   * @param {Element} element - Target element
   * @returns {Object} Selector result
   */
  generatePositionalSelector(element) {
    if (!element.parentElement) {
      return { selector: element.tagName.toLowerCase(), confidence: 0.2, strategy: 'positional' };
    }

    const siblings = Array.from(element.parentElement.children);
    const index = siblings.indexOf(element);
    const tagName = element.tagName.toLowerCase();

    // Try to use nth-of-type if there are multiple of same tag
    const sameTagSiblings = siblings.filter(el => el.tagName.toLowerCase() === tagName);
    if (sameTagSiblings.length > 1) {
      const typeIndex = sameTagSiblings.indexOf(element) + 1;
      const selector = `${tagName}:nth-of-type(${typeIndex})`;
      return {
        selector,
        confidence: 0.6,
        strategy: 'positional',
        position: typeIndex,
        totalOfType: sameTagSiblings.length,
      };
    }

    // Use nth-child as fallback
    const selector = `${tagName}:nth-child(${index + 1})`;
    return {
      selector,
      confidence: 0.4,
      strategy: 'positional',
      position: index + 1,
      totalSiblings: siblings.length,
    };
  }

  /**
   * Generate content-based selector using text content
   * @param {Element} element - Target element
   * @returns {Object} Selector result
   */
  generateContentBasedSelector(element) {
    const textContent = element.textContent?.trim();
    if (!textContent || textContent.length > 50) {
      return { selector: null, confidence: 0, strategy: 'content-based' };
    }

    // For buttons, links, and labels with short, stable text
    const stableTextTags = ['button', 'a', 'label', 'span'];
    const tagName = element.tagName.toLowerCase();

    if (stableTextTags.includes(tagName) && textContent.length < 30) {
      // Use CSS :contains() pseudo-selector (note: not standard CSS, but commonly supported)
      const escapedText = textContent.replace(/["\\]/g, '\\$&');

      // Try multiple content-based approaches
      const approaches = [
        // Exact text match
        `${tagName}:contains("${escapedText}")`,
        // Partial text match for longer content
        textContent.length > 10 ? `${tagName}:contains("${escapedText.substring(0, 15)}")` : null,
        // Attribute-based if available
        element.getAttribute('title') ? `${tagName}[title*="${element.getAttribute('title').substring(0, 20)}"]` : null,
        element.getAttribute('alt') ? `${tagName}[alt*="${element.getAttribute('alt').substring(0, 20)}"]` : null,
      ].filter(Boolean);

      return {
        selector: approaches[0], // Primary selector
        alternatives: approaches.slice(1), // Alternative selectors
        confidence: 0.7,
        strategy: 'content-based',
        textContent,
        tagName,
      };
    }

    // Try aria-label or other accessibility attributes
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.length < 40) {
      return {
        selector: `[aria-label="${ariaLabel.replace(/["\\]/g, '\\$&')}"]`,
        confidence: 0.8,
        strategy: 'content-based-aria',
        ariaLabel,
        tagName,
      };
    }

    return { selector: null, confidence: 0, strategy: 'content-based' };
  }

  /**
   * Score a CSS class semantically
   * @param {string} className - CSS class to score
   * @returns {number} Score between 0 and 1
   */
  scoreClassSemantically(className) {
    let score = 0;

    // Check if it's a generic/framework class (lower score)
    if (this.genericClasses.some(generic => className.includes(generic))) {
      score -= 0.4;
    }

    // Check for BEM methodology patterns (higher score)
    const bemMatch = this.bemPatterns.find(pattern => pattern.test(className));
    if (bemMatch) {
      score += 0.3;
      // Extra bonus for element and modifier patterns (more specific)
      if (className.includes('__') || className.includes('--')) {
        score += 0.1;
      }
    }

    // Check for semantic keywords
    const semanticMatches = this.semanticKeywords.filter(keyword =>
      className.toLowerCase().includes(keyword.toLowerCase()),
    );
    score += semanticMatches.length * 0.2;

    // Prefer longer, more specific class names
    if (className.length > 10) {score += 0.1;}
    if (className.includes('-') || className.includes('_')) {score += 0.1;}

    // Penalize very short or numeric classes
    if (className.length < 4) {score -= 0.2;}
    if (/^\d+$/.test(className)) {score -= 0.3;}

    // Check for platform-specific patterns
    Object.values(this.platformPatterns).forEach(platform => {
      if (platform.classes.some(cls => className.includes(cls))) {
        score += 0.2;
      }
    });

    // Dynamic base score based on class characteristics
    let baseScore = 0.4;
    if (className.length >= 8 && className.length <= 25) {baseScore = 0.5;} // Optimal length range
    if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(className)) {baseScore += 0.1;} // Well-formed identifier

    return Math.max(0, Math.min(1, score + baseScore));
  }

  /**
   * Generate a stable segment for path building
   * @param {Element} element - Element to generate segment for
   * @returns {Object} Path segment
   */
  generateStableSegment(element) {
    const tagName = element.tagName.toLowerCase();

    // Check for ID (most stable)
    if (element.id) {
      return {
        selector: `#${element.id}`,
        isUnique: true,
        stability: 0.95,
        type: 'id',
      };
    }

    // Check for high-value data attributes
    const dataResult = this.generateDataAttributeSelector(element);
    if (dataResult.selector) {
      return {
        selector: dataResult.selector,
        isUnique: true,
        stability: 0.9,
        type: 'data-attribute',
      };
    }

    // Use semantic classes
    const classResult = this.generateSemanticClassSelector(element);
    if (classResult.selector) {
      return {
        selector: classResult.selector,
        isUnique: false,
        stability: classResult.confidence,
        type: 'semantic-class',
      };
    }

    // Fallback to tag with position
    return {
      selector: tagName,
      isUnique: false,
      stability: 0.3,
      type: 'tag',
    };
  }

  /**
   * Calculate confidence score for a path selector
   * @param {Array} path - Array of path segments
   * @returns {number} Confidence score
   */
  calculatePathConfidence(path) {
    if (path.length === 0) {return 0;}

    // Check if any segment is unique
    const hasUniqueSegment = path.some(seg => seg.isUnique);
    if (hasUniqueSegment) {return 0.9;}

    // Calculate average stability
    const avgStability = path.reduce((sum, seg) => sum + seg.stability, 0) / path.length;

    // Penalize very long paths
    const lengthPenalty = Math.max(0, (path.length - 3) * 0.1);

    return Math.max(0.1, Math.min(0.85, avgStability - lengthPenalty));
  }

  /**
   * Generate basic fallback selector
   * @param {Element} element - Target element
   * @returns {Object} Selector result
   */
  generateFallbackSelector(element) {
    if (!element) {return { selector: null, confidence: 0, strategy: 'fallback' };}

    const tagName = element.tagName.toLowerCase();

    // Try ID first
    if (element.id) {
      return {
        selector: `#${element.id}`,
        confidence: 0.9,
        strategy: 'fallback-id',
      };
    }

    // Try first class
    if (element.className) {
      const firstClass = element.className.split(' ')[0].trim();
      if (firstClass) {
        return {
          selector: `.${firstClass}`,
          confidence: 0.5,
          strategy: 'fallback-class',
        };
      }
    }

    // Tag name only
    return {
      selector: tagName,
      confidence: 0.2,
      strategy: 'fallback-tag',
    };
  }

  /**
   * Detect platform type from DOM
   * @param {Document} document - Document to analyze
   * @returns {string} Platform identifier
   */
  detectPlatform(document) {
    for (const [platform, config] of Object.entries(this.platformPatterns)) {
      for (const selector of config.selectors) {
        if (document.querySelector(selector)) {
          return platform;
        }
      }
    }
    return 'generic';
  }

  /**
   * Generate hybrid selector combining multiple approaches
   * @param {Element} element - Target element
   * @param {Object} options - Generation options
   * @returns {Object} Hybrid selector result
   */
  generateHybridSelector(element, options = {}) {
    if (!element) {return { selector: null, confidence: 0, strategy: 'hybrid' };}

    const components = [];
    let confidence = 0;

    // Try to combine stable identifying features
    const dataResult = this.generateDataAttributeSelector(element);
    if (dataResult.selector && dataResult.confidence > 0.8) {
      return dataResult; // Data attributes are preferred
    }

    // Combine semantic classes with structural context
    const classResult = this.generateSemanticClassSelector(element);
    if (classResult.selector && classResult.confidence > 0.6) {
      components.push(classResult.selector);
      confidence += classResult.confidence * 0.6;
    }

    // Add contextual parent if it increases reliability
    let parent = element.parentElement;
    let depth = 0;
    while (parent && depth < 2) {
      const parentDataResult = this.generateDataAttributeSelector(parent);
      if (parentDataResult.selector) {
        components.unshift(parentDataResult.selector);
        confidence += 0.2;
        break;
      }

      const parentClassResult = this.generateSemanticClassSelector(parent);
      if (parentClassResult.selector && parentClassResult.confidence > 0.7) {
        components.unshift(parentClassResult.selector);
        confidence += 0.1;
        break;
      }

      parent = parent.parentElement;
      depth++;
    }

    if (components.length === 0) {
      return this.generateFallbackSelector(element);
    }

    const selector = components.join(' ');
    return {
      selector,
      confidence: Math.min(0.95, confidence),
      strategy: 'hybrid',
      components,
      depth,
    };
  }

  /**
   * Generate weighted selector using multiple strategies
   * @param {Element} element - Target element
   * @param {Object} options - Generation options
   * @returns {Object} Weighted selector result
   */
  generateWeightedSelector(element, options = {}) {
    const candidates = this.generateSelectorCandidates(element, options);

    if (candidates.length === 0) {
      return this.generateFallbackSelector(element);
    }

    // Apply weighted scoring based on context and element characteristics
    const contextWeights = this.getContextWeights(options.context);
    const elementWeights = this.getElementWeights(element);

    candidates.forEach(candidate => {
      const strategyWeight = contextWeights[candidate.strategy] || 1.0;
      const elementWeight = elementWeights[candidate.strategy] || 1.0;
      candidate.weightedScore = candidate.confidence * strategyWeight * elementWeight;
    });

    // Return the highest weighted candidate
    const best = candidates.sort((a, b) => b.weightedScore - a.weightedScore)[0];
    return {
      ...best,
      originalScore: best.confidence,
      confidence: best.weightedScore,
    };
  }

  /**
   * Generate multiple selector candidates for an element
   * @param {Element} element - Target element
   * @param {Object} options - Generation options
   * @returns {Array} Array of selector candidates with scores
   */
  generateSelectorCandidates(element, options = {}) {
    const candidates = [];

    // Data attribute selector
    const dataResult = this.generateDataAttributeSelector(element);
    if (dataResult.selector) {candidates.push(dataResult);}

    // Semantic class selector
    const classResult = this.generateSemanticClassSelector(element);
    if (classResult.selector) {candidates.push(classResult);}

    // Stable path selector
    const pathResult = this.generateStablePathSelector(element, options);
    if (pathResult.selector) {candidates.push(pathResult);}

    // Positional selector
    const positionalResult = this.generatePositionalSelector(element);
    if (positionalResult.selector) {candidates.push(positionalResult);}

    // Content-based selector
    const contentResult = this.generateContentBasedSelector(element);
    if (contentResult.selector) {candidates.push(contentResult);}

    // Hybrid selector
    const hybridResult = this.generateHybridSelector(element, options);
    if (hybridResult.selector) {candidates.push(hybridResult);}

    // Sort by confidence score
    return candidates.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get context-specific weights for different strategies
   * @param {string} context - Context string (e.g., 'product.title')
   * @returns {Object} Strategy weights
   */
  getContextWeights(context) {
    const defaultWeights = {
      'data-attribute': 1.0,
      'semantic-class': 0.8,
      'stable-path': 0.7,
      'positional': 0.4,
      'content-based': 0.6,
      'hybrid': 0.9,
    };

    if (!context) {return defaultWeights;}

    const contextSpecificWeights = {
      'product.link': {
        'content-based': 0.8, // Text content is important for links
        'semantic-class': 0.9,
      },
      'product.price': {
        'content-based': 0.9, // Price patterns are distinctive
        'semantic-class': 0.8,
      },
      'form.input': {
        'data-attribute': 1.0, // Form inputs often have data attributes
        'positional': 0.3, // Position less reliable for forms
      },
      'navigation.menu': {
        'stable-path': 0.9, // Navigation structure is usually stable
        'semantic-class': 0.8,
      },
    };

    const contextWeights = contextSpecificWeights[context] || {};
    return { ...defaultWeights, ...contextWeights };
  }

  /**
   * Get element-specific weights based on element characteristics
   * @param {Element} element - Target element
   * @returns {Object} Element-based strategy weights
   */
  getElementWeights(element) {
    const weights = {
      'data-attribute': 1.0,
      'semantic-class': 1.0,
      'stable-path': 1.0,
      'positional': 1.0,
      'content-based': 1.0,
      'hybrid': 1.0,
    };

    const tagName = element.tagName.toLowerCase();

    // Interactive elements benefit from data attributes and semantic classes
    if (['button', 'a', 'input', 'select'].includes(tagName)) {
      weights['data-attribute'] = 1.2;
      weights['semantic-class'] = 1.1;
      weights['content-based'] = 1.1;
    }

    // Text content elements benefit from content-based selection
    if (['span', 'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      if (element.textContent && element.textContent.trim().length < 50) {
        weights['content-based'] = 1.2;
      }
    }

    // Elements with many classes benefit from semantic analysis
    if (element.className && element.className.split(' ').length > 2) {
      weights['semantic-class'] = 1.1;
      weights.hybrid = 1.2;
    }

    // Elements with unique IDs or data attributes
    if (element.id || Array.from(element.attributes).some(attr => attr.name.startsWith('data-'))) {
      weights['data-attribute'] = 1.3;
    }

    return weights;
  }
}

module.exports = IntelligentSelectorGenerator;
