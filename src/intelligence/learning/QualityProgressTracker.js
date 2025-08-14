/**
 * QualityProgressTracker - Track quality improvements between learning attempts
 * 
 * Monitors progression through the 3-attempt learning cycle:
 * - Records quality scores and improvements per attempt
 * - Identifies gaps that need focus in next attempt
 * - Tracks patterns learned and extraction success
 * - Provides delta analysis between attempts
 */

class QualityProgressTracker {
  constructor(logger) {
    this.logger = logger;
    this.progressHistory = new Map(); // domain -> attempt history
    this.qualityThresholds = {
      attempt1: 0.35, // 35% expected for discovery
      attempt2: 0.65, // 65% expected for enhancement  
      attempt3: 0.9   // 90% expected for mastery
    };
  }

  /**
   * Record progress for a specific attempt
   */
  async recordProgress(domain, attempt, qualityScore, extractedData) {
    const progressEntry = {
      attempt,
      quality: qualityScore,
      timestamp: new Date().toISOString(),
      
      // Analyze what was extracted
      extraction_analysis: this.analyzeExtraction(extractedData),
      
      // Calculate improvements from previous attempt
      improvements: this.calculateImprovements(domain, attempt, extractedData),
      
      // Identify remaining gaps
      gaps: this.identifyGaps(extractedData, qualityScore),
      
      // Count patterns learned
      patterns_learned: this.countPatternsLearned(extractedData),
      
      // Performance metrics
      performance: this.calculatePerformanceMetrics(extractedData),
      
      // Quality breakdown
      quality_breakdown: this.breakdownQuality(extractedData)
    };

    // Store in memory for session
    if (!this.progressHistory.has(domain)) {
      this.progressHistory.set(domain, []);
    }
    this.progressHistory.get(domain).push(progressEntry);

    // Log progress
    this.logProgress(domain, progressEntry);

    return progressEntry;
  }

  /**
   * Analyze what was successfully extracted in this attempt
   */
  analyzeExtraction(extractedData) {
    const analysis = {
      products_found: extractedData.products?.length || 0,
      fields_extracted: {},
      selectors_working: 0,
      data_completeness: 0
    };

    if (extractedData.products && extractedData.products.length > 0) {
      const product = extractedData.products[0]; // Analyze first product
      
      // Check which fields were successfully extracted
      const fields = ['title', 'price', 'description', 'images', 'variants', 'availability', 'category'];
      fields.forEach(field => {
        analysis.fields_extracted[field] = this.hasValidData(product[field]);
      });

      // Count working selectors
      if (extractedData.selectors) {
        analysis.selectors_working = Object.keys(extractedData.selectors).length;
      }

      // Calculate data completeness
      const extractedFields = Object.values(analysis.fields_extracted).filter(Boolean).length;
      analysis.data_completeness = extractedFields / fields.length;
    }

    return analysis;
  }

  /**
   * Calculate improvements from previous attempt
   */
  calculateImprovements(domain, currentAttempt, extractedData) {
    const history = this.progressHistory.get(domain) || [];
    if (history.length === 0 || currentAttempt === 1) {
      return {
        quality_delta: 0,
        new_fields: [],
        new_patterns: 0,
        is_first_attempt: true
      };
    }

    const previousAttempt = history[history.length - 1];
    const currentAnalysis = this.analyzeExtraction(extractedData);

    const improvements = {
      quality_delta: currentAnalysis.data_completeness - previousAttempt.extraction_analysis.data_completeness,
      new_fields: this.findNewFields(previousAttempt.extraction_analysis, currentAnalysis),
      new_patterns: currentAnalysis.patterns_learned - previousAttempt.patterns_learned,
      selector_improvements: currentAnalysis.selectors_working - previousAttempt.extraction_analysis.selectors_working,
      is_first_attempt: false
    };

    return improvements;
  }

