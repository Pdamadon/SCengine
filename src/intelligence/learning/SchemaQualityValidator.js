/**
 * SchemaQualityValidator - Validate extraction quality against Glasswing schema
 * 
 * Implements the exact quality standards from GlasswingScraper:
 * - Required fields (40% weight): title, price, url, description
 * - Enhanced fields (40% weight): images, variants, availability, category, brand
 * - Actionable selectors (20% weight): add_to_cart, size_selector, quantity_input
 * 
 * Target: 90%+ quality matching hand-crafted GlasswingScraper output
 */

class SchemaQualityValidator {
  constructor(logger) {
    this.logger = logger;
    this.glasswingSchema = this.defineGlasswingSchema();
    this.validationHistory = new Map(); // Track validation results
  }

  /**
   * Define the complete Glasswing quality schema
   */
  defineGlasswingSchema() {
    return {
      // Required fields (40% of total quality score)
      required: {
        title: {
          weight: 0.3,
          validator: (val) => this.validateTitle(val),
          description: 'Product title/name'
        },
        price: {
          weight: 0.3,
          validator: (val) => this.validatePrice(val),
          description: 'Product price with currency'
        },
        url: {
          weight: 0.2,
          validator: (val) => this.validateUrl(val),
          description: 'Product page URL'
        },
        description: {
          weight: 0.2,
          validator: (val) => this.validateDescription(val),
          description: 'Product description (min 20 chars)'
        }
      },

      // Enhanced fields (40% of total quality score)
      enhanced: {
        images: {
          weight: 0.25,
          validator: (val) => this.validateImages(val),
          description: 'Product images with metadata'
        },
        variants: {
          weight: 0.25,
          validator: (val) => this.validateVariants(val),
          description: 'Product variants (size, color, etc.)'
        },
        availability: {
          weight: 0.15,
          validator: (val) => this.validateAvailability(val),
          description: 'Stock availability status'
        },
        category_hierarchy: {
          weight: 0.15,
          validator: (val) => this.validateCategoryHierarchy(val),
          description: 'Category breadcrumb path'
        },
        brand: {
          weight: 0.1,
          validator: (val) => this.validateBrand(val),
          description: 'Product brand/manufacturer'
        },
        description_html: {
          weight: 0.1,
          validator: (val) => this.validateDescriptionHtml(val),
          description: 'Rich HTML description'
        }
      },

      // Actionable selectors (20% of total quality score)
      actionable: {
        add_to_cart: {
          weight: 0.4,
          validator: (val) => this.validateSelector(val),
          description: 'Add to cart button selector'
        },
        size_selector: {
          weight: 0.2,
          validator: (val) => this.validateSelector(val),
          description: 'Size selection dropdown/input'
        },
        quantity_input: {
          weight: 0.2,
          validator: (val) => this.validateSelector(val),
          description: 'Quantity input field'
        },
        color_selector: {
          weight: 0.1,
          validator: (val) => this.validateSelector(val),
          description: 'Color selection input'
        },
        variant_selector: {
          weight: 0.1,
          validator: (val) => this.validateSelector(val),
          description: 'General variant selector'
        }
      }
    };
  }

