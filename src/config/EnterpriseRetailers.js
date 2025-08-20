/**
 * EnterpriseRetailers.js - Configuration for major enterprise retail sites
 *
 * Extracted from test_adaptive_navigation.js and test_enhanced_megamenu_retailers.js
 * Contains proven configurations for enterprise-level navigation discovery
 */

const ENTERPRISE_RETAILERS = {
  // Fashion & Department Stores
  fashion: [
    {
      name: 'Nordstrom',
      url: 'https://www.nordstrom.com',
      expectedCategories: 8,
      timeout: 10000,
      category: 'Fashion',
      navigationComplexity: 'high',
      requiresNonHeadless: true,
      megaMenuStrategy: true,
    },
    {
      name: 'Macy\'s',
      url: 'https://www.macys.com',
      expectedCategories: 6,
      timeout: 10000,
      category: 'Fashion',
      navigationComplexity: 'enterprise',
      requiresNonHeadless: true,
      megaMenuStrategy: true,
      hierarchyDepth: 4,
    },
    {
      name: 'Zara',
      url: 'https://www.zara.com',
      expectedCategories: 4,
      timeout: 8000,
      category: 'Fashion',
      navigationComplexity: 'medium',
      megaMenuStrategy: true,
    },
    {
      name: 'Saks Fifth Avenue',
      url: 'https://www.saksfifthavenue.com',
      expectedCategories: 7,
      timeout: 12000,
      category: 'Luxury Fashion',
      navigationComplexity: 'high',
      requiresNonHeadless: true,
      megaMenuStrategy: true,
    },
  ],

  // General Retail & Department
  department: [
    {
      name: 'Target',
      url: 'https://www.target.com',
      expectedCategories: 10,
      timeout: 8000,
      category: 'General Retail',
      navigationComplexity: 'high',
      megaMenuStrategy: true,
    },
    {
      name: 'Walmart',
      url: 'https://www.walmart.com',
      expectedCategories: 12,
      timeout: 10000,
      category: 'General Retail',
      navigationComplexity: 'enterprise',
      megaMenuStrategy: true,
    },
  ],

  // Specialty & Boutique
  boutique: [
    {
      name: 'Glasswing Shop',
      url: 'https://glasswingshop.com',
      expectedCategories: 5,
      timeout: 6000,
      category: 'Boutique',
      navigationComplexity: 'low',
      dropdownStrategy: true,
    },
    {
      name: 'Everlane',
      url: 'https://www.everlane.com',
      expectedCategories: 6,
      timeout: 8000,
      category: 'Boutique Fashion',
      navigationComplexity: 'medium',
    },
  ],
};

// Site-specific navigation configurations
const SITE_NAVIGATION_CONFIG = {
  'macys.com': {
    allowedHeadless: false,
    hoverDelay: 3000,
    maxDepth: 4,
    expectedSections: ['Women', 'Men', 'Kids', 'Home', 'Shoes', 'Beauty'],
    knownIssues: ['hierarchy_corruption', 'category_id_collisions'],
  },

  'nordstrom.com': {
    allowedHeadless: false,
    hoverDelay: 2500,
    maxDepth: 3,
    expectedSections: ['Women', 'Men', 'Kids', 'Young Adult', 'Beauty', 'Home'],
  },

  'saks.com': {
    allowedHeadless: false,
    hoverDelay: 2000,
    maxDepth: 3,
    expectedSections: ['Women', 'Men', 'Kids', 'Beauty', 'Home'],
  },

  'glasswingshop.com': {
    allowedHeadless: true,
    hoverDelay: 1000,
    maxDepth: 2,
    dropdownStrategy: 'comprehensive',
    expectedSections: ['New', 'Women', 'Men', 'Sale', 'About'],
  },
};

// Testing configurations extracted from test files
const TESTING_CONFIG = {
  performance: {
    maxTestDuration: 300000, // 5 minutes max per test
    concurrentTests: 2,
    respectfulDelay: 3000,
  },

  validation: {
    minNavigationSections: 3,
    minTreeNodes: 5,
    minTaxonomyItems: 10,
  },

  retry: {
    maxAttempts: 3,
    backoffDelay: 2000,
  },
};

module.exports = {
  ENTERPRISE_RETAILERS,
  SITE_NAVIGATION_CONFIG,
  TESTING_CONFIG,
};
