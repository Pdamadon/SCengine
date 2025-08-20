/**
 * StructuralNavigationClassifier.js
 *
 * DOM-structure-based navigation classification that doesn't rely on hardcoded text patterns.
 * Implements Zen's Phase 1 heuristic approach for universal site compatibility.
 *
 * Core principle: Navigation structure is more reliable than text content across different sites.
 */

class StructuralNavigationClassifier {
  constructor(logger, options = {}) {
    this.logger = logger;
    this.config = {
      // Scoring weights (tunable based on evaluation)
      weights: {
        domPosition: 0.25,      // Y-coordinate importance
        containment: 0.20,      // Parent container signals
        siblingCount: 0.20,     // Grouped navigation detection
        visualProminence: 0.15, // Font size, weight, styling
        depthFromBody: 0.10,    // DOM tree depth
        urlHeuristics: 0.10,    // Path structure analysis
        ...options.weights,
      },

      // Classification thresholds (temporarily lowered for debugging)
      thresholds: {
        mainSection: 0.40,      // Score needed for MAIN_SECTION (lowered from 0.70)
        category: 0.25,         // Score needed for CATEGORY (lowered from 0.50)
        utility: 0.15,          // Below this = UTILITY (lowered from 0.30)
        ...options.thresholds,
      },

      // Utility link indicators (negative scoring)
      utilityKeywords: [
        'cart', 'bag', 'basket', 'checkout',
        'login', 'sign in', 'account', 'profile',
        'wishlist', 'favorites', 'search',
        'help', 'support', 'contact', 'store locator',
      ],

      // Navigation container selectors (positive scoring)
      navContainerSelectors: [
        'nav', 'header nav', '.nav', '.navigation',
        '.main-nav', '.primary-nav', '.navbar',
        '[role="navigation"]', '[role="menubar"]',
      ],
    };
  }

  /**
   * Classify navigation items using structural analysis
   * @param {Array} items - Raw navigation items from strategies
   * @param {Page} page - Playwright page for DOM analysis
   * @returns {Promise<Array>} Items with tier classifications
   */
  async classifyNavigationItems(items, page) {
    this.logger.info(`🏗️ Classifying ${items.length} navigation items using structural analysis`);

    const classifiedItems = [];

    for (const item of items) {
      try {
        // Collect structural features for this item
        const features = await this.collectNavigationFeatures(item, page);

        // Use fallback classification if no selector available
        if (features.noSelector) {
          const fallbackTier = this.classifyWithoutSelector(item);
          const classifiedItem = {
            ...item,
            tier: fallbackTier,
            score: fallbackTier === 'MAIN_SECTION' ? 0.8 :
              fallbackTier === 'CATEGORY' ? 0.6 :
                fallbackTier === 'SUBCATEGORY' ? 0.4 : 0.2,
            features: { fallback: true, fallbackTier },
            // Legacy compatibility
            type: fallbackTier === 'MAIN_SECTION' ? 'main_section' :
              fallbackTier === 'CATEGORY' ? 'category' :
                fallbackTier === 'SUBCATEGORY' ? 'subcategory' : 'utility',
            isMainNav: fallbackTier === 'MAIN_SECTION',
          };
          classifiedItems.push(classifiedItem);
        } else {
          // Calculate classification score
          const score = this.calculateClassificationScore(features);

          // Determine tier based on score
          const tier = this.determineTier(score, features);

          // Enhanced item with classification
          const classifiedItem = {
            ...item,
            tier,
            score,
            features,
            // Legacy compatibility
            type: tier === 'MAIN_SECTION' ? 'main_section' :
              tier === 'CATEGORY' ? 'category' :
                tier === 'SUBCATEGORY' ? 'subcategory' : 'utility',
            isMainNav: tier === 'MAIN_SECTION',
          };

          classifiedItems.push(classifiedItem);
        }

      } catch (error) {
        this.logger.warn(`Failed to classify item ${item.name}:`, error.message);

        // Fallback: intelligent classification without DOM selectors
        const fallbackTier = this.classifyWithoutSelector(item);
        classifiedItems.push({
          ...item,
          tier: fallbackTier,
          type: fallbackTier === 'MAIN_SECTION' ? 'main_section' :
            fallbackTier === 'CATEGORY' ? 'category' :
              fallbackTier === 'SUBCATEGORY' ? 'subcategory' : 'utility',
          isMainNav: fallbackTier === 'MAIN_SECTION',
          score: fallbackTier === 'MAIN_SECTION' ? 0.8 :
            fallbackTier === 'CATEGORY' ? 0.6 :
              fallbackTier === 'SUBCATEGORY' ? 0.4 : 0.2,
          features: { fallback: true, fallbackTier },
        });
      }
    }

    const mainSections = classifiedItems.filter(item => item.tier === 'MAIN_SECTION');
    const categories = classifiedItems.filter(item => item.tier === 'CATEGORY');
    const subcategories = classifiedItems.filter(item => item.tier === 'SUBCATEGORY');
    const utilities = classifiedItems.filter(item => item.tier === 'UTILITY');

    this.logger.info(`📊 Classification results: ${mainSections.length} main sections, ${categories.length} categories, ${subcategories.length} subcategories, ${utilities.length} utilities`);

    // DEBUG: Show sample scores for troubleshooting
    if (mainSections.length === 0 && classifiedItems.length > 0) {
      this.logger.warn('🔍 DEBUG: No main sections found. Sample scores:');
      const highestScores = classifiedItems
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 5);

      highestScores.forEach((item, i) => {
        this.logger.warn(`  ${i + 1}. "${item.name || item.text || 'N/A'}" score=${item.score?.toFixed(3)} tier=${item.tier} selector="${item.selector || 'MISSING'}"`);
      });
    }

