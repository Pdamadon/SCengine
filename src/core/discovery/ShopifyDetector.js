/**
 * ShopifyDetector - Comprehensive Shopify platform detection
 * Based on multiple signals for high-confidence detection
 */

class ShopifyDetector {
  constructor() {
    // Shopify-specific asset hosts
    this.SHOPIFY_ASSET_HOSTS = [
      'cdn.shopify.com',
      'shopifycdn.net',
      'shopify.com',
      'myshopify.com',
      'checkout.shopify.com',
      'shopifycloud.com'
    ];

    // Shopify response headers
    this.SHOPIFY_HEADERS = [
      'x-shopid',
      'x-shopify-stage',
      'x-shopify-request-id',
      'x-sorting-hat-shopid',
      'x-sorting-hat-podid',
      'x-storefront-renderer-rendered',
      'x-dc',  // Shopify datacenter
      'x-shardid'
    ];

    // Shopify API endpoints
    this.SHOPIFY_ENDPOINTS = [
      /\/cart\.js(\?|$)/i,
      /\/cart\.json(\?|$)/i,
      /\/products\/[^/]+\.js(\?|$)/i,
      /\/collections\/[^/]+\.json(\?|$)/i,
      /\/cart\/(add|change|update|clear)\.js(\?|$)/i,
      /\/api\/\d{4}-\d{2}\//,  // Storefront API
      /\/admin\/api\//
    ];

    // Weight for each signal type (for confidence scoring)
    this.SIGNAL_WEIGHTS = {
      shopify_header: 0.35,        // Strong signal
      shopify_asset_host: 0.20,    
      shopify_endpoint: 0.25,      
      shopify_checkout_url: 0.30,  // Strong signal
      window_shopify: 0.25,        // Strong signal
      shopify_analytics: 0.15,
      meta_shopify: 0.10,
      shopify_payment: 0.15,
      liquid_template: 0.10,
      shopify_section: 0.10
    };
  }

  /**
   * Lightweight detection without network monitoring
   * Fast check using only DOM/JavaScript evaluation
   */
  async detectQuick(page) {
    const signals = await page.evaluate(() => {
      const evidence = [];
      const matchedSignals = [];

      // Check JavaScript globals
      if (typeof window.Shopify !== 'undefined') {
        matchedSignals.push('window_shopify');
        evidence.push({ 
          signal: 'window_shopify', 
          detail: `Shopify object with ${Object.keys(window.Shopify || {}).length} properties` 
        });
      }

      if (typeof window.ShopifyAnalytics !== 'undefined') {
        matchedSignals.push('shopify_analytics');
        evidence.push({ signal: 'shopify_analytics', detail: 'ShopifyAnalytics present' });
      }

      // Check meta tags
      const metas = Array.from(document.querySelectorAll('meta'));
      for (const meta of metas) {
        const name = (meta.getAttribute('name') || '').toLowerCase();
        const property = (meta.getAttribute('property') || '').toLowerCase();
        const content = meta.getAttribute('content') || '';
        
        if (name.includes('shopify') || property.includes('shopify') || content.includes('shopify')) {
          matchedSignals.push('meta_shopify');
          evidence.push({
            signal: 'meta_shopify',
            detail: `${name || property}: ${content.substring(0, 50)}`
          });
        }
      }

      // Check scripts for Shopify CDN
      const scripts = Array.from(document.scripts);
      const shopifyScripts = scripts.filter(s => 
        s.src && (s.src.includes('cdn.shopify') || s.src.includes('shopifycdn'))
      );
      
      if (shopifyScripts.length > 0) {
        matchedSignals.push('shopify_asset_host');
        evidence.push({
          signal: 'shopify_asset_host',
          detail: `${shopifyScripts.length} scripts from Shopify CDN`
        });
      }

      // Check for Shopify-specific elements
      const shopifyElements = {
        cartForm: document.querySelector('form[action*="/cart/add"]'),
        shopifySection: document.querySelector('.shopify-section'),
        shopifyPayment: document.querySelector('.shopify-payment-button'),
        productJson: document.querySelector('script[type="application/json"][data-product-json]'),
        liquidTemplate: document.querySelector('[data-section-type]')
      };

      if (shopifyElements.cartForm) {
        matchedSignals.push('shopify_cart_form');
        evidence.push({ signal: 'shopify_cart_form', detail: 'Cart add form present' });
      }

      if (shopifyElements.shopifySection) {
        matchedSignals.push('shopify_section');
        evidence.push({ signal: 'shopify_section', detail: 'Shopify section elements found' });
      }

      if (shopifyElements.shopifyPayment) {
        matchedSignals.push('shopify_payment');
        evidence.push({ signal: 'shopify_payment', detail: 'Shopify payment button found' });
      }

      if (shopifyElements.liquidTemplate) {
        matchedSignals.push('liquid_template');
        evidence.push({ signal: 'liquid_template', detail: 'Liquid template markers found' });
      }

      // Check for Shopify URLs in links
      const links = Array.from(document.querySelectorAll('a[href]'));
      const shopifyLinks = links.filter(a => 
        a.href.includes('myshopify.com') || 
        a.href.includes('checkout.shopify.com')
      );

      if (shopifyLinks.length > 0) {
        matchedSignals.push('shopify_checkout_url');
        evidence.push({
          signal: 'shopify_checkout_url',
          detail: `${shopifyLinks.length} Shopify checkout links`
        });
      }

      // Additional Shopify indicators
      const additionalChecks = {
        hasShopifyPay: !!document.querySelector('[data-shopify-pay]'),
        hasShopifyReviews: !!document.querySelector('.shopify-product-reviews-badge'),
        hasShopifyCart: typeof window.Shopify?.cart !== 'undefined',
        hasShopifyTheme: typeof window.Shopify?.theme !== 'undefined',
        shopifyThemeName: window.Shopify?.theme?.name || null,
        shopifyThemeId: window.Shopify?.theme?.theme_store_id || null
      };

      if (additionalChecks.hasShopifyTheme && additionalChecks.shopifyThemeName) {
        evidence.push({
          signal: 'shopify_theme',
          detail: `Theme: ${additionalChecks.shopifyThemeName}`
        });
      }

      return {
        matchedSignals: [...new Set(matchedSignals)],
        evidence,
        additionalInfo: additionalChecks
      };
    });

    // Calculate confidence score
    let confidence = 0;
    for (const signal of signals.matchedSignals) {
      confidence += this.SIGNAL_WEIGHTS[signal] || 0.05;
    }
    confidence = Math.min(1, confidence);

    // Determine if it's Shopify
    const isShopify = confidence >= 0.3 || 
                     signals.matchedSignals.includes('window_shopify') ||
                     signals.matchedSignals.includes('shopify_header');

    return {
      isShopify,
      confidence: Number((confidence * 100).toFixed(0)),
      signals: signals.matchedSignals,
      evidence: signals.evidence,
      theme: signals.additionalInfo.shopifyThemeName
    };
  }

