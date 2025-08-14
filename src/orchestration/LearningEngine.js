/**
 * LearningEngine - Refactored learning orchestration
 * 
 * Manages progressive pattern learning without the scraping logic.
 * Uses existing components:
 * - SiteIntelligence for comprehensive site analysis
 * - QualityProgressTracker for tracking improvements
 * - SchemaQualityValidator for quality validation
 * - ProductPatternLearner for URL pattern learning
 * 
 * This replaces LearningLoopOrchestrator with cleaner separation
 */

const SiteIntelligence = require('../intelligence/SiteIntelligence');
const QualityProgressTracker = require('../intelligence/learning/QualityProgressTracker');
const SchemaQualityValidator = require('../intelligence/learning/SchemaQualityValidator');
const ProductPatternLearner = require('../intelligence/discovery/ProductPatternLearner');
const IntelligentSelectorGenerator = require('../intelligence/IntelligentSelectorGenerator');
const AdvancedFallbackSystem = require('../intelligence/AdvancedFallbackSystem');

class LearningEngine {
  constructor(logger) {
    this.logger = logger;
    
    // Initialize learning components
    this.siteIntelligence = new SiteIntelligence(logger);
    this.qualityTracker = new QualityProgressTracker(logger);
    this.schemaValidator = new SchemaQualityValidator(logger);
    this.patternLearner = new ProductPatternLearner(logger);
    this.selectorGenerator = new IntelligentSelectorGenerator(logger);
    this.fallbackSystem = new AdvancedFallbackSystem(logger);
    
    // Learning state
    this.learningHistory = new Map();
    this.qualityThresholds = {
      attempt1: 0.35, // Discovery phase
      attempt2: 0.65, // Enhancement phase
      attempt3: 0.90  // Mastery phase
    };
  }

  /**
   * Initialize learning components
   */
  async initialize() {
    await this.siteIntelligence.initialize();
    this.logger.info('LearningEngine initialized');
  }

