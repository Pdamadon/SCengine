class ReasoningEngine {
  constructor(logger) {
    this.logger = logger;
    this.intentPatterns = this.loadIntentPatterns();
    this.actionReasoningMap = this.loadActionReasoningMap();
  }

  loadIntentPatterns() {
    return {
      search: /find|search|look for|browse|shop for/i,
      filter: /under|below|above|between|color|size|brand|material/i,
      compare: /compare|versus|vs|difference|better|best/i,
      purchase: /buy|purchase|add to cart|order|checkout/i,
      information: /details|info|specifications|reviews|rating/i,
    };
  }

  loadActionReasoningMap() {
    return {
      navigate_to_category: {
        reasoning_templates: [
          "I need to browse {category} specifically since that's what I'm shopping for",
          'To find {item_type}, I should go to the {category} section first',
          'The {category} page will have all the relevant products organized together',
        ],
        ai_learning: 'Category navigation - filter to relevant product type',
      },

      apply_filter: {
        reasoning_templates: [
          "I only want {filter_value}, so I'll filter to save time scanning irrelevant results",
          'Filtering by {filter_type} will narrow down to exactly what I need',
          "This filter eliminates products that don't match my requirements",
        ],
        ai_learning: 'Attribute filtering - narrow results to user specifications',
      },

      search_products: {
        reasoning_templates: [
          "Searching for '{search_term}' will quickly find products matching my needs",
          'The search function is faster than browsing categories for specific items',
          'Search will show the most relevant products first',
        ],
        ai_learning: 'Text search - direct product discovery via keywords',
      },

      select_product: {
        reasoning_templates: [
          'This product matches my criteria for {attributes}',
          'Among the options, this one has the best {comparison_factor}',
          'This product fits my budget and requirements perfectly',
        ],
        ai_learning: 'Product selection - choose based on user criteria matching',
      },

      add_to_cart: {
        reasoning_templates: [
          "I've found what I want, so I'll add it to my cart to proceed with purchase",
          'Adding to cart secures this item while I continue shopping or checkout',
          'This is the standard next step after selecting the right product',
        ],
        ai_learning: 'Purchase funnel progression - move from selection to acquisition',
      },
    };
  }

  async generateReasoning(userIntent, sitePatterns) {
    try {
      this.logger.info(`Generating reasoning for intent: ${userIntent}`);

      const intentAnalysis = this.analyzeUserIntent(userIntent);
      const shoppingFlow = await this.generateShoppingFlow(intentAnalysis, sitePatterns);

      return {
        user_intent_analysis: intentAnalysis,
        shopping_flow: shoppingFlow,
        reasoning_metadata: {
          complexity_score: this.calculateComplexityScore(shoppingFlow),
          estimated_steps: shoppingFlow.length,
          primary_intent: intentAnalysis.primary_intent,
        },
      };
    } catch (error) {
      this.logger.error('Failed to generate reasoning:', error);
      throw error;
    }
  }

  analyzeUserIntent(userIntent) {
    const analysis = {
      raw_intent: userIntent,
      primary_intent: this.classifyIntent(userIntent),
      extracted_attributes: this.extractAttributes(userIntent),
      shopping_goals: this.identifyShoppingGoals(userIntent),
      constraints: this.identifyConstraints(userIntent),
    };

    return analysis;
  }

  classifyIntent(userIntent) {
    for (const [intent, pattern] of Object.entries(this.intentPatterns)) {
      if (pattern.test(userIntent)) {
        return intent;
      }
    }
    return 'browse';
  }

  extractAttributes(userIntent) {
    const attributes = {};

    const colorMatch = userIntent.match(/\b(black|white|red|blue|green|yellow|brown|gray|grey|pink|purple|orange)\b/i);
    if (colorMatch) {attributes.color = colorMatch[1].toLowerCase();}

    const sizeMatch = userIntent.match(/\b(small|medium|large|xl|xxl|\d+)\b/i);
    if (sizeMatch) {attributes.size = sizeMatch[1].toLowerCase();}

    const materialMatch = userIntent.match(/\b(leather|cotton|wool|silk|denim|canvas|metal|wood|plastic)\b/i);
    if (materialMatch) {attributes.material = materialMatch[1].toLowerCase();}

    const priceMatch = userIntent.match(/under\s*\$?(\d+)|below\s*\$?(\d+)|less than\s*\$?(\d+)/i);
    if (priceMatch) {
      const price = priceMatch[1] || priceMatch[2] || priceMatch[3];
      attributes.budget_max = parseInt(price);
    }

    const itemMatch = userIntent.match(/\b(shoes|boots|shirt|pants|dress|jacket|coat|hat|bag|watch|phone|laptop)\b/i);
    if (itemMatch) {attributes.item_type = itemMatch[1].toLowerCase();}

    return attributes;
  }

  identifyShoppingGoals(userIntent) {
    const goals = [];

    if (this.intentPatterns.search.test(userIntent)) {
      goals.push('find_specific_product');
    }
    if (this.intentPatterns.compare.test(userIntent)) {
      goals.push('compare_options');
    }
    if (this.intentPatterns.purchase.test(userIntent)) {
      goals.push('complete_purchase');
    }
    if (this.intentPatterns.information.test(userIntent)) {
      goals.push('gather_information');
    }

    return goals.length > 0 ? goals : ['browse_products'];
  }

  identifyConstraints(userIntent) {
    const constraints = {};

    if (userIntent.includes('urgent') || userIntent.includes('quickly')) {
      constraints.time_sensitive = true;
    }

    if (userIntent.includes('budget') || userIntent.includes('cheap') || userIntent.includes('affordable')) {
      constraints.price_conscious = true;
    }

    if (userIntent.includes('specific') || userIntent.includes('exact')) {
      constraints.precise_requirements = true;
    }

    return constraints;
  }

  async generateShoppingFlow(intentAnalysis, sitePatterns) {
    const flow = [];
    const { primary_intent, extracted_attributes, shopping_goals } = intentAnalysis;

    if (extracted_attributes.item_type && sitePatterns.navigation?.categories?.length > 0) {
      flow.push(this.createFlowStep('navigate_to_category', {
        category: extracted_attributes.item_type,
        site_patterns: sitePatterns.navigation,
      }));
    }

    if (Object.keys(extracted_attributes).length > 1 && sitePatterns.ecommercePatterns?.hasFilters) {
      Object.entries(extracted_attributes).forEach(([attr, value]) => {
        if (attr !== 'item_type') {
          flow.push(this.createFlowStep('apply_filter', {
            filter_type: attr,
            filter_value: value,
            site_patterns: sitePatterns,
          }));
        }
      });
    }

    if (primary_intent === 'search' && sitePatterns.navigation?.search) {
      flow.push(this.createFlowStep('search_products', {
        search_term: this.generateSearchTerm(extracted_attributes),
        search_element: sitePatterns.navigation.search,
      }));
    }

    if (sitePatterns.products?.length > 0) {
      flow.push(this.createFlowStep('select_product', {
        selection_criteria: extracted_attributes,
        available_products: sitePatterns.products.slice(0, 3),
      }));
    }

    if (shopping_goals.includes('complete_purchase') && sitePatterns.ecommercePatterns?.hasCart) {
      flow.push(this.createFlowStep('add_to_cart', {
        purchase_intent: true,
      }));
    }

    return flow;
  }

  createFlowStep(action, context) {
    const reasoningConfig = this.actionReasoningMap[action];
    if (!reasoningConfig) {
      throw new Error(`No reasoning configuration found for action: ${action}`);
    }

    const reasoning = this.selectReasoningTemplate(reasoningConfig.reasoning_templates, context);

    return {
      action,
      human_reasoning: reasoning,
      ai_learning: reasoningConfig.ai_learning,
      context: context,
      success_criteria: this.generateSuccessCriteria(action, context),
      technical_implementation: this.generateTechnicalImplementation(action, context),
    };
  }

  selectReasoningTemplate(templates, context) {
    const template = templates[Math.floor(Math.random() * templates.length)];
    return this.interpolateTemplate(template, context);
  }

  interpolateTemplate(template, context) {
    let reasoning = template;

    Object.entries(context).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      if (reasoning.includes(placeholder)) {
        reasoning = reasoning.replace(placeholder, value);
      }
    });

    return reasoning;
  }

  generateSuccessCriteria(action, context) {
    const criteriaMap = {
      navigate_to_category: `Page shows ${context.category} products`,
      apply_filter: `Results filtered to show only ${context.filter_value} items`,
      search_products: 'Search results display relevant products',
      select_product: 'Product details page loads successfully',
      add_to_cart: 'Cart shows added item and updated count',
    };

    return criteriaMap[action] || 'Action completed successfully';
  }

  generateTechnicalImplementation(action, context) {
    const implementations = {
      navigate_to_category: `click('a[href*="${context.category}"]')`,
      apply_filter: `click('.filter[data-${context.filter_type}="${context.filter_value}"]')`,
      search_products: `type('${context.search_term}').press('Enter')`,
      select_product: 'click(\'.product-item:first-child\')',
      add_to_cart: 'click(\'.add-to-cart, .btn-add-cart\')',
    };

    return implementations[action] || `performAction('${action}')`;
  }

  generateSearchTerm(attributes) {
    const terms = [];
    if (attributes.color) {terms.push(attributes.color);}
    if (attributes.material) {terms.push(attributes.material);}
    if (attributes.item_type) {terms.push(attributes.item_type);}

    return terms.join(' ') || 'products';
  }

  calculateComplexityScore(flow) {
    return Math.min(flow.length * 2, 10);
  }
}

module.exports = ReasoningEngine;
