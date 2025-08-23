# Browserless.io Migration Guide

## Overview
This guide explains how to migrate from local Chromium to Browserless.io, which provides cloud browser sessions with full BrightData proxy support.

## Why Browserless.io Over HyperBrowser

### Key Advantages
- **✅ Custom Proxy Support**: Works with your existing BrightData proxy
- **✅ Full Puppeteer/Playwright Compatibility**: No code changes needed
- **✅ Human-in-the-Loop**: Manual intervention when needed
- **✅ CAPTCHA Detection**: Built-in CAPTCHA solving
- **✅ Live Debugging**: Real-time browser access for troubleshooting

### Cost Comparison at 1000 Daily Extractions
```
HyperBrowser: $75/month (sessions) + Cannot use BrightData = Need their proxy
Browserless.io: $250/month (unlimited plan) + Use existing BrightData proxy
Local Chromium: $0 + BrightData proxy ($270/month) = Works for simple sites only
```

## Installation

### 1. Install Dependencies
```bash
npm install puppeteer-core playwright-core dotenv
```

### 2. Set Environment Variables
```bash
# .env file
# Browserless.io Configuration
BROWSERLESS_TOKEN=your_browserless_token_here
BROWSERLESS_ENDPOINT=wss://production-sfo.browserless.io
USE_BROWSERLESS=true

# Keep existing BrightData configuration
BRIGHTDATA_USERNAME=your_username
BRIGHTDATA_PASSWORD=your_password
BRIGHTDATA_HOST=http://brd.superproxy.io
BRIGHTDATA_PORT=33335
BRIGHTDATA_ZONE=residential
```

### 3. Get Browserless.io Token
1. Sign up at https://www.browserless.io
2. Go to Account → API Tokens
3. Create new token
4. Add to .env file

## Migration Steps

### Step 1: Replace BrowserManager in NavigationMapper

```javascript
// src/core/discovery/NavigationMapper.js
- const BrowserManager = require('../../common/BrowserManager');
+ const BrowserManagerBrowserless = require('../../common/BrowserManagerBrowserless');

class NavigationMapper {
  constructor(logger, worldModel) {
    this.logger = logger;
    this.worldModel = worldModel;
    - this.browserManager = new BrowserManager();
    + this.browserManager = new BrowserManagerBrowserless({
    +   fallbackToLocal: true,  // Fallback to local if Browserless fails
    +   enableHybridAutomation: false  // Enable if you need human intervention
    + });
    
    // Rest of constructor...
  }

  async extractNavigation(url, options = {}) {
    // Existing validation code...
    
    const { page, close, backend } = await this.browserManager.createBrowser('stealth', {
      site: url,
      proxy: this.shouldUseProxy(url) ? 'brightdata' : false,
      proxyType: 'residential',
      headless: this.isHeadlessAllowed(url),
      // New Browserless-specific options
      autoSolveCaptcha: this.isProtectedSite(url),
      humanInLoop: options.requiresHumanAuth || false
    });
    
    this.logger.info(`Using ${backend} backend for ${url}`);
    
    try {
      // Existing extraction logic...
      const navigation = await this.performExtraction(page, url, options);
      return navigation;
    } finally {
      await close();
    }
  }

  shouldUseProxy(url) {
    // Protected sites always need proxy
    const protectedSites = ['toasttab.com', 'doordash.com', 'ubereats.com'];
    return protectedSites.some(site => url.includes(site));
  }

  isProtectedSite(url) {
    // Sites with CAPTCHA or advanced protection
    const protectedSites = ['toasttab.com', 'cloudflare.com'];
    return protectedSites.some(site => url.includes(site));
  }
}
```

### Step 2: Update Extraction Logic for Better Error Handling

