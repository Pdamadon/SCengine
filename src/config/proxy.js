/**
 * Unified Proxy Configuration
 * Single source of truth for all proxy settings
 */

require('dotenv').config();

const ProxyConfig = {
  // BrightData ISP Proxy (primary)
  brightdata: {
    host: process.env.BRIGHTDATA_HOST || 'brd.superproxy.io',
    port: process.env.BRIGHTDATA_PORT || '33335',
    username: process.env.BRIGHTDATA_USERNAME,
    password: process.env.BRIGHTDATA_PASSWORD,
    zone: process.env.BRIGHTDATA_ZONE || 'isp_proxy1',
    
    // Get full proxy URL
    getUrl() {
      if (!this.username || !this.password) {
        throw new Error('BrightData credentials not configured in .env');
      }
      
      // Check if username already has zone
      let fullUsername = this.username;
      if (!this.username.includes('-zone-')) {
        fullUsername = `${this.username}-zone-${this.zone}`;
      }
      
      return {
        server: `http://${this.host}:${this.port}`,
        username: fullUsername,
        password: this.password
      };
    },
    
    // Get sticky session (same IP for duration)
    getStickySession(sessionId = null) {
      const config = this.getUrl();
      const session = sessionId || `session-${Date.now()}`;
      config.username += `-session-${session}`;
      return config;
    },
    
    // Refresh to get new IP
    getRotatingSession() {
      const config = this.getUrl();
      config.username += `-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      return config;
    }
  },
  
  // Safety check - fail if proxy not enforced
  enforceProxy() {
    if (process.env.FORCE_PROXY !== 'true' && process.env.NODE_ENV !== 'test') {
      console.error('');
      console.error('❌ SECURITY ERROR: Direct connection detected!');
      console.error('');
      console.error('You must run tests through the proxy wrapper:');
      console.error('  node run_with_proxy.js <test-file>');
      console.error('  OR');
      console.error('  make test');
      console.error('');
      console.error('This protects your IP from being banned.');
      console.error('');
      process.exit(1);
    }
  },
  
  // Auto-retry helper for failed requests
  async withRetry(fn, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Get fresh IP for each retry
        const proxyConfig = this.brightdata.getRotatingSession();
        console.log(`🔄 Attempt ${i + 1}/${maxRetries} with new IP...`);
        
        return await fn(proxyConfig);
        
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ Attempt ${i + 1} failed: ${error.message}`);
        
        // Check if it's a CAPTCHA or rate limit
        if (error.message.includes('CAPTCHA') || 
            error.message.includes('rate limit') ||
            error.message.includes('403')) {
          console.log('🔄 Rotating IP due to block...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          // Non-recoverable error
          throw error;
        }
      }
    }
    
    throw lastError;
  }
};

// Auto-enforce proxy in development
if (process.env.NODE_ENV === 'development') {
  ProxyConfig.enforceProxy();
}

module.exports = ProxyConfig;