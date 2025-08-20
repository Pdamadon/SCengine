/**
 * MegaMenuConfig.js - Enhanced MegaMenu interaction strategies
 *
 * Extracted from test_enhanced_megamenu_retailers.js
 * Contains proven configurations for desktop mega-menu capture
 */

const ENHANCED_MEGAMENU_CONFIG = {
  // Timing configurations
  timing: {
    hoverDelay: 2000,        // Wait time after hovering to trigger menu
    dismissDelay: 500,       // Wait time before dismissing menu
    siteTimeout: 45000,      // Overall site load timeout
    menuLoadTimeout: 8000,   // Wait for menu content to load
    retryDelay: 1000,        // Delay between retry attempts
    settleDelay: 3000,        // Page settle time after load
  },

  // Interaction strategies
  interaction: {
    methods: ['hover', 'click', 'focus', 'js_events'], // Multi-method approach
    retryAttempts: 3,
    maxMenusPerSite: 8,
  },

  // Browser context for desktop mega-menus
  browserContext: {
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
    slowMo: 200, // For debugging
  },

  // ARIA-based selector strategies
  selectors: {
    ariaExpanded: '[aria-expanded]',
    ariaHaspopup: '[aria-haspopup="true"]',
    navigationRoles: '[role="navigation"]',
    menuRoles: '[role="menu"], [role="menubar"], [role="menuitem"]',
    dropdownTriggers: [
      'nav a[aria-haspopup="true"]',
      'nav button[aria-expanded]',
      '.navigation a:has(+ .dropdown)',
      '.main-nav a[data-toggle="dropdown"]',
      '[data-target*="dropdown"]',
      '[data-dropdown-trigger]',
    ],
  },

  // Navigation pattern detection
  patterns: {
    mobileFirst: {
      indicators: [
        '.mobile-nav',
        '.hamburger',
        '[data-toggle="mobile-menu"]',
        '.nav-toggle',
        '#mobile-navigation',
      ],
    },
    desktopMegaMenu: {
      indicators: [
        '.mega-menu',
        '.dropdown-menu',
        '.main-navigation',
        '[data-mega-menu]',
        '.nav-dropdown',
      ],
    },
  },

  // Popup/modal handling
  popupHandling: {
    closeSelectors: [
      '[aria-label="Close"]',
      '.modal-close',
      '.popup-close',
      '[data-dismiss="modal"]',
      '.close-button',
      '.overlay-close',
    ],
    escapeKey: true,
    clickOutside: true,
  },

  // Site-specific overrides
  siteOverrides: {
    'macys.com': {
      headless: false,
      hoverDelay: 3000,
      specialSelectors: ['.main-navigation a'],
    },
    'nordstrom.com': {
      headless: false,
      hoverDelay: 2500,
      dismissDelay: 1000,
    },
    'saks.com': {
      headless: false,
      hoverDelay: 2000,
      retryAttempts: 2,
    },
  },
};

module.exports = ENHANCED_MEGAMENU_CONFIG;
