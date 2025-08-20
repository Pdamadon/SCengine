/**
 * NavigationPatterns - Redundant pattern definitions for 95% accuracy across sites
 * 
 * Based on successful Test 4 approach: Try multiple patterns until one works
 * No AI required - just good fallback selector coverage
 */

/**
 * Common navigation patterns for e-commerce sites
 * Ordered by popularity/success rate
 */
const NAVIGATION_PATTERNS = [
  // Pattern 1: Shopify/Glasswing style (proven 100% success)
  {
    name: 'shopify-dropdown',
    description: 'Shopify-style dropdown navigation (glasswingshop.com)',
    selectors: {
      container: 'li.dropdown-toggle',
      trigger: 'p.dropdown-title', 
      dropdown: '.dropdown-content'
    },
    interactionType: 'hover',
    sites: ['glasswingshop.com', 'shopify-themes']
  },

  // Pattern 2: Macy's mega-menu style (dynamic flyout containers)
  {
    name: 'macys-megamenu',
    description: 'Macy\'s-style mega menu navigation with dynamic flyout containers',
    selectors: {
      container: 'li.fob-item',
      trigger: 'a.menu-link-heavy', 
      dropdown: 'dynamic-flyout'  // Special handling for dynamic flyout containers
    },
    interactionType: 'hover',
    sites: ['macys.com']
  },

  // Pattern 3: Generic Bootstrap dropdown
  {
    name: 'bootstrap-dropdown',
    description: 'Standard Bootstrap dropdown navigation',
    selectors: {
      container: '.dropdown',
      trigger: '.dropdown-toggle',
      dropdown: '.dropdown-menu'
    },
    interactionType: 'hover',
    sites: ['bootstrap-based']
  },

  // Pattern 4: Simple nav with ul dropdowns
  {
    name: 'simple-nav-ul',
    description: 'Simple navigation with ul dropdown menus',
    selectors: {
      container: 'nav li',
      trigger: 'a',
      dropdown: 'ul'
    },
    interactionType: 'hover',
    sites: ['generic']
  },

  // Pattern 5: Amazon-style navigation
  {
    name: 'amazon-nav',
    description: 'Amazon-style navigation menu',
    selectors: {
      container: '#nav-main .nav-item',
      trigger: 'a',
      dropdown: '.nav-panel'
    },
    interactionType: 'hover',
    sites: ['amazon.com']
  },

  // Pattern 6: Material Design nav
  {
    name: 'material-nav',
    description: 'Material Design navigation',
    selectors: {
      container: '.mdc-menu-surface--anchor',
      trigger: 'button',
      dropdown: '.mdc-menu'
    },
    interactionType: 'click',
    sites: ['material-design']
  },

  // Pattern 7: Semantic UI dropdown
  {
    name: 'semantic-ui-dropdown',
    description: 'Semantic UI dropdown navigation',
    selectors: {
      container: '.ui.dropdown',
      trigger: '.text',
      dropdown: '.menu'
    },
    interactionType: 'hover',
    sites: ['semantic-ui']
  },

  // Pattern 8: Foundation dropdown
  {
    name: 'foundation-dropdown',
    description: 'Zurb Foundation dropdown',
    selectors: {
      container: '.dropdown-pane',
      trigger: '[data-toggle="dropdown"]',
      dropdown: '.dropdown-content'
    },
    interactionType: 'click',
    sites: ['foundation']
  }
];

/**
 * Site-specific pattern mappings
 * Maps domains to their preferred patterns
 */
const SITE_PATTERN_MAP = {
  'glasswingshop.com': ['shopify-dropdown'],
  'macys.com': ['macys-megamenu', 'bootstrap-dropdown'],
  'amazon.com': ['amazon-nav', 'simple-nav-ul'],
  'nordstrom.com': ['bootstrap-dropdown', 'simple-nav-ul'],
  'target.com': ['bootstrap-dropdown', 'simple-nav-ul'],
  'walmart.com': ['simple-nav-ul', 'bootstrap-dropdown'],
  'homedepot.com': ['bootstrap-dropdown', 'simple-nav-ul'],
  'lowes.com': ['bootstrap-dropdown', 'simple-nav-ul']
};

/**
 * Get navigation patterns for a specific site (with fallbacks)
 * @param {string} url - Site URL
 * @returns {Array} Array of patterns to try in order
 */
function getPatternsForSite(url) {
  try {
    const domain = new URL(url).hostname.toLowerCase();
    
    // Remove www. prefix
    const cleanDomain = domain.replace(/^www\./, '');
    
    // Get site-specific patterns
    const sitePatterns = SITE_PATTERN_MAP[cleanDomain] || [];
    
    // Get pattern objects
    const patterns = sitePatterns.map(patternName => 
      NAVIGATION_PATTERNS.find(p => p.name === patternName)
    ).filter(Boolean);
    
    // Add fallback patterns (if not already included)
    const fallbackPatterns = NAVIGATION_PATTERNS.filter(pattern => 
      !patterns.some(p => p.name === pattern.name)
    );
    
    return [...patterns, ...fallbackPatterns];
    
  } catch (error) {
    // If URL parsing fails, return all patterns
    return [...NAVIGATION_PATTERNS];
  }
}

/**
 * Get all available patterns
 */
function getAllPatterns() {
  return [...NAVIGATION_PATTERNS];
}

/**
 * Get pattern by name
 */
function getPatternByName(name) {
  return NAVIGATION_PATTERNS.find(p => p.name === name);
}

/**
 * Add custom pattern (for extending with new sites)
 */
function addCustomPattern(pattern) {
  // Validate pattern structure
  const required = ['name', 'selectors'];
  const hasRequired = required.every(key => pattern[key]);
  
  if (!hasRequired) {
    throw new Error(`Custom pattern must have: ${required.join(', ')}`);
  }
  
  const selectorKeys = ['container', 'trigger', 'dropdown'];
  const hasSelectors = selectorKeys.every(key => pattern.selectors[key]);
  
  if (!hasSelectors) {
    throw new Error(`Pattern selectors must have: ${selectorKeys.join(', ')}`);
  }
  
  // Add to patterns array
  NAVIGATION_PATTERNS.push(pattern);
  return pattern;
}

module.exports = {
  NAVIGATION_PATTERNS,
  SITE_PATTERN_MAP,
  getPatternsForSite,
  getAllPatterns,
  getPatternByName,
  addCustomPattern
};