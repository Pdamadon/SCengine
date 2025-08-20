/**
 * SectorTemplateStrategy - Uses sector-specific templates for navigation discovery
 * 
 * This strategy leverages the sector templates (clothing, hardware, etc.) to use
 * domain-specific selectors and patterns for navigation discovery.
 * Particularly useful for Shopify stores and sites that don't work with mega-menu hovers.
 */

const NavigationStrategy = require('./NavigationStrategy');
const { SectorTemplates, getTemplate } = require('../../../config/sector-templates');

class SectorTemplateStrategy extends NavigationStrategy {
  constructor(logger, options = {}) {
    super(logger, options);
    this.name = 'SectorTemplateStrategy';
    this.description = 'Uses sector-specific templates for navigation discovery';
    
    this.config = {
      sector: options.sector || 'clothing', // Default to clothing sector
      maxLinks: options.maxLinks || 200,
      includeProducts: options.includeProducts !== false,
      ...options
    };
  }

  /**
   * Main execution method
   */
  async execute(page) {
    return await this.measureExecution(async () => {
      try {
        const url = page.url();
        const domain = new URL(url).hostname;
        
        this.logger.info(`🎯 Sector template navigation discovery for ${domain} (${this.config.sector} sector)`);

        // Get sector template
        const template = getTemplate(this.config.sector);
        
        // Wait for navigation elements
        await this.waitForNavigation(page, 3000);
        
        // Extract navigation using sector-specific patterns
        const navigationData = await this.extractSectorNavigation(page, template);
        
        // Process and categorize items
        const processedItems = this.processNavigationItems(navigationData.items, template);
        const confidence = this.calculateConfidence(processedItems, navigationData.metadata);
        
        this.logger.info(`✅ Sector template discovery found ${processedItems.length} navigation items`);
        
        return {
          items: processedItems,
          confidence: confidence,
          metadata: {
            ...navigationData.metadata,
            strategy: this.name,
            sector: this.config.sector,
            template: template.name,
            itemCount: processedItems.length
          }
        };
        
      } catch (error) {
        this.logger.error(`Sector template strategy failed: ${error.message}`);
        return {
          items: [],
          confidence: 0,
          metadata: {
            error: error.message,
            strategy: this.name,
            sector: this.config.sector
          }
        };
      }
    });
  }

  /**
   * Extract navigation using sector-specific patterns
   */
  async extractSectorNavigation(page, template) {
    return await page.evaluate((params) => {
      const { template: sectorConfig, includeProducts } = params;
      const items = [];
      const processed = new Set();
      
      // Helper functions
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 &&
               style.display !== 'none' && style.visibility !== 'hidden';
      };

      const generateSelector = (element) => {
        if (element.id) return `#${element.id}`;
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) return `.${classes[0]}`;
        }
        return element.tagName.toLowerCase();
      };

      const shouldSkipLink = (text, url) => {
        if (!text || !url) return true;

        const skipPatterns = [
          // Account/utility
          'sign in', 'sign up', 'login', 'logout', 'account', 'profile',
          'cart', 'bag', 'basket', 'checkout', 'wishlist', 'favorites',
          // Support/info
          'help', 'support', 'contact', 'about', 'careers', 'investors',
          'store locator', 'find a store', 'shipping', 'returns',
          // Social/legal
          'facebook', 'twitter', 'instagram', 'youtube', 'pinterest',
          'privacy', 'terms', 'cookie', 'legal', 'accessibility', 'sitemap'
        ];

        const lowerText = text.toLowerCase();
        return skipPatterns.some(pattern => lowerText.includes(pattern)) ||
               url.includes('javascript:') || url.includes('mailto:') ||
               url.startsWith('#') || url.includes('tel:');
      };

      const getItemType = (text, url) => {
        // Check if it's a main category (department)
        const departmentPatterns = [
          'women', 'men', 'girls', 'boys', 'baby', 'kids', 'toddler',
          'clothing', 'apparel', 'fashion', 'man', 'woman',
          'home', 'beauty', 'shoes', 'jewelry', 'handbags', 'accessories',
          'electronics', 'furniture', 'sports', 'toys', 'books',
          'bath', 'body', 'greenhouse', 'seattle' // glasswingshop specific
        ];

        const lowerText = text.toLowerCase();
        const isDepartment = departmentPatterns.some(dept => 
          lowerText.includes(dept) || dept.includes(lowerText)
        );

        // Check if it looks like a product based on URL patterns
        if (includeProducts) {
          const isProduct = sectorConfig.productUrlPatterns.some(pattern => 
            url.includes(pattern)
          );
          if (isProduct) return 'product';
        }

        // Check if it looks like a category based on URL patterns
        const isCategory = sectorConfig.categoryUrlPatterns.some(pattern => 
          url.includes(pattern)
        );

        if (isDepartment) return 'main_department';
        if (isCategory) return 'category';
        return 'navigation';
      };

