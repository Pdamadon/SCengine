import { Logger } from '../types/common.types';

interface PerformanceMetrics {
  totalFallbacksGenerated: number;
  successfulFallbacks: number;
  averageGenerationTime: number;
  strategySuccessRates: {
    'visual-similarity': number;
    'structural': number;
    'platform-specific': number;
    'content-based': number;
    'adaptive-pattern': number;
  };
}

interface PatternData {
  selector: string;
  count: number;
  successRate: number;
  firstUsed: number;
  lastUsed: number;
}

interface LearningData {
  successfulPatterns: Map<string, PatternData[]>;
  failedPatterns: Map<string, PatternData[]>;
  contextSuccessRates: Map<string, Map<string, number>>;
}

interface PlatformPatterns {
  [platform: string]: {
    [context: string]: string[];
  };
}

interface VisualPattern {
  size: {
    large: { minWidth: number; minHeight: number };
    medium: { minWidth: number; minHeight: number };
    small: { minWidth: number; minHeight: number };
  };
  position: {
    header: { maxTop: number };
    sidebar: { maxLeft: number };
    footer: { minBottomFromViewport: number };
  };
  styling: {
    primary: string[];
    secondary: string[];
    accent: string[];
  };
}

interface ContentPattern {
  patterns: RegExp[];
  indicators: string[];
}

interface ContentPatterns {
  pricing: ContentPattern;
  titles: ContentPattern;
  buttons: ContentPattern;
  navigation: ContentPattern;
}

interface StructuralPatterns {
  productContext: {
    siblingSelectors: string[];
    parentSelectors: string[];
    childSelectors: string[];
  };
}

interface FallbackCandidate {
  selector: string;
  confidence: number;
  strategy: string;
  details: Record<string, any>;
  finalScore?: number;
  elementCount?: number;
  visibleCount?: number;
  interactableCount?: number;
  mlInsights?: {
    historicalSuccessRate?: number;
    contextSuccessRate?: number;
    semanticScore?: number;
    error?: string;
  };
}

interface SimilarElement {
  element: Element;
  similarity: number;
  selector: string;
}

interface FallbackGenerationOptions {
  maxFallbacks?: number;
  includeGeneric?: boolean;
  platformHint?: string;
}

interface PatternExtraction {
  hasId: boolean;
  hasClass: boolean;
  hasAttribute: boolean;
  hasDescendant: boolean;
  hasChild: boolean;
  complexity: number;
}

/**
 * AdvancedFallbackSystem - Contextual fallback generation for failed selectors
 * Implements visual similarity, structural relationships, platform patterns, and content-based alternatives
 */
class AdvancedFallbackSystem {
  private logger: Logger | null;
  private performanceMetrics: PerformanceMetrics;
  private learningData: LearningData;
  private platformPatterns: PlatformPatterns;
  private visualPatterns: VisualPattern;
  private contentPatterns: ContentPatterns;
  private structuralPatterns: StructuralPatterns;

