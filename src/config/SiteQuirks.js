/**
 * Site-Specific Interaction Quirks
 * 
 * KEEP THIS SIMPLE! Only add real quirks we encounter, not theoretical ones.
 * Rule: Add mechanics only when we hit actual problems.
 */

const SITE_QUIRKS = {
  'glasswingshop.com': {
    // Mouse needs to move off dropdown before hovering next item
    needsMouseOffBetweenHovers: true,
    mouseOffDelay: 500
  }
  
  // Add more ONLY when we encounter real issues with other sites
};

/**
 * Get quirks for a domain
 */
function getQuirksForDomain(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return SITE_QUIRKS[domain] || {};
  } catch (error) {
    return {};
  }
}

module.exports = {
  SITE_QUIRKS,
  getQuirksForDomain
};