    return classifiedItems;
  }

  /**
   * Collect structural features for a navigation item
   * @param {Object} item - Navigation item
   * @param {Page} page - Playwright page
   * @returns {Promise<Object>} Feature object
   */
  async collectNavigationFeatures(item, page) {
    if (!item.selector) {
      return { hasSelector: false, noSelector: true };
    }

    return await page.evaluate((serializedData) => {
      const { selector, config } = serializedData;

      try {
        const element = document.querySelector(selector);
        if (!element) {
          return { elementFound: false };
        }

        const features = {};
        const rect = element.getBoundingClientRect();

        // 1. DOM Position Analysis
        features.domPosition = {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          isAboveFold: rect.top < window.innerHeight,
          isInTopQuarter: rect.top < window.innerHeight * 0.25,
          centerX: rect.left + rect.width / 2,
          isRightAligned: (rect.left + rect.width / 2) > window.innerWidth * 0.8,
        };

        // 2. Containment Analysis
        features.containment = {
          isInNav: !!element.closest('nav'),
          isInHeader: !!element.closest('header'),
          hasNavRole: !!element.closest('[role="navigation"]'),
          hasMenubarRole: !!element.closest('[role="menubar"]'),
          parentTagName: element.parentElement?.tagName?.toLowerCase(),
          hasNavClass: !!element.closest('[class*="nav"]'),
        };

        // 3. Sibling Count Analysis
        const parent = element.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(child =>
            child.tagName === element.tagName &&
            child.querySelector('a[href]'),
          );

          features.siblings = {
            count: siblings.length,
            position: siblings.indexOf(element),
            isInGroup: siblings.length >= 3 && siblings.length <= 15,
            avgTextLength: siblings.reduce((sum, sib) => sum + (sib.textContent?.trim().length || 0), 0) / siblings.length,
          };
        }

        // 4. Visual Prominence
        const computedStyle = window.getComputedStyle(element);
        features.visualProminence = {
          fontSize: parseFloat(computedStyle.fontSize) || 0,
          fontWeight: computedStyle.fontWeight,
          isBold: computedStyle.fontWeight === 'bold' || parseInt(computedStyle.fontWeight) >= 600,
          isUppercase: element.textContent === element.textContent?.toUpperCase(),
          hasBackgroundColor: computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && computedStyle.backgroundColor !== 'transparent',
          zIndex: parseInt(computedStyle.zIndex) || 0,
        };

        // 5. Depth from Body
        let depth = 0;
        let current = element;
        while (current && current !== document.body) {
          depth++;
          current = current.parentElement;
        }
        features.depthFromBody = depth;

        // 6. Text Content Analysis
        const text = element.textContent?.trim() || '';
        features.textContent = {
          length: text.length,
          hasText: text.length > 0,
          isShort: text.length <= 3, // Likely icon-only
          wordCount: text.split(/\s+/).length,
          text: text,
        };

        return features;

      } catch (error) {
        return { error: error.message };
      }
    }, {
      selector: item.selector,
      config: this.config,
    });
  }

  /**
   * Calculate classification score based on collected features
   * @param {Object} features - Collected structural features
   * @returns {number} Classification score 0-1
   */
  calculateClassificationScore(features) {
    if (!features.elementFound || features.noSelector) {
      return 0.1;
    }

    let score = 0;
    const weights = this.config.weights;

    // 1. DOM Position Score
    if (features.domPosition) {
      let positionScore = 0;

      // Higher score for items above the fold
      if (features.domPosition.isAboveFold) {positionScore += 0.5;}
      if (features.domPosition.isInTopQuarter) {positionScore += 0.5;}

      // Penalize right-aligned items (likely utility)
      if (features.domPosition.isRightAligned) {positionScore -= 0.3;}

      score += Math.max(0, positionScore) * weights.domPosition;
    }

    // 2. Containment Score
    if (features.containment) {
      let containmentScore = 0;

      if (features.containment.isInNav) {containmentScore += 0.4;}
      if (features.containment.isInHeader) {containmentScore += 0.3;}
      if (features.containment.hasNavRole) {containmentScore += 0.2;}
      if (features.containment.hasNavClass) {containmentScore += 0.1;}

      score += Math.min(1, containmentScore) * weights.containment;
    }

    // 3. Sibling Count Score
    if (features.siblings) {
      let siblingScore = 0;

      if (features.siblings.isInGroup) {siblingScore += 0.8;}
      else if (features.siblings.count >= 2) {siblingScore += 0.4;}

      // Bonus for being in the first half of siblings
      if (features.siblings.position < features.siblings.count / 2) {siblingScore += 0.2;}

      score += Math.min(1, siblingScore) * weights.siblingCount;
    }

    // 4. Visual Prominence Score
    if (features.visualProminence) {
      let prominenceScore = 0;

      // Font size relative to browser default (16px)
      const relativeFontSize = features.visualProminence.fontSize / 16;
      if (relativeFontSize >= 1.1) {prominenceScore += 0.3;}
      if (relativeFontSize >= 1.3) {prominenceScore += 0.2;}

      if (features.visualProminence.isBold) {prominenceScore += 0.2;}
      if (features.visualProminence.isUppercase) {prominenceScore += 0.1;}
      if (features.visualProminence.hasBackgroundColor) {prominenceScore += 0.2;}

      score += Math.min(1, prominenceScore) * weights.visualProminence;
    }

    // 5. Depth Score (closer to body = higher score)
    if (features.depthFromBody) {
      const depthScore = Math.max(0, 1 - (features.depthFromBody - 3) / 10);
      score += depthScore * weights.depthFromBody;
    }

    // 6. Negative scoring for utility indicators
    if (features.textContent && features.textContent.text) {
      const text = features.textContent.text.toLowerCase();
      const isUtilityText = this.config.utilityKeywords.some(keyword =>
        text.includes(keyword),
      );

      if (isUtilityText) {
        score *= 0.3; // Heavy penalty for utility keywords
      }

      // Penalty for very short text (likely icons)
      if (features.textContent.isShort) {
        score *= 0.7;
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Determine tier based on score and features
   * @param {number} score - Classification score
   * @param {Object} features - Structural features
   * @returns {string} Tier classification
   */
  determineTier(score, features) {
    const thresholds = this.config.thresholds;

    // Check for clear utility indicators first
    if (features.textContent && features.textContent.text) {
      const text = features.textContent.text.toLowerCase();
      if (this.config.utilityKeywords.some(keyword => text.includes(keyword))) {
        return 'UTILITY';
      }
    }

    // Right-aligned small items are usually utility
    if (features.domPosition?.isRightAligned && features.textContent?.isShort) {
      return 'UTILITY';
    }

    // Score-based classification
    if (score >= thresholds.mainSection) {
      return 'MAIN_SECTION';
    } else if (score >= thresholds.category) {
      return 'CATEGORY';
    } else if (score >= thresholds.utility) {
      return 'SUBCATEGORY';
    } else {
      return 'UTILITY';
    }
  }

  /**
   * Intelligent fallback classification when DOM analysis isn't possible
   * @param {Object} item - Navigation item
   * @returns {string} Tier classification
   */
  classifyWithoutSelector(item) {
    if (!item.name && !item.text && !item.url) {return 'UTILITY';}

    const text = (item.name || item.text || '').toLowerCase().trim();
    const url = (item.url || '').toLowerCase();

    // Clear utility patterns
    if (this.config.utilityKeywords.some(keyword => text.includes(keyword))) {
      return 'UTILITY';
    }

    // URL patterns that suggest main navigation
    const mainNavUrlPatterns = [
      '/collections/', '/categories/', '/category/', '/dept/', '/department/',
      '/men', '/women', '/man', '/woman', '/clothing', '/shoes', '/home',
      '/sale', '/new', '/brands',
    ];

    if (mainNavUrlPatterns.some(pattern => url.includes(pattern))) {
      return 'MAIN_SECTION';
    }

    // Text patterns for boutique/general sites (much more permissive than enterprise patterns)
    const navigationTextPatterns = [
      // Traditional departments
      'men', 'man', 'mens', 'women', 'woman', 'womens', 'unisex',
      'kids', 'children', 'baby', 'girls', 'boys',

      // Categories
      'clothing', 'shoes', 'accessories', 'bags', 'jewelry',
      'home', 'bath', 'body', 'beauty', 'fragrance',

      // Commercial
      'sale', 'clearance', 'new', 'featured', 'collection', 'all',

      // Boutique-specific
      'designer', 'brand', 'seasonal', 'spring', 'summer', 'fall', 'winter',
      'studio', 'atelier', 'gallery', 'greenhouse', 'seattle',
    ];

    // Flexible text matching
    if (navigationTextPatterns.some(pattern => {
      // Exact match or contains pattern
      return text === pattern ||
             text.includes(pattern) ||
             text.startsWith(pattern) ||
             text.includes('all ' + pattern) ||
             text.includes(pattern + 's'); // plural forms
    })) {
      return 'MAIN_SECTION';
    }

    // If it has a reasonable URL and text, probably navigation
    if (url && text && text.length > 2 && text.length < 50) {
      return 'CATEGORY';
    }

    return 'UTILITY';
  }

  /**
   * Simple utility check for fallback classification
   * @param {Object} item - Navigation item
   * @returns {boolean} True if likely utility link
   */
  isLikelyUtility(item) {
    return this.classifyWithoutSelector(item) === 'UTILITY';
  }
}

module.exports = StructuralNavigationClassifier;