  /**
   * Main validation method - returns quality score 0.0 to 1.0
   */
  async validateQuality(extractedData) {
    const validationId = `validation_${Date.now()}`;
    const startTime = Date.now();

    this.logger.info('Starting quality validation', {
      validationId,
      hasProducts: !!extractedData.products?.length,
      hasActionableSelectors: !!extractedData.actionable_selectors
    });

    try {
      // Basic validation - must have products
      if (!extractedData.products || extractedData.products.length === 0) {
        this.logger.warn('No products found for validation');
        return this.recordValidation(validationId, 0.0, {
          error: 'No products extracted',
          breakdown: { required: 0, enhanced: 0, actionable: 0 }
        });
      }

      // Validate first product (primary product)
      const product = extractedData.products[0];
      let totalScore = 0;

      // Validate required fields (40% weight)
      const requiredResult = this.validateFieldGroup(
        product,
        this.glasswingSchema.required,
        'required'
      );
      totalScore += requiredResult.score * 0.4;

      // Validate enhanced fields (40% weight)
      const enhancedResult = this.validateFieldGroup(
        product,
        this.glasswingSchema.enhanced,
        'enhanced'
      );
      totalScore += enhancedResult.score * 0.4;

      // Validate actionable selectors (20% weight)
      const actionableResult = this.validateFieldGroup(
        extractedData.actionable_selectors || {},
        this.glasswingSchema.actionable,
        'actionable'
      );
      totalScore += actionableResult.score * 0.2;

      // Create detailed breakdown
      const breakdown = {
        required: requiredResult,
        enhanced: enhancedResult,
        actionable: actionableResult,
        overall_score: totalScore,
        weighted_scores: {
          required: requiredResult.score * 0.4,
          enhanced: enhancedResult.score * 0.4,
          actionable: actionableResult.score * 0.2
        }
      };

      // Log validation results
      this.logValidationResults(totalScore, breakdown);

      // Record for history
      return this.recordValidation(validationId, totalScore, breakdown, Date.now() - startTime);

    } catch (error) {
      this.logger.error('Quality validation failed', {
        validationId,
        error: error.message,
        stack: error.stack
      });
      return 0.0;
    }
  }

  /**
   * Validate a group of fields (required, enhanced, or actionable)
   */
  validateFieldGroup(data, schema, groupName) {
    let groupScore = 0;
    let totalWeight = 0;
    const fieldResults = {};

    for (const [fieldName, config] of Object.entries(schema)) {
      totalWeight += config.weight;
      
      const fieldValue = data[fieldName];
      const isValid = config.validator(fieldValue);
      const fieldScore = isValid ? config.weight : 0;
      
      groupScore += fieldScore;
      fieldResults[fieldName] = {
        value: fieldValue,
        valid: isValid,
        score: fieldScore,
        weight: config.weight,
        description: config.description
      };
    }

    const normalizedScore = totalWeight > 0 ? groupScore / totalWeight : 0;

    return {
      score: normalizedScore,
      total_weight: totalWeight,
      raw_score: groupScore,
      field_results: fieldResults,
      fields_passed: Object.values(fieldResults).filter(r => r.valid).length,
      total_fields: Object.keys(fieldResults).length
    };
  }

  /**
   * Identify missing or invalid fields for improvement guidance
   */
  identifyMissingFields(extractedData) {
    const missing = [];
    const product = extractedData.products?.[0] || {};
    const actionableSelectors = extractedData.actionable_selectors || {};

    // Check required fields
    for (const [field, config] of Object.entries(this.glasswingSchema.required)) {
      if (!config.validator(product[field])) {
        missing.push({
          field,
          group: 'required',
          weight: config.weight,
          description: config.description,
          current_value: product[field],
          severity: 'critical'
        });
      }
    }

    // Check enhanced fields
    for (const [field, config] of Object.entries(this.glasswingSchema.enhanced)) {
      if (!config.validator(product[field])) {
        missing.push({
          field,
          group: 'enhanced',
          weight: config.weight,
          description: config.description,
          current_value: product[field],
          severity: 'high'
        });
      }
    }

    // Check actionable selectors
    for (const [field, config] of Object.entries(this.glasswingSchema.actionable)) {
      if (!config.validator(actionableSelectors[field])) {
        missing.push({
          field,
          group: 'actionable',
          weight: config.weight,
          description: config.description,
          current_value: actionableSelectors[field],
          severity: 'medium'
        });
      }
    }

    // Sort by impact (weight * severity)
    return missing.sort((a, b) => {
      const severityWeight = { critical: 3, high: 2, medium: 1 };
      const aImpact = a.weight * severityWeight[a.severity];
      const bImpact = b.weight * severityWeight[b.severity];
      return bImpact - aImpact;
    });
  }

