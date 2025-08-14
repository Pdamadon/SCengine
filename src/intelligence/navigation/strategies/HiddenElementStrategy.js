/**
 * HiddenElementStrategy.js
 * 
 * Discovers navigation elements that are present in the DOM but hidden
 * Finds elements with display:none, visibility:hidden, opacity:0, or off-screen
 * Makes them temporarily visible to extract structure
 */

const NavigationStrategy = require('../NavigationStrategy');

class HiddenElementStrategy extends NavigationStrategy {
  constructor(logger, options = {}) {
    super(logger, options);
    this.name = 'HiddenElementStrategy';
  }

  /**
   * Execute strategy - find hidden navigation elements
   */
  async execute(page) {
    return await this.measureExecution(async () => {
      try {
        // Find and analyze hidden navigation elements
        const hiddenNavigation = await page.evaluate(() => {
          const items = [];
          const analyzedElements = new Set();

          // Helper to generate selector
          const generateSelector = (element) => {
            if (element.id) return `#${element.id}`;
            if (element.className) {
              const classes = element.className.split(' ').filter(c => c.trim());
              if (classes.length > 0) return `.${classes[0]}`;
            }
            if (element.getAttribute('data-testid')) {
              return `[data-testid="${element.getAttribute('data-testid')}"]`;
            }
            return element.tagName.toLowerCase();
          };

          // Check if element is hidden
          const isHidden = (element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            
            return {
              isHidden: style.display === 'none' || 
                       style.visibility === 'hidden' || 
                       parseFloat(style.opacity) === 0 ||
                       rect.width === 0 ||
                       rect.height === 0 ||
                       rect.right < 0 ||
                       rect.bottom < 0 ||
                       rect.left > window.innerWidth ||
                       rect.top > window.innerHeight,
              hiddenBy: {
                display: style.display === 'none',
                visibility: style.visibility === 'hidden',
                opacity: parseFloat(style.opacity) === 0,
                zeroSize: rect.width === 0 || rect.height === 0,
                offScreen: rect.right < 0 || rect.left > window.innerWidth
              },
              style: {
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                position: style.position
              }
            };
          };

          // Temporarily make element visible to analyze
          const makeVisible = (element) => {
            const originalStyles = {
              display: element.style.display,
              visibility: element.style.visibility,
              opacity: element.style.opacity,
              position: element.style.position,
              left: element.style.left,
              top: element.style.top
            };

            element.style.display = 'block';
            element.style.visibility = 'visible';
            element.style.opacity = '1';
            if (element.style.position === 'absolute' || element.style.position === 'fixed') {
              element.style.left = '0';
              element.style.top = '0';
            }

            return originalStyles;
          };

          // Restore original styles
          const restoreStyles = (element, originalStyles) => {
            Object.keys(originalStyles).forEach(prop => {
              element.style[prop] = originalStyles[prop];
            });
          };

          // Find navigation-related containers that might be hidden
          const navSelectors = [
            // Common navigation containers
            'nav', '[role="navigation"]', '.navigation', '.nav',
            '.menu', '.navbar', '.header-nav', '.main-nav',
            
            // Dropdown and mega-menu containers
            '.dropdown', '.mega-menu', '.megamenu', '.submenu',
            '[class*="dropdown"]', '[class*="mega"]', '[class*="menu"]',
            
            // Mobile navigation
            '.mobile-nav', '.mobile-menu', '.hamburger-menu',
            '.off-canvas', '.side-menu', '.slide-menu',
            
            // Hover/click activated menus
            '[class*="hover"]', '[class*="expand"]', '[class*="collapse"]',
            
            // Data attribute based
            '[data-menu]', '[data-nav]', '[data-dropdown]'
          ];

          navSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            
            elements.forEach(element => {
              // Skip if already analyzed
              if (analyzedElements.has(element)) return;
              analyzedElements.add(element);

              const hiddenStatus = isHidden(element);
              
              if (hiddenStatus.isHidden) {
                // Temporarily make visible to extract content
                const originalStyles = makeVisible(element);
                
                try {
                  // Extract navigation links
                  const links = element.querySelectorAll('a');
                  const navigationItems = [];
                  
                  links.forEach(link => {
                    const text = link.textContent.trim();
                    const href = link.href;
                    
                    if (text && href && !href.includes('javascript:')) {
                      // Skip social and footer links
                      const skipPatterns = ['facebook', 'twitter', 'instagram', 
                                           'privacy', 'terms', 'copyright'];
                      if (!skipPatterns.some(p => text.toLowerCase().includes(p))) {
                        navigationItems.push({
                          text: text,
                          url: href,
                          selector: generateSelector(link)
                        });
                      }
                    }
                  });

                  if (navigationItems.length > 0) {
                    items.push({
                      type: 'hidden_navigation',
                      containerSelector: generateSelector(element),
                      hiddenBy: hiddenStatus.hiddenBy,
                      originalStyles: hiddenStatus.style,
                      items: navigationItems,
                      itemCount: navigationItems.length,
                      isDropdown: selector.includes('dropdown') || selector.includes('menu'),
                      isMobile: selector.includes('mobile') || selector.includes('hamburger'),
                      element_type: element.tagName.toLowerCase(),
                      classes: element.className,
                      attributes: {
                        'data-testid': element.getAttribute('data-testid'),
                        'aria-label': element.getAttribute('aria-label'),
                        'role': element.getAttribute('role')
                      }
                    });
                  }
                } finally {
                  // Restore original styles
                  restoreStyles(element, originalStyles);
                }
              }
            });
          });

          // Also check for elements that are specifically marked as expandable
          const expandableSelectors = [
            '[aria-expanded="false"]',
            '[data-expanded="false"]',
            '[data-toggle="dropdown"]',
            '.collapsed',
            '.closed'
          ];

          expandableSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            
            elements.forEach(element => {
              if (analyzedElements.has(element)) return;
              analyzedElements.add(element);

              // Look for associated content
              const targetId = element.getAttribute('aria-controls') || 
                             element.getAttribute('data-target') ||
                             element.getAttribute('href');
              
              let targetElement = null;
              if (targetId) {
                if (targetId.startsWith('#')) {
                  targetElement = document.querySelector(targetId);
                } else {
                  targetElement = document.getElementById(targetId);
                }
              }

              // Check next sibling as fallback
              if (!targetElement) {
                targetElement = element.nextElementSibling;
              }

              if (targetElement && isHidden(targetElement).isHidden) {
                const originalStyles = makeVisible(targetElement);
                
                try {
                  const links = targetElement.querySelectorAll('a');
                  const expandableItems = [];
                  
                  links.forEach(link => {
                    const text = link.textContent.trim();
                    if (text && link.href) {
                      expandableItems.push({
                        text: text,
                        url: link.href,
                        selector: generateSelector(link)
                      });
                    }
                  });

                  if (expandableItems.length > 0) {
                    items.push({
                      type: 'expandable_menu',
                      trigger: {
                        text: element.textContent.trim(),
                        selector: generateSelector(element)
                      },
                      containerSelector: generateSelector(targetElement),
                      items: expandableItems,
                      itemCount: expandableItems.length,
                      element_type: targetElement.tagName.toLowerCase()
                    });
                  }
                } finally {
                  restoreStyles(targetElement, originalStyles);
                }
              }
            });
          });

          return {
            items: items,
            metadata: {
              totalHiddenContainers: items.length,
              totalHiddenLinks: items.reduce((sum, item) => sum + (item.itemCount || 0), 0),
              hiddenTypes: {
                dropdown: items.filter(i => i.isDropdown).length,
                mobile: items.filter(i => i.isMobile).length,
                expandable: items.filter(i => i.type === 'expandable_menu').length
              }
            }
          };
        });