  /**
   * Identify gaps that need to be addressed in next attempt
   */
  identifyGaps(extractedData, qualityScore) {
    const gaps = [];
    
    // Overall quality gaps
    if (qualityScore < 0.9) {
      gaps.push({
        type: 'quality',
        severity: 'high',
        description: `Quality ${(qualityScore * 100).toFixed(1)}% below target 90%`,
        target: 'overall_quality'
      });
    }

    // Specific field gaps
    if (extractedData.products && extractedData.products.length > 0) {
      const product = extractedData.products[0];
      
      if (!this.hasValidData(product.title)) {
        gaps.push({
          type: 'field',
          severity: 'critical',
          description: 'Product title not extracted',
          target: 'title_extraction'
        });
      }
      
      if (!this.hasValidData(product.price)) {
        gaps.push({
          type: 'field', 
          severity: 'critical',
          description: 'Product price not extracted',
          target: 'price_extraction'
        });
      }
      
      if (!this.hasValidData(product.description) || product.description?.length < 20) {
        gaps.push({
          type: 'field',
          severity: 'high',
          description: 'Product description missing or too short',
          target: 'description_extraction'
        });
      }
      
      if (!Array.isArray(product.images) || product.images.length === 0) {
        gaps.push({
          type: 'field',
          severity: 'medium',
          description: 'Product images not extracted',
          target: 'image_extraction'
        });
      }
      
      if (!Array.isArray(product.variants) || product.variants.length === 0) {
        gaps.push({
          type: 'field',
          severity: 'medium',
          description: 'Product variants not detected',
          target: 'variant_detection'
        });
      }
    } else {
      gaps.push({
        type: 'extraction',
        severity: 'critical',
        description: 'No products extracted',
        target: 'product_detection'
      });
    }

    // Actionable selector gaps
    if (!extractedData.actionable_selectors || Object.keys(extractedData.actionable_selectors).length === 0) {
      gaps.push({
        type: 'selectors',
        severity: 'medium',
        description: 'No actionable selectors found',
        target: 'actionable_selectors'
      });
    }

    return gaps.sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity));
  }

  /**
   * Count patterns learned in this attempt
   */
  countPatternsLearned(extractedData) {
    let count = 0;
    
    if (extractedData.selectors) {
      count += Object.keys(extractedData.selectors).length;
    }
    
    if (extractedData.navigation) {
      count += extractedData.navigation.main_sections?.length || 0;
    }
    
    if (extractedData.url_patterns) {
      count += Object.keys(extractedData.url_patterns).length;
    }

    return count;
  }

  /**
   * Calculate performance metrics for this attempt
   */
  calculatePerformanceMetrics(extractedData) {
    return {
      extraction_success_rate: this.calculateExtractionSuccessRate(extractedData),
      selector_reliability: this.calculateSelectorReliability(extractedData),
      data_quality_score: this.calculateDataQualityScore(extractedData),
      completeness_ratio: this.calculateCompletenessRatio(extractedData)
    };
  }

  /**
   * Break down quality score by component
   */
  breakdownQuality(extractedData) {
    const breakdown = {
      required_fields: 0,    // 40% weight
      enhanced_fields: 0,    // 40% weight
      actionable_selectors: 0 // 20% weight
    };

    if (extractedData.products && extractedData.products.length > 0) {
      const product = extractedData.products[0];
      
      // Required fields (title, price, url, description)
      const requiredFields = ['title', 'price', 'url', 'description'];
      const requiredPresent = requiredFields.filter(field => this.hasValidData(product[field])).length;
      breakdown.required_fields = requiredPresent / requiredFields.length;
      
      // Enhanced fields (images, variants, availability, category, brand)
      const enhancedFields = ['images', 'variants', 'availability', 'category', 'brand'];
      const enhancedPresent = enhancedFields.filter(field => this.hasValidData(product[field])).length;
      breakdown.enhanced_fields = enhancedPresent / enhancedFields.length;
    }

    // Actionable selectors
    if (extractedData.actionable_selectors) {
      const actionableFields = ['add_to_cart', 'size_selector', 'quantity_input'];
      const actionablePresent = actionableFields.filter(field => 
        this.hasValidData(extractedData.actionable_selectors[field])
      ).length;
      breakdown.actionable_selectors = actionablePresent / actionableFields.length;
    }

    return breakdown;
  }

  /**
   * Get progress delta between attempts
   */
  getProgressDelta(domain, currentAttempt) {
    const history = this.progressHistory.get(domain) || [];
    if (history.length < 2) return null;

    const current = history[currentAttempt - 1];
    const previous = history[currentAttempt - 2];

    return {
      quality_improvement: current.quality - previous.quality,
      new_patterns: current.patterns_learned - previous.patterns_learned,
      gaps_closed: previous.gaps.length - current.gaps.length,
      fields_improved: this.countFieldImprovements(previous, current),
      performance_delta: {
        extraction_rate: current.performance.extraction_success_rate - previous.performance.extraction_success_rate,
        reliability: current.performance.selector_reliability - previous.performance.selector_reliability
      }
    };
  }

  /**
   * Get recommendations for next attempt based on progress
   */
  getRecommendationsForNextAttempt(domain, currentAttempt) {
    const history = this.progressHistory.get(domain) || [];
    if (history.length === 0) return [];

    const latest = history[history.length - 1];
    const recommendations = [];

    // Analyze gaps and suggest focus areas
    latest.gaps.forEach(gap => {
      switch (gap.target) {
        case 'title_extraction':
          recommendations.push('Use semantic HTML5 patterns for title detection');
          break;
        case 'price_extraction':
          recommendations.push('Apply price-specific regex patterns and currency detection');
          break;
        case 'description_extraction':
          recommendations.push('Look for rich text content and product details sections');
          break;
        case 'image_extraction':
          recommendations.push('Focus on product image carousels and gallery patterns');
          break;
        case 'variant_detection':
          recommendations.push('Identify option selectors and variant dropdowns');
          break;
        case 'actionable_selectors':
          recommendations.push('Generate automation-ready selectors for user actions');
          break;
      }
    });

    // Quality-based recommendations
    if (latest.quality < this.qualityThresholds[`attempt${currentAttempt}`]) {
      recommendations.push(`Focus on core extraction - current quality below expected ${this.qualityThresholds[`attempt${currentAttempt}`] * 100}%`);
    }

    return recommendations;
  }

  /**
   * Get summary of all attempts for a domain
   */
  getProgressSummary(domain) {
    const history = this.progressHistory.get(domain) || [];
    if (history.length === 0) return null;

    return {
      total_attempts: history.length,
      quality_progression: history.map(h => h.quality),
      best_quality: Math.max(...history.map(h => h.quality)),
      latest_gaps: history[history.length - 1]?.gaps || [],
      total_patterns_learned: history[history.length - 1]?.patterns_learned || 0,
      overall_trend: this.calculateOverallTrend(history)
    };
  }

  // Helper methods
  hasValidData(value) {
    if (value === null || value === undefined || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  }

  findNewFields(previousAnalysis, currentAnalysis) {
    const newFields = [];
    for (const [field, hasData] of Object.entries(currentAnalysis.fields_extracted)) {
      if (hasData && !previousAnalysis.fields_extracted[field]) {
        newFields.push(field);
      }
    }
    return newFields;
  }

  getSeverityWeight(severity) {
    switch (severity) {
      case 'critical': return 3;
      case 'high': return 2;
      case 'medium': return 1;
      case 'low': return 0;
      default: return 0;
    }
  }

  calculateExtractionSuccessRate(extractedData) {
    // Simplified calculation based on successful field extraction
    if (!extractedData.products || extractedData.products.length === 0) return 0;
    
    const product = extractedData.products[0];
    const fields = ['title', 'price', 'description', 'images', 'variants'];
    const successful = fields.filter(field => this.hasValidData(product[field])).length;
    
    return successful / fields.length;
  }

  calculateSelectorReliability(extractedData) {
    // Simplified reliability based on working selectors vs attempted
    const working = extractedData.selectors ? Object.keys(extractedData.selectors).length : 0;
    const attempted = working + 5; // Assume some failed attempts
    return working / attempted;
  }

  calculateDataQualityScore(extractedData) {
    // Comprehensive quality score considering data richness
    let score = 0;
    let maxScore = 0;

    if (extractedData.products && extractedData.products.length > 0) {
      const product = extractedData.products[0];
      
      // Title quality (length, capitalization)
      if (this.hasValidData(product.title)) {
        score += product.title.length > 10 ? 1 : 0.5;
      }
      maxScore += 1;

      // Description quality (length, HTML content)
      if (this.hasValidData(product.description)) {
        score += product.description.length > 50 ? 1 : 0.5;
      }
      maxScore += 1;

      // Image quality (multiple images, metadata)
      if (Array.isArray(product.images)) {
        score += product.images.length > 1 ? 1 : 0.5;
      }
      maxScore += 1;

      // Variant quality (multiple types, availability)
      if (Array.isArray(product.variants) && product.variants.length > 0) {
        score += product.variants.some(v => v.type && v.options) ? 1 : 0.5;
      }
      maxScore += 1;
    }

    return maxScore > 0 ? score / maxScore : 0;
  }

  calculateCompletenessRatio(extractedData) {
    const totalRequiredFields = 10; // Title, price, description, images, variants, etc.
    let completedFields = 0;

    if (extractedData.products && extractedData.products.length > 0) {
      const product = extractedData.products[0];
      const fields = ['title', 'price', 'description', 'images', 'variants', 'availability', 'category', 'brand', 'url'];
      completedFields = fields.filter(field => this.hasValidData(product[field])).length;
    }

    return completedFields / totalRequiredFields;
  }

  countFieldImprovements(previous, current) {
    let improvements = 0;
    const fields = ['title', 'price', 'description', 'images', 'variants', 'availability'];
    
    fields.forEach(field => {
      const hadBefore = previous.extraction_analysis.fields_extracted[field];
      const hasNow = current.extraction_analysis.fields_extracted[field];
      if (!hadBefore && hasNow) {
        improvements++;
      }
    });

    return improvements;
  }

  calculateOverallTrend(history) {
    if (history.length < 2) return 'insufficient_data';
    
    const qualityTrend = history[history.length - 1].quality - history[0].quality;
    if (qualityTrend > 0.3) return 'excellent_progress';
    if (qualityTrend > 0.1) return 'good_progress';
    if (qualityTrend > 0) return 'slow_progress';
    return 'stagnant';
  }

  logProgress(domain, progressEntry) {
    this.logger.info(`Quality progress recorded for ${domain}`, {
      attempt: progressEntry.attempt,
      quality: `${(progressEntry.quality * 100).toFixed(1)}%`,
      patterns_learned: progressEntry.patterns_learned,
      gaps_remaining: progressEntry.gaps.length,
      data_completeness: `${(progressEntry.extraction_analysis.data_completeness * 100).toFixed(1)}%`
    });

    // Log improvements if not first attempt
    if (!progressEntry.improvements.is_first_attempt) {
      this.logger.info(`Quality improvements for ${domain}`, {
        quality_delta: `+${(progressEntry.improvements.quality_delta * 100).toFixed(1)}%`,
        new_fields: progressEntry.improvements.new_fields,
        new_patterns: progressEntry.improvements.new_patterns
      });
    }

    // Log critical gaps
    const criticalGaps = progressEntry.gaps.filter(g => g.severity === 'critical');
    if (criticalGaps.length > 0) {
      this.logger.warn(`Critical gaps remaining for ${domain}`, {
        critical_gaps: criticalGaps.map(g => g.description)
      });
    }
  }
}

module.exports = QualityProgressTracker;