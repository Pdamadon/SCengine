import { Logger } from '../types/common.types';

interface ValidationResult {
  isValid: boolean;
  selector?: string;
  expectedContext?: string | null;
  issues: string[];
  warnings: string[];
  confidence: number;
  details: {
    matchCount?: number;
    elements?: Element[];
    visibility?: VisibilityResults;
    context?: ContextResult;
    stability?: StabilityResult;
    interactability?: InteractabilityResults;
    performance?: PerformanceResult;
    stabilityTest?: StabilityTestResult;
  };
  improvements?: ImprovementSuggestion[];
  _cacheExpiration?: number;
}

interface VisibilityResults {
  totalCount: number;
  visibleCount: number;
  hiddenCount: number;
  partiallyVisibleCount: number;
  elementDetails: Array<{
    index: number;
    isFullyVisible: boolean;
    isPartiallyVisible: boolean;
    dimensions: {
      width: number;
      height: number;
      top: number;
      left: number;
    };
    style: {
      display: string;
      visibility: string;
      opacity: number;
      zIndex: number;
    };
    reasons: string[];
  }>;
}

interface ContextResult {
  isAppropriate: boolean;
  expectedTags: string[];
  actualTags: string[];
  appropriateCount: number;
  inappropriateCount: number;
  reason: string | null;
}

interface StabilityResult {
  score: number;
  factors: {
    stable: number;
    moderatelyStable: number;
    unstable: number;
  };
  classification: 'stable' | 'moderate' | 'unstable';
}

interface InteractabilityResults {
  totalCount: number;
  interactableCount: number;
  nonInteractableCount: number;
  elementDetails: Array<{
    index: number;
    isInteractable: boolean;
    blockers: string[];
  }>;
}

interface PerformanceResult {
  selector: string;
  iterations: number;
  executionTimes: number[];
  averageTime: number;
  minTime: number;
  maxTime: number;
  errorCount: number;
  performanceGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

interface StabilityTestResult {
  selector: string;
  iterations: number;
  successCount: number;
  failureCount: number;
  stabilityScore: number;
  issues: string[];
  elementConsistency: {
    sameElementCount: number;
    differentElementCount: number;
    averageElementCount: number;
  };
}

interface ImprovementSuggestion {
  type: 'specificity' | 'stability' | 'visibility' | 'context' | 'performance';
  priority: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  suggestion: string;
}

interface ValidationOptions {
  requireUnique?: boolean;
  includePerformance?: boolean;
  includeStability?: boolean;
  performanceIterations?: number;
  stabilityIterations?: number;
  context?: string;
  duration?: number;
}

interface PerformanceMetrics {
  totalValidations: number;
  averageValidationTime: number;
  cacheHitRate: number;
  cacheHits: number;
  cacheMisses: number;
}

interface VisibilityThresholds {
  minWidth: number;
  minHeight: number;
  minOpacity: number;
  maxZIndex: number;
}

interface StabilityIndicators {
  stable: string[];
  moderatelyStable: string[];
  unstable: string[];
}

interface RealTimeValidationResult {
  selector: string;
  duration: number;
  initialValidation: ValidationResult | null;
  mutationEvents: Array<{
    timestamp: number;
    type: string;
    elementCount: number;
    isValid: boolean;
    error?: string;
  }>;
  finalValidation: ValidationResult | null;
  stabilityScore: number;
  recommendations: ImprovementSuggestion[];
}

/**
 * SelectorValidator - Real-time validation for CSS selectors
 * Validates selector uniqueness, element visibility, stability, and context appropriateness
 */
class SelectorValidator {
  private logger: Logger | null;
  private validationCache: Map<string, ValidationResult>;
  private cacheTimeout: number;
  private performanceMetrics: PerformanceMetrics;
  private stabilityHistory: Map<string, any>;
  private activeMonitoringSessions: Map<string, any>;
  private contextExpectations: Record<string, string[]>;
  private visibilityThresholds: VisibilityThresholds;
  private stabilityIndicators: StabilityIndicators;