```javascript
// src/core/discovery/NavigationPatternExtractor.js
async extractWithRetry(page, pattern, options = {}) {
  const maxAttempts = 3;
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Check if CAPTCHA is present
      const hasCaptcha = await page.$('.cf-turnstile, .g-recaptcha, #px-captcha');
      if (hasCaptcha) {
        this.logger.warn('CAPTCHA detected, waiting for auto-solve...');
        await page.waitForTimeout(5000); // Give time for auto-solve
      }
      
      // Perform extraction
      const result = await this.extractNavigationItems(page, pattern);
      
      if (result && result.length > 0) {
        return result;
      }
      
      throw new Error('No navigation items found');
      
    } catch (error) {
      lastError = error;
      this.logger.warn(`Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < maxAttempts) {
        // Reload page for retry
        await page.reload({ waitUntil: 'networkidle2' });
      }
    }
  }
  
  throw lastError;
}
```

### Step 3: Configure Site-Specific Settings

```javascript
// src/config/SiteConfig.js (create new file)
module.exports = {
  // Sites that require Browserless.io
  'toasttab.com': {
    backend: 'browserless',
    proxy: 'brightdata',
    proxyType: 'residential',
    autoSolveCaptcha: true,
    headless: false
  },
  
  // Sites that work fine locally (cost optimization)
  'glasswingshop.com': {
    backend: 'local',
    proxy: false,
    headless: true
  },
  
  'macys.com': {
    backend: 'local',  // Works locally with headless:false
    proxy: 'brightdata',
    proxyType: 'datacenter',
    headless: false
  },
  
  // Default configuration
  'default': {
    backend: 'auto',  // Let BrowserManagerBrowserless decide
    proxy: false,
    headless: true
  }
};
```

### Step 4: Implement Smart Backend Selection

```javascript
// Update BrowserManagerBrowserless.js shouldUseBrowserless method
shouldUseBrowserless(options) {
  // Load site config
  const SiteConfig = require('../config/SiteConfig');
  const domain = this.extractDomain(options.site);
  const config = SiteConfig[domain] || SiteConfig.default;
  
  // Explicit backend selection from config
  if (config.backend === 'browserless') return true;
  if (config.backend === 'local') return false;
  
  // Auto-detection logic
  if (config.backend === 'auto') {
    // Use Browserless for protected sites
    if (options.autoSolveCaptcha) return true;
    if (options.humanInLoop) return true;
    if (config.proxy && this.config.useBrowserless) return true;
    
    // Default to local for cost savings
    return false;
  }
  
  return this.config.useBrowserless;
}
```

## Testing the Migration

### 1. Test Basic Connection
```bash
node src/common/__tests__/test_browserless_integration.js
```

### 2. Test Specific Site
```bash
# Test protected site with Browserless
USE_BROWSERLESS=true node -e "
const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
(async () => {
  const bm = new BrowserManagerBrowserless();
  const { page, close, backend } = await bm.createBrowser('stealth', {
    site: 'https://www.toasttab.com/local/restaurants',
    proxy: 'brightdata',
    autoSolveCaptcha: true
  });
  console.log('Backend:', backend);
  await page.goto('https://www.toasttab.com/local/restaurants');
  console.log('Title:', await page.title());
  const hasContent = await page.$('.restaurant-card');
  console.log('Found restaurants:', !!hasContent);
  await close();
  console.log('Stats:', bm.getStats());
})();
"
```

### 3. Compare Performance
```bash
node src/common/__tests__/test_browserless_integration.js --compare
```

### 4. Test Navigation Extraction
```bash
# Test with new BrowserManagerBrowserless
node -e "
const NavigationMapper = require('./src/core/discovery/NavigationMapper');
const logger = console;
(async () => {
  const mapper = new NavigationMapper(logger, {});
  const result = await mapper.extractNavigation('https://www.glasswingshop.com');
  console.log('Extracted items:', result.navigation.length);
})();
"
```

## Human-in-the-Loop Setup

For sites requiring manual authentication:

```javascript
// Enable human intervention
const { page, close, cdp } = await browserManager.createBrowser('stealth', {
  site: 'https://accounts.google.com',
  humanInLoop: true,
  onLiveUrl: (liveUrl) => {
    console.log('🔗 Manual intervention needed:');
    console.log(`   Open this URL: ${liveUrl}`);
    console.log('   Complete the login/CAPTCHA manually');
    // Send URL to Slack/email for team member to handle
    notifyTeam(liveUrl);
  }
});

// Wait for human to complete action
await page.waitForSelector('.logged-in-indicator', { timeout: 120000 });
```

## Monitoring & Cost Tracking

### Real-time Usage Dashboard
```javascript
// Add to your monitoring system
class BrowserlessMonitor {
  constructor(browserManager) {
    this.browserManager = browserManager;
    this.startMonitoring();
  }
  