      // Navigation selectors - comprehensive list for all types of nav
      const navigationSelectors = [
        // Primary navigation containers
        'nav a', 'header nav a', '[role="navigation"] a',
        '.navigation a', '.nav a', '.menu a', '.navbar a',
        '.main-nav a', '.primary-nav a', '.header-nav a',
        '.site-nav a', '.global-nav a', '#navigation a',
        
        // Shopify specific patterns (for glasswingshop.com)
        '.site-nav__link', '.nav-bar__link', '.header__nav-item a',
        '.menu__item a', '.nav-item a', '.header-menu a',
        
        // Class pattern searches
        '[class*="nav"] a', '[class*="menu"] a', '[class*="Nav"] a',
        '.nav-item a', '.menu-item a', '.nav-link',
        
        // Data attributes
        '[data-nav] a', '[data-menu] a', '[data-navigation] a',
        '[data-testid*="nav"] a', '[data-testid*="menu"] a',
        
        // ARIA patterns
        '[aria-label*="navigation"] a', '[aria-label*="menu"] a',
        '[role="menuitem"]', '[role="link"]',
        
        // URL pattern based (using sector template patterns)
        ...sectorConfig.categoryUrlPatterns.map(pattern => `a[href*="${pattern}"]`),
        
        // Dropdown/mega-menu content (visible only)
        '.dropdown a', '.submenu a', '.mega-menu a',
        '.dropdown-content a', '.submenu-content a'
      ];

      // Extract navigation links
      navigationSelectors.forEach(selector => {
        try {
          const links = document.querySelectorAll(selector);
          links.forEach(link => {
            const text = link.textContent?.trim();
            const url = link.href;

            if (processed.has(url) || shouldSkipLink(text, url)) return;
            processed.add(url);

            // Determine if element is visible
            const visible = isVisible(link);
            if (!visible) return; // Only include visible items for this strategy

            const itemType = getItemType(text, url);

            items.push({
              text: text,
              name: text,
              url: url,
              selector: generateSelector(link),
              is_visible: visible,
              type: itemType,
              element_type: 'a',
              discovered_via: selector,
              parent_container: link.closest('nav, header, [role="navigation"]') ?
                generateSelector(link.closest('nav, header, [role="navigation"]')) : null,
              is_department: itemType === 'main_department',
              is_category: itemType === 'category',
              is_product: itemType === 'product'
            });
          });
        } catch (e) {
          // Skip invalid selectors
        }
      });

      // Sort with departments first, then categories, then other nav
      items.sort((a, b) => {
        if (a.is_department && !b.is_department) return -1;
        if (!a.is_department && b.is_department) return 1;
        if (a.is_category && !b.is_category) return -1;
        if (!a.is_category && b.is_category) return 1;
        return 0;
      });

      return {
        items: items.slice(0, 200), // Limit to prevent overwhelming results
        metadata: {
          totalLinksFound: items.length,
          departmentLinks: items.filter(i => i.is_department).length,
          categoryLinks: items.filter(i => i.is_category).length,
          productLinks: items.filter(i => i.is_product).length,
          navigationLinks: items.filter(i => i.type === 'navigation').length,
          uniqueUrls: processed.size,
          timestamp: new Date().toISOString()
        }
      };

    }, { template, includeProducts: this.config.includeProducts });
  }

  /**
   * Process navigation items with sector-specific logic
   */
  processNavigationItems(items, template) {
    // Deduplicate by URL
    const seen = new Set();
    const processed = items.filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });

    // Apply sector-specific validation rules if available
    if (template.validationRules) {
      return processed.filter(item => {
        // Apply any validation rules from the sector template
        return true; // For now, keep all items
      });
    }

    return processed;
  }

  /**
   * Calculate confidence based on sector template expectations
   */
  calculateConfidence(items, metadata) {
    let confidence = 0.4; // Base confidence for template strategy

    // Department links are strong indicators
    if (metadata.departmentLinks > 5) confidence += 0.3;
    else if (metadata.departmentLinks > 2) confidence += 0.2;
    else if (metadata.departmentLinks > 0) confidence += 0.1;

    // Category links add confidence
    if (metadata.categoryLinks > 10) confidence += 0.2;
    else if (metadata.categoryLinks > 5) confidence += 0.1;

    // Total navigation items
    if (items.length > 50) confidence += 0.2;
    else if (items.length > 20) confidence += 0.1;
    else if (items.length < 5) confidence -= 0.2;

    return Math.max(0.1, Math.min(0.9, confidence));
  }

  /**
   * Wait for navigation elements to be present
   */
  async waitForNavigation(page, timeout = 5000) {
    try {
      await page.waitForSelector('nav, header, [role="navigation"]', { 
        timeout,
        state: 'visible'
      });
      await page.waitForTimeout(1000); // Additional settling time
    } catch (error) {
      this.logger.debug(`Navigation wait timeout: ${error.message}`);
    }
  }
}

module.exports = SectorTemplateStrategy;