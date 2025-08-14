/**
 * DataAttributeStrategy.js
 * 
 * Discovers navigation using data attributes which are often more reliable
 * Looks for data-menu, data-nav, data-dropdown, data-testid, etc.
 * Also finds framework-specific attributes (React, Vue, Angular)
 */

const NavigationStrategy = require('../NavigationStrategy');

class DataAttributeStrategy extends NavigationStrategy {
  constructor(logger, options = {}) {
    super(logger, options);
    this.name = 'DataAttributeStrategy';
  }

  /**
   * Execute strategy - find navigation via data attributes
   */
  async execute(page) {
    return await this.measureExecution(async () => {
      try {
        // Find elements with navigation-related data attributes
        const dataNavigation = await page.evaluate(() => {
          const items = [];
          const processedElements = new Set();

          // Helper to generate selector
          const generateSelector = (element) => {
            // Prefer data attributes for selector
            const dataAttrs = Array.from(element.attributes)
              .filter(attr => attr.name.startsWith('data-'));
            
            if (dataAttrs.length > 0) {
              // Use most specific data attribute
              const testId = element.getAttribute('data-testid');
              if (testId) return `[data-testid="${testId}"]`;
              
              const dataId = element.getAttribute('data-id');
              if (dataId) return `[data-id="${dataId}"]`;
              
              // Use first data attribute
              return `[${dataAttrs[0].name}="${dataAttrs[0].value}"]`;
            }

            if (element.id) return `#${element.id}`;
            if (element.className) {
              const classes = element.className.split(' ').filter(c => c.trim());
              if (classes.length > 0) return `.${classes[0]}`;
            }
            return element.tagName.toLowerCase();
          };

          // Common navigation data attributes
          const navigationDataAttributes = [
            // Generic navigation
            'data-nav', 'data-navigation', 'data-menu', 'data-nav-item',
            'data-menu-item', 'data-dropdown', 'data-submenu',
            
            // Testing attributes (very reliable)
            'data-testid*=nav', 'data-testid*=menu', 'data-test*=nav',
            'data-cy*=nav', 'data-automation*=nav',
            
            // Component attributes
            'data-component*=nav', 'data-component*=menu',
            'data-module*=nav', 'data-widget*=nav',
            
            // Framework specific
            'data-react-*=nav', 'data-react-*=menu',
            'data-vue-*=nav', 'data-ng-*=nav',
            
            // E-commerce specific
            'data-category', 'data-department', 'data-collection',
            'data-product-category', 'data-nav-category',
            
            // Action attributes
            'data-toggle="dropdown"', 'data-toggle="menu"',
            'data-action="menu"', 'data-behavior="menu"',
            
            // Target attributes
            'data-target*=menu', 'data-target*=nav',
            'data-menu-target', 'data-dropdown-target'
          ];

          // Build complex selector for all data attributes
          const buildAttributeSelector = (pattern) => {
            if (pattern.includes('*=')) {
              // Contains selector
              const [attr, value] = pattern.split('*=');
              return `[${attr}*="${value}"]`;
            } else if (pattern.includes('=')) {
              // Exact match
              return `[${pattern}]`;
            } else {
              // Just attribute presence
              return `[${pattern}]`;
            }
          };

          // Search for elements with navigation data attributes
          navigationDataAttributes.forEach(attrPattern => {
            try {
              const selector = buildAttributeSelector(attrPattern);
              const elements = document.querySelectorAll(selector);
              
              elements.forEach(element => {
                if (processedElements.has(element)) return;
                processedElements.add(element);

                const dataAttributes = {};
                Array.from(element.attributes).forEach(attr => {
                  if (attr.name.startsWith('data-')) {
                    dataAttributes[attr.name] = attr.value;
                  }
                });

                // Check if this is a container or individual item
                const links = element.querySelectorAll('a');
                const isContainer = links.length > 1;
                
                if (isContainer) {
                  // Process as navigation container
                  const containerItems = [];
                  links.forEach(link => {
                    const text = link.textContent.trim();
                    if (text && link.href && !link.href.includes('javascript:')) {
                      containerItems.push({
                        text: text,
                        url: link.href,
                        selector: generateSelector(link),
                        dataAttributes: this.extractDataAttributes(link)
                      });
                    }
                  });

                  if (containerItems.length > 0) {
                    items.push({
                      type: 'data_navigation_container',
                      selector: generateSelector(element),
                      dataAttributes: dataAttributes,
                      items: containerItems,
                      itemCount: containerItems.length,
                      element_type: element.tagName.toLowerCase(),
                      isDropdown: attrPattern.includes('dropdown'),
                      isMenu: attrPattern.includes('menu')
                    });
                  }
                } else if (element.tagName === 'A' && element.href) {
                  // Individual navigation link with data attributes
                  const text = element.textContent.trim();
                  if (text && !element.href.includes('javascript:')) {
                    items.push({
                      type: 'data_navigation_item',
                      text: text,
                      url: element.href,
                      selector: generateSelector(element),
                      dataAttributes: dataAttributes,
                      element_type: 'a',
                      parent: element.parentElement ? generateSelector(element.parentElement) : null
                    });
                  }
                } else if (links.length === 1) {
                  // Container with single link
                  const link = links[0];
                  const text = link.textContent.trim();
                  if (text && link.href && !link.href.includes('javascript:')) {
                    items.push({
                      type: 'data_navigation_item',
                      text: text,
                      url: link.href,
                      selector: generateSelector(link),
                      dataAttributes: dataAttributes,
                      element_type: 'a',
                      wrapper: generateSelector(element)
                    });
                  }
                }

                // Also check for expandable behavior
                const isExpandable = 
                  dataAttributes['data-toggle'] === 'dropdown' ||
                  dataAttributes['data-expanded'] === 'false' ||
                  dataAttributes['data-state'] === 'closed';

                if (isExpandable) {
                  // Look for target element
                  const targetId = dataAttributes['data-target'] || 
                                 dataAttributes['data-controls'] ||
                                 element.getAttribute('aria-controls');
                  
                  if (targetId) {
                    const target = document.querySelector(targetId) || 
                                 document.getElementById(targetId.replace('#', ''));
                    
                    if (target) {
                      const targetLinks = target.querySelectorAll('a');
                      const expandableItems = [];
                      
                      targetLinks.forEach(link => {
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
                          type: 'data_expandable',
                          trigger: {
                            text: element.textContent.trim(),
                            selector: generateSelector(element),
                            dataAttributes: dataAttributes
                          },
                          target: generateSelector(target),
                          items: expandableItems,
                          itemCount: expandableItems.length
                        });
                      }
                    }
                  }
                }
              });
            } catch (error) {
              // Skip invalid selectors
            }
          });

          // Helper function to extract data attributes
          function extractDataAttributes(element) {
            const attrs = {};
            Array.from(element.attributes).forEach(attr => {
              if (attr.name.startsWith('data-')) {
                attrs[attr.name] = attr.value;
              }
            });
            return attrs;
          }

          // Special handling for Gap.com and similar sites
          // Look for specific patterns we know work
          const specificPatterns = [
            { selector: '[data-testid^="division-"]', type: 'category' },
            { selector: '[data-testid*="link"]', type: 'link' },
            { selector: '[data-nav-id]', type: 'nav_item' },
            { selector: '[data-menu-id]', type: 'menu_item' },
            { selector: '[data-category-id]', type: 'category' }
          ];

          specificPatterns.forEach(pattern => {
            try {
              const elements = document.querySelectorAll(pattern.selector);
              elements.forEach(element => {
                if (processedElements.has(element)) return;
                processedElements.add(element);

                if (element.tagName === 'A' && element.href) {
                  const text = element.textContent.trim();
                  if (text) {
                    items.push({
                      type: `specific_${pattern.type}`,
                      text: text,
                      url: element.href,
                      selector: generateSelector(element),
                      dataAttributes: extractDataAttributes(element),
                      element_type: 'a',
                      pattern: pattern.selector
                    });
                  }
                }
              });
            } catch (error) {
              // Skip invalid patterns
            }
          });

          return {
            items: items,
            metadata: {
              totalDataElements: items.length,
              containerCount: items.filter(i => i.type === 'data_navigation_container').length,
              expandableCount: items.filter(i => i.type === 'data_expandable').length,
              specificPatternMatches: items.filter(i => i.type?.startsWith('specific_')).length,
              uniqueDataAttributes: [...new Set(items.flatMap(i => 
                Object.keys(i.dataAttributes || {})
              ))]
            }
          };
        });

        // Process and format results
        const processedItems = this.processDataNavigation(dataNavigation.items);
        const confidence = this.calculateStrategyConfidence(processedItems, dataNavigation.metadata);

        this.logResults(processedItems, confidence, this.performanceMetrics.executionTime);

        return {
          items: processedItems,
          confidence: confidence,
          metadata: {
            ...dataNavigation.metadata,
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
   * Process data navigation into standard format
   */
  processDataNavigation(dataItems) {
    const items = [];

    dataItems.forEach(item => {
      if (item.type === 'data_navigation_container') {
        // Add container items
        if (item.items) {
          item.items.forEach(subItem => {
            items.push({
              ...subItem,
              name: subItem.text,
              type: item.isDropdown ? 'dropdown_item' : 'main_section',
              has_dropdown: item.isDropdown,
              element_type: 'a',
              is_visible: true,
              parent_container: item.selector,
              discovered_via: 'data-attribute'
            });
          });
        }

        // Add container itself if it's a dropdown
        if (item.isDropdown || item.isMenu) {
          items.push({
            type: 'dropdown',
            selector: item.selector,
            items: item.items,
            element_type: item.element_type,
            has_dropdown: true,
            discovered_via: 'data-attribute'
          });
        }
      } else if (item.type === 'data_expandable') {
        // Add expandable menu
        items.push({
          type: 'dropdown',
          selector: item.target,
          trigger_selector: item.trigger.selector,
          items: item.items,
          has_dropdown: true,
          is_expandable: true,
          discovered_via: 'data-attribute'
        });

        // Add individual items
        if (item.items) {
          item.items.forEach(subItem => {
            items.push({
              ...subItem,
              name: subItem.text,
              type: 'dropdown_item',
              element_type: 'a',
              parent_container: item.target,
              discovered_via: 'data-attribute'
            });
          });
        }
      } else {
        // Individual navigation items
        items.push({
          ...item,
          name: item.text,
          type: item.type?.includes('specific_category') ? 'main_section' : 'navigation',
          element_type: item.element_type || 'a',
          is_visible: true,
          discovered_via: 'data-attribute'
        });
      }
    });

    return this.deduplicateItems(items);
  }

  /**
   * Calculate confidence for data attribute discovery
   */
  calculateStrategyConfidence(items, metadata) {
    let confidence = 0.6; // Higher base confidence for data attributes

    // Data attributes are usually very reliable
    if (metadata.totalDataElements > 10) confidence += 0.2;
    else if (metadata.totalDataElements > 5) confidence += 0.1;

    // Bonus for finding containers (structured navigation)
    if (metadata.containerCount > 0) confidence += 0.1;

    // Bonus for finding expandable elements
    if (metadata.expandableCount > 0) confidence += 0.1;

    // Bonus for specific pattern matches
    if (metadata.specificPatternMatches > 0) confidence += 0.1;

    // Check for quality indicators
    const hasTestIds = metadata.uniqueDataAttributes.some(attr => 
      attr.includes('testid') || attr.includes('test') || attr.includes('cy')
    );
    if (hasTestIds) confidence += 0.1; // Test IDs are very reliable

    return Math.max(0.1, Math.min(1, confidence));
  }
}

module.exports = DataAttributeStrategy;