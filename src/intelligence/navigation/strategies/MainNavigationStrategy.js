/**
 * MainNavigationStrategy.js
 * 
 * Specialized strategy for capturing ONLY the first-layer main navigation
 * Focuses on department/category links that form the primary site structure
 * Filters out deep links, query parameters, and non-navigation items
 */

const NavigationStrategy = require('../NavigationStrategy');

class MainNavigationStrategy extends NavigationStrategy {
  constructor(logger, options = {}) {
    super(logger, options);
    this.name = 'MainNavigationStrategy';
  }

  /**
   * Execute strategy - find main navigation layer only
   */
  async execute(page) {
    return await this.measureExecution(async () => {
      try {
        this.logger.info('🎯 Starting main navigation discovery');
        
        // Wait for navigation to be ready
        await this.waitForNavigation(page, 3000);
        
        // Extract main navigation
        const navigationData = await page.evaluate(() => {
          const items = [];
          const processed = new Set();
          
          // Helper to check if URL is a main navigation link
          const isMainNavLink = (url, text) => {
            if (!url || !text) return false;
            
            // Skip if has query parameters (likely filtered/deep link)
            if (url.includes('?id=') || url.includes('&id=')) return false;
            
            // Skip non-navigation items
            const skipPatterns = [
              'sign in', 'sign up', 'login', 'logout', 'register',
              'cart', 'bag', 'basket', 'checkout', 'my bag',
              'account', 'profile', 'my account', 'wishlist',
              'help', 'support', 'contact', 'customer service',
              'store locator', 'find a store', 'stores',
              'gift cards', 'gift card',
              'facebook', 'twitter', 'instagram', 'youtube', 'pinterest',
              'privacy', 'terms', 'cookie', 'legal', 'copyright',
              'careers', 'about us', 'investor'
            ];
            
            const lowerText = text.toLowerCase();
            if (skipPatterns.some(pattern => lowerText.includes(pattern))) {
              return false;
            }
            
            // Main department patterns (more flexible matching)
            const mainDepartments = [
              'women', 'woman', 'men', 'man', 'kids', 'children', 'girls', 'boys', 'baby', 'toddler',
              'home', 'furniture', 'decor', 'kitchen', 'bedding', 'bath',
              'shoes', 'clothing', 'accessories', 'jewelry', 'handbags', 'bags',
              'beauty', 'fragrance', 'makeup', 'skincare',
              'electronics', 'toys', 'sports', 'outdoor',
              'sale', 'clearance', 'new arrivals', 'brands', 'collections'
            ];
            
            // Check if it's a main department (flexible matching)
            const isDepartment = mainDepartments.some(dept => 
              lowerText === dept || 
              lowerText === dept + 's' || 
              lowerText.includes(dept) ||
              dept.includes(lowerText)
            );
            
            // Also consider any link in main navigation areas as potentially valid
            // if it's in a navigation container and not explicitly excluded
            const inNavigation = url.includes('/collection') || 
                                url.includes('/category') || 
                                url.includes('/department') ||
                                text.length >= 3; // Any reasonable length text
            
            return isDepartment || (inNavigation && text.length >= 3);
          };
          
          // Helper to extract clean text
          const getCleanText = (element) => {
            // Try to get just the direct text, not from children
            const clone = element.cloneNode(true);
            // Remove child elements to get only direct text
            while (clone.firstElementChild) {
              clone.removeChild(clone.firstElementChild);
            }
            return clone.textContent.trim() || element.textContent.trim();
          };
          
          // Primary navigation selectors (ordered by reliability)
          const navSelectors = [
            // Specific IDs and classes for main nav
            '#mainNavigation > li > a',
            '#nav-menu > li > a',
            '#main-nav > li > a',
            '#primary-nav > li > a',
            '.main-navigation > li > a',
            '.nav-menu > li > a',        // glasswingshop specific
            '.primary-navigation > li > a',
            '.site-navigation > li > a',
            
            // Direct children of nav (first level only)
            'nav > ul > li > a',
            'nav > div > a',
            '[role="navigation"] > ul > li > a',
            
            // glasswingshop specific patterns from screenshot
            '.dropdown-toggle',           // Main navigation triggers
            'li > .dropdown-toggle',
            '.nav-menu li > a',
            '#nav-menu li > a',
            
            // Header navigation (first level)
            'header nav > ul > li > a',
            'header .navigation > ul > li > a',
            '.header-nav > ul > li > a',
            
            // Common patterns (but only direct children)
            '.nav-list > li > a',
            'ul.menu > li > a',
            
            // Specific store patterns
            '.nav-item > a:first-child', // First link in nav item
            '[class*="department"] > a',
            '[class*="category-nav"] > li > a',
            
            // More flexible patterns for glasswingshop
            'nav a[href*="/collections"]',
            'nav a[href*="/category"]',
            'nav a[href*="/collection"]'
          ];
          
          // Process each selector
          navSelectors.forEach(selector => {
            try {
              const elements = document.querySelectorAll(selector);
              elements.forEach(element => {
                const url = element.href;
                const text = getCleanText(element);
                
                // Skip if already processed
                if (processed.has(url)) return;
                
                // Check if it's a main nav link
                if (isMainNavLink(url, text)) {
                  processed.add(url);
                  
                  // Check if has dropdown
                  const parent = element.closest('li, .nav-item');
                  const hasDropdown = parent ? (
                    parent.querySelector('.dropdown, .submenu, .mega-menu') ||
                    parent.querySelector('[class*="dropdown"]') ||
                    element.getAttribute('aria-haspopup') === 'true' ||
                    element.getAttribute('aria-expanded') !== null
                  ) : false;
                  
                  items.push({
                    name: text,
                    url: url,
                    selector: selector,
                    element_type: element.tagName.toLowerCase(),
                    has_dropdown: !!hasDropdown,
                    type: 'main_section',
                    isMainNav: true,
                    level: 1,
                    discovered_via: 'MainNavigationStrategy'
                  });
                }
              });
            } catch (e) {
              // Skip failed selectors
            }
          });
          
          // If we didn't find enough, try a more general approach
          if (items.length < 5) {
            // Find all navigation containers
            const navContainers = document.querySelectorAll('nav, [role="navigation"], .navigation, #navigation');
            
            navContainers.forEach(nav => {
              // Get only first-level links
              const firstLevelLinks = nav.querySelectorAll('a');
              
              firstLevelLinks.forEach(link => {
                // Check depth - should be direct child or one level deep
                let depth = 0;
                let current = link.parentElement;
                while (current && current !== nav && depth < 3) {
                  depth++;
                  current = current.parentElement;
                }
                
                if (depth <= 2) { // Only first or second level
                  const url = link.href;
                  const text = getCleanText(link);
                  
                  if (!processed.has(url) && isMainNavLink(url, text)) {
                    processed.add(url);
                    
                    items.push({
                      name: text,
                      url: url,
                      selector: 'nav a',
                      element_type: 'a',
                      has_dropdown: false,
                      type: 'main_section',
                      isMainNav: true,
                      level: 1,
                      discovered_via: 'MainNavigationStrategy'
                    });
                  }
                }
              });
            });
          }
          
          return items;
        });
        
        // Calculate confidence based on quality of results
        const confidence = this.calculateConfidence(navigationData);
        
        this.logger.info(`✅ Main navigation found: ${navigationData.length} departments (confidence: ${(confidence * 100).toFixed(1)}%)`);
        
        // Log sample of found items
        if (navigationData.length > 0) {
          const sample = navigationData.slice(0, 5).map(item => item.name).join(', ');
          this.logger.debug(`  Sample: ${sample}`);
        }
        
        return {
          items: navigationData,
          confidence: confidence,
          metadata: {
            strategy: this.name,
            totalFound: navigationData.length,
            hasDropdowns: navigationData.filter(item => item.has_dropdown).length
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
   * Calculate confidence based on navigation quality
   */
  calculateConfidence(items) {
    if (items.length === 0) return 0;
    
    // High confidence if we found typical departments
    const expectedDepartments = ['women', 'men', 'kids', 'home', 'sale'];
    const foundDepartments = items.map(item => item.name.toLowerCase());
    
    const matchedDepartments = expectedDepartments.filter(dept => 
      foundDepartments.some(found => found.includes(dept))
    ).length;
    
    // Calculate confidence
    const factors = {
      hasEnoughItems: items.length >= 4 ? 0.3 : items.length * 0.075,
      hasExpectedDepartments: (matchedDepartments / expectedDepartments.length) * 0.4,
      hasDropdowns: items.filter(item => item.has_dropdown).length > 0 ? 0.2 : 0,
      consistentStructure: items.every(item => item.level === 1) ? 0.1 : 0
    };
    
    return Object.values(factors).reduce((sum, val) => sum + val, 0);
  }
}

module.exports = MainNavigationStrategy;