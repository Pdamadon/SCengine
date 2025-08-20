/**
 * ProxyConfig - Centralized proxy configuration for residential and datacenter proxies
 * 
 * Supports multiple proxy providers and rotation strategies
 */

class ProxyConfig {
  /**
   * Get proxy configuration based on scraping requirements
   * @param {Object} options - Proxy options
   * @param {string} options.type - 'residential', 'datacenter', 'rotating', 'sticky'
   * @param {string} options.country - Country code for geo-targeting (e.g., 'US', 'GB')
   * @param {string} options.city - City for more specific geo-targeting
   * @param {number} options.sessionDuration - Session duration in minutes for sticky sessions
   * @returns {Object} Proxy configuration for Playwright
   */
  static getProxySettings(options = {}) {
    const { 
      type = 'residential',
      country = null,
      city = null,
      sessionDuration = 10
    } = options;

    // Check for specific proxy service configurations
    if (process.env.BRIGHTDATA_USERNAME) {
      return this.getBrightDataConfig(type, country, city, sessionDuration);
    } else if (process.env.OXYLABS_USERNAME) {
      return this.getOxylabsConfig(type, country, city);
    } else if (process.env.SMARTPROXY_USERNAME) {
      return this.getSmartProxyConfig(type, country, city);
    } else if (process.env.PROXY_URL) {
      return this.getCustomProxyConfig();
    }

    return null;
  }

  /**
   * BrightData configuration
   * Following official docs: https://docs.brightdata.com/scraping-browser/playwright
   */
  static getBrightDataConfig(type, country, city, sessionDuration) {
    // Check if proxy is disabled
    if (process.env.BRIGHTDATA_PROXY_ENABLED === 'false' || process.env.DISABLE_PROXY === 'true') {
      return null;
    }
    
    const username = process.env.BRIGHTDATA_USERNAME;
    const password = process.env.BRIGHTDATA_PASSWORD;
    const zone = process.env.BRIGHTDATA_ZONE || 'residential';
    
    // Check if username already contains zone
    let fullUsername = username;
    if (!username.includes('-zone-')) {
      // Only add zone if not already in username
      fullUsername = `${username}-zone-${zone}`;
    }
    
    // IMPORTANT: Add session for sticky IPs (BrightData rotates IPs by default)
    if (type === 'sticky') {
      const sessionId = `session-${Date.now()}`;
      fullUsername += `-session-${sessionId}`;
    }
    
    // Add geo-targeting
    if (country) {
      fullUsername += `-country-${country.toLowerCase()}`;
    }
    if (city) {
      fullUsername += `-city-${city.toLowerCase().replace(' ', '_')}`;
    }

    // Use the correct BrightData proxy URL (from curl example)
    const proxyHost = process.env.BRIGHTDATA_HOST || 'http://brd.superproxy.io';
    const proxyPort = process.env.BRIGHTDATA_PORT || '33335';
    
    return {
      server: `${proxyHost}:${proxyPort}`,
      username: fullUsername,
      password: password
    };
  }

  /**
   * Oxylabs configuration
   */
  static getOxylabsConfig(type, country, city) {
    const username = process.env.OXYLABS_USERNAME;
    const password = process.env.OXYLABS_PASSWORD;
    
    let server = 'http://pr.oxylabs.io:7777'; // Residential
    
    if (type === 'datacenter') {
      server = 'http://dc.oxylabs.io:8001';
    }

    // Build username with geo-targeting
    let fullUsername = username;
    if (country) {
      fullUsername = `${username}-country-${country.toLowerCase()}`;
    }
    if (city) {
      fullUsername += `-city-${city.toLowerCase().replace(' ', '_')}`;
    }

    return {
      server,
      username: fullUsername,
      password
    };
  }

  /**
   * SmartProxy configuration
   */
  static getSmartProxyConfig(type, country, city) {
    const username = process.env.SMARTPROXY_USERNAME;
    const password = process.env.SMARTPROXY_PASSWORD;
    
    let server = 'http://gate.smartproxy.com:10000'; // Residential
    
    if (type === 'datacenter') {
      server = 'http://gate.dc.smartproxy.com:20000';
    }

    // SmartProxy uses endpoint selection for geo-targeting
    if (country) {
      const countryCode = country.toLowerCase();
      server = `http://${countryCode}.smartproxy.com:10000`;
    }

    return {
      server,
      username,
      password
    };
  }

  /**
   * Custom proxy configuration from environment variables
   */
  static getCustomProxyConfig() {
    const proxyUrl = process.env.PROXY_URL;
    
    if (!proxyUrl) return null;

    try {
      const url = new URL(proxyUrl);
      
      return {
        server: `${url.protocol}//${url.hostname}:${url.port || (url.protocol === 'https:' ? 443 : 80)}`,
        username: url.username || process.env.PROXY_USERNAME,
        password: url.password || process.env.PROXY_PASSWORD
      };
    } catch (error) {
      console.error('Invalid PROXY_URL format:', error);
      return null;
    }
  }

  /**
   * Get a list of proxy configurations for rotation
   * @param {number} count - Number of proxy configurations to generate
   * @param {Object} options - Proxy options
   * @returns {Array} Array of proxy configurations
   */
  static getRotatingProxies(count = 5, options = {}) {
    const proxies = [];
    const countries = options.countries || ['US', 'GB', 'CA', 'DE', 'FR'];
    
    for (let i = 0; i < count; i++) {
      const country = countries[i % countries.length];
      const proxyConfig = this.getProxySettings({
        ...options,
        country,
        type: 'rotating'
      });
      
      if (proxyConfig) {
        proxies.push(proxyConfig);
      }
    }
    
    return proxies;
  }

  /**
   * Test proxy connection
   * @param {Object} proxyConfig - Proxy configuration
   * @returns {Promise<boolean>} True if proxy is working
   */
  static async testProxy(proxyConfig) {
    const { chromium } = require('playwright');
    
    try {
      const browser = await chromium.launch({
        headless: true,
        proxy: proxyConfig
      });
      
      const context = await browser.newContext();
      const page = await context.newPage();
      
      // Test by checking IP
      await page.goto('https://api.ipify.org?format=json', { timeout: 10000 });
      const response = await page.textContent('body');
      const { ip } = JSON.parse(response);
      
      console.log(`✅ Proxy working. IP: ${ip}`);
      
      await browser.close();
      return true;
      
    } catch (error) {
      console.error('❌ Proxy test failed:', error.message);
      return false;
    }
  }
}

module.exports = ProxyConfig;