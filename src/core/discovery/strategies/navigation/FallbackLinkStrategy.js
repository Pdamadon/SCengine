/**
 * FallbackLinkStrategy - Fast, non-interactive navigation link collection
 *
 * Merges the best features from link collection strategies:
 * - VisibleNavigationStrategy: Visible link collection
 * - ComprehensiveLinkStrategy: All navigation links
 * - HiddenElementStrategy: Hidden navigation discovery
 *
 * This is the FALLBACK strategy when EnhancedMegaMenuStrategy fails.
 * No interaction = no bot detection risk = fast and safe.
 */

const NavigationStrategy = require('./NavigationStrategy');

class FallbackLinkStrategy extends NavigationStrategy {
  constructor(logger, options = {}) {
    super(logger, options);
    this.name = 'FallbackLinkStrategy';
    this.description = 'Non-interactive comprehensive link collection';

    this.config = {
      includeHidden: options.includeHidden !== false,
      maxLinks: options.maxLinks || 500,
      ...options,
    };
  }

  /**
   * Main execution - collect all navigation links without interaction
   */
  async execute(page) {
    return await this.measureExecution(async () => {
      try {
        this.logger.info('🔗 Executing fallback link collection strategy');

        // Wait for navigation elements to be present
        await this.waitForNavigation(page, 3000);

        // Collect all navigation links
        const navigationData = await this.collectAllNavigationLinks(page);

        // Process and deduplicate
        const processedItems = this.processNavigationItems(navigationData.items);
        const confidence = this.calculateConfidence(processedItems, navigationData.metadata);

        this.logger.info(`✅ Collected ${processedItems.length} navigation links`);

        return {
          items: processedItems,
          confidence: confidence,
          metadata: {
            ...navigationData.metadata,
            strategy: this.name,
            itemCount: processedItems.length,
          },
        };

      } catch (error) {
        this.logger.error(`Fallback strategy failed: ${error.message}`);
        return {
          items: [],
          confidence: 0,
          metadata: {
            error: error.message,
            strategy: this.name,
          },
        };
      }
    });
  }

  /**
   * Collect all navigation links from the page
   */
  async collectAllNavigationLinks(page) {
    return await page.evaluate((config) => {
      const items = [];
      const processed = new Set();

      // Helper functions
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 &&
               style.display !== 'none' && style.visibility !== 'hidden';
      };

      const isHidden = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display === 'none' ||
               style.visibility === 'hidden' ||
               parseFloat(style.opacity) === 0 ||
               rect.width === 0 || rect.height === 0;
      };

      const generateSelector = (element) => {
        if (element.id) {return `#${element.id}`;}
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {return `.${classes[0]}`;}
        }
        if (element.getAttribute('data-testid')) {
          return `[data-testid="${element.getAttribute('data-testid')}"]`;
        }
        return element.tagName.toLowerCase();
      };

      const shouldSkipLink = (text, url) => {
        if (!text || !url) {return true;}

        const skipPatterns = [
          // Account/utility
          'sign in', 'sign up', 'login', 'logout',
          'cart', 'bag', 'basket', 'checkout',
          'account', 'profile', 'my account',
          'wishlist', 'favorites',
          // Support
          'help', 'support', 'contact', 'customer service',
          'store locator', 'find a store',
          // Social media
          'facebook', 'twitter', 'instagram', 'youtube',
          'pinterest', 'tiktok', 'snapchat',
          // Legal
          'privacy', 'terms', 'cookie', 'legal', 'copyright',
          'accessibility', 'sitemap',
        ];

        const lowerText = text.toLowerCase();
        return skipPatterns.some(pattern => lowerText.includes(pattern)) ||
               url.includes('javascript:') ||
               url.includes('mailto:') ||
               url.includes('#');
      };

      // Comprehensive selectors for navigation areas and links
      const navigationSelectors = [
        // Navigation containers with links
        'nav a', 'header a', '[role="navigation"] a',
        '.navigation a', '.nav a', '.menu a',
        '.navbar a', '.main-nav a', '.primary-nav a',
        '.header-nav a', '.site-nav a', '.global-nav a',
        '#mainNavigation a', '#navigation a',

        // Class patterns
        '[class*="nav"] a', '[class*="menu"] a',
        '[class*="Nav"] a', '[class*="Menu"] a',
        '.nav-item a', '.menu-item a', '.nav-link',

        // Data attributes
        '[data-nav] a', '[data-menu] a',
        '[data-testid*="nav"] a', '[data-testid*="menu"] a',

        // ARIA
        '[aria-label*="navigation"] a', '[aria-label*="menu"] a',
        '[role="menuitem"]', '[role="link"]',

        // URL pattern based
        'a[href*="/shop/"]', 'a[href*="/browse/"]',
        'a[href*="/category/"]', 'a[href*="/collection/"]',
        'a[href*="/department/"]', 'a[href*="/products/"]',

        // Specific retailer patterns
        'a[id*="department"]', 'a[class*="department"]',
        'a[href*="/c/"]', 'a[href*="/cat/"]',
      ];

