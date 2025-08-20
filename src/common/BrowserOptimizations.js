/**
 * BrowserOptimizations - ONLY browser/network optimizations
 * 
 * Focused solely on making pages load faster
 * NO scraping logic here!
 */

class BrowserOptimizations {
  /**
   * Block resources we don't need for scraping
   * This alone can make pages load 2-5x faster!
   */
  static async blockUnnecessaryResources(page) {
    // Block images - we don't need them for data
    await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico}', route => route.abort());
    
    // Block fonts - just slows things down
    await page.route('**/*.{woff,woff2,ttf,otf}', route => route.abort());
    
    // Block tracking/analytics - huge speed boost
    await page.route('**/google-analytics.com/**', route => route.abort());
    await page.route('**/googletagmanager.com/**', route => route.abort());
    await page.route('**/facebook.com/**', route => route.abort());
    await page.route('**/doubleclick.net/**', route => route.abort());
    await page.route('**/hotjar.com/**', route => route.abort());
    await page.route('**/mixpanel.com/**', route => route.abort());
    await page.route('**/segment.io/**', route => route.abort());
    await page.route('**/clarity.ms/**', route => route.abort());
    await page.route('**/amplitude.com/**', route => route.abort());
    
    // Block video - definitely don't need
    await page.route('**/*.{mp4,webm,avi,mov}', route => route.abort());
    
    // Block CSS if we're only extracting data (optional - might break some JS)
    // await page.route('**/*.css', route => route.abort());
    
    console.log('✅ Resource blocking enabled - pages will load much faster');
  }
  
  /**
   * Monitor network for product API calls
   * Useful for sites that load products via AJAX
   */
  static async monitorProductAPIs(page, callback) {
    page.on('response', async response => {
      const url = response.url();
      
      // Common product API patterns
      if (url.includes('/api/products') || 
          url.includes('/api/catalog') ||
          url.includes('/api/search') ||
          url.includes('/products.json') ||
          url.includes('/collection') && url.includes('.json')) {
        
        try {
          const data = await response.json();
          callback(data, url);
        } catch (e) {
          // Not JSON or failed to parse
        }
      }
    });
  }

}

module.exports = BrowserOptimizations;