  /**
   * Main learning method - learn patterns progressively
   * 
   * @param {string} url - Target URL
   * @param {object} discoveryData - Navigation discovery data
   * @param {object} options - Learning options
   * @returns {object} Learning results with patterns and selectors
   */
  async learn(url, discoveryData, options = {}) {
    const domain = new URL(url).hostname;
    const maxAttempts = options.maxAttempts || 3;
    const targetQuality = options.targetQuality || 0.9;
    const progressCallback = options.progressCallback;
    
    this.logger.info('Starting learning process', {
      url,
      domain,
      maxAttempts,
      targetQuality
    });

    let currentQuality = 0;
    let attempt = 0;
    let cumulativeLearning = {
      patterns: [],
      selectors: {},
      extraction_rules: {},
      platform_detected: null
    };
    
    const attemptResults = [];
    const startTime = Date.now();

    try {
      // Progressive learning loop
      while (attempt < maxAttempts && currentQuality < targetQuality) {
        attempt++;
        
        const attemptTarget = this.getQualityTarget(attempt);
        
        this.logger.info(`Learning attempt ${attempt}/${maxAttempts}`, {
          currentQuality,
          targetQuality: attemptTarget
        });
        
        if (progressCallback) {
          progressCallback(
            (attempt - 1) * 33,
            `Attempt ${attempt}: ${this.getAttemptDescription(attempt)}`
          );
        }

        // Execute learning attempt
        const attemptResult = await this.executeAttempt(
          url,
          discoveryData,
          cumulativeLearning,
          attempt
        );
        
        // Validate quality
        currentQuality = await this.schemaValidator.validateQuality(attemptResult);
        
        // Track progress
        const progress = await this.qualityTracker.recordProgress(
          domain,
          attempt,
          currentQuality,
          attemptResult
        );
        
        // Merge learning
        cumulativeLearning = this.mergeLearning(cumulativeLearning, attemptResult);
        
        attemptResults.push({
          attempt,
          quality: currentQuality,
          patterns: attemptResult.patterns,
          improvements: progress.improvements
        });
        
        this.logger.info(`Attempt ${attempt} completed`, {
          quality: currentQuality,
          patternsLearned: attemptResult.patterns?.length || 0
        });
        
        // Early exit if quality target reached
        if (currentQuality >= attemptTarget) {
          this.logger.info('Quality target reached early', {
            attempt,
            quality: currentQuality,
            target: attemptTarget
          });
          break;
        }
      }

      // Compile final learning results
      const finalResult = {
        quality: currentQuality,
        attempts: attempt,
        patterns: cumulativeLearning.patterns,
        selectors: cumulativeLearning.selectors,
        extraction_rules: cumulativeLearning.extraction_rules,
        platform_detected: cumulativeLearning.platform_detected,
        quality_progression: attemptResults.map(r => r.quality),
        duration: Date.now() - startTime,
        metadata: {
          domain,
          targetQuality,
          finalQuality: currentQuality,
          attempts: attemptResults
        }
      };
      
      // Store learning history
      this.learningHistory.set(domain, finalResult);
      
      if (progressCallback) {
        progressCallback(100, `Learning complete: ${(currentQuality * 100).toFixed(1)}% quality`);
      }
      
      return finalResult;
      
    } catch (error) {
      this.logger.error('Learning failed', {
        domain,
        attempt,
        error: error.message
      });
      
      // Return partial results
      return {
        quality: currentQuality,
        attempts: attempt,
        patterns: cumulativeLearning.patterns,
        selectors: cumulativeLearning.selectors,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Execute a single learning attempt
   */
  async executeAttempt(url, discoveryData, previousLearning, attemptNumber) {
    const focusAreas = this.getFocusAreas(attemptNumber);
    
    this.logger.info(`Executing learning attempt ${attemptNumber}`, {
      focusAreas
    });

    // Build comprehensive site intelligence
    const siteIntelligence = await this.siteIntelligence.buildComprehensiveSiteIntelligence(
      url,
      {
        forceRefresh: attemptNumber === 1,
        maxConcurrent: attemptNumber * 2, // Increase parallelism with attempts
        maxSubcategories: attemptNumber * 3,
        previousLearning,
        focusAreas,
        attemptNumber,
        discoveryData // Pass discovery data to avoid re-discovery
      }
    );

    // Generate intelligent selectors
    const selectors = await this.generateSelectors(siteIntelligence, attemptNumber);
    
    // Learn product URL patterns
    const patterns = await this.learnPatterns(siteIntelligence, attemptNumber);
    
    // Generate fallback strategies
    const fallbacks = this.generateFallbacks(siteIntelligence, selectors);
    
    return {
      patterns,
      selectors,
      fallbacks,
      platform_detected: siteIntelligence.platform_detected,
      extraction_rules: siteIntelligence.extraction_rules || {},
      categories_explored: siteIntelligence.categories_explored || [],
      quality_metrics: siteIntelligence.quality_metrics || {}
    };
  }

  /**
   * Generate intelligent selectors based on site intelligence
   */
  async generateSelectors(siteIntelligence, attemptNumber) {
    const selectors = {};
    
    // Generate selectors for different element types
    const elementTypes = [
      'product_container',
      'product_title',
      'product_price',
      'product_image',
      'product_link',
      'add_to_cart',
      'pagination',
      'load_more'
    ];
    
    for (const elementType of elementTypes) {
      const samples = siteIntelligence.sample_products || [];
      const generated = this.selectorGenerator.generateOptimalSelector(
        elementType,
        samples,
        {
          platform: siteIntelligence.platform_detected,
          attemptNumber,
          useFallbacks: attemptNumber > 1
        }
      );
      
      if (generated) {
        selectors[elementType] = generated;
      }
    }
    
    this.logger.info('Generated selectors', {
      count: Object.keys(selectors).length,
      types: Object.keys(selectors)
    });
    
    return selectors;
  }

  /**
   * Learn product URL patterns
   */
  async learnPatterns(siteIntelligence, attemptNumber) {
    const patterns = [];
    
    // Extract URL patterns from discovered products
    if (siteIntelligence.sample_products && siteIntelligence.sample_products.length > 0) {
      const urls = siteIntelligence.sample_products
        .map(p => p.url)
        .filter(url => url);
      
      // Group by pattern
      const patternGroups = this.patternLearner.groupByUrlPattern(urls);
      
      // Convert to pattern objects
      Object.entries(patternGroups).forEach(([pattern, urls]) => {
        patterns.push({
          pattern,
          confidence: urls.length / siteIntelligence.sample_products.length,
          examples: urls.slice(0, 3),
          count: urls.length
        });
      });
    }
    
    // Sort by confidence
    patterns.sort((a, b) => b.confidence - a.confidence);
    
    this.logger.info('Learned URL patterns', {
      count: patterns.length,
      topPattern: patterns[0]?.pattern
    });
    
    return patterns;
  }

  /**
   * Generate fallback strategies
   */
  generateFallbacks(siteIntelligence, selectors) {
    const fallbacks = {};
    
    Object.entries(selectors).forEach(([elementType, selector]) => {
      const alternatives = this.fallbackSystem.generateContextualFallbacks(
        selector,
        elementType,
        {
          platform: siteIntelligence.platform_detected,
          sampleContent: siteIntelligence.sample_products
        }
      );
      
      if (alternatives && alternatives.length > 0) {
        fallbacks[elementType] = alternatives;
      }
    });
    
    return fallbacks;
  }

  /**
   * Merge learning from current attempt with previous learning
   */
  mergeLearning(previous, current) {
    return {
      patterns: [...(previous.patterns || []), ...(current.patterns || [])],
      selectors: { ...previous.selectors, ...current.selectors },
      extraction_rules: { ...previous.extraction_rules, ...current.extraction_rules },
      fallbacks: { ...previous.fallbacks, ...current.fallbacks },
      platform_detected: current.platform_detected || previous.platform_detected,
      categories_explored: [
        ...(previous.categories_explored || []),
        ...(current.categories_explored || [])
      ]
    };
  }

  /**
   * Get quality target for attempt
   */
  getQualityTarget(attempt) {
    return this.qualityThresholds[`attempt${attempt}`] || 0.9;
  }

  /**
   * Get focus areas for attempt
   */
  getFocusAreas(attempt) {
    const focusAreasByAttempt = {
      1: ['navigation_mapping', 'basic_product_detection', 'platform_identification'],
      2: ['deep_category_exploration', 'selector_refinement', 'pattern_learning'],
      3: ['edge_case_handling', 'fallback_generation', 'quality_optimization']
    };
    
    return focusAreasByAttempt[attempt] || focusAreasByAttempt[3];
  }

  /**
   * Get attempt description
   */
  getAttemptDescription(attempt) {
    const descriptions = {
      1: 'Discovery & basic extraction',
      2: 'Pattern refinement & enhancement',
      3: 'Deep extraction & quality optimization'
    };
    
    return descriptions[attempt] || 'Advanced learning';
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    // No browser resources to clean in learning engine
    this.learningHistory.clear();
    this.logger.info('LearningEngine cleaned up');
  }
}

module.exports = LearningEngine;