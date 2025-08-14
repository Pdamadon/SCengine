/**
 * AriaNavigationStrategy.js
 * 
 * Discovers navigation using ARIA (Accessible Rich Internet Applications) attributes
 * ARIA attributes are often the most reliable way to find navigation
 * Looks for role="navigation", aria-label, aria-expanded, aria-haspopup, etc.
 */

const NavigationStrategy = require('../NavigationStrategy');

class AriaNavigationStrategy extends NavigationStrategy {
  constructor(logger, options = {}) {
    super(logger, options);
    this.name = 'AriaNavigationStrategy';
  }

  /**
   * Execute strategy - find navigation via ARIA attributes
   */
  async execute(page) {
    return await this.measureExecution(async () => {
      try {
        // Find elements with ARIA navigation attributes
        const ariaNavigation = await page.evaluate(() => {
          const items = [];
          const processedElements = new Set();

          // Helper to generate selector
          const generateSelector = (element) => {
            // Prefer ARIA attributes for selector
            if (element.getAttribute('aria-label')) {
              return `[aria-label="${element.getAttribute('aria-label')}"]`;
            }
            if (element.getAttribute('aria-labelledby')) {
              return `[aria-labelledby="${element.getAttribute('aria-labelledby')}"]`;
            }
            if (element.id) return `#${element.id}`;
            if (element.className) {
              const classes = element.className.split(' ').filter(c => c.trim());
              if (classes.length > 0) return `.${classes[0]}`;
            }
            return element.tagName.toLowerCase();
          };

          // Extract all ARIA attributes from an element
          const getAriaAttributes = (element) => {
            const ariaAttrs = {};
            Array.from(element.attributes).forEach(attr => {
              if (attr.name.startsWith('aria-')) {
                ariaAttrs[attr.name] = attr.value;
              }
            });
            return ariaAttrs;
          };

          // Check if element is visible
          const isVisible = (element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && 
                   rect.height > 0 && 
                   style.display !== 'none' && 
                   style.visibility !== 'hidden';
          };

          // 1. Find elements with role="navigation"
          const navElements = document.querySelectorAll('[role="navigation"]');
          navElements.forEach(nav => {
            if (processedElements.has(nav)) return;
            processedElements.add(nav);

            const links = nav.querySelectorAll('a');
            const navItems = [];
            
            links.forEach(link => {
              const text = link.textContent.trim();
              if (text && link.href && !link.href.includes('javascript:')) {
                // Skip non-navigation links
                const skipPatterns = ['privacy', 'terms', 'cookie', 'facebook', 'twitter'];
                if (!skipPatterns.some(p => text.toLowerCase().includes(p))) {
                  navItems.push({
                    text: text,
                    url: link.href,
                    selector: generateSelector(link),
                    ariaAttributes: getAriaAttributes(link)
                  });
                }
              }
            });

            if (navItems.length > 0) {
              items.push({
                type: 'aria_navigation',
                selector: generateSelector(nav),
                ariaLabel: nav.getAttribute('aria-label'),
                ariaAttributes: getAriaAttributes(nav),
                items: navItems,
                itemCount: navItems.length,
                is_visible: isVisible(nav),
                element_type: nav.tagName.toLowerCase()
              });
            }
          });

          // 2. Find elements with aria-haspopup (dropdown indicators)
          const popupElements = document.querySelectorAll('[aria-haspopup="true"], [aria-haspopup="menu"]');
          popupElements.forEach(trigger => {
            if (processedElements.has(trigger)) return;
            processedElements.add(trigger);

            const triggerText = trigger.textContent.trim();
            const ariaControls = trigger.getAttribute('aria-controls');
            const ariaExpanded = trigger.getAttribute('aria-expanded');
            
            // Find the controlled element
            let controlledElement = null;
            if (ariaControls) {
              controlledElement = document.getElementById(ariaControls) || 
                                document.querySelector(`#${ariaControls}`);
            }
            
            // If no controlled element, check next sibling or parent's next sibling
            if (!controlledElement) {
              controlledElement = trigger.nextElementSibling ||
                                trigger.parentElement?.nextElementSibling;
            }

            if (controlledElement) {
              const dropdownLinks = controlledElement.querySelectorAll('a');
              const dropdownItems = [];
              
              dropdownLinks.forEach(link => {
                const text = link.textContent.trim();
                if (text && link.href) {
                  dropdownItems.push({
                    text: text,
                    url: link.href,
                    selector: generateSelector(link),
                    ariaAttributes: getAriaAttributes(link)
                  });
                }
              });

              if (dropdownItems.length > 0 || ariaExpanded === 'false') {
                items.push({
                  type: 'aria_dropdown',
                  trigger: {
                    text: triggerText,
                    selector: generateSelector(trigger),
                    ariaExpanded: ariaExpanded,
                    ariaControls: ariaControls
                  },
                  dropdown: {
                    selector: controlledElement ? generateSelector(controlledElement) : null,
                    is_visible: controlledElement ? isVisible(controlledElement) : false
                  },
                  items: dropdownItems,
                  itemCount: dropdownItems.length,
                  has_dropdown: true,
                  element_type: trigger.tagName.toLowerCase()
                });
              }
            } else if (triggerText && trigger.href) {
              // Trigger itself is a navigation item with dropdown capability
              items.push({
                type: 'aria_nav_with_dropdown',
                text: triggerText,
                url: trigger.href,
                selector: generateSelector(trigger),
                has_dropdown: true,
                ariaAttributes: getAriaAttributes(trigger),
                element_type: trigger.tagName.toLowerCase()
              });
            }
          });

          // 3. Find elements with aria-expanded (collapsible sections)
          const expandableElements = document.querySelectorAll('[aria-expanded]');
          expandableElements.forEach(expandable => {
            if (processedElements.has(expandable)) return;
            processedElements.add(expandable);

            const isExpanded = expandable.getAttribute('aria-expanded') === 'true';
            const ariaControls = expandable.getAttribute('aria-controls');
            
            if (!isExpanded && ariaControls) {
              // This is a collapsed section that might contain navigation
              items.push({
                type: 'aria_expandable',
                trigger: {
                  text: expandable.textContent.trim(),
                  selector: generateSelector(expandable),
                  ariaExpanded: 'false',
                  ariaControls: ariaControls
                },
                is_collapsed: true,
                element_type: expandable.tagName.toLowerCase()
              });
            }
          });

          // 4. Find elements with navigation-related aria-labels
          const navAriaLabels = [
            '[aria-label*="menu"]', '[aria-label*="navigation"]',
            '[aria-label*="nav"]', '[aria-label*="category"]',
            '[aria-label*="department"]', '[aria-label*="shop"]'
          ];

          navAriaLabels.forEach(selector => {
            try {
              const elements = document.querySelectorAll(selector);
              elements.forEach(element => {
                if (processedElements.has(element)) return;
                processedElements.add(element);

                const ariaLabel = element.getAttribute('aria-label');
                const links = element.querySelectorAll('a');
                
                if (links.length > 0) {
                  const labeledItems = [];
                  links.forEach(link => {
                    const text = link.textContent.trim();
                    if (text && link.href) {
                      labeledItems.push({
                        text: text,
                        url: link.href,
                        selector: generateSelector(link),
                        ariaAttributes: getAriaAttributes(link)
                      });
                    }
                  });

                  if (labeledItems.length > 0) {
                    items.push({
                      type: 'aria_labeled_nav',
                      selector: generateSelector(element),
                      ariaLabel: ariaLabel,
                      items: labeledItems,
                      itemCount: labeledItems.length,
                      is_visible: isVisible(element),
                      element_type: element.tagName.toLowerCase()
                    });
                  }
                } else if (element.tagName === 'A' && element.href) {
                  // Single navigation item with aria-label
                  items.push({
                    type: 'aria_labeled_link',
                    text: element.textContent.trim() || ariaLabel,
                    url: element.href,
                    selector: generateSelector(element),
                    ariaLabel: ariaLabel,
                    ariaAttributes: getAriaAttributes(element),
                    element_type: 'a'
                  });
                }
              });
            } catch (error) {
              // Skip invalid selectors
            }
          });

          // 5. Find menu items with ARIA roles
          const menuRoles = ['menuitem', 'menuitemcheckbox', 'menuitemradio'];
          menuRoles.forEach(role => {
            const menuItems = document.querySelectorAll(`[role="${role}"]`);
            menuItems.forEach(item => {
              if (processedElements.has(item)) return;
              processedElements.add(item);

              const text = item.textContent.trim();
              const href = item.href || item.querySelector('a')?.href;
              
              if (text && href) {
                items.push({
                  type: 'aria_menu_item',
                  text: text,
                  url: href,
                  selector: generateSelector(item),
                  role: role,
                  ariaAttributes: getAriaAttributes(item),
                  element_type: item.tagName.toLowerCase()
                });
              }
            });
          });

          // 6. Find tabs (often used for navigation)
          const tabs = document.querySelectorAll('[role="tab"]');
          tabs.forEach(tab => {
            if (processedElements.has(tab)) return;
            processedElements.add(tab);

            const text = tab.textContent.trim();
            const href = tab.href || tab.getAttribute('data-href');
            const ariaSelected = tab.getAttribute('aria-selected');
            
            if (text) {
              items.push({
                type: 'aria_tab',
                text: text,
                url: href,
                selector: generateSelector(tab),
                ariaSelected: ariaSelected,
                ariaAttributes: getAriaAttributes(tab),
                element_type: tab.tagName.toLowerCase()
              });
            }
          });

          return {
            items: items,
            metadata: {
              totalAriaElements: items.length,
              navigationRoles: items.filter(i => i.type === 'aria_navigation').length,
              dropdowns: items.filter(i => i.type === 'aria_dropdown').length,
              expandables: items.filter(i => i.type === 'aria_expandable').length,
              labeledNavs: items.filter(i => i.type === 'aria_labeled_nav').length,
              menuItems: items.filter(i => i.type === 'aria_menu_item').length,
              tabs: items.filter(i => i.type === 'aria_tab').length
            }
          };
        });

        // Process and format results
        const processedItems = this.processAriaNavigation(ariaNavigation.items);
        const confidence = this.calculateStrategyConfidence(processedItems, ariaNavigation.metadata);

        this.logResults(processedItems, confidence, this.performanceMetrics.executionTime);

        return {
          items: processedItems,
          confidence: confidence,
          metadata: {
            ...ariaNavigation.metadata,
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
   * Process ARIA navigation into standard format
   */
  processAriaNavigation(ariaItems) {
    const items = [];

    ariaItems.forEach(item => {
      if (item.type === 'aria_navigation' || item.type === 'aria_labeled_nav') {
        // Process navigation container
        if (item.items) {
          item.items.forEach(subItem => {
            items.push({
              ...subItem,
              name: subItem.text,
              type: 'main_section',
              element_type: 'a',
              is_visible: item.is_visible !== false,
              parent_container: item.selector,
              discovered_via: 'aria',
              aria_context: item.ariaLabel
            });
          });
        }
      } else if (item.type === 'aria_dropdown') {
        // Process dropdown
        if (item.trigger) {
          items.push({
            text: item.trigger.text,
            name: item.trigger.text,
            selector: item.trigger.selector,
            type: 'main_section',
            has_dropdown: true,
            dropdown_selector: item.dropdown?.selector,
            element_type: item.element_type,
            discovered_via: 'aria'
          });
        }

        if (item.items) {
          items.push({
            type: 'dropdown',
            selector: item.dropdown?.selector || item.trigger.selector,
            trigger_selector: item.trigger.selector,
            items: item.items,
            has_dropdown: true,
            is_visible: item.dropdown?.is_visible,
            discovered_via: 'aria'
          });

          // Add individual dropdown items
          item.items.forEach(subItem => {
            items.push({
              ...subItem,
              name: subItem.text,
              type: 'dropdown_item',
              element_type: 'a',
              parent_container: item.dropdown?.selector,
              discovered_via: 'aria'
            });
          });
        }
      } else if (item.type === 'aria_expandable') {
        // Mark expandable sections
        items.push({
          text: item.trigger.text,
          name: item.trigger.text,
          selector: item.trigger.selector,
          type: 'expandable_section',
          is_collapsed: true,
          aria_controls: item.trigger.ariaControls,
          element_type: item.element_type,
          discovered_via: 'aria'
        });
      } else {
        // Individual navigation items
        items.push({
          ...item,
          name: item.text,
          type: item.type === 'aria_tab' ? 'tab_navigation' : 'navigation',
          element_type: item.element_type || 'a',
          is_visible: true,
          discovered_via: 'aria'
        });
      }
    });

    return this.deduplicateItems(items);
  }

  /**
   * Calculate confidence for ARIA discovery
   */
  calculateStrategyConfidence(items, metadata) {
    let confidence = 0.7; // High base confidence for ARIA (accessibility is reliable)

    // ARIA navigation roles are very reliable
    if (metadata.navigationRoles > 0) confidence += 0.2;

    // Dropdowns with ARIA are well-structured
    if (metadata.dropdowns > 0) confidence += 0.1;

    // Multiple ARIA patterns increase confidence
    const differentTypes = [
      metadata.navigationRoles,
      metadata.dropdowns,
      metadata.expandables,
      metadata.labeledNavs,
      metadata.menuItems,
      metadata.tabs
    ].filter(count => count > 0).length;

    if (differentTypes >= 3) confidence += 0.1;
    else if (differentTypes >= 2) confidence += 0.05;

    // Adjust based on total items
    if (metadata.totalAriaElements > 10) confidence += 0.1;
    else if (metadata.totalAriaElements < 3) confidence -= 0.2;

    return Math.max(0.1, Math.min(1, confidence));
  }
}

module.exports = AriaNavigationStrategy;