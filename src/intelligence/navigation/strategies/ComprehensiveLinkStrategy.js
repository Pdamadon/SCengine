/**
 * ComprehensiveLinkStrategy.js
 * 
 * Discovers navigation by finding ALL links that match navigation patterns
 * Does NOT require finding a nav container first - just finds all nav-related links
 * This catches sites that don't use traditional nav elements
 */

const NavigationStrategy = require('../NavigationStrategy');

class ComprehensiveLinkStrategy extends NavigationStrategy {
  constructor(logger, options = {}) {
    super(logger, options);
    this.name = 'ComprehensiveLinkStrategy';
  }

  /**
   * Execute strategy - find ALL links that look like navigation
   */
  async execute(page) {
    return await this.measureExecution(async () => {
      try {
        // Wait for navigation elements to be present
        try {
          await page.waitForSelector('nav, header, [role="navigation"]', { 
            timeout: 3000,
            state: 'visible' 
          });
        } catch (e) {
          this.logger.debug('Navigation elements not immediately visible, continuing anyway');
        }
        
        // Extract ALL navigation-related links
        const navigationData = await page.evaluate(() => {
          const items = [];
          const processed = new Set();
          
          // Comprehensive selectors that find links directly
          // (not requiring a nav container first)
          const linkSelectors = [
            'nav a',
            'header a',
            '[role="navigation"] a',
            '.navigation a',
            '#mainNavigation a',
            '[class*="nav"] a',
            '[class*="menu"] a',
            '[class*="Nav"] a',
            '[class*="Menu"] a',
            '[id*="navigation"] a',
            '[id*="Navigation"] a',
            '.header a',
            '.navbar a',
            '.main-nav a',
            '.primary-nav a',
            '.header-nav a',
            '.main-menu a',
            '[data-nav] a',
            '[data-menu] a',
            '.site-nav a',
            '.global-nav a',
            
            // URL pattern based
            'a[href*="/shop/"]',
            'a[href*="/browse/"]',
            'a[href*="/category/"]',
            'a[href*="/collection/"]',
            
            // Macy's specific
            '#mainNavigation a',
            '.header a[href*="/shop/"]',
            'a[id*="department"]',
            
            // Gap specific
            'a[href*="/browse/category.do"]',
            '[class*="nav-item"] a',
            '[class*="category-nav"] a'
          ];
          
          // Process each selector
          linkSelectors.forEach(selector => {
            try {
              const links = document.querySelectorAll(selector);
              links.forEach(link => {
                const text = link.textContent.trim();
                const url = link.href;
                
                // Skip if already processed
                if (!text || !url || processed.has(url)) return;
                
                // Skip non-navigation items
                const skipPatterns = [
                  'sign in', 'sign up', 'login', 'logout',
                  'cart', 'bag', 'basket', 'checkout',
                  'account', 'profile', 'my account',
                  'help', 'support', 'contact',
                  'facebook', 'twitter', 'instagram', 'youtube', 'pinterest',
                  'privacy', 'terms', 'cookie', 'legal', 'copyright'
                ];
                
                const shouldSkip = skipPatterns.some(pattern => 
                  text.toLowerCase().includes(pattern)
                );
                
                if (!shouldSkip && !url.includes('javascript:') && !url.includes('mailto:')) {
                  processed.add(url);
                  
                  // Check if link is visible
                  const rect = link.getBoundingClientRect();
                  const style = window.getComputedStyle(link);
                  const isVisible = rect.width > 0 && 
                                  rect.height > 0 && 
                                  style.display !== 'none' && 
                                  style.visibility !== 'hidden';
                  
                  items.push({
                    text: text,
                    name: text,
                    url: url,
                    selector: selector,
                    is_visible: isVisible,
                    type: 'main_section',  // Changed from 'navigation_link' so it's treated as explorable
                    element_type: 'a',
                    discovered_via: selector,
                    attributes: {
                      'data-testid': link.getAttribute('data-testid'),
                      'aria-label': link.getAttribute('aria-label'),
                      'role': link.getAttribute('role'),
                      'class': link.className,
                      'id': link.id
                    }
                  });
                }
              });
            } catch (error) {
              // Continue with other selectors
            }
          });
          
          // Also look for any links in common navigation areas
          const navigationAreas = [
            'header',
            'nav',
            '[role="navigation"]',
            '.header',
            '.navbar',
            '#header',
            '#navigation',
            '.top-nav',
            '.main-header'
          ];
          
          navigationAreas.forEach(areaSelector => {
            try {
              const area = document.querySelector(areaSelector);
              if (area) {
                const links = area.querySelectorAll('a');
                links.forEach(link => {
                  const text = link.textContent.trim();
                  const url = link.href;
                  
                  if (text && url && !processed.has(url)) {
                    const skipPatterns = ['sign in', 'cart', 'help', 'facebook', 'twitter'];
                    const shouldSkip = skipPatterns.some(p => text.toLowerCase().includes(p));
                    
                    if (!shouldSkip && !url.includes('javascript:')) {
                      processed.add(url);
                      items.push({
                        text: text,
                        name: text,
                        url: url,
                        type: 'main_section',  // Changed to be treated as explorable
                        element_type: 'a',
                        is_visible: true,
                        discovered_via: `${areaSelector} a`
                      });
                    }
                  }
                });
              }
            } catch (error) {
              // Continue
            }
          });
          
          return {
            items: items,
            metadata: {
              totalLinksFound: items.length,
              uniqueUrls: processed.size,
              timestamp: new Date().toISOString()
            }
          };
        });

        // Process and format results
        const processedItems = this.deduplicateItems(navigationData.items);
        const confidence = this.calculateStrategyConfidence(processedItems, navigationData.metadata);

        this.logResults(processedItems, confidence, this.performanceMetrics.executionTime);

        return {
          items: processedItems,
          confidence: confidence,
          metadata: {
            ...navigationData.metadata,
            strategy: this.name,
            itemCount: processedItems.length
          }
        };

      } catch (error) {
        this.logger.error(`${this.name} failed: ${error.message}`);
        return {
          items: [],
          confidence: 0,
          metadata: {
            error: error.message,
            strategy: this.name
          }
        };
      }
    });
  }

  /**
   * Calculate confidence for this strategy
   */
  calculateStrategyConfidence(items, metadata) {
    let confidence = 0.5; // Base confidence

    // Higher confidence with more items
    if (items.length > 100) confidence += 0.3;
    else if (items.length > 50) confidence += 0.2;
    else if (items.length > 20) confidence += 0.1;
    else if (items.length < 5) confidence -= 0.2;

    // Check for variety in discovered selectors
    const selectors = new Set(items.map(i => i.discovered_via));
    if (selectors.size > 5) confidence += 0.1;

    // Check for expected navigation terms
    const navTerms = ['women', 'men', 'kids', 'home', 'sale', 'shop'];
    const hasNavTerms = items.some(item => 
      navTerms.some(term => item.text?.toLowerCase().includes(term))
    );
    if (hasNavTerms) confidence += 0.1;

    return Math.max(0.1, Math.min(1, confidence));
  }
}

module.exports = ComprehensiveLinkStrategy;