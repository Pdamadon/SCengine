/**
 * HTTP Header Profiles - Realistic browser header configurations
 * 
 * Provides configurable header profiles that make HTTP requests appear
 * less bot-like and more like legitimate browser traffic.
 * 
 * Following CLAUDE.md principles:
 * - Configurable values via environment variables
 * - Reusable components for consistent headers across extractors
 * - Practical improvements that work TODAY
 */

/**
 * Realistic browser header profiles
 * Based on current Chrome versions to avoid bot detection
 */
const HEADER_PROFILES = {
  'chrome-stable-win': {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive'
  },
  'chrome-stable-mac': {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive'
  },
  'firefox-stable': {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive'
  }
};

/**
 * Default profile selection
 * Can be overridden via environment variables
 */
const DEFAULT_PROFILE = 'chrome-stable-win';

/**
 * Environment variable configuration
 */
const CONFIG = {
  // Main profile selection
  headerProfile: process.env.HTTP_HEADER_PROFILE || DEFAULT_PROFILE,
  
  // Individual header overrides
  userAgent: process.env.HTTP_USER_AGENT,
  acceptLanguage: process.env.HTTP_ACCEPT_LANGUAGE,
  
  // Advanced: Full header override as JSON
  headersJson: process.env.HTTP_HEADERS_JSON ? 
    (() => {
      try {
        return JSON.parse(process.env.HTTP_HEADERS_JSON);
      } catch (e) {
        console.warn('Invalid HTTP_HEADERS_JSON environment variable, ignoring');
        return {};
      }
    })() : {}
};

/**
 * Get header profile by name
 * @param {string} profileName - Profile name (e.g., 'chrome-stable-win')
 * @returns {Object} Header configuration object
 */
function getHeaderProfile(profileName = CONFIG.headerProfile) {
  const profile = HEADER_PROFILES[profileName];
  if (!profile) {
    console.warn(`Unknown header profile '${profileName}', falling back to '${DEFAULT_PROFILE}'`);
    return HEADER_PROFILES[DEFAULT_PROFILE];
  }
  return profile;
}

/**
 * Get all available profile names
 * @returns {string[]} Array of profile names
 */
function getAvailableProfiles() {
  return Object.keys(HEADER_PROFILES);
}

/**
 * Get configuration with environment variable overrides
 * @returns {Object} Configuration object
 */
function getConfig() {
  return { ...CONFIG };
}

module.exports = {
  HEADER_PROFILES,
  DEFAULT_PROFILE,
  getHeaderProfile,
  getAvailableProfiles,
  getConfig
};