  /**
   * Comprehensive detection with network monitoring
   * More accurate but requires intercepting network requests
   */
  async detectComprehensive(page, options = {}) {
    const evidence = [];
    const matchedSignals = [];
    let mainResponseHeaders = {};

    // Set up network monitoring if not already done
    if (options.enableNetworkMonitoring) {
      // Monitor responses for Shopify headers and assets
      page.on('response', async (response) => {
        try {
          const url = response.url();
          const headers = response.headers();
          
          // Check if main page response
          if (url === page.url()) {
            mainResponseHeaders = headers;
          }

          // Check for Shopify headers
          for (const header of this.SHOPIFY_HEADERS) {
            if (headers[header]) {
              matchedSignals.push('shopify_header');
              evidence.push({
                signal: 'shopify_header',
                detail: `${header}: ${headers[header]}`
              });
            }
          }

          // Check for Shopify asset hosts
          const urlObj = new URL(url);
          if (this.SHOPIFY_ASSET_HOSTS.some(host => urlObj.hostname.includes(host))) {
            matchedSignals.push('shopify_asset_host');
            evidence.push({
              signal: 'shopify_asset_host',
              detail: urlObj.hostname
            });
          }

          // Check for Shopify API endpoints
          for (const pattern of this.SHOPIFY_ENDPOINTS) {
            if (pattern.test(urlObj.pathname)) {
              matchedSignals.push('shopify_endpoint');
              evidence.push({
                signal: 'shopify_endpoint',
                detail: urlObj.pathname
              });
            }
          }
        } catch (e) {
          // Ignore errors in response processing
        }
      });

      // Wait for navigation with network monitoring
      await page.goto(options.url, { 
        waitUntil: 'domcontentloaded',
        timeout: options.timeout || 30000 
      });
    }

    // Get DOM-based signals
    const quickDetection = await this.detectQuick(page);
    
    // Combine all signals
    const allSignals = [...new Set([...matchedSignals, ...quickDetection.signals])];
    const allEvidence = [...evidence, ...quickDetection.evidence];

    // Recalculate confidence with all signals
    let confidence = 0;
    for (const signal of allSignals) {
      confidence += this.SIGNAL_WEIGHTS[signal] || 0.05;
    }
    confidence = Math.min(1, confidence);

    // Check for strong Shopify indicators
    const hasStrongSignal = allSignals.includes('shopify_header') ||
                           allSignals.includes('window_shopify') ||
                           allSignals.includes('shopify_checkout_url');

    return {
      isShopify: confidence >= 0.3 || hasStrongSignal,
      confidence: Number((confidence * 100).toFixed(0)),
      signals: allSignals,
      evidence: allEvidence,
      theme: quickDetection.theme,
      headers: Object.keys(mainResponseHeaders).filter(h => 
        h.toLowerCase().includes('shopify') || h.toLowerCase().includes('x-')
      )
    };
  }

  /**
   * Batch detection for multiple URLs
   */
  async detectBatch(urls, browserManager) {
    const results = [];
    
    for (const url of urls) {
      const session = await browserManager.createBrowser('stealth', {
        site: url,
        useBQL: false,
        timeout: 30000
      });
      
      try {
        await session.page.goto(url, { 
          waitUntil: 'domcontentloaded',
          timeout: 20000 
        });
        
        const detection = await this.detectQuick(session.page);
        results.push({
          url,
          ...detection
        });
        
      } catch (error) {
        results.push({
          url,
          error: error.message,
          isShopify: false,
          confidence: 0
        });
      } finally {
        await session.close();
      }
      
      // Small delay between sites
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
  }
}

module.exports = ShopifyDetector;