      // Collect visible navigation links
      navigationSelectors.forEach(selector => {
        try {
          const links = document.querySelectorAll(selector);
          links.forEach(link => {
            const text = link.textContent.trim();
            const url = link.href;

            // Skip if already processed or should skip
            if (processed.has(url) || shouldSkipLink(text, url)) {return;}
            processed.add(url);

            // Determine visibility
            const visible = isVisible(link);
            const hidden = !visible && isHidden(link);

            // Skip completely invisible items unless includeHidden is true
            if (!visible && !hidden) {return;}
            if (hidden && !config.includeHidden) {return;}

            items.push({
              text: text,
              name: text,
              url: url,
              selector: generateSelector(link),
              is_visible: visible,
              is_hidden: hidden,
              type: 'navigation',
              element_type: 'a',
              discovered_via: selector,
              parent_container: link.closest('nav, header, [role="navigation"]') ?
                generateSelector(link.closest('nav, header, [role="navigation"]')) : null,
            });
          });
        } catch (e) {
          // Skip invalid selectors
        }
      });

      // If includeHidden is true, also process hidden containers
      if (config.includeHidden) {
        const hiddenContainers = [
          '.dropdown:not(:visible)', '.mega-menu:not(:visible)',
          '.submenu:not(:visible)', '[class*="menu"][style*="none"]',
          '.mobile-nav', '.mobile-menu', '.off-canvas',
        ];

        hiddenContainers.forEach(selector => {
          try {
            const containers = document.querySelectorAll(selector);
            containers.forEach(container => {
              if (!isHidden(container)) {return;}

              const links = container.querySelectorAll('a');
              links.forEach(link => {
                const text = link.textContent.trim();
                const url = link.href;

                if (processed.has(url) || shouldSkipLink(text, url)) {return;}
                processed.add(url);

                items.push({
                  text: text,
                  name: text,
                  url: url,
                  selector: generateSelector(link),
                  is_visible: false,
                  is_hidden: true,
                  type: 'hidden_navigation',
                  element_type: 'a',
                  discovered_via: selector,
                  parent_container: generateSelector(container),
                });
              });
            });
          } catch (e) {
            // Skip invalid selectors
          }
        });
      }

      // Also collect navigation items with specific patterns (departments, categories)
      const departmentPatterns = [
        'Women', 'Men', 'Girls', 'Boys', 'Baby', 'Kids', 'Toddler',
        'Home', 'Beauty', 'Shoes', 'Jewelry', 'Handbags', 'Accessories',
        'Electronics', 'Furniture', 'Sports', 'Toys', 'Books',
        'Clothing', 'Apparel', 'Fashion',
      ];

      // Prioritize items that match department patterns
      items.forEach(item => {
        const matchesDepartment = departmentPatterns.some(dept =>
          item.text.toLowerCase().includes(dept.toLowerCase()),
        );
        if (matchesDepartment) {
          item.type = 'main_section';
          item.is_department = true;
        }
      });

      // Sort with departments first
      items.sort((a, b) => {
        if (a.is_department && !b.is_department) {return -1;}
        if (!a.is_department && b.is_department) {return 1;}
        if (a.is_visible && !b.is_visible) {return -1;}
        if (!a.is_visible && b.is_visible) {return 1;}
        return 0;
      });

      return {
        items: items.slice(0, config.maxLinks),
        metadata: {
          totalLinksFound: items.length,
          visibleLinks: items.filter(i => i.is_visible).length,
          hiddenLinks: items.filter(i => i.is_hidden).length,
          departmentLinks: items.filter(i => i.is_department).length,
          uniqueUrls: processed.size,
          timestamp: new Date().toISOString(),
        },
      };

    }, this.config);
  }

  /**
   * Process navigation items
   */
  processNavigationItems(items) {
    // Deduplicate by URL
    const seen = new Set();
    const processed = items.filter(item => {
      if (seen.has(item.url)) {return false;}
      seen.add(item.url);
      return true;
    });

    // Ensure consistent format
    return processed.map(item => ({
      ...item,
      name: item.name || item.text,
      type: item.type || 'navigation',
      element_type: item.element_type || 'a',
      has_dropdown: false, // No interaction means we don't know
      discovered_via: 'fallback_collection',
    }));
  }

  /**
   * Calculate confidence
   */
  calculateConfidence(items, metadata) {
    let confidence = 0.3; // Base confidence for fallback

    // More items = higher confidence
    if (items.length > 100) {confidence += 0.3;}
    else if (items.length > 50) {confidence += 0.2;}
    else if (items.length > 20) {confidence += 0.1;}
    else if (items.length < 5) {confidence -= 0.1;}

    // Department links are good indicators
    if (metadata.departmentLinks > 5) {confidence += 0.2;}
    else if (metadata.departmentLinks > 2) {confidence += 0.1;}

    // Mix of visible and hidden is good
    if (metadata.visibleLinks > 0 && metadata.hiddenLinks > 0) {
      confidence += 0.1;
    }

    return Math.max(0.1, Math.min(0.8, confidence)); // Cap at 0.8 for fallback
  }
}

module.exports = FallbackLinkStrategy;