        // Process and format results
        const processedItems = this.processHiddenNavigation(hiddenNavigation.items);
        const confidence = this.calculateStrategyConfidence(processedItems, hiddenNavigation.metadata);

        this.logResults(processedItems, confidence, this.performanceMetrics.executionTime);

        return {
          items: processedItems,
          confidence: confidence,
          metadata: {
            ...hiddenNavigation.metadata,
            strategy: this.name
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
   * Process hidden navigation into standard format
   */
  processHiddenNavigation(hiddenContainers) {
    const items = [];

    hiddenContainers.forEach(container => {
      // Add container as a navigation section if it has multiple items
      if (container.items && container.items.length > 0) {
        // If it's a dropdown or expandable menu, add it as such
        if (container.isDropdown || container.type === 'expandable_menu') {
          items.push({
            type: 'dropdown',
            isDropdown: true,
            selector: container.containerSelector,
            trigger_selector: container.trigger?.selector,
            items: container.items,
            has_dropdown: true,
            is_visible: false,
            hidden_type: container.hiddenBy || 'expandable',
            element_type: container.element_type
          });
        }
        
        // Add individual items as well for better discovery
        container.items.forEach(item => {
          items.push({
            ...item,
            name: item.text,
            type: container.isMobile ? 'mobile_nav' : 'hidden_nav',
            is_visible: false,
            parent_container: container.containerSelector,
            element_type: 'a'
          });
        });
      }
    });

    return this.deduplicateItems(items);
  }

  /**
   * Calculate confidence for hidden element discovery
   */
  calculateStrategyConfidence(items, metadata) {
    let confidence = 0.3; // Base confidence for hidden elements

    // Higher confidence if we found many hidden containers
    if (metadata.totalHiddenContainers > 5) confidence += 0.3;
    else if (metadata.totalHiddenContainers > 2) confidence += 0.2;
    else if (metadata.totalHiddenContainers > 0) confidence += 0.1;

    // Higher confidence if we found many hidden links
    if (metadata.totalHiddenLinks > 20) confidence += 0.2;
    else if (metadata.totalHiddenLinks > 10) confidence += 0.1;

    // Bonus for finding dropdowns (very common pattern)
    if (metadata.hiddenTypes.dropdown > 0) confidence += 0.1;

    // Bonus for finding mobile navigation
    if (metadata.hiddenTypes.mobile > 0) confidence += 0.1;

    return Math.max(0.1, Math.min(1, confidence));
  }
}

module.exports = HiddenElementStrategy;