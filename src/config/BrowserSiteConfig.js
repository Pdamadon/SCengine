/**
 * BrowserSiteConfig.js
 *
 * Site-specific browser configuration for NavigationMapperBrowserless
 * Defines which sites require special handling for anti-bot protection
 */

const BROWSER_SITE_CONFIG = {
  // All sites now use Browserless.io for consistency and better reliability
  'toasttab.com': { 
    allowedHeadless: false,
    preferBrowserless: true,
    useProxy: true,
    autoSolveCaptcha: true
  },
  'doordash.com': { 
    allowedHeadless: false,
    preferBrowserless: true,
    useProxy: true,
    autoSolveCaptcha: true
  },
  'ubereats.com': { 
    allowedHeadless: false,
    preferBrowserless: true,
    useProxy: true,
    autoSolveCaptcha: true
  },
  
  // Major e-commerce sites via Browserless with proxy
  'macys.com': { 
    allowedHeadless: false,
    preferBrowserless: true,
    useProxy: true,
    autoSolveCaptcha: false
  },
  'nordstrom.com': { 
    allowedHeadless: false,
    preferBrowserless: true,
    useProxy: true,
    autoSolveCaptcha: false
  },
  'saks.com': { 
    allowedHeadless: false,
    preferBrowserless: true,
    useProxy: true,
    autoSolveCaptcha: false
  },
  
  // Simple sites via Browserless (more consistent than local)
  'glasswingshop.com': {
    allowedHeadless: true,
    preferBrowserless: true,
    useProxy: false,
    autoSolveCaptcha: false
  },
  
  // Default: All sites use Browserless.io
  'default': { 
    allowedHeadless: true,
    preferBrowserless: true,
    useProxy: false,
    autoSolveCaptcha: false
  }
};

/**
 * Get browser configuration for a specific domain
 */
function getBrowserConfigForDomain(urlOrDomain) {
  try {
    // Handle both URLs and bare domains
    const normalized = /^https?:\/\//i.test(urlOrDomain)
      ? urlOrDomain
      : `https://${urlOrDomain}`;
    const domain = new URL(normalized).hostname.replace(/^www\./, '');
    
    // Check for exact match
    if (BROWSER_SITE_CONFIG[domain]) {
      return BROWSER_SITE_CONFIG[domain];
    }
    
    // Check for partial match (e.g., "macys.com" in "www1.macys.com")
    for (const [key, config] of Object.entries(BROWSER_SITE_CONFIG)) {
      if (key !== 'default' && domain.includes(key)) {
        return config;
      }
    }
    
    // Return default
    return BROWSER_SITE_CONFIG.default;
    
  } catch (error) {
    console.error('Error parsing domain for browser config:', error);
    return BROWSER_SITE_CONFIG.default;
  }
}

/**
 * Check if a site requires special anti-bot protection
 */
function requiresAntiBot(url) {
  const config = getBrowserConfigForDomain(url);
  return config.preferBrowserless || config.autoSolveCaptcha;
}

/**
 * Check if a site can run headless
 */
function allowsHeadless(url) {
  const config = getBrowserConfigForDomain(url);
  return config.allowedHeadless;
}

module.exports = {
  BROWSER_SITE_CONFIG,
  getBrowserConfigForDomain,
  requiresAntiBot,
  allowsHeadless
};