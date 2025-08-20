/**
 * PlatformDetector - Identify e-commerce platform to use targeted strategies
 * 
 * Benefits:
 * - Only need ~20 platform strategies instead of hundreds of site strategies
 * - Platforms share common structures (Shopify sites all similar)
 * - Can fall back to universal discovery if platform unknown
 */

class PlatformDetector {
  async detectPlatform(page) {
    const indicators = await page.evaluate(() => {
      return {
        // Check meta tags
        generator: document.querySelector('meta[name="generator"]')?.content,
        
        // Check for platform-specific globals
        shopify: typeof window.Shopify !== 'undefined',
        woocommerce: document.querySelector('body.woocommerce') !== null,
        magento: document.querySelector('body.catalog-product-view') !== null,
        bigcommerce: typeof window.BCData !== 'undefined',
        
        // Check for platform-specific elements
        hasShopifyCart: document.querySelector('form[action*="/cart/add"]') !== null,
        hasWooCart: document.querySelector('.woocommerce-cart') !== null,
        
        // Check scripts
        scripts: Array.from(document.scripts)
          .map(s => s.src)
          .filter(src => src.includes('cdn.shopify') || 
                        src.includes('woocommerce') ||
                        src.includes('magento')),
        
        // Check common platform classes
        bodyClasses: document.body.className,
        
        // Platform-specific data attributes
        dataAttributes: Array.from(document.querySelectorAll('[data-shopify], [data-woo], [data-magento]'))
          .map(el => el.tagName)
      };
    });

    // Determine platform based on indicators
    if (indicators.shopify || indicators.hasShopifyCart || 
        indicators.scripts.some(s => s.includes('shopify'))) {
      return 'shopify';
    }
    
    if (indicators.woocommerce || indicators.hasWooCart) {
      return 'woocommerce';
    }
    
    if (indicators.magento || indicators.bodyClasses?.includes('magento')) {
      return 'magento';
    }
    
    if (indicators.bigcommerce) {
      return 'bigcommerce';
    }
    
    // Could not detect platform
    return 'unknown';
  }
}

module.exports = PlatformDetector;