  /**
   * Generate improvement recommendations based on validation
   */
  generateImprovementRecommendations(extractedData) {
    const missing = this.identifyMissingFields(extractedData);
    const recommendations = [];

    missing.forEach(item => {
      switch (item.field) {
        case 'title':
          recommendations.push({
            field: item.field,
            priority: 'critical',
            action: 'Use semantic selectors: h1, .product-title, .product-name, [data-testid*="title"]',
            example: 'document.querySelector("h1, .product-title, .product__title")'
          });
          break;

        case 'price':
          recommendations.push({
            field: item.field,
            priority: 'critical',
            action: 'Look for currency symbols and price patterns: .price, .money, [class*="price"]',
            example: 'document.querySelector(".price, .money, [data-testid*=price]")'
          });
          break;

        case 'description':
          recommendations.push({
            field: item.field,
            priority: 'high',
            action: 'Extract from product description containers: .description, .product-details, .rte',
            example: 'document.querySelector(".product-description, .product-details, .rte")'
          });
          break;

        case 'images':
          recommendations.push({
            field: item.field,
            priority: 'high',
            action: 'Find product image galleries: .product-images img, .gallery img, .carousel img',
            example: 'document.querySelectorAll(".product-images img, [class*=gallery] img")'
          });
          break;

        case 'variants':
          recommendations.push({
            field: item.field,
            priority: 'medium',
            action: 'Detect variant selectors: select[name*="size"], .variant-selector, .product-options',
            example: 'document.querySelectorAll("select[name*=variant], .variant-selector select")'
          });
          break;

        case 'add_to_cart':
          recommendations.push({
            field: item.field,
            priority: 'medium',
            action: 'Find add to cart buttons: [type="submit"], .add-to-cart, .btn-add-cart',
            example: 'document.querySelector("button[type=submit], .add-to-cart, .btn-cart")'
          });
          break;
      }
    });

    return recommendations;
  }

  /**
   * Compare quality against Glasswing benchmark
   */
  compareToGlasswingBenchmark(qualityScore) {
    const benchmarks = {
      excellent: 0.95, // Matches Glasswing quality
      good: 0.85,      // Close to Glasswing
      acceptable: 0.70, // Usable but needs improvement
      poor: 0.50,      // Significant gaps
      failing: 0.30    // Major issues
    };

    let rating = 'failing';
    let message = 'Quality significantly below Glasswing standard';

    if (qualityScore >= benchmarks.excellent) {
      rating = 'excellent';
      message = 'Quality matches Glasswing standard - extraction complete';
    } else if (qualityScore >= benchmarks.good) {
      rating = 'good';
      message = 'Quality near Glasswing standard - minor improvements needed';
    } else if (qualityScore >= benchmarks.acceptable) {
      rating = 'acceptable';
      message = 'Quality acceptable but below Glasswing standard';
    } else if (qualityScore >= benchmarks.poor) {
      rating = 'poor';
      message = 'Quality poor - significant improvements needed';
    }

    return {
      rating,
      message,
      score: qualityScore,
      glasswing_target: benchmarks.excellent,
      gap_to_target: benchmarks.excellent - qualityScore,
      percentage: `${(qualityScore * 100).toFixed(1)}%`
    };
  }

  // Individual field validators

  validateTitle(value) {
    return value && 
           typeof value === 'string' && 
           value.trim().length > 3 &&
           value.trim().length < 200; // Reasonable title length
  }

  validatePrice(value) {
    if (!value || typeof value !== 'string') return false;
    
    // Must contain currency symbol or price pattern
    const pricePatterns = [
      /\$[\d,]+\.?\d*/,           // $29.99, $1,000
      /€[\d,]+\.?\d*/,           // €29.99
      /£[\d,]+\.?\d*/,           // £29.99
      /[\d,]+\.?\d*\s*(USD|EUR|GBP|CAD)/i, // 29.99 USD
      /Price:?\s*[\d,]+/i        // Price: 29
    ];
    
    return pricePatterns.some(pattern => pattern.test(value.trim()));
  }

  validateUrl(value) {
    if (!value || typeof value !== 'string') return false;
    try {
      new URL(value);
      return value.startsWith('http') && value.length > 10;
    } catch {
      return false;
    }
  }

  validateDescription(value) {
    return value && 
           typeof value === 'string' && 
           value.trim().length >= 20 && // Minimum meaningful description
           value.trim().length < 5000;   // Maximum reasonable length
  }