  constructor(logger: Logger | null = null) {
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
   */
  async generateFallbackSelectors(
    originalElement: Element | null,
    failedSelector: string,
    context: string,
    document: Document,
    options: FallbackGenerationOptions = {}
  ): Promise<FallbackCandidate[]> {
    if (!originalElement || !document) {
      return [];
    }

    const fallbackCandidates: FallbackCandidate[] = [];

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
   */
  private async generateVisualSimilarityFallbacks(
    originalElement: Element,
    context: string,
    document: Document,
    options: FallbackGenerationOptions
  ): Promise<FallbackCandidate[]> {
    const fallbacks: FallbackCandidate[] = [];
    const originalRect = originalElement.getBoundingClientRect();
    const originalStyle = window.getComputedStyle(originalElement);

    // Find elements with similar dimensions
    const allElements = document.querySelectorAll('*');
    const similarElements: SimilarElement[] = [];

    for (const element of allElements) {
      if (element === originalElement) {
        continue;
      }

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
   */
  private async generateStructuralFallbacks(
    originalElement: Element,
    context: string,
    document: Document,
    options: FallbackGenerationOptions
  ): Promise<FallbackCandidate[]> {
    const fallbacks: FallbackCandidate[] = [];

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
   */
  private async generatePlatformFallbacks(
    context: string,
    document: Document,
    options: FallbackGenerationOptions
  ): Promise<FallbackCandidate[]> {
    const fallbacks: FallbackCandidate[] = [];
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
   */
  private async generateContentBasedFallbacks(
    originalElement: Element,
    context: string,
    document: Document,
    options: FallbackGenerationOptions
  ): Promise<FallbackCandidate[]> {
    const fallbacks: FallbackCandidate[] = [];
    const contextType = context.split('.')[1];
    const originalText = originalElement.textContent?.trim();

    if (!originalText || !this.contentPatterns[contextType as keyof ContentPatterns]) {
      return fallbacks;
    }

    const patterns = this.contentPatterns[contextType as keyof ContentPatterns];

    // Find elements with similar content patterns
    const allElements = document.querySelectorAll('*');
    for (const element of allElements) {
      if (element === originalElement) {
        continue;
      }

      const elementText = element.textContent?.trim();
      if (!elementText) {
        continue;
      }

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
   */
  private async generateGenericFallbacks(
    originalElement: Element,
    context: string,
    document: Document,
    options: FallbackGenerationOptions
  ): Promise<FallbackCandidate[]> {
    const fallbacks: FallbackCandidate[] = [];
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
   */
  private async scoreFallbackCandidates(
    candidates: FallbackCandidate[],
    originalElement: Element,
    context: string,
    document: Document
  ): Promise<FallbackCandidate[]> {
    const scoredCandidates: FallbackCandidate[] = [];

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
          if (this.isElementVisible(el)) {
            visibleCount++;
          }
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

    return scoredCandidates.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
  }

  /**
   * Calculate similarity between two numerical values
   */
  private calculateSimilarity(value1: number, value2: number): number {
    if (value1 === 0 && value2 === 0) {
      return 1;
    }
    if (value1 === 0 || value2 === 0) {
      return 0;
    }

    const larger = Math.max(value1, value2);
    const smaller = Math.min(value1, value2);
    return smaller / larger;
  }

  /**
   * Calculate positional similarity between two rectangles
   */
  private calculatePositionalSimilarity(rect1: DOMRect, rect2: DOMRect): number {
    const xSimilarity = this.calculateSimilarity(rect1.left, rect2.left);
    const ySimilarity = this.calculateSimilarity(rect1.top, rect2.top);
    return (xSimilarity + ySimilarity) / 2;
  }

  /**
   * Calculate styling similarity between two computed styles
   */
  private calculateStyingSimilarity(style1: CSSStyleDeclaration, style2: CSSStyleDeclaration): number {
    const properties = ['fontSize', 'fontWeight', 'color', 'backgroundColor', 'display'];
    let matches = 0;

    properties.forEach(prop => {
      if (style1[prop as any] === style2[prop as any]) {
        matches++;
      }
    });

    return matches / properties.length;
  }

  /**
   * Calculate text content similarity
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) {
      return 0;
    }

    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);

    const commonWords = words1.filter(word => words2.includes(word));
    const totalUniqueWords = new Set([...words1, ...words2]).size;

    return totalUniqueWords > 0 ? commonWords.length / totalUniqueWords : 0;
  }

  /**
   * Generate a basic selector for an element
   */
  private generateElementSelector(element: Element): string {
    if ((element as HTMLElement).id) {
      return `#${(element as HTMLElement).id}`;
    }

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
   */
  private generateRelativeSelector(targetElement: Element, referenceElement: Element): string {
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
   */
  private generateContextualChildSelector(parent: Element, context: string): string {
    const contextType = context.split('.')[1];

    const contextSelectors: Record<string, string> = {
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
   */
  private getAncestors(element: Element, maxDepth: number = 5): Element[] {
    const ancestors: Element[] = [];
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
   */
  private isSemanticClass(className: string): boolean {
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
   */
  private detectPlatform(document: Document): string {
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
   */
  private isElementVisible(element: Element): boolean {
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
   */
  private isContextAppropriate(element: Element | undefined, context: string): boolean {
    if (!element || !context) {
      return false;
    }

    const contextType = context.split('.')[1];
    const tagName = element.tagName.toLowerCase();

    const appropriateTags: Record<string, string[]> = {
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
   */
  private deduplicateAndLimit(candidates: FallbackCandidate[], maxResults: number = 10): FallbackCandidate[] {
    const seen = new Set<string>();
    const unique: FallbackCandidate[] = [];

    for (const candidate of candidates) {
      if (!seen.has(candidate.selector)) {
        seen.add(candidate.selector);
        unique.push(candidate);

        if (unique.length >= maxResults) {
          break;
        }
      }
    }

    return unique;
  }

  /**
   * Check if element is interactable
   */
  private isElementInteractable(element: Element): boolean {
    const style = window.getComputedStyle(element);
    const tagName = element.tagName.toLowerCase();

    // Basic interactability checks
    if ((element as HTMLInputElement).disabled || style.pointerEvents === 'none') {
      return false;
    }

    // Interactive elements
    const interactiveTags = ['button', 'a', 'input', 'select', 'textarea'];
    if (interactiveTags.includes(tagName)) {
      return true;
    }

    // Elements with click handlers or role
    if ((element as any).onclick || element.getAttribute('role') === 'button') {
      return true;
    }

    return false;
  }

  /**
   * Check if context is interactive
   */
  private isInteractiveContext(context: string): boolean {
    const interactiveContexts = ['button', 'link', 'menu', 'dropdown', 'controls'];
    return interactiveContexts.some(ctx => context.includes(ctx));
  }

  /**
   * Record successful pattern for learning
   */
  recordSuccessfulPattern(selector: string, context: string): void {
    if (!this.learningData.successfulPatterns.has(context)) {
      this.learningData.successfulPatterns.set(context, []);
    }

    const patterns = this.learningData.successfulPatterns.get(context)!;
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
   * Get performance insights
   */
  getPerformanceInsights(): Record<string, any> {
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
}

export default AdvancedFallbackSystem;