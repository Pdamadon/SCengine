/**
 * VisibleNavigationStrategy.js
 * 
 * Finds immediately visible navigation elements on the page
 * This is the current NavigationMapper logic extracted as a strategy
 * Serves as the baseline/fallback strategy
 */

const NavigationStrategy = require('../NavigationStrategy');

class VisibleNavigationStrategy extends NavigationStrategy {
  constructor(logger, options = {}) {
    super(logger, options);
    this.name = 'VisibleNavigationStrategy';
  }

  /**
   * Execute strategy - find visible navigation elements
   */
  async execute(page) {
    return await this.measureExecution(async () => {
      try {
        // Wait for navigation to be ready
        await this.waitForNavigation(page, 3000);

        // Extract visible navigation using current NavigationMapper logic
        const navigationData = await page.evaluate(() => {
          const items = [];
          
          // Helper function to generate reliable CSS selector
          const generateSelector = (element) => {
            if (element.id) return `#${element.id}`;

            if (element.className) {
              const classes = element.className.split(' ').filter(c => c.trim());
              if (classes.length > 0) return `.${classes[0]}`;
            }

            if (element.getAttribute('data-testid')) {
              return `[data-testid="${element.getAttribute('data-testid')}"]`;
            }

            // Generate path-based selector as fallback
            const path = [];
            let current = element;
            while (current && current !== document.body) {
              let selector = current.tagName.toLowerCase();
              if (current.className) {
                const firstClass = current.className.split(' ')[0];
                if (firstClass) selector += `.${firstClass}`;
              }
              path.unshift(selector);
              current = current.parentElement;
              if (path.length > 4) break; // Limit depth
            }

            return path.join(' > ');
          };

          // Check if element is visible
          const isVisible = (element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            
            return rect.width > 0 && 
                   rect.height > 0 && 
                   style.display !== 'none' && 
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0';
          };

          // Check if element likely has dropdown
          const hasDropdownMenu = (element) => {
            const parent = element.closest('li, .nav-item, .menu-item');
            if (parent) {
              return !!(parent.querySelector('.dropdown, .submenu, .mega-menu') ||
                       parent.querySelector('[data-dropdown]') ||
                       parent.querySelector('[class*="dropdown"]'));
            }
            return false;
          };

          // Extract main navigation sections
          const mainNavSelectors = [
            'nav',
            '.main-nav',
            '.primary-nav',
            '.header-nav',
            '.navigation',
            '.main-menu',
            '[role="navigation"]',
            '.navbar',
            'header nav'
          ];

          let navFound = false;
          
          for (const selector of mainNavSelectors) {
            const navElement = document.querySelector(selector);
            if (navElement && isVisible(navElement)) {
              navFound = true;
              
              // Find main section links
              const sectionLinks = navElement.querySelectorAll('a');
              sectionLinks.forEach(link => {
                if (link.textContent.trim() && link.href && isVisible(link)) {
                  const text = link.textContent.trim();
                  
                  // Skip social media and footer-type links
                  const skipPatterns = ['facebook', 'twitter', 'instagram', 'youtube', 
                                       'privacy', 'terms', 'cookie', 'legal'];
                  if (skipPatterns.some(p => text.toLowerCase().includes(p))) {
                    return;
                  }

                  items.push({
                    text: text,
                    name: text,
                    url: link.href,
                    selector: generateSelector(link),
                    has_dropdown: hasDropdownMenu(link),
                    element_type: 'a',
                    is_visible: true,
                    type: 'main_section',
                    nav_container: selector,
                    attributes: {
                      'data-testid': link.getAttribute('data-testid'),
                      'aria-label': link.getAttribute('aria-label'),
                      'role': link.getAttribute('role')
                    }
                  });
                }
              });
              
              // Don't break - check all nav containers
            }
          }

          // Also look for dropdown menus that are visible
          const dropdownSelectors = [
            '.dropdown:not([style*="none"])',
            '.mega-menu:not([style*="none"])',
            '.submenu:not([style*="none"])',
            '[data-dropdown]:not([style*="none"])'
          ];

          dropdownSelectors.forEach(selector => {
            const dropdowns = document.querySelectorAll(selector);
            dropdowns.forEach((dropdown, index) => {
              if (isVisible(dropdown)) {
                const dropdownItems = [];
                const links = dropdown.querySelectorAll('a');
                
                links.forEach(link => {
                  if (link.textContent.trim() && link.href) {
                    dropdownItems.push({
                      text: link.textContent.trim(),
                      url: link.href,
                      selector: generateSelector(link)
                    });
                  }
                });

                if (dropdownItems.length > 0) {
                  items.push({
                    type: 'dropdown',
                    isDropdown: true,
                    selector: generateSelector(dropdown),
                    items: dropdownItems,
                    is_visible: true
                  });
                }
              }
            });
          });

          // Look for sidebar navigation
          const sidebarSelectors = [
            '.sidebar:not([style*="none"])',
            '.category-nav:not([style*="none"])',
            '.filters:not([style*="none"])',
            '.left-nav:not([style*="none"])'
          ];

          sidebarSelectors.forEach(selector => {
            const sidebar = document.querySelector(selector);
            if (sidebar && isVisible(sidebar)) {
              const sidebarLinks = sidebar.querySelectorAll('a');
              sidebarLinks.forEach(link => {
                if (link.textContent.trim() && link.href && isVisible(link)) {
                  items.push({
                    text: link.textContent.trim(),
                    name: link.textContent.trim(),
                    url: link.href,
                    selector: generateSelector(link),
                    type: 'sidebar',
                    is_visible: true,
                    element_type: 'a'
                  });
                }
              });
            }
          });

          // Look for breadcrumbs
          const breadcrumbSelectors = [
            '.breadcrumb',
            '.breadcrumbs',
            '[aria-label="breadcrumb"]'
          ];

          breadcrumbSelectors.forEach(selector => {
            const breadcrumb = document.querySelector(selector);
            if (breadcrumb && isVisible(breadcrumb)) {
              const breadcrumbItems = [];
              const items = breadcrumb.querySelectorAll('a, span');
              
              items.forEach(item => {
                if (item.textContent.trim() && isVisible(item)) {
                  breadcrumbItems.push({
                    text: item.textContent.trim(),
                    url: item.href || null,
                    selector: generateSelector(item)
                  });
                }
              });

              if (breadcrumbItems.length > 0) {
                items.push({
                  type: 'breadcrumb',
                  selector: selector,
                  items: breadcrumbItems,
                  is_visible: true
                });
              }
            }
          });

          return {
            items: items,
            metadata: {
              navFound: navFound,
              documentReady: document.readyState === 'complete',
              timestamp: new Date().toISOString()
            }
          };
        });

        // Process and format results
        const processedItems = this.processNavigationItems(navigationData.items);
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
   * Process navigation items to ensure consistent format
   */
  processNavigationItems(items) {
    return items
      .map(item => this.formatNavigationItem(item))
      .filter(item => this.isValidNavigationItem(item));
  }

  /**
   * Validate navigation item
   */
  isValidNavigationItem(item) {
    // Must have text/name and either URL or selector
    return (item.text || item.name) && (item.url || item.selector);
  }

  /**
   * Calculate confidence for this strategy
   */
  calculateStrategyConfidence(items, metadata) {
    let confidence = 0.5; // Base confidence for visible elements

    // Higher confidence if we found navigation container
    if (metadata.navFound) confidence += 0.2;

    // Higher confidence if document is ready
    if (metadata.documentReady) confidence += 0.1;

    // Adjust based on number of items found
    if (items.length > 10) confidence += 0.2;
    else if (items.length > 5) confidence += 0.1;
    else if (items.length < 3) confidence -= 0.2;

    // Check for expected navigation patterns
    const hasMainSections = items.some(i => i.type === 'main_section');
    const hasDropdowns = items.some(i => i.type === 'dropdown' || i.has_dropdown);
    
    if (hasMainSections) confidence += 0.1;
    if (hasDropdowns) confidence += 0.1;

    return Math.max(0.1, Math.min(1, confidence));
  }
}

module.exports = VisibleNavigationStrategy;