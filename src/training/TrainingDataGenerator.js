const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class TrainingDataGenerator {
  constructor(logger) {
    this.logger = logger;
    this.trainingDataPath = process.env.TRAINING_DATA_PATH || './data/training';
    this.scenarioCount = 0;
    this.dailyTarget = parseInt(process.env.SCENARIOS_PER_DAY_TARGET) || 1000;
    this.scenarioTemplates = this.loadScenarioTemplates();
    
    this.ensureDataDirectory();
  }

  async ensureDataDirectory() {
    try {
      await fs.mkdir(this.trainingDataPath, { recursive: true });
      await fs.mkdir(path.join(this.trainingDataPath, 'scenarios'), { recursive: true });
      await fs.mkdir(path.join(this.trainingDataPath, 'flows'), { recursive: true });
      await fs.mkdir(path.join(this.trainingDataPath, 'aggregated'), { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create training data directories:', error);
    }
  }

  loadScenarioTemplates() {
    return {
      product_search: [
        "Find {color} {item_type} under ${budget}",
        "Look for {material} {item_type} in {color}",
        "Search for {brand} {item_type} with {feature}",
        "Browse {item_type} suitable for {occasion}"
      ],
      
      category_browse: [
        "Browse all {category} products",
        "Explore {category} section for new arrivals",
        "Check {category} for sale items",
        "View {category} collection"
      ],
      
      comparison_shopping: [
        "Compare {item_type} from different brands",
        "Find the best {item_type} under ${budget}",
        "Compare {item_type} with similar features",
        "Evaluate {item_type} options for {criteria}"
      ],
      
      specific_purchase: [
        "Buy {specific_item} in {size}",
        "Purchase {item_type} for {purpose}",
        "Order {quantity} of {item_type}",
        "Add {item_type} to cart and checkout"
      ]
    };
  }

  async createScenario(url, userIntent, siteStructure, reasoning) {
    try {
      this.logger.info(`Creating training scenario for ${url}`);
      
      const scenario = {
        id: uuidv4(),
        created_at: new Date().toISOString(),
        site: {
          url: url,
          domain: new URL(url).hostname,
          platform: siteStructure.metadata?.platform || 'unknown'
        },
        user_intent: {
          raw: userIntent,
          analysis: reasoning.user_intent_analysis
        },
        shopping_flow: await this.enhanceShoppingFlow(reasoning.shopping_flow, siteStructure),
        site_context: this.extractSiteContext(siteStructure),
        training_metadata: {
          complexity_score: reasoning.reasoning_metadata.complexity_score,
          estimated_time: this.estimateCompletionTime(reasoning.shopping_flow),
          success_probability: this.calculateSuccessProbability(reasoning.shopping_flow, siteStructure),
          learning_objectives: this.identifyLearningObjectives(reasoning.shopping_flow)
        }
      };
      
      await this.saveScenario(scenario);
      this.scenarioCount++;
      
      this.logger.info(`Training scenario created: ${scenario.id}`);
      return scenario;
      
    } catch (error) {
      this.logger.error('Failed to create training scenario:', error);
      throw error;
    }
  }

  async enhanceShoppingFlow(flow, siteStructure) {
    return await Promise.all(flow.map(async (step, index) => {
      const enhancedStep = {
        step_id: uuidv4(),
        step_number: index + 1,
        action: step.action,
        human_reasoning: step.human_reasoning,
        ai_learning_objective: step.ai_learning,
        technical_implementation: {
          method: this.extractImplementationMethod(step.technical_implementation),
          selector: this.generateRobustSelector(step, siteStructure),
          fallback_selectors: this.generateFallbackSelectors(step, siteStructure),
          interaction_type: this.classifyInteractionType(step.action)
        },
        validation: {
          success_criteria: step.success_criteria,
          failure_indicators: this.generateFailureIndicators(step.action),
          retry_strategy: this.generateRetryStrategy(step.action),
          timeout_ms: this.calculateTimeout(step.action)
        },
        context: {
          prerequisite_steps: index > 0 ? [flow[index - 1].action] : [],
          page_state_requirements: this.generatePageStateRequirements(step),
          user_goal_progress: this.calculateGoalProgress(index, flow.length),
          decision_factors: this.extractDecisionFactors(step)
        }
      };
      
      return enhancedStep;
    }));
  }

  extractSiteContext(siteStructure) {
    return {
      ecommerce_maturity: this.assessEcommerceMaturity(siteStructure.ecommercePatterns),
      navigation_complexity: this.assessNavigationComplexity(siteStructure.navigation),
      product_catalog_size: siteStructure.products.length,
      technical_features: {
        spa_indicators: this.detectSPAIndicators(siteStructure),
        ajax_navigation: this.detectAjaxNavigation(siteStructure),
        responsive_design: siteStructure.pageStructure.responsive_score || 0
      },
      accessibility_features: this.assessAccessibilityFeatures(siteStructure),
      performance_indicators: this.extractPerformanceIndicators(siteStructure)
    };
  }

  extractImplementationMethod(technicalImpl) {
    if (technicalImpl.includes('click(')) return 'click';
    if (technicalImpl.includes('type(')) return 'type';
    if (technicalImpl.includes('select(')) return 'select';
    if (technicalImpl.includes('hover(')) return 'hover';
    return 'interact';
  }

  generateRobustSelector(step, siteStructure) {
    const baseSelector = step.context?.selector || step.technical_implementation;
    
    const selectorStrategies = [
      this.generateDataAttributeSelector(baseSelector),
      this.generateClassBasedSelector(baseSelector),
      this.generateTextBasedSelector(step),
      this.generateStructuralSelector(step, siteStructure)
    ].filter(Boolean);
    
    return {
      primary: selectorStrategies[0] || baseSelector,
      alternatives: selectorStrategies.slice(1),
      confidence: this.calculateSelectorConfidence(selectorStrategies[0])
    };
  }

  generateFallbackSelectors(step, siteStructure) {
    const fallbacks = [];
    
    switch (step.action) {
      case 'navigate_to_category':
        fallbacks.push(
          `a[href*="${step.context.category}"]`,
          `.nav a:contains("${step.context.category}")`,
          `[data-category="${step.context.category}"]`
        );
        break;
        
      case 'apply_filter':
        fallbacks.push(
          `.filter[data-${step.context.filter_type}]`,
          `.${step.context.filter_type}-filter`,
          `input[name="${step.context.filter_type}"]`
        );
        break;
        
      case 'search_products':
        fallbacks.push(
          'input[type="search"]',
          'input[name*="search"]',
          '.search-input',
          '#search'
        );
        break;
        
      case 'select_product':
        fallbacks.push(
          '.product-item:first-child',
          '.product:first',
          '[data-product]:first'
        );
        break;
        
      case 'add_to_cart':
        fallbacks.push(
          '.add-to-cart',
          '.btn-add-cart',
          'button[data-action="add-to-cart"]',
          'input[type="submit"][value*="cart"]'
        );
        break;
    }
    
    return fallbacks;
  }

  classifyInteractionType(action) {
    const typeMap = {
      navigate_to_category: 'navigation',
      apply_filter: 'filtering',
      search_products: 'search',
      select_product: 'selection',
      add_to_cart: 'transaction'
    };
    
    return typeMap[action] || 'general';
  }

  generateFailureIndicators(action) {
    const indicators = {
      navigate_to_category: [
        'Page did not change',
        'No products displayed',
        '404 error page'
      ],
      apply_filter: [
        'Product count unchanged',
        'Filter not visually active',
        'Page reload without filter applied'
      ],
      search_products: [
        'No search results displayed',
        'Search input not focused',
        'Search suggestion dropdown not appearing'
      ],
      select_product: [
        'Product page did not load',
        'Same page content displayed',
        'Product details not visible'
      ],
      add_to_cart: [
        'Cart count not updated',
        'No confirmation message',
        'Add to cart button still enabled without change'
      ]
    };
    
    return indicators[action] || ['Action did not complete successfully'];
  }

  generateRetryStrategy(action) {
    const strategies = {
      navigate_to_category: 'retry_with_different_selector',
      apply_filter: 'wait_and_retry',
      search_products: 'clear_and_retype',
      select_product: 'scroll_into_view_and_retry',
      add_to_cart: 'wait_for_ajax_and_retry'
    };
    
    return strategies[action] || 'simple_retry';
  }

  calculateTimeout(action) {
    const timeouts = {
      navigate_to_category: 5000,
      apply_filter: 3000,
      search_products: 4000,
      select_product: 3000,
      add_to_cart: 6000
    };
    
    return timeouts[action] || 5000;
  }

  generatePageStateRequirements(step) {
    const requirements = {
      navigate_to_category: ['homepage_or_category_page_loaded'],
      apply_filter: ['product_listing_page_visible', 'filters_available'],
      search_products: ['search_functionality_visible'],
      select_product: ['products_displayed', 'product_clickable'],
      add_to_cart: ['product_page_loaded', 'add_to_cart_button_visible']
    };
    
    return requirements[step.action] || ['page_loaded'];
  }

  calculateGoalProgress(currentStep, totalSteps) {
    return {
      percentage: Math.round((currentStep + 1) / totalSteps * 100),
      phase: this.identifyShoppingPhase(currentStep, totalSteps),
      remaining_steps: totalSteps - currentStep - 1
    };
  }

  identifyShoppingPhase(currentStep, totalSteps) {
    const progress = (currentStep + 1) / totalSteps;
    
    if (progress <= 0.3) return 'discovery';
    if (progress <= 0.7) return 'evaluation';
    return 'conversion';
  }

  extractDecisionFactors(step) {
    const factors = [];
    
    if (step.context.category) factors.push(`product_category:${step.context.category}`);
    if (step.context.filter_type) factors.push(`filter_criteria:${step.context.filter_type}`);
    if (step.context.search_term) factors.push(`search_intent:${step.context.search_term}`);
    if (step.context.selection_criteria) factors.push('product_criteria_matching');
    if (step.context.purchase_intent) factors.push('purchase_readiness');
    
    return factors;
  }

  estimateCompletionTime(flow) {
    const baseTimePerStep = 2000;
    const complexityMultipliers = {
      navigate_to_category: 1.0,
      apply_filter: 1.2,
      search_products: 1.1,
      select_product: 0.8,
      add_to_cart: 1.5
    };
    
    const totalTime = flow.reduce((time, step) => {
      const stepTime = baseTimePerStep * (complexityMultipliers[step.action] || 1.0);
      return time + stepTime;
    }, 0);
    
    return {
      estimated_ms: totalTime,
      estimated_seconds: Math.round(totalTime / 1000),
      user_perceived_time: Math.round(totalTime / 1000 * 0.7)
    };
  }

  calculateSuccessProbability(flow, siteStructure) {
    let probability = 0.8;
    
    const ecommerceScore = siteStructure.ecommercePatterns?.ecommerceScore || 0;
    probability *= (0.5 + ecommerceScore * 0.5);
    
    const productAvailability = siteStructure.products.length > 0 ? 1 : 0.3;
    probability *= productAvailability;
    
    const navigationComplexity = flow.length / 10;
    probability *= Math.max(0.5, 1 - navigationComplexity);
    
    return Math.max(0.1, Math.min(0.95, probability));
  }

  identifyLearningObjectives(flow) {
    const objectives = new Set();
    
    flow.forEach(step => {
      switch (step.action) {
        case 'navigate_to_category':
          objectives.add('category_navigation');
          objectives.add('site_structure_understanding');
          break;
        case 'apply_filter':
          objectives.add('product_filtering');
          objectives.add('attribute_based_selection');
          break;
        case 'search_products':
          objectives.add('search_functionality');
          objectives.add('query_optimization');
          break;
        case 'select_product':
          objectives.add('product_evaluation');
          objectives.add('decision_making');
          break;
        case 'add_to_cart':
          objectives.add('transaction_initiation');
          objectives.add('purchase_funnel_progression');
          break;
      }
    });
    
    return Array.from(objectives);
  }

  async saveScenario(scenario) {
    const filename = `scenario_${scenario.id}.json`;
    const filepath = path.join(this.trainingDataPath, 'scenarios', filename);
    
    try {
      await fs.writeFile(filepath, JSON.stringify(scenario, null, 2));
      
      await this.updateAggregatedStats(scenario);
      
    } catch (error) {
      this.logger.error(`Failed to save scenario ${scenario.id}:`, error);
      throw error;
    }
  }

  async updateAggregatedStats(scenario) {
    const statsPath = path.join(this.trainingDataPath, 'aggregated', 'daily_stats.json');
    const today = new Date().toISOString().split('T')[0];
    
    try {
      let stats = {};
      try {
        const existingStats = await fs.readFile(statsPath, 'utf8');
        stats = JSON.parse(existingStats);
      } catch (error) {
        // File doesn't exist yet, start fresh
      }
      
      if (!stats[today]) {
        stats[today] = {
          scenarios_generated: 0,
          sites_processed: [],
          average_complexity: 0,
          total_complexity: 0,
          platforms: {}
        };
      }
      
      const dayStats = stats[today];
      dayStats.scenarios_generated++;
      if (!dayStats.sites_processed.includes(scenario.site.domain)) {
        dayStats.sites_processed.push(scenario.site.domain);
      }
      dayStats.total_complexity += scenario.training_metadata.complexity_score;
      dayStats.average_complexity = dayStats.total_complexity / dayStats.scenarios_generated;
      
      const platform = scenario.site.platform;
      dayStats.platforms[platform] = (dayStats.platforms[platform] || 0) + 1;
      
      await fs.writeFile(statsPath, JSON.stringify(stats, null, 2));
      
    } catch (error) {
      this.logger.error('Failed to update aggregated stats:', error);
    }
  }

  async getScenarioCount() {
    return this.scenarioCount;
  }

  generateDataAttributeSelector(baseSelector) {
    if (baseSelector.includes('[data-')) {
      return baseSelector;
    }
    return null;
  }

  generateClassBasedSelector(baseSelector) {
    if (baseSelector.includes('.')) {
      return baseSelector;
    }
    return null;
  }

  generateTextBasedSelector(step) {
    if (step.context && step.context.category) {
      return `a:contains("${step.context.category}")`;
    }
    return null;
  }

  generateStructuralSelector(step, siteStructure) {
    return null;
  }

  calculateSelectorConfidence(selector) {
    if (!selector) return 0;
    
    let confidence = 0.5;
    if (selector.includes('[data-')) confidence += 0.3;
    if (selector.includes('#')) confidence += 0.2;
    if (selector.includes('.') && !selector.includes(' ')) confidence += 0.1;
    
    return Math.min(1, confidence);
  }

  assessEcommerceMaturity(patterns) {
    if (!patterns) return 'unknown';
    
    if (patterns.ecommerceScore > 0.8) return 'mature';
    if (patterns.ecommerceScore > 0.5) return 'developing';
    return 'basic';
  }

  assessNavigationComplexity(navigation) {
    if (!navigation) return 'simple';
    
    const menuSize = navigation.mainMenu.length;
    if (menuSize > 10) return 'complex';
    if (menuSize > 5) return 'moderate';
    return 'simple';
  }

  detectSPAIndicators(siteStructure) {
    return siteStructure.scriptTags > 5;
  }

  detectAjaxNavigation(siteStructure) {
    return siteStructure.ecommercePatterns?.hasFilters && 
           siteStructure.ecommercePatterns?.hasProductGrid;
  }

  assessAccessibilityFeatures(siteStructure) {
    return {
      has_semantic_html: siteStructure.pageStructure.hasMain,
      keyboard_navigation: true,
      screen_reader_support: 'unknown'
    };
  }

  extractPerformanceIndicators(siteStructure) {
    return {
      total_elements: siteStructure.pageStructure.totalElements,
      script_count: siteStructure.pageStructure.scriptTags,
      style_count: siteStructure.pageStructure.styleTags,
      estimated_load_time: 'unknown'
    };
  }
}

module.exports = TrainingDataGenerator;