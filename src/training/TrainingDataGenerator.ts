/**
 * Training Data Generator for AI Shopping Agent
 * Creates comprehensive training scenarios and flows
 * Generates synthetic data for machine learning model training
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../types/common.types';

interface ScenarioTemplates {
  [category: string]: string[];
}

interface SiteInfo {
  url: string;
  domain: string;
  platform: string;
}

interface UserIntentAnalysis {
  raw_intent: string;
  primary_intent: string;
  extracted_attributes: any;
  shopping_goals: string[];
  constraints: any;
}

interface UserIntent {
  raw: string;
  analysis: UserIntentAnalysis;
}

interface TechnicalImplementation {
  method: string;
  selector: {
    primary: string;
    alternatives: string[];
    confidence: number;
  };
  fallback_selectors: string[];
  interaction_type: string;
}

interface Validation {
  success_criteria: string;
  failure_indicators: string[];
  retry_strategy: string;
  timeout_ms: number;
}

interface GoalProgress {
  percentage: number;
  phase: string;
  remaining_steps: number;
}

interface StepContext {
  prerequisite_steps: string[];
  page_state_requirements: string[];
  user_goal_progress: GoalProgress;
  decision_factors: string[];
}

interface EnhancedFlowStep {
  step_id: string;
  step_number: number;
  action: string;
  human_reasoning: string;
  ai_learning_objective: string;
  technical_implementation: TechnicalImplementation;
  validation: Validation;
  context: StepContext;
}

interface TechnicalFeatures {
  spa_indicators: boolean;
  ajax_navigation: boolean;
  responsive_design: number;
}

interface AccessibilityFeatures {
  has_semantic_html: boolean;
  keyboard_navigation: boolean;
  screen_reader_support: string;
}

interface PerformanceIndicators {
  total_elements: number;
  script_count: number;
  style_count: number;
  estimated_load_time: string;
}

interface SiteContext {
  ecommerce_maturity: string;
  navigation_complexity: string;
  product_catalog_size: number;
  technical_features: TechnicalFeatures;
  accessibility_features: AccessibilityFeatures;
  performance_indicators: PerformanceIndicators;
}

interface EstimatedTime {
  estimated_ms: number;
  estimated_seconds: number;
  user_perceived_time: number;
}

interface TrainingMetadata {
  complexity_score: number;
  estimated_time: EstimatedTime;
  success_probability: number;
  learning_objectives: string[];
}

interface TrainingScenario {
  id: string;
  created_at: string;
  site: SiteInfo;
  user_intent: UserIntent;
  shopping_flow: EnhancedFlowStep[];
  site_context: SiteContext;
  training_metadata: TrainingMetadata;
}

interface FlowStep {
  action: string;
  human_reasoning: string;
  ai_learning: string;
  context: any;
  success_criteria: string;
  technical_implementation: string;
}

interface EcommercePatterns {
  ecommerceScore?: number;
  hasFilters?: boolean;
  hasProductGrid?: boolean;
  [key: string]: any;
}

interface NavigationData {
  mainMenu: any[];
  [key: string]: any;
}

interface PageStructure {
  responsive_score?: number;
  hasMain?: boolean;
  totalElements?: number;
  scriptTags?: number;
  styleTags?: number;
  [key: string]: any;
}

interface SiteStructure {
  metadata?: {
    platform?: string;
  };
  ecommercePatterns?: EcommercePatterns;
  navigation?: NavigationData;
  products: any[];
  pageStructure?: PageStructure;
  scriptTags?: number;
  [key: string]: any;
}

interface ReasoningData {
  user_intent_analysis: UserIntentAnalysis;
  shopping_flow: FlowStep[];
  reasoning_metadata: {
    complexity_score: number;
    [key: string]: any;
  };
}

interface DayStats {
  scenarios_generated: number;
  sites_processed: string[];
  average_complexity: number;
  total_complexity: number;
  platforms: { [platform: string]: number };
}

interface AggregatedStats {
  [date: string]: DayStats;
}

class TrainingDataGenerator {
  private logger: Logger;
  private trainingDataPath: string;
  private scenarioCount: number;
  private dailyTarget: number;
  private scenarioTemplates: ScenarioTemplates;

  constructor(logger: Logger) {
    this.logger = logger;
    this.trainingDataPath = process.env.TRAINING_DATA_PATH || './data/training';
    this.scenarioCount = 0;
    this.dailyTarget = parseInt(process.env.SCENARIOS_PER_DAY_TARGET || '1000');
    this.scenarioTemplates = this.loadScenarioTemplates();

    this.ensureDataDirectory();
  }

  private async ensureDataDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.trainingDataPath, { recursive: true });
      await fs.mkdir(path.join(this.trainingDataPath, 'scenarios'), { recursive: true });
      await fs.mkdir(path.join(this.trainingDataPath, 'flows'), { recursive: true });
      await fs.mkdir(path.join(this.trainingDataPath, 'aggregated'), { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create training data directories:', error);
    }
  }

  private loadScenarioTemplates(): ScenarioTemplates {
    return {
      product_search: [
        'Find {color} {item_type} under ${budget}',
        'Look for {material} {item_type} in {color}',
        'Search for {brand} {item_type} with {feature}',
        'Browse {item_type} suitable for {occasion}',
      ],

      category_browse: [
        'Browse all {category} products',
        'Explore {category} section for new arrivals',
        'Check {category} for sale items',
        'View {category} collection',
      ],

      comparison_shopping: [
        'Compare {item_type} from different brands',
        'Find the best {item_type} under ${budget}',
        'Compare {item_type} with similar features',
        'Evaluate {item_type} options for {criteria}',
      ],

      specific_purchase: [
        'Buy {specific_item} in {size}',
        'Purchase {item_type} for {purpose}',
        'Order {quantity} of {item_type}',
        'Add {item_type} to cart and checkout',
      ],
    };
  }

  async createScenario(url: string, userIntent: string, siteStructure: SiteStructure, reasoning: ReasoningData): Promise<TrainingScenario> {
    try {
      this.logger.info(`Creating training scenario for ${url}`);

      const scenario: TrainingScenario = {
        id: uuidv4(),
        created_at: new Date().toISOString(),
        site: {
          url: url,
          domain: new URL(url).hostname,
          platform: siteStructure.metadata?.platform || 'unknown',
        },
        user_intent: {
          raw: userIntent,
          analysis: reasoning.user_intent_analysis,
        },
        shopping_flow: await this.enhanceShoppingFlow(reasoning.shopping_flow, siteStructure),
        site_context: this.extractSiteContext(siteStructure),
        training_metadata: {
          complexity_score: reasoning.reasoning_metadata.complexity_score,
          estimated_time: this.estimateCompletionTime(reasoning.shopping_flow),
          success_probability: this.calculateSuccessProbability(reasoning.shopping_flow, siteStructure),
          learning_objectives: this.identifyLearningObjectives(reasoning.shopping_flow),
        },
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

  private async enhanceShoppingFlow(flow: FlowStep[], siteStructure: SiteStructure): Promise<EnhancedFlowStep[]> {
    return await Promise.all(flow.map(async (step, index) => {
      const enhancedStep: EnhancedFlowStep = {
        step_id: uuidv4(),
        step_number: index + 1,
        action: step.action,
        human_reasoning: step.human_reasoning,
        ai_learning_objective: step.ai_learning,
        technical_implementation: {
          method: this.extractImplementationMethod(step.technical_implementation),
          selector: this.generateRobustSelector(step, siteStructure),
          fallback_selectors: this.generateFallbackSelectors(step, siteStructure),
          interaction_type: this.classifyInteractionType(step.action),
        },
        validation: {
          success_criteria: step.success_criteria,
          failure_indicators: this.generateFailureIndicators(step.action),
          retry_strategy: this.generateRetryStrategy(step.action),
          timeout_ms: this.calculateTimeout(step.action),
        },
        context: {
          prerequisite_steps: index > 0 ? [flow[index - 1].action] : [],
          page_state_requirements: this.generatePageStateRequirements(step),
          user_goal_progress: this.calculateGoalProgress(index, flow.length),
          decision_factors: this.extractDecisionFactors(step),
        },
      };

      return enhancedStep;
    }));
  }

  private extractSiteContext(siteStructure: SiteStructure): SiteContext {
    return {
      ecommerce_maturity: this.assessEcommerceMaturity(siteStructure.ecommercePatterns),
      navigation_complexity: this.assessNavigationComplexity(siteStructure.navigation),
      product_catalog_size: siteStructure.products.length,
      technical_features: {
        spa_indicators: this.detectSPAIndicators(siteStructure),
        ajax_navigation: this.detectAjaxNavigation(siteStructure),
        responsive_design: siteStructure.pageStructure?.responsive_score || 0,
      },
      accessibility_features: this.assessAccessibilityFeatures(siteStructure),
      performance_indicators: this.extractPerformanceIndicators(siteStructure),
    };
  }

  private extractImplementationMethod(technicalImpl: string): string {
    if (technicalImpl.includes('click(')) {return 'click';}
    if (technicalImpl.includes('type(')) {return 'type';}
    if (technicalImpl.includes('select(')) {return 'select';}
    if (technicalImpl.includes('hover(')) {return 'hover';}
    return 'interact';
  }

  private generateRobustSelector(step: FlowStep, siteStructure: SiteStructure): { primary: string; alternatives: string[]; confidence: number } {
    const baseSelector = step.context?.selector || step.technical_implementation;

    const selectorStrategies = [
      this.generateDataAttributeSelector(baseSelector),
      this.generateClassBasedSelector(baseSelector),
      this.generateTextBasedSelector(step),
      this.generateStructuralSelector(step, siteStructure),
    ].filter(Boolean);

    return {
      primary: selectorStrategies[0] || baseSelector,
      alternatives: selectorStrategies.slice(1),
      confidence: this.calculateSelectorConfidence(selectorStrategies[0]),
    };
  }

  private generateFallbackSelectors(step: FlowStep, siteStructure: SiteStructure): string[] {
    const fallbacks: string[] = [];

    switch (step.action) {
      case 'navigate_to_category':
        fallbacks.push(
          `a[href*="${step.context.category}"]`,
          `.nav a:contains("${step.context.category}")`,
          `[data-category="${step.context.category}"]`,
        );
        break;

      case 'apply_filter':
        fallbacks.push(
          `.filter[data-${step.context.filter_type}]`,
          `.${step.context.filter_type}-filter`,
          `input[name="${step.context.filter_type}"]`,
        );
        break;

      case 'search_products':
        fallbacks.push(
          'input[type="search"]',
          'input[name*="search"]',
          '.search-input',
          '#search',
        );
        break;

      case 'select_product':
        fallbacks.push(
          '.product-item:first-child',
          '.product:first',
          '[data-product]:first',
        );
        break;

      case 'add_to_cart':
        fallbacks.push(
          '.add-to-cart',
          '.btn-add-cart',
          'button[data-action="add-to-cart"]',
          'input[type="submit"][value*="cart"]',
        );
        break;
    }

    return fallbacks;
  }

  private classifyInteractionType(action: string): string {
    const typeMap: { [key: string]: string } = {
      navigate_to_category: 'navigation',
      apply_filter: 'filtering',
      search_products: 'search',
      select_product: 'selection',
      add_to_cart: 'transaction',
    };

    return typeMap[action] || 'general';
  }

  private generateFailureIndicators(action: string): string[] {
    const indicators: { [key: string]: string[] } = {
      navigate_to_category: [
        'Page did not change',
        'No products displayed',
        '404 error page',
      ],
      apply_filter: [
        'Product count unchanged',
        'Filter not visually active',
        'Page reload without filter applied',
      ],
      search_products: [
        'No search results displayed',
        'Search input not focused',
        'Search suggestion dropdown not appearing',
      ],
      select_product: [
        'Product page did not load',
        'Same page content displayed',
        'Product details not visible',
      ],
      add_to_cart: [
        'Cart count not updated',
        'No confirmation message',
        'Add to cart button still enabled without change',
      ],
    };

    return indicators[action] || ['Action did not complete successfully'];
  }

  private generateRetryStrategy(action: string): string {
    const strategies: { [key: string]: string } = {
      navigate_to_category: 'retry_with_different_selector',
      apply_filter: 'wait_and_retry',
      search_products: 'clear_and_retype',
      select_product: 'scroll_into_view_and_retry',
      add_to_cart: 'wait_for_ajax_and_retry',
    };

    return strategies[action] || 'simple_retry';
  }

  private calculateTimeout(action: string): number {
    const timeouts: { [key: string]: number } = {
      navigate_to_category: 5000,
      apply_filter: 3000,
      search_products: 4000,
      select_product: 3000,
      add_to_cart: 6000,
    };

    return timeouts[action] || 5000;
  }

  private generatePageStateRequirements(step: FlowStep): string[] {
    const requirements: { [key: string]: string[] } = {
      navigate_to_category: ['homepage_or_category_page_loaded'],
      apply_filter: ['product_listing_page_visible', 'filters_available'],
      search_products: ['search_functionality_visible'],
      select_product: ['products_displayed', 'product_clickable'],
      add_to_cart: ['product_page_loaded', 'add_to_cart_button_visible'],
    };

    return requirements[step.action] || ['page_loaded'];
  }

  private calculateGoalProgress(currentStep: number, totalSteps: number): GoalProgress {
    return {
      percentage: Math.round((currentStep + 1) / totalSteps * 100),
      phase: this.identifyShoppingPhase(currentStep, totalSteps),
      remaining_steps: totalSteps - currentStep - 1,
    };
  }

  private identifyShoppingPhase(currentStep: number, totalSteps: number): string {
    const progress = (currentStep + 1) / totalSteps;

    if (progress <= 0.3) {return 'discovery';}
    if (progress <= 0.7) {return 'evaluation';}
    return 'conversion';
  }

  private extractDecisionFactors(step: FlowStep): string[] {
    const factors: string[] = [];

    if (step.context.category) {factors.push(`product_category:${step.context.category}`);}
    if (step.context.filter_type) {factors.push(`filter_criteria:${step.context.filter_type}`);}
    if (step.context.search_term) {factors.push(`search_intent:${step.context.search_term}`);}
    if (step.context.selection_criteria) {factors.push('product_criteria_matching');}
    if (step.context.purchase_intent) {factors.push('purchase_readiness');}

    return factors;
  }

  private estimateCompletionTime(flow: FlowStep[]): EstimatedTime {
    const baseTimePerStep = 2000;
    const complexityMultipliers: { [key: string]: number } = {
      navigate_to_category: 1.0,
      apply_filter: 1.2,
      search_products: 1.1,
      select_product: 0.8,
      add_to_cart: 1.5,
    };

    const totalTime = flow.reduce((time, step) => {
      const stepTime = baseTimePerStep * (complexityMultipliers[step.action] || 1.0);
      return time + stepTime;
    }, 0);

    return {
      estimated_ms: totalTime,
      estimated_seconds: Math.round(totalTime / 1000),
      user_perceived_time: Math.round(totalTime / 1000 * 0.7),
    };
  }

  private calculateSuccessProbability(flow: FlowStep[], siteStructure: SiteStructure): number {
    let probability = 0.8;

    const ecommerceScore = siteStructure.ecommercePatterns?.ecommerceScore || 0;
    probability *= (0.5 + ecommerceScore * 0.5);

    const productAvailability = siteStructure.products.length > 0 ? 1 : 0.3;
    probability *= productAvailability;

    const navigationComplexity = flow.length / 10;
    probability *= Math.max(0.5, 1 - navigationComplexity);

    return Math.max(0.1, Math.min(0.95, probability));
  }

  private identifyLearningObjectives(flow: FlowStep[]): string[] {
    const objectives = new Set<string>();

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

  private async saveScenario(scenario: TrainingScenario): Promise<void> {
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

  private async updateAggregatedStats(scenario: TrainingScenario): Promise<void> {
    const statsPath = path.join(this.trainingDataPath, 'aggregated', 'daily_stats.json');
    const today = new Date().toISOString().split('T')[0];

    try {
      let stats: AggregatedStats = {};
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
          platforms: {},
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

  async getScenarioCount(): Promise<number> {
    return this.scenarioCount;
  }

  private generateDataAttributeSelector(baseSelector: string): string | null {
    if (baseSelector.includes('[data-')) {
      return baseSelector;
    }
    return null;
  }

  private generateClassBasedSelector(baseSelector: string): string | null {
    if (baseSelector.includes('.')) {
      return baseSelector;
    }
    return null;
  }

  private generateTextBasedSelector(step: FlowStep): string | null {
    if (step.context && step.context.category) {
      return `a:contains("${step.context.category}")`;
    }
    return null;
  }

  private generateStructuralSelector(step: FlowStep, siteStructure: SiteStructure): string | null {
    return null;
  }

  private calculateSelectorConfidence(selector: string | null): number {
    if (!selector) {return 0;}

    let confidence = 0.5;
    if (selector.includes('[data-')) {confidence += 0.3;}
    if (selector.includes('#')) {confidence += 0.2;}
    if (selector.includes('.') && !selector.includes(' ')) {confidence += 0.1;}

    return Math.min(1, confidence);
  }

  private assessEcommerceMaturity(patterns?: EcommercePatterns): string {
    if (!patterns) {return 'unknown';}

    if (patterns.ecommerceScore && patterns.ecommerceScore > 0.8) {return 'mature';}
    if (patterns.ecommerceScore && patterns.ecommerceScore > 0.5) {return 'developing';}
    return 'basic';
  }

  private assessNavigationComplexity(navigation?: NavigationData): string {
    if (!navigation) {return 'simple';}

    const menuSize = navigation.mainMenu.length;
    if (menuSize > 10) {return 'complex';}
    if (menuSize > 5) {return 'moderate';}
    return 'simple';
  }

  private detectSPAIndicators(siteStructure: SiteStructure): boolean {
    return (siteStructure.scriptTags || 0) > 5;
  }

  private detectAjaxNavigation(siteStructure: SiteStructure): boolean {
    return Boolean(siteStructure.ecommercePatterns?.hasFilters &&
           siteStructure.ecommercePatterns?.hasProductGrid);
  }

  private assessAccessibilityFeatures(siteStructure: SiteStructure): AccessibilityFeatures {
    return {
      has_semantic_html: Boolean(siteStructure.pageStructure?.hasMain),
      keyboard_navigation: true,
      screen_reader_support: 'unknown',
    };
  }

  private extractPerformanceIndicators(siteStructure: SiteStructure): PerformanceIndicators {
    return {
      total_elements: siteStructure.pageStructure?.totalElements || 0,
      script_count: siteStructure.pageStructure?.scriptTags || 0,
      style_count: siteStructure.pageStructure?.styleTags || 0,
      estimated_load_time: 'unknown',
    };
  }
}

export default TrainingDataGenerator;