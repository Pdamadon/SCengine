/**
 * Platform Detection Service
 * Analyzes URLs and web pages to detect e-commerce platform types
 * Enables automatic routing to appropriate scraper implementations
 */

const { chromium } = require('playwright');

class PlatformDetector {
  constructor(logger) {
    this.logger = logger;
    this.browser = null;
    
    // Platform fingerprints - signatures that identify different platforms
    this.fingerprints = {
      shopify: {
        indicators: [
          // Meta tags and headers
          { type: 'meta', content: 'name="generator"', value: /Shopify/i },
          { type: 'meta', content: 'name="shopify-checkout-api-token"' },
          { type: 'script', content: /\/\/cdn\.shopify\.com\//i },
          { type: 'script', content: /Shopify\./i },
          // URL patterns
          { type: 'url', content: /\.myshopify\.com/i },
          { type: 'url', content: /\/collections\//i },
          { type: 'url', content: /\/products\//i },
          // DOM elements
          { type: 'element', content: '.shopify-section' },
          { type: 'element', content: '[data-shopify-payment-method]' },
          // API endpoints
          { type: 'api', content: '/products.json' },
        ],
        confidence_threshold: 3,
      },
      
      woocommerce: {
        indicators: [
          // Meta tags and headers
          { type: 'meta', content: 'name="generator"', value: /WooCommerce/i },
          { type: 'script', content: /woocommerce/i },
          { type: 'script', content: /wp-content/i },
          // URL patterns  
          { type: 'url', content: /\/product\//i },
          { type: 'url', content: /\/shop\//i },
          { type: 'url', content: /\/cart\//i },
          // DOM elements
          { type: 'element', content: '.woocommerce' },
          { type: 'element', content: '.single-product' },
          { type: 'element', content: '.product_title' },
          // WordPress indicators
          { type: 'script', content: /wp-json/i },
        ],
        confidence_threshold: 3,
      },
      
      bigcommerce: {
        indicators: [
          // Meta tags and headers
          { type: 'meta', content: 'name="generator"', value: /BigCommerce/i },
          { type: 'script', content: /bigcommerce/i },
          // URL patterns
          { type: 'url', content: /bigcommerce\.com/i },
          { type: 'url', content: /\/products\//i },
          // DOM elements
          { type: 'element', content: '.productView' },
          { type: 'element', content: '.page-sidebar' },
        ],
        confidence_threshold: 2,
      },
      
      gap: {
        indicators: [
          // Domain-specific
          { type: 'url', content: /gap\.com/i },
          { type: 'url', content: /gapcdn\.com/i },
          // URL patterns
          { type: 'url', content: /\/browse\/category\.do/i },
          { type: 'url', content: /\/products\//i },
          // DOM elements specific to Gap
          { type: 'element', content: '.pdp-wrapper' },
          { type: 'element', content: '.category-page' },
          // Scripts/assets
          { type: 'script', content: /gap-inc/i },
        ],
        confidence_threshold: 2,
      },
      
      amazon: {
        indicators: [
          // Domain
          { type: 'url', content: /amazon\./i },
          // URL patterns
          { type: 'url', content: /\/dp\//i },
          { type: 'url', content: /\/gp\/product\//i },
          { type: 'url', content: /\/s\?/i },
          // DOM elements
          { type: 'element', content: '#productTitle' },
          { type: 'element', content: '.a-price' },
          { type: 'element', content: '#add-to-cart-button' },
          // Scripts
          { type: 'script', content: /amazon-adsystem/i },
        ],
        confidence_threshold: 2,
      },
    };
  }

  async initialize() {
    try {
      this.browser = await chromium.launch({
        headless: process.env.HEADLESS_MODE !== 'false',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--disable-gpu',
        ],
      });
      this.logger.info('PlatformDetector initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize PlatformDetector:', error);
      throw error;
    }
  }

  /**
   * Detect platform from URL without loading the page (fast method)
   */
  detectFromUrl(url) {
    const urlString = url.toLowerCase();
    
    // Quick domain-based detection
    if (urlString.includes('myshopify.com') || urlString.includes('/collections/')) {
      return { platform: 'shopify', confidence: 0.8, method: 'url_pattern' };
    }
    
    if (urlString.includes('gap.com')) {
      return { platform: 'gap', confidence: 0.9, method: 'domain' };
    }
    
    if (urlString.includes('amazon.')) {
      return { platform: 'amazon', confidence: 0.9, method: 'domain' };
    }
    
    if (urlString.includes('/product/') && (urlString.includes('wp-') || urlString.includes('/shop/'))) {
      return { platform: 'woocommerce', confidence: 0.6, method: 'url_pattern' };
    }
    
    return { platform: 'unknown', confidence: 0.0, method: 'url_analysis' };
  }

  /**
   * Deep platform detection by analyzing page content
   */
  async detectFromPage(url, options = {}) {
    if (!this.browser) {
      await this.initialize();
    }

    const timeout = options.timeout || 15000;
    const page = await this.browser.newPage();
    
    try {
      this.logger.info(`Analyzing page for platform detection: ${url}`);
      
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: timeout,
      });
      
      await page.waitForTimeout(2000);

      const analysis = await page.evaluate((fingerprints) => {
        const results = {};
        
        // Analyze each platform's fingerprints
        Object.keys(fingerprints).forEach(platform => {
          const platformFingerprints = fingerprints[platform];
          let score = 0;
          const matches = [];
          
          platformFingerprints.indicators.forEach(indicator => {
            let found = false;
            
            switch (indicator.type) {
              case 'meta':
                const metaTags = document.querySelectorAll('meta');
                metaTags.forEach(meta => {
                  if (indicator.content.includes('name=') && meta.name) {
                    const nameMatch = indicator.content.match(/name="([^"]+)"/);
                    if (nameMatch && meta.name === nameMatch[1]) {
                      if (indicator.value) {
                        if (indicator.value.test && indicator.value.test(meta.content)) {
                          found = true;
                        }
                      } else {
                        found = true;
                      }
                    }
                  }
                });
                break;
                
              case 'script':
                const scripts = document.querySelectorAll('script');
                scripts.forEach(script => {
                  if (script.src && indicator.content.test && indicator.content.test(script.src)) {
                    found = true;
                  }
                  if (script.textContent && indicator.content.test && indicator.content.test(script.textContent)) {
                    found = true;
                  }
                });
                break;
                
              case 'element':
                if (document.querySelector(indicator.content)) {
                  found = true;
                }
                break;
                
              case 'url':
                if (indicator.content.test && indicator.content.test(window.location.href)) {
                  found = true;
                }
                break;
            }
            
            if (found) {
              score += 1;
              matches.push(indicator.content.toString());
            }
          });
          
          results[platform] = {
            score: score,
            matches: matches,
            confidence: score >= platformFingerprints.confidence_threshold ? 
              Math.min(score / (platformFingerprints.indicators.length * 0.7), 1.0) : 0,
          };
        });
        
        return {
          url: window.location.href,
          title: document.title,
          results: results,
        };
      }, this.fingerprints);

      // Determine best match
      let bestMatch = { platform: 'unknown', confidence: 0, method: 'page_analysis' };
      
      Object.keys(analysis.results).forEach(platform => {
        const result = analysis.results[platform];
        if (result.confidence > bestMatch.confidence) {
          bestMatch = {
            platform: platform,
            confidence: result.confidence,
            score: result.score,
            matches: result.matches,
            method: 'page_analysis',
          };
        }
      });

      this.logger.info(`Platform detection complete: ${bestMatch.platform} (confidence: ${(bestMatch.confidence * 100).toFixed(1)}%)`);
      
      return {
        ...bestMatch,
        analysis: analysis,
        detectedAt: new Date().toISOString(),
      };

    } catch (error) {
      this.logger.error(`Platform detection failed for ${url}:`, error);
      return { 
        platform: 'unknown', 
        confidence: 0, 
        method: 'error',
        error: error.message,
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Comprehensive platform detection using both URL and page analysis
   */
  async detectPlatform(url, options = {}) {
    // Start with fast URL-based detection
    const urlResult = this.detectFromUrl(url);
    
    // If URL detection has high confidence, return early
    if (urlResult.confidence >= 0.8) {
      this.logger.info(`Fast platform detection: ${urlResult.platform} (${(urlResult.confidence * 100).toFixed(1)}% confidence)`);
      return urlResult;
    }
    
    // Otherwise, perform deep page analysis
    if (options.skipPageAnalysis) {
      return urlResult;
    }
    
    const pageResult = await this.detectFromPage(url, options);
    
    // Combine results, preferring page analysis if available
    if (pageResult.confidence > urlResult.confidence) {
      return pageResult;
    }
    
    return urlResult.confidence > 0 ? urlResult : pageResult;
  }

  /**
   * Get platform-specific scraping configuration
   */
  getPlatformConfig(platform) {
    const configs = {
      shopify: {
        hasJsonApi: true,
        apiEndpoints: ['/products.json', '/collections.json'],
        commonSelectors: {
          productCards: '.product-item, .product-card, .grid__item',
          productTitle: '.product-item__title, .product__title, h1',
          productPrice: '.price, .product-price, .money',
          productImage: '.product-item__image img, .product__image img',
          nextPage: '.pagination__next, [aria-label*="Next"]',
        },
        rateLimits: {
          requestsPerMinute: 120,
          burstRate: 10,
        },
        antiBot: {
          userAgentRotation: true,
          delayRange: [1000, 3000],
        },
      },
      
      gap: {
        hasJsonApi: false,
        apiEndpoints: [],
        commonSelectors: {
          productCards: '.product-tile, .product-item',
          productTitle: '.product-title, h1',
          productPrice: '.price, .product-price',
          productImage: '.product-image img',
          nextPage: '.pagination-next, [aria-label*="Next"]',
        },
        rateLimits: {
          requestsPerMinute: 60,
          burstRate: 5,
        },
        antiBot: {
          userAgentRotation: true,
          delayRange: [2000, 5000],
          requiresHeaders: true,
        },
      },
      
      woocommerce: {
        hasJsonApi: true,
        apiEndpoints: ['/wp-json/wc/v3/products'],
        commonSelectors: {
          productCards: '.product, .woocommerce-LoopProduct-link',
          productTitle: '.woocommerce-loop-product__title, .product_title',
          productPrice: '.price, .woocommerce-Price-amount',
          productImage: '.attachment-woocommerce_thumbnail',
          nextPage: '.next, .page-numbers.next',
        },
        rateLimits: {
          requestsPerMinute: 100,
          burstRate: 8,
        },
        antiBot: {
          userAgentRotation: false,
          delayRange: [1000, 2000],
        },
      },
      
      amazon: {
        hasJsonApi: false,
        apiEndpoints: [],
        commonSelectors: {
          productCards: '[data-component-type="s-search-result"]',
          productTitle: 'h2 a span, #productTitle',
          productPrice: '.a-price .a-offscreen',
          productImage: '.s-image, #landingImage',
          nextPage: '.s-pagination-next',
        },
        rateLimits: {
          requestsPerMinute: 30,
          burstRate: 3,
        },
        antiBot: {
          userAgentRotation: true,
          delayRange: [3000, 8000],
          requiresProxies: true,
          requiresHeaders: true,
        },
      },
    };
    
    return configs[platform] || {
      hasJsonApi: false,
      apiEndpoints: [],
      commonSelectors: {},
      rateLimits: { requestsPerMinute: 60, burstRate: 5 },
      antiBot: { userAgentRotation: true, delayRange: [2000, 4000] },
    };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.logger.info('PlatformDetector closed successfully');
    }
  }
}

module.exports = PlatformDetector;