  startMonitoring() {
    setInterval(() => {
      const stats = this.browserManager.getStats();
      
      // Log to your metrics system
      metrics.gauge('browserless.sessions.active', stats.activeSessions);
      metrics.counter('browserless.sessions.created', stats.sessions.created);
      metrics.counter('browserless.captchas.detected', stats.sessions.captchasDetected);
      metrics.gauge('browserless.cost.estimated', stats.cost.estimatedCost);
      
      // Alert on high usage
      if (stats.cost.estimatedCost > 10) {
        alerts.send('High Browserless usage detected', stats);
      }
    }, 60000); // Every minute
  }
}
```

### Cost Optimization Strategies

1. **Use Local for Simple Sites**
   ```javascript
   // Only use Browserless when necessary
   const needsBrowserless = (url) => {
     const protectedSites = ['toasttab.com', 'doordash.com'];
     return protectedSites.some(site => url.includes(site));
   };
   ```

2. **Session Reuse**
   ```javascript
   // Browserless sessions can be reused for multiple pages
   const { browser, close } = await browserManager.createBrowser();
   const page1 = await browser.newPage();
   const page2 = await browser.newPage();
   // Use both pages, then close once
   await close();
   ```

3. **Batch Processing**
   ```javascript
   // Process multiple URLs in one session
   const urls = ['url1', 'url2', 'url3'];
   const { browser, close } = await browserManager.createBrowser();
   
   for (const url of urls) {
     const page = await browser.newPage();
     await processUrl(page, url);
     await page.close(); // Close page, not browser
   }
   
   await close(); // Close browser after all URLs
   ```

## Rollback Plan

If issues arise:

```javascript
// Option 1: Disable Browserless globally
process.env.USE_BROWSERLESS = 'false';

// Option 2: Force local for all sites
const browserManager = new BrowserManagerBrowserless({
  useBrowserless: false  // Override all configs
});

// Option 3: Revert to original BrowserManager
const BrowserManager = require('./BrowserManager');
// Use original instead of BrowserManagerBrowserless
```

## Troubleshooting

### Common Issues

1. **"WebSocket connection failed"**
   - Check BROWSERLESS_TOKEN is valid
   - Verify network allows WebSocket connections
   - Try different endpoint (US vs EU)

2. **"Proxy authentication failed"**
   - Verify BrightData credentials
   - Check proxy quota/billing
   - Test proxy independently

3. **"CAPTCHA not solving"**
   - Enable autoSolveCaptcha option
   - Consider human-in-the-loop for complex CAPTCHAs
   - Check if site needs specific proxy location

### Debug Mode
```bash
# Enable detailed logging
DEBUG=browserless:* LOG_LEVEL=debug node your_script.js
```

### Test Individual Components
```javascript
// Test Browserless connection only
const puppeteer = require('puppeteer-core');
const browser = await puppeteer.connect({
  browserWSEndpoint: `wss://production-sfo.browserless.io?token=${token}`
});

// Test BrightData proxy only
const ProxyConfig = require('./src/config/ProxyConfig');
const proxyWorks = await ProxyConfig.testProxy(
  ProxyConfig.getBrightDataConfig('residential')
);
```

## Next Steps

1. **Day 1**: Test Browserless on 1-2 problem sites (Toast Tab, DoorDash)
2. **Day 2-3**: Monitor success rates and costs
3. **Day 4-5**: Expand to more protected sites if successful
4. **Week 2**: Optimize backend selection rules based on data
5. **Week 3**: Implement human-in-the-loop for special cases
6. **Month 2**: Full production rollout with monitoring

## Support Resources

- Browserless.io Docs: https://docs.browserless.io
- Browserless.io Status: https://status.browserless.io
- Support: support@browserless.io
- Discord: https://discord.gg/browserless

## Cost Calculator

```javascript
// Estimate monthly costs
function estimateMonthlyCost(dailyExtractions) {
  const protectedSiteRatio = 0.2; // 20% need Browserless
  const browserlessSessions = dailyExtractions * protectedSiteRatio * 30;
  
  // Browserless pricing tiers
  if (browserlessSessions < 1000) {
    return 50; // Starter plan
  } else if (browserlessSessions < 10000) {
    return 250; // Professional plan
  } else {
    return 500; // Enterprise plan
  }
}

console.log('1000 daily extractions cost:', estimateMonthlyCost(1000));
// Output: $250/month (Professional plan)
```