  validateImages(value) {
    if (!Array.isArray(value)) return false;
    if (value.length === 0) return false;
    
    // At least one image with valid src
    return value.some(img => 
      img && 
      typeof img === 'object' && 
      img.src && 
      typeof img.src === 'string' &&
      img.src.startsWith('http')
    );
  }

  validateVariants(value) {
    if (!Array.isArray(value)) return false;
    if (value.length === 0) return false;
    
    // At least one variant with type and options
    return value.some(variant =>
      variant &&
      typeof variant === 'object' &&
      variant.type &&
      Array.isArray(variant.options) &&
      variant.options.length > 0
    );
  }

  validateAvailability(value) {
    if (!value || typeof value !== 'string') return false;
    
    const validStatuses = [
      'in_stock', 'out_of_stock', 'available', 'unavailable',
      'in stock', 'out of stock', 'sold out', 'backorder'
    ];
    
    return validStatuses.some(status => 
      value.toLowerCase().includes(status.toLowerCase())
    );
  }

  validateCategoryHierarchy(value) {
    return Array.isArray(value) && 
           value.length > 0 && 
           value.every(cat => typeof cat === 'string' && cat.trim().length > 0);
  }

  validateBrand(value) {
    return value && 
           typeof value === 'string' && 
           value.trim().length > 1 &&
           value.trim().length < 100;
  }

  validateDescriptionHtml(value) {
    return value && 
           typeof value === 'string' && 
           value.includes('<') && 
           value.includes('>') &&
           value.trim().length >= 30;
  }

  validateSelector(value) {
    if (!value || typeof value !== 'string') return false;
    
    // Basic CSS selector validation
    try {
      // Check if it looks like a valid CSS selector
      return value.length > 2 && 
             (value.includes('.') || value.includes('#') || value.includes('[') || 
              /^[a-zA-Z][a-zA-Z0-9-_]*$/.test(value)); // Basic element selector
    } catch {
      return false;
    }
  }

  // Utility methods

  recordValidation(validationId, score, breakdown, duration = 0) {
    const record = {
      id: validationId,
      score,
      breakdown,
      duration,
      timestamp: new Date().toISOString()
    };

    // Keep last 10 validations in memory
    if (!this.validationHistory.has('recent')) {
      this.validationHistory.set('recent', []);
    }
    const recent = this.validationHistory.get('recent');
    recent.push(record);
    if (recent.length > 10) {
      recent.shift();
    }

    return score;
  }

  logValidationResults(totalScore, breakdown) {
    this.logger.info('Quality validation completed', {
      overall_score: `${(totalScore * 100).toFixed(1)}%`,
      required_score: `${(breakdown.required.score * 100).toFixed(1)}%`,
      enhanced_score: `${(breakdown.enhanced.score * 100).toFixed(1)}%`,
      actionable_score: `${(breakdown.actionable.score * 100).toFixed(1)}%`,
      glasswing_comparison: this.compareToGlasswingBenchmark(totalScore).rating
    });

    // Log field-level details
    const failedFields = [];
    
    ['required', 'enhanced', 'actionable'].forEach(group => {
      const groupResult = breakdown[group];
      Object.entries(groupResult.field_results).forEach(([field, result]) => {
        if (!result.valid) {
          failedFields.push({
            field,
            group,
            weight: result.weight,
            current_value: result.value
          });
        }
      });
    });

    if (failedFields.length > 0) {
      this.logger.warn('Quality validation - missing fields', {
        missing_count: failedFields.length,
        critical_missing: failedFields.filter(f => f.group === 'required').length,
        total_missing_weight: failedFields.reduce((sum, f) => sum + f.weight, 0).toFixed(2)
      });
    }
  }

  getValidationHistory() {
    return this.validationHistory.get('recent') || [];
  }

  getQualityTrend() {
    const history = this.getValidationHistory();
    if (history.length < 2) return null;

    const scores = history.map(h => h.score);
    const trend = scores[scores.length - 1] - scores[0];
    
    return {
      trend: trend > 0 ? 'improving' : trend < 0 ? 'declining' : 'stable',
      change: trend,
      latest: scores[scores.length - 1],
      average: scores.reduce((sum, s) => sum + s, 0) / scores.length
    };
  }
}

module.exports = SchemaQualityValidator;