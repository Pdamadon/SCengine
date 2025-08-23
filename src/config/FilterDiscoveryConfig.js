/**
 * Filter Discovery Configuration
 * 
 * Configurable selector patterns for different e-commerce sites
 * Following CLAUDE.md principle: "NEVER hard-code values that can't be swapped out"
 */

const FilterDiscoveryConfig = {
  // Global discovery options
  defaults: {
    maxFiltersPerGroup: parseInt(process.env.MAX_FILTERS_PER_GROUP) || 20,
    minFiltersToConsiderGroup: parseInt(process.env.MIN_FILTERS_TO_CONSIDER_GROUP) || 2,
    trackFilterMetadata: process.env.TRACK_FILTER_METADATA !== 'false',
    discoveryTimeout: parseInt(process.env.FILTER_DISCOVERY_TIMEOUT) || 30000
  },

  // Site-specific patterns (configurable by site)
  sitePatterns: {
    // Glasswing/Shopify patterns - based on user's screenshot
    shopify: {
      name: 'Shopify/Glasswing',
      containerSelector: '.filter-group-display',
      titleSelector: '.filter-group-display__summary .filter-group-display__title',
      itemsSelector: '.filter-group-display__list-item',
      alternativeContainerSelectors: [
        '.collection-filters',
        '.product-filters',
        '[data-filter-group]'
      ]
    },

    // Generic e-commerce patterns
    generic: {
      name: 'Generic E-commerce',
      containerSelector: '.filter-group, .filters-group, .facet-group',
      titleSelector: 'h3, .title, .group-title, .filter-title',
      itemsSelector: '.filter-option, .filter-item, .facet-option',
      alternativeContainerSelectors: [
        '.refinements',
        '.filters-container',
        '.filter-panel'
      ]
    },

    // Sidebar filter patterns
    sidebar: {
      name: 'Sidebar Filters',
      containerSelector: '.sidebar-filters .filter-section',
      titleSelector: '.filter-heading, h4',
      itemsSelector: '.filter-option',
      alternativeContainerSelectors: [
        '.left-filters',
        '.filter-sidebar',
        '.facet-sidebar'
      ]
    }
  },

  // Filter element patterns (for individual filter detection)
  filterElementPatterns: {
    checkbox: {
      selector: 'input[type="checkbox"]',
      labelSelectors: ['label', '.filter-label', '.title'],
      activeStates: ['checked']
    },

    radio: {
      selector: 'input[type="radio"]',
      labelSelectors: ['label', '.filter-label', '.title'],
      activeStates: ['checked']
    },

    button: {
      selector: 'button',
      labelSelectors: null, // Use button text directly
      activeStates: ['active', 'selected', 'pressed']
    },

    link: {
      selector: 'a',
      labelSelectors: null, // Use link text directly
      activeStates: ['active', 'selected', 'current']
    },

    custom: {
      selector: '[data-filter], [data-value]',
      labelSelectors: ['.filter-text', '.value-text'],
      activeStates: ['active', 'selected']
    }
  },

  // Group classification patterns (for organizing filters by type)
  groupClassification: {
    categories: ['category', 'categories', 'type', 'department'],
    brands: ['brand', 'brands', 'manufacturer', 'vendor'],
    price: ['price', 'cost', 'budget', 'range'],
    sizes: ['size', 'sizes', 'fit'],
    colors: ['color', 'colours', 'shade'],
    materials: ['material', 'fabric', 'texture'],
    ratings: ['rating', 'review', 'star'],
    availability: ['stock', 'availability', 'in-stock', 'out of stock', 'in stock']
  },

  // Priority order for pattern matching (try most specific first)
  patternPriority: ['shopify', 'sidebar', 'generic']
};

module.exports = FilterDiscoveryConfig;