  constructor(logger: Logger | null = null) {
    this.logger = logger;

    // Cache for validation results to improve performance
    this.validationCache = new Map();
    this.cacheTimeout = 30000; // 30 seconds

    // Performance monitoring
    this.performanceMetrics = {
      totalValidations: 0,
      averageValidationTime: 0,
      cacheHitRate: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };

    // Stability tracking for continuous improvement
    this.stabilityHistory = new Map();

    // Real-time monitoring sessions
    this.activeMonitoringSessions = new Map();

    // Element type expectations for different contexts
    this.contextExpectations = {
      'product.link': ['a', 'button'],
      'product.title': ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'a'],
      'product.price': ['span', 'div', 'p', 'strong', 'em'],
      'product.image': ['img'],
      'product.button': ['button', 'a', 'input'],
      'navigation.menu': ['nav', 'ul', 'div'],
      'navigation.breadcrumb': ['nav', 'ol', 'ul', 'div'],
      'filters.dropdown': ['select', 'div', 'ul'],
      'pagination.controls': ['nav', 'div', 'ul'],
      'forms.input': ['input', 'textarea', 'select'],
    };

    // Minimum visibility thresholds
    this.visibilityThresholds = {
      minWidth: 1,
      minHeight: 1,
      minOpacity: 0.1,
      maxZIndex: -999, // Elements below this z-index are considered hidden
    };

    // Stability indicators
    this.stabilityIndicators = {
      stable: ['id', 'data-testid', 'data-test', 'data-cy', 'data-component'],
      moderatelyStable: ['class', 'role', 'aria-label'],
      unstable: ['nth-child', 'nth-of-type', 'first-child', 'last-child'],
    };
  }

  /**
   * Comprehensive validation of a selector
   */
  async validateSelector(
    selector: string,
    document: Document,
    expectedContext: string | null = null,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    if (!selector || !document) {
      return this.createValidationResult(false, 'Missing selector or document context');
    }

    // Check cache first
    const cacheKey = `${selector}-${expectedContext}-${Date.now().toString().slice(0, -4)}`;
    if (this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey)!;
    }

    const validationResult: ValidationResult = {
      isValid: false,
      selector,
      expectedContext,
      issues: [],
      warnings: [],
      confidence: 0,
      details: {},
    };

