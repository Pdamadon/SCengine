/**
 * LearningLoopOrchestrator - Coordinates 3-attempt progressive learning
 * 
 * Orchestrates the self-learning process:
 * Attempt 1: Discovery & Basic Extraction (30-40% quality)
 * Attempt 2: Targeted Enhancement (60-70% quality) 
 * Attempt 3: Deep Extraction & Mastery (90-95% quality)
 */

const SiteIntelligence = require('../SiteIntelligence');
const QualityProgressTracker = require('./QualityProgressTracker');
const SchemaQualityValidator = require('./SchemaQualityValidator');
const WorldModel = require('../WorldModel');

class LearningLoopOrchestrator {
  constructor(logger) {
    this.logger = logger;
    this.siteIntelligence = new SiteIntelligence(logger);
    this.qualityTracker = new QualityProgressTracker(logger);
    this.schemaValidator = new SchemaQualityValidator(logger);
    this.worldModel = new WorldModel(logger);
  }

  async initialize() {
    await this.siteIntelligence.initialize();
    await this.worldModel.initialize();
    this.logger.info('LearningLoopOrchestrator initialized');
  }

  /**
   * Main orchestration method - coordinates the learning progression
   */
  async orchestrateLearning(url, maxAttempts = 3, targetQuality = 0.9, progressCallback = null) {
    const domain = new URL(url).hostname;
    const startTime = Date.now();

    this.logger.info('Starting learning orchestration', {
      url,
      domain,
      maxAttempts,
      targetQuality
    });

    let cumulativeLearning = await this.loadExistingLearning(domain);
    let qualityScore = 0;
    let attempt = 0;
    let attemptResults = [];

    try {
      while (attempt < maxAttempts && qualityScore < targetQuality) {
        attempt++;
        
        this.logger.info(`Starting learning attempt ${attempt}/${maxAttempts}`, {
          domain,
          currentQuality: qualityScore,
          targetQuality
        });

        if (progressCallback) {
          progressCallback(
            20 + (attempt - 1) * 25,
            `Learning attempt ${attempt}/${maxAttempts}: ${this.getAttemptDescription(attempt)}`
          );
        }

        // Execute attempt with accumulated knowledge
        const attemptResult = await this.executeAttempt(
          url,
          cumulativeLearning,
          attempt,
          progressCallback
        );

        // Validate quality against Glasswing schema
        qualityScore = await this.schemaValidator.validateQuality(attemptResult);
        
        // Record progress
        const progressData = await this.qualityTracker.recordProgress(
          domain,
          attempt,
          qualityScore,
          attemptResult
        );

        // Learn from this attempt
        cumulativeLearning = await this.learnFromAttempt(
          cumulativeLearning,
          attemptResult,
          qualityScore,
          attempt
        );

        // Store progress for persistence
        await this.storeProgress(domain, attempt, cumulativeLearning, qualityScore);

        attemptResults.push({
          attempt,
          quality: qualityScore,
          result: attemptResult,
          progress: progressData
        });

        this.logger.info(`Attempt ${attempt} completed`, {
          domain,
          quality: qualityScore,
          improvements: this.identifyImprovements(attemptResult, attempt),
          targetReached: qualityScore >= targetQuality
        });

        // Break if target quality reached
        if (qualityScore >= targetQuality) {
          this.logger.info(`Target quality ${targetQuality} reached in ${attempt} attempts`);
          break;
        }

        // Analyze what to focus on next attempt
        if (attempt < maxAttempts) {
          const focusAreas = this.planNextAttempt(cumulativeLearning, progressData, attempt);
          this.logger.info(`Planning attempt ${attempt + 1}`, { focusAreas });
        }
      }

      // Finalize results
      const finalResult = await this.finalizeResults(
        cumulativeLearning,
        attemptResults,
        qualityScore,
        startTime
      );

      if (progressCallback) {
        progressCallback(
          100,
          `Learning complete: ${(qualityScore * 100).toFixed(1)}% quality in ${attempt} attempts`
        );
      }

      this.logger.info('Learning orchestration completed', {
        domain,
        finalQuality: qualityScore,
        attemptsUsed: attempt,
        duration: Date.now() - startTime
      });

      return finalResult;

    } catch (error) {
      this.logger.error('Learning orchestration failed', {
        domain,
        attempt,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Execute a single learning attempt
   */
  async executeAttempt(url, cumulativeLearning, attemptNumber, progressCallback) {
    const focusAreas = this.getFocusAreasForAttempt(cumulativeLearning, attemptNumber);
    
    const options = {
      forceRefresh: attemptNumber > 1,
      maxConcurrent: this.getConcurrencyForAttempt(attemptNumber),
      maxSubcategories: 3,
      
      // Learning-specific options
      previousLearning: cumulativeLearning,
      focusAreas: focusAreas,
      attemptNumber: attemptNumber,
      
      // Quality target for this attempt
      qualityTarget: this.getQualityTargetForAttempt(attemptNumber)
    };

    this.logger.info(`Executing attempt ${attemptNumber}`, {
      url,
      focusAreas,
      options: { ...options, previousLearning: '[truncated]' }
    });

    // Use existing SiteIntelligence with learning-enhanced options
    const intelligence = await this.siteIntelligence.buildComprehensiveSiteIntelligence(url, options);

    // Enhance the intelligence result with attempt-specific processing
    return await this.enhanceIntelligenceResult(intelligence, cumulativeLearning, attemptNumber);
  }

  /**
   * Learn from the current attempt and update cumulative learning
   */
  async learnFromAttempt(cumulativeLearning, attemptResult, qualityScore, attemptNumber) {
    const newLearning = {
      ...cumulativeLearning,
      
      // Update attempt history
      attempts: (cumulativeLearning.attempts || []).concat({
        number: attemptNumber,
        quality: qualityScore,
        timestamp: new Date().toISOString(),
        patterns_found: this.countPatternsFound(attemptResult),
        successful_selectors: this.extractSuccessfulSelectors(attemptResult),
        failed_extractions: this.identifyFailedExtractions(attemptResult)
      }),

      // Merge successful patterns
      successful_patterns: this.mergeSuccessfulPatterns(
        cumulativeLearning.successful_patterns || {},
        attemptResult
      ),

      // Learn from failures to avoid repeating
      failed_patterns: this.updateFailedPatterns(
        cumulativeLearning.failed_patterns || {},
        attemptResult
      ),

      // Update selector reliability scores
      selector_reliability: this.updateSelectorReliability(
        cumulativeLearning.selector_reliability || {},
        attemptResult
      ),

      // Track quality progression
      quality_progression: (cumulativeLearning.quality_progression || []).concat(qualityScore),

      // Update learning metadata
      last_updated: new Date().toISOString(),
      total_attempts: attemptNumber,
      best_quality: Math.max(cumulativeLearning.best_quality || 0, qualityScore)
    };

    return newLearning;
  }

  /**
   * Determine focus areas based on attempt number and previous results
   */
  getFocusAreasForAttempt(cumulativeLearning, attemptNumber) {
    switch (attemptNumber) {
      case 1:
        // Attempt 1: Basic discovery
        return [
          'navigation_mapping',
          'basic_product_detection',
          'platform_identification',
          'generic_selectors'
        ];
        
      case 2:
        // Attempt 2: Target gaps from attempt 1
        return this.identifyGapsFromPreviousAttempt(cumulativeLearning);
        
      case 3:
        // Attempt 3: Deep extraction and refinement
        return [
          'variant_detection',
          'actionable_selectors',
          'relationship_mapping',
          'quality_enhancement'
        ];
        
      default:
        return ['comprehensive_extraction'];
    }
  }

  /**
   * Identify gaps from previous attempt to focus on
   */
  identifyGapsFromPreviousAttempt(cumulativeLearning) {
    const gaps = [];
    const lastAttempt = cumulativeLearning.attempts?.[cumulativeLearning.attempts.length - 1];
    
    if (!lastAttempt) {
      return ['basic_extraction'];
    }

    // Identify missing elements based on quality score
    if (lastAttempt.quality < 0.5) {
      gaps.push('improved_selectors', 'platform_specific_patterns');
    }
    
    if (!lastAttempt.successful_selectors?.images?.length) {
      gaps.push('image_extraction');
    }
    
    if (!lastAttempt.successful_selectors?.variants?.length) {
      gaps.push('variant_detection');
    }
    
    if (!lastAttempt.successful_selectors?.actionable?.length) {
      gaps.push('actionable_selectors');
    }

    return gaps.length > 0 ? gaps : ['quality_refinement'];
  }

  /**
   * Get concurrency level based on attempt (more conservative on later attempts)
   */
  getConcurrencyForAttempt(attemptNumber) {
    switch (attemptNumber) {
      case 1: return 4; // Aggressive discovery
      case 2: return 3; // Focused exploration
      case 3: return 2; // Deep, careful extraction
      default: return 2;
    }
  }

  /**
   * Get quality target for each attempt
   */
  getQualityTargetForAttempt(attemptNumber) {
    switch (attemptNumber) {
      case 1: return 0.35; // 35% target
      case 2: return 0.65; // 65% target  
      case 3: return 0.9;  // 90% target
      default: return 0.9;
    }
  }

  /**
   * Get human-readable description for attempt
   */
  getAttemptDescription(attemptNumber) {
    switch (attemptNumber) {
      case 1: return 'Discovery & basic extraction';
      case 2: return 'Targeted enhancement';
      case 3: return 'Deep extraction & mastery';
      default: return 'Quality refinement';
    }
  }

  /**
   * Enhance intelligence result with attempt-specific processing
   */
  async enhanceIntelligenceResult(intelligence, cumulativeLearning, attemptNumber) {
    // Add learning-specific enhancements based on attempt number
    const enhanced = {
      ...intelligence,
      learning_metadata: {
        attempt_number: attemptNumber,
        cumulative_patterns: Object.keys(cumulativeLearning.successful_patterns || {}).length,
        learning_score: this.calculateLearningScore(cumulativeLearning),
        enhanced_at: new Date().toISOString()
      }
    };

    // Apply cumulative learning to improve extraction
    if (cumulativeLearning.successful_patterns) {
      enhanced.selectors = this.enhanceSelectorsWithLearning(
        enhanced.selectors,
        cumulativeLearning.successful_patterns
      );
    }

    return enhanced;
  }

  /**
   * Load existing learning data for domain
   */
  async loadExistingLearning(domain) {
    try {
      // Try to load from WorldModel
      const existingIntelligence = await this.worldModel.getSiteIntelligenceSummary(domain);
      
      if (existingIntelligence && existingIntelligence.learning_data) {
        this.logger.info(`Loaded existing learning for ${domain}`, {
          attempts: existingIntelligence.learning_data.total_attempts,
          bestQuality: existingIntelligence.learning_data.best_quality
        });
        return existingIntelligence.learning_data;
      }

      // No existing learning found
      this.logger.info(`No existing learning found for ${domain}, starting fresh`);
      return {
        successful_patterns: {},
        failed_patterns: {},
        selector_reliability: {},
        quality_progression: [],
        attempts: [],
        total_attempts: 0,
        best_quality: 0
      };

    } catch (error) {
      this.logger.warn(`Failed to load existing learning for ${domain}`, { error: error.message });
      return {};
    }
  }

  /**
   * Store learning progress for persistence
   */
  async storeProgress(domain, attempt, cumulativeLearning, qualityScore) {
    try {
      // Store in WorldModel for persistence
      await this.worldModel.storeLearningProgress(domain, {
        attempt,
        learning_data: cumulativeLearning,
        quality_score: qualityScore,
        updated_at: new Date().toISOString()
      });

      this.logger.debug(`Stored learning progress for ${domain}`, {
        attempt,
        quality: qualityScore
      });

    } catch (error) {
      this.logger.warn(`Failed to store learning progress for ${domain}`, {
        error: error.message
      });
    }
  }

  /**
   * Finalize results after all attempts
   */
  async finalizeResults(cumulativeLearning, attemptResults, finalQuality, startTime) {
    const duration = Date.now() - startTime;
    
    return {
      // Final extracted data (best attempt)
      products: this.extractBestProducts(attemptResults),
      actionable_selectors: this.extractBestActionableSelectors(attemptResults),
      
      // Learning metrics
      finalQuality: finalQuality,
      attemptsUsed: attemptResults.length,
      qualityProgression: attemptResults.map(r => r.quality),
      patternsLearned: Object.keys(cumulativeLearning.successful_patterns || {}).length,
      
      // Timing
      startedAt: new Date(Date.now() - duration).toISOString(),
      completedAt: new Date().toISOString(),
      duration: duration,
      
      // Full learning context
      learning_data: cumulativeLearning,
      attempt_details: attemptResults.map(r => ({
        attempt: r.attempt,
        quality: r.quality,
        improvements: r.progress?.improvements || []
      }))
    };
  }

  // Helper methods
  identifyImprovements(attemptResult, attemptNumber) {
    // Analyze what improved in this attempt
    return ['selectors_refined', 'new_patterns_found']; // Simplified for now
  }

  planNextAttempt(cumulativeLearning, progressData, currentAttempt) {
    // Plan focus areas for next attempt based on current gaps
    return progressData.gaps?.slice(0, 3) || ['general_improvement'];
  }

  countPatternsFound(attemptResult) {
    return Object.keys(attemptResult.selectors || {}).length;
  }

  extractSuccessfulSelectors(attemptResult) {
    return attemptResult.selectors || {};
  }

  identifyFailedExtractions(attemptResult) {
    return []; // TODO: Implement based on extraction failures
  }

  mergeSuccessfulPatterns(existing, attemptResult) {
    return { ...existing, ...attemptResult.selectors };
  }

  updateFailedPatterns(existing, attemptResult) {
    return existing; // TODO: Track failed patterns
  }

  updateSelectorReliability(existing, attemptResult) {
    return existing; // TODO: Update reliability scores
  }

  calculateLearningScore(cumulativeLearning) {
    const attempts = cumulativeLearning.attempts?.length || 0;
    const quality = cumulativeLearning.best_quality || 0;
    return Math.min(attempts * 0.2 + quality * 0.8, 1.0);
  }

  enhanceSelectorsWithLearning(selectors, successfulPatterns) {
    // Enhance selectors with learned patterns
    return { ...selectors, ...successfulPatterns };
  }

  extractBestProducts(attemptResults) {
    // Return products from highest quality attempt
    const bestAttempt = attemptResults.reduce((best, current) => 
      current.quality > best.quality ? current : best
    );
    return bestAttempt.result?.products || [];
  }

  extractBestActionableSelectors(attemptResults) {
    // Return actionable selectors from highest quality attempt
    const bestAttempt = attemptResults.reduce((best, current) => 
      current.quality > best.quality ? current : best
    );
    return bestAttempt.result?.actionable_selectors || {};
  }
}

module.exports = LearningLoopOrchestrator;