    try {
      // 1. Syntax validation
      const syntaxResult = this.validateSelectorSyntax(selector);
      if (!syntaxResult.isValid) {
        validationResult.issues.push(`Syntax error: ${syntaxResult.error}`);
        return this.cacheAndReturn(cacheKey, validationResult);
      }

      // 2. Element existence and uniqueness
      const elements = document.querySelectorAll(selector);
      if (elements.length === 0) {
        validationResult.issues.push('Selector matches no elements');
        return this.cacheAndReturn(cacheKey, validationResult);
      }

      validationResult.details.matchCount = elements.length;
      validationResult.details.elements = Array.from(elements);

      // Check uniqueness
      if (elements.length > 1) {
        if (options.requireUnique !== false) {
          validationResult.warnings.push(`Selector matches ${elements.length} elements (uniqueness concern)`);
        }
      }

      // 3. Visibility validation
      const visibilityResults = this.validateElementVisibility(elements);
      validationResult.details.visibility = visibilityResults;

      if (visibilityResults.visibleCount === 0) {
        validationResult.issues.push('All matched elements are not visible');
        return this.cacheAndReturn(cacheKey, validationResult);
      }

      if (visibilityResults.visibleCount < elements.length) {
        validationResult.warnings.push(`${elements.length - visibilityResults.visibleCount} of ${elements.length} elements are not visible`);
      }

      // 4. Context appropriateness
      if (expectedContext) {
        const contextResult = this.validateContextAppropriateness(elements, expectedContext);
        validationResult.details.context = contextResult;

        if (!contextResult.isAppropriate) {
          validationResult.warnings.push(`Context mismatch: ${contextResult.reason}`);
        }
      }

      // 5. Stability assessment
      const stabilityResult = this.assessSelectorStability(selector);
      validationResult.details.stability = stabilityResult;

      if (stabilityResult.score < 0.3) {
        validationResult.warnings.push(`Low stability score: ${stabilityResult.score.toFixed(2)}`);
      }

      // 6. Interactability validation (for interactive elements)
      if (this.isInteractiveContext(expectedContext)) {
        const interactabilityResult = this.validateInteractability(elements);
        validationResult.details.interactability = interactabilityResult;

        if (interactabilityResult.interactableCount === 0) {
          validationResult.issues.push('No matched elements are interactable');
          return this.cacheAndReturn(cacheKey, validationResult);
        }
      }

      // Calculate overall confidence score
      validationResult.confidence = this.calculateConfidenceScore(validationResult);

      // Determine if valid based on issues and confidence
      validationResult.isValid = validationResult.issues.length === 0 && validationResult.confidence > 0.5;

      return this.cacheAndReturn(cacheKey, validationResult);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error('Selector validation failed:', error);
      validationResult.issues.push(`Validation error: ${errorMessage}`);
      return this.cacheAndReturn(cacheKey, validationResult);
    }
  }

  /**
   * Validate selector syntax
   */
  private validateSelectorSyntax(selector: string): { isValid: boolean; error?: string } {
    try {
      // Use document.querySelector to test syntax validity
      document.querySelector(selector);
      return { isValid: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isValid: false,
        error: errorMessage.includes('is not a valid selector')
          ? 'Invalid CSS selector syntax'
          : errorMessage,
      };
    }
  }

  /**
   * Validate element visibility
   */
  private validateElementVisibility(elements: NodeListOf<Element>): VisibilityResults {
    const results: VisibilityResults = {
      totalCount: elements.length,
      visibleCount: 0,
      hiddenCount: 0,
      partiallyVisibleCount: 0,
      elementDetails: [],
    };

    elements.forEach((element, index) => {
      const visibility = this.checkElementVisibility(element);
      results.elementDetails.push({
        index,
        ...visibility,
      });

      if (visibility.isFullyVisible) {
        results.visibleCount++;
      } else if (visibility.isPartiallyVisible) {
        results.partiallyVisibleCount++;
      } else {
        results.hiddenCount++;
      }
    });

    return results;
  }

  /**
   * Check individual element visibility
   */
  private checkElementVisibility(element: Element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    const visibility = {
      isFullyVisible: false,
      isPartiallyVisible: false,
      dimensions: {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
      },
      style: {
        display: style.display,
        visibility: style.visibility,
        opacity: parseFloat(style.opacity) || 1,
        zIndex: parseInt(style.zIndex) || 0,
      },
      reasons: [] as string[],
    };

    // Check basic visibility conditions
    if (style.display === 'none') {
      visibility.reasons.push('display: none');
      return visibility;
    }

    if (style.visibility === 'hidden') {
      visibility.reasons.push('visibility: hidden');
      return visibility;
    }

    if (visibility.style.opacity < this.visibilityThresholds.minOpacity) {
      visibility.reasons.push(`opacity too low: ${visibility.style.opacity}`);
      return visibility;
    }

    if (visibility.style.zIndex < this.visibilityThresholds.maxZIndex) {
      visibility.reasons.push(`z-index too low: ${visibility.style.zIndex}`);
      return visibility;
    }

    // Check dimensions
    if (rect.width < this.visibilityThresholds.minWidth || rect.height < this.visibilityThresholds.minHeight) {
      visibility.reasons.push('dimensions too small');
      visibility.isPartiallyVisible = true;
    }

    // Check if element is in viewport
    const isInViewport = rect.top >= 0 && rect.left >= 0 &&
                        rect.bottom <= window.innerHeight &&
                        rect.right <= window.innerWidth;

    if (!isInViewport) {
      visibility.reasons.push('outside viewport');
      visibility.isPartiallyVisible = true;
    }

    // If no blocking issues found, consider it fully visible
    if (visibility.reasons.length === 0) {
      visibility.isFullyVisible = true;
    } else if (visibility.reasons.every(reason => reason.includes('viewport') || reason.includes('dimensions'))) {
      visibility.isPartiallyVisible = true;
    }

    return visibility;
  }

  /**
   * Validate context appropriateness
   */
  private validateContextAppropriateness(elements: NodeListOf<Element>, expectedContext: string): ContextResult {
    const expectedTags = this.contextExpectations[expectedContext] || [];
    const results: ContextResult = {
      isAppropriate: true,
      expectedTags,
      actualTags: [],
      appropriateCount: 0,
      inappropriateCount: 0,
      reason: null,
    };

    if (expectedTags.length === 0) {
      results.reason = 'No expectations defined for context';
      return results;
    }

    elements.forEach(element => {
      const tagName = element.tagName.toLowerCase();
      results.actualTags.push(tagName);

      if (expectedTags.includes(tagName)) {
        results.appropriateCount++;
      } else {
        results.inappropriateCount++;
      }
    });

    if (results.inappropriateCount > 0) {
      results.isAppropriate = false;
      results.reason = `Expected ${expectedTags.join('|')} but found ${[...new Set(results.actualTags)].join('|')}`;
    }

    return results;
  }

  /**
   * Assess selector stability
   */
  private assessSelectorStability(selector: string): StabilityResult {
    let score = 0.5; // Base score
    const factors = {
      stable: 0,
      moderatelyStable: 0,
      unstable: 0,
    };

    // Check for stable indicators
    this.stabilityIndicators.stable.forEach(indicator => {
      if (selector.includes(indicator)) {
        factors.stable++;
        score += 0.3;
      }
    });

    // Check for moderately stable indicators
    this.stabilityIndicators.moderatelyStable.forEach(indicator => {
      if (selector.includes(indicator)) {
        factors.moderatelyStable++;
        score += 0.1;
      }
    });

    // Check for unstable indicators
    this.stabilityIndicators.unstable.forEach(indicator => {
      if (selector.includes(indicator)) {
        factors.unstable++;
        score -= 0.2;
      }
    });

    // Additional stability factors
    if (selector.includes('#')) {
      score += 0.2;
    } // ID selectors are stable
    if (selector.includes('[data-')) {
      score += 0.2;
    } // Data attributes are stable
    if (selector.includes('nth-child')) {
      score -= 0.3;
    } // Position-based selectors are unstable
    if (selector.split('.').length > 4) {
      score -= 0.1;
    } // Too many classes can be unstable

    return {
      score: Math.max(0, Math.min(1, score)),
      factors,
      classification: score > 0.7 ? 'stable' : score > 0.4 ? 'moderate' : 'unstable',
    };
  }

  /**
   * Validate element interactability
   */
  private validateInteractability(elements: NodeListOf<Element>): InteractabilityResults {
    const results: InteractabilityResults = {
      totalCount: elements.length,
      interactableCount: 0,
      nonInteractableCount: 0,
      elementDetails: [],
    };

    elements.forEach((element, index) => {
      const interactability = this.checkElementInteractability(element);
      results.elementDetails.push({
        index,
        ...interactability,
      });

      if (interactability.isInteractable) {
        results.interactableCount++;
      } else {
        results.nonInteractableCount++;
      }
    });

    return results;
  }

  /**
   * Check individual element interactability
   */
  private checkElementInteractability(element: Element) {
    const result = {
      isInteractable: true,
      blockers: [] as string[],
    };

    // Check if element is disabled
    if ((element as HTMLInputElement).disabled) {
      result.blockers.push('element is disabled');
      result.isInteractable = false;
    }

    // Check if element is readonly (for inputs)
    if ((element as HTMLInputElement).readOnly) {
      result.blockers.push('element is readonly');
      result.isInteractable = false;
    }

    // Check pointer events
    const style = window.getComputedStyle(element);
    if (style.pointerEvents === 'none') {
      result.blockers.push('pointer-events: none');
      result.isInteractable = false;
    }

    // Check if element might be covered by another element
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const elementAtPoint = document.elementFromPoint(centerX, centerY);

    if (elementAtPoint && !element.contains(elementAtPoint) && elementAtPoint !== element) {
      result.blockers.push('element might be covered by another element');
      // Don't mark as non-interactable for this, just a warning
    }

    return result;
  }

  /**
   * Check if context requires interactability
   */
  private isInteractiveContext(context: string | null): boolean {
    const interactiveContexts = [
      'product.button', 'product.link', 'navigation.menu', 'filters.dropdown',
      'pagination.controls', 'forms.input', 'forms.submit',
    ];
    return context ? interactiveContexts.some(ctx => context.includes(ctx)) : false;
  }

  /**
   * Calculate overall confidence score with enhanced metrics
   */
  private calculateConfidenceScore(validationResult: ValidationResult): number {
    let score = 0.6; // Increased base score for better baseline

    // Issues significantly reduce confidence
    score -= validationResult.issues.length * 0.3;

    // Warnings moderately reduce confidence
    score -= validationResult.warnings.length * 0.08;

    // Visibility affects confidence with improved weighting
    if (validationResult.details.visibility) {
      const visibility = validationResult.details.visibility;
      const visibilityRatio = visibility.visibleCount / visibility.totalCount;
      const partialVisibilityRatio = visibility.partiallyVisibleCount / visibility.totalCount;

      // Full visibility gets full bonus, partial visibility gets reduced bonus
      score += (visibilityRatio * 0.25) + (partialVisibilityRatio * 0.1);
    }

    // Stability affects confidence with enhanced weighting
    if (validationResult.details.stability) {
      const stabilityScore = validationResult.details.stability.score;
      score += stabilityScore * 0.25;

      // Bonus for stable selectors (data attributes, IDs)
      if (validationResult.details.stability.classification === 'stable') {
        score += 0.1;
      }
    }

    // Context appropriateness affects confidence
    if (validationResult.details.context?.isAppropriate) {
      score += 0.15;
    } else if (validationResult.details.context && !validationResult.details.context.isAppropriate) {
      score -= 0.1; // Penalty for inappropriate context
    }

    // Enhanced uniqueness scoring
    const matchCount = validationResult.details.matchCount || 0;
    if (matchCount === 1) {
      score += 0.15; // Strong bonus for unique selectors
    } else if (matchCount >= 2 && matchCount <= 3) {
      score += 0.05; // Small bonus for low-match selectors
    } else if (matchCount > 10) {
      score -= 0.25; // Strong penalty for overly generic selectors
    } else if (matchCount > 5) {
      score -= 0.15; // Medium penalty for generic selectors
    }

    // Interactability bonus for interactive contexts
    if (validationResult.details.interactability) {
      const interactability = validationResult.details.interactability;
      const interactableRatio = interactability.interactableCount / interactability.totalCount;
      score += interactableRatio * 0.1;
    }

    // Performance consideration (if available)
    if (validationResult.details.performance) {
      const perfGrade = validationResult.details.performance.performanceGrade;
      const perfBonus = {
        'A': 0.05,
        'B': 0.03,
        'C': 0,
        'D': -0.02,
        'F': -0.05,
      }[perfGrade] || 0;
      score += perfBonus;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Enhanced validation with machine learning insights
   */
  async validateSelectorEnhanced(
    selector: string,
    document: Document,
    expectedContext: string | null = null,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    // Run standard validation first
    const standardResult = await this.validateSelector(selector, document, expectedContext, options);

    // Add performance validation if requested
    if (options.includePerformance) {
      standardResult.details.performance = await this.validateSelectorPerformance(selector, document, {
        iterations: options.performanceIterations || 50,
      });
    }

    // Add stability testing if requested
    if (options.includeStability) {
      standardResult.details.stabilityTest = await this.testSelectorStability(selector, document,
        options.stabilityIterations || 3,
      );
    }

    // Recalculate confidence with enhanced metrics
    standardResult.confidence = this.calculateConfidenceScore(standardResult);

    // Add improvement suggestions
    standardResult.improvements = this.generateImprovementSuggestions(standardResult, selector, document);

    return standardResult;
  }

  /**
   * Generate improvement suggestions for selectors
   */
  private generateImprovementSuggestions(
    validationResult: ValidationResult,
    selector: string,
    document: Document
  ): ImprovementSuggestion[] {
    const suggestions: ImprovementSuggestion[] = [];

    // Suggest improvements based on validation results
    if ((validationResult.details.matchCount || 0) > 5) {
      suggestions.push({
        type: 'specificity',
        priority: 'high',
        message: 'Selector matches too many elements',
        suggestion: 'Add more specific parent selectors or additional class names',
      });
    }

    if ((validationResult.details.stability?.score || 1) < 0.5) {
      suggestions.push({
        type: 'stability',
        priority: 'high',
        message: 'Selector has low stability score',
        suggestion: 'Consider using data attributes or more stable element identifiers',
      });
    }

    if ((validationResult.details.visibility?.visibleCount || 1) === 0) {
      suggestions.push({
        type: 'visibility',
        priority: 'critical',
        message: 'No matched elements are visible',
        suggestion: 'Check for CSS display/visibility issues or scroll element into view',
      });
    }

    if (validationResult.details.context && !validationResult.details.context.isAppropriate) {
      suggestions.push({
        type: 'context',
        priority: 'medium',
        message: 'Element type does not match expected context',
        suggestion: `Expected ${validationResult.details.context.expectedTags.join('|')} but found ${validationResult.details.context.actualTags.join('|')}`,
      });
    }

    // Performance-based suggestions
    if (validationResult.details.performance?.performanceGrade === 'F') {
      suggestions.push({
        type: 'performance',
        priority: 'medium',
        message: 'Selector has poor performance characteristics',
        suggestion: 'Simplify selector or add more specific parent context to reduce search scope',
      });
    }

    return suggestions;
  }

  /**
   * Create a standardized validation result object
   */
  private createValidationResult(isValid: boolean, message: string | null = null): ValidationResult {
    const result: ValidationResult = {
      isValid,
      issues: message && !isValid ? [message] : [],
      warnings: [],
      confidence: isValid ? 0.8 : 0,
      details: {},
    };
    return result;
  }

  /**
   * Cache validation result and return it
   */
  private cacheAndReturn(cacheKey: string, result: ValidationResult): ValidationResult {
    // Set expiration timestamp
    result._cacheExpiration = Date.now() + this.cacheTimeout;
    this.validationCache.set(cacheKey, result);

    // Clean old cache entries periodically
    if (this.validationCache.size > 100) {
      this.cleanCache();
    }

    return result;
  }

  /**
   * Clean expired cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, value] of this.validationCache.entries()) {
      if (value._cacheExpiration && value._cacheExpiration < now) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.validationCache.delete(key));
  }

  /**
   * Validate multiple selectors and return the best one
   */
  async findBestSelector(
    selectors: string[],
    document: Document,
    expectedContext: string | null = null,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const validationPromises = selectors.map(selector =>
      this.validateSelector(selector, document, expectedContext, options),
    );

    const results = await Promise.all(validationPromises);

    // Find the best valid selector
    const validResults = results.filter(result => result.isValid);
    if (validResults.length === 0) {
      // If no valid selectors, return the one with highest confidence
      return results.sort((a, b) => b.confidence - a.confidence)[0];
    }

    // Return the valid selector with highest confidence
    return validResults.sort((a, b) => b.confidence - a.confidence)[0];
  }

  /**
   * Test selector stability across page reloads (simulation)
   */
  async testSelectorStability(
    selector: string,
    document: Document,
    iterations: number = 3
  ): Promise<StabilityTestResult> {
    const results: StabilityTestResult = {
      selector,
      iterations,
      successCount: 0,
      failureCount: 0,
      stabilityScore: 0,
      issues: [],
      elementConsistency: {
        sameElementCount: 0,
        differentElementCount: 0,
        averageElementCount: 0,
      },
    };

    const elementCounts: number[] = [];
    const elementSnapshots: any[] = [];

    for (let i = 0; i < iterations; i++) {
      try {
        const elements = document.querySelectorAll(selector);
        const elementCount = elements.length;

        if (elementCount > 0) {
          results.successCount++;
          elementCounts.push(elementCount);

          // Store snapshot of elements for consistency checking
          const snapshot = Array.from(elements).map(el => ({
            tagName: el.tagName,
            className: el.className,
            textContent: el.textContent?.trim().substring(0, 50),
            attributes: this.getRelevantAttributes(el),
          }));
          elementSnapshots.push(snapshot);
        } else {
          results.failureCount++;
          results.issues.push(`Iteration ${i + 1}: No elements found`);
          elementCounts.push(0);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.failureCount++;
        results.issues.push(`Iteration ${i + 1}: ${errorMessage}`);
        elementCounts.push(0);
      }

      // Simulate small delay between tests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Calculate stability metrics
    results.stabilityScore = results.successCount / iterations;
    results.elementConsistency.averageElementCount = elementCounts.reduce((sum, count) => sum + count, 0) / iterations;

    // Check element count consistency
    const uniqueCounts = [...new Set(elementCounts)];
    results.elementConsistency.sameElementCount = uniqueCounts.length === 1 ? iterations : 0;
    results.elementConsistency.differentElementCount = iterations - results.elementConsistency.sameElementCount;

    // Add consistency score to overall stability
    const consistencyBonus = results.elementConsistency.sameElementCount / iterations * 0.2;
    results.stabilityScore = Math.min(1.0, results.stabilityScore + consistencyBonus);

    return results;
  }

  /**
   * Validate selector performance under load
   */
  async validateSelectorPerformance(
    selector: string,
    document: Document,
    options: { iterations?: number } = {}
  ): Promise<PerformanceResult> {
    const iterations = options.iterations || 100;
    const results: PerformanceResult = {
      selector,
      iterations,
      executionTimes: [],
      averageTime: 0,
      minTime: Infinity,
      maxTime: 0,
      errorCount: 0,
      performanceGrade: 'A',
    };

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();

      try {
        document.querySelectorAll(selector);
        const endTime = performance.now();
        const executionTime = endTime - startTime;

        results.executionTimes.push(executionTime);
        results.minTime = Math.min(results.minTime, executionTime);
        results.maxTime = Math.max(results.maxTime, executionTime);
      } catch (error) {
        results.errorCount++;
        const endTime = performance.now();
        results.executionTimes.push(endTime - startTime);
      }
    }

    // Calculate performance metrics
    results.averageTime = results.executionTimes.reduce((sum, time) => sum + time, 0) / iterations;

    // Assign performance grade
    if (results.averageTime < 1) {
      results.performanceGrade = 'A'; // Excellent
    } else if (results.averageTime < 5) {
      results.performanceGrade = 'B'; // Good
    } else if (results.averageTime < 10) {
      results.performanceGrade = 'C'; // Average
    } else if (results.averageTime < 20) {
      results.performanceGrade = 'D'; // Poor
    } else {
      results.performanceGrade = 'F'; // Very Poor
    }

    return results;
  }

  /**
   * Get relevant attributes for element comparison
   */
  private getRelevantAttributes(element: Element): Record<string, string> {
    const relevantAttrs: Record<string, string> = {};
    const importantAttributes = ['id', 'class', 'data-testid', 'data-test', 'role', 'aria-label'];

    importantAttributes.forEach(attr => {
      const value = element.getAttribute(attr);
      if (value) {
        relevantAttrs[attr] = value;
      }
    });

    return relevantAttrs;
  }
}

export default SelectorValidator;