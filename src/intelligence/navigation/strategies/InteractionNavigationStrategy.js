/**
 * InteractionNavigationStrategy.js
 * 
 * Discovers navigation by interacting with elements (hover, click)
 * Essential for revealing dropdown menus, mega-menus, and dynamic content
 * Captures the full navigation hierarchy including hidden subcategories
 */

const NavigationStrategy = require('../NavigationStrategy');

class InteractionNavigationStrategy extends NavigationStrategy {
  constructor(logger, options = {}) {
    super(logger, options);
    this.name = 'InteractionNavigationStrategy';
  }

  /**
   * Execute strategy - interact with navigation to reveal hidden content
   */
  async execute(page) {
    return await this.measureExecution(async () => {
      try {
        this.logger.debug('Starting interaction-based navigation discovery');
        
        // First, find potential navigation triggers
        const triggers = await this.findNavigationTriggers(page);
        this.logger.debug(`Found ${triggers.length} potential navigation triggers`);
        
        // Interact with each trigger to reveal content
        const discoveredItems = [];
        
        for (const trigger of triggers) {
          try {
            const revealed = await this.interactAndExtract(page, trigger);
            if (revealed && revealed.length > 0) {
              discoveredItems.push({
                trigger: trigger,
                items: revealed,
                interaction: 'hover'
              });
            }
          } catch (error) {
            this.logger.debug(`Failed to interact with trigger: ${error.message}`);
          }
        }
        
        // Process and format results
        const processedItems = this.processInteractionResults(discoveredItems);
        const confidence = this.calculateStrategyConfidence(processedItems, discoveredItems);
        
        this.logResults(processedItems, confidence, this.performanceMetrics.executionTime);
        
        return {
          items: processedItems,
          confidence: confidence,
          metadata: {
            strategy: this.name,
            triggersFound: triggers.length,
            dropdownsRevealed: discoveredItems.length,
            totalItemsFound: processedItems.length
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
   * Find elements that might trigger navigation dropdowns
   */
  async findNavigationTriggers(page) {
    return await page.evaluate(() => {
      const triggers = [];
      const processed = new Set();
      
      // Common patterns for navigation triggers
      const triggerSelectors = [
        // Main navigation items
        'nav a', 'nav button', 'nav li',
        '.navigation a', '.navigation li',
        '.menu a', '.menu li',
        '[role="navigation"] a', '[role="navigation"] li',
        
        // Specific patterns
        '.nav-item', '.menu-item', '.nav-link',
        '[class*="nav"] > li', '[class*="menu"] > li',
        
        // Elements with dropdown indicators
        '[aria-haspopup]', '[aria-expanded]',
        '[data-toggle="dropdown"]', '[data-dropdown]',
        
        // Common class patterns
        '.has-dropdown', '.has-submenu', '.has-children',
        '.dropdown-toggle', '.menu-toggle'
      ];
      
      triggerSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            // Skip if already processed
            const key = element.tagName + (element.className || '') + (element.id || '');
            if (processed.has(key)) return;
            processed.add(key);
            
            // Skip non-navigation items
            const text = element.textContent.trim();
            if (!text) return;
            
            const skipPatterns = ['sign in', 'cart', 'search', 'account'];
            if (skipPatterns.some(p => text.toLowerCase().includes(p))) return;
            
            // Check if this might have a dropdown
            const hasDropdownIndicator = 
              element.getAttribute('aria-haspopup') === 'true' ||
              element.getAttribute('aria-expanded') !== null ||
              element.classList.contains('has-dropdown') ||
              element.classList.contains('dropdown-toggle') ||
              // Check for arrow/chevron icons
              element.querySelector('[class*="arrow"], [class*="chevron"], [class*="caret"]') ||
              // Check for adjacent dropdown containers
              element.nextElementSibling?.classList.toString().includes('dropdown') ||
              element.parentElement?.querySelector('.dropdown, .submenu, .mega-menu');
            
            triggers.push({
              text: text,
              selector: element.id ? `#${element.id}` : 
                       element.className ? `.${element.className.split(' ')[0]}` :
                       element.tagName.toLowerCase(),
              tagName: element.tagName.toLowerCase(),
              hasDropdownIndicator: hasDropdownIndicator,
              ariaExpanded: element.getAttribute('aria-expanded'),
              ariaHaspopup: element.getAttribute('aria-haspopup'),
              href: element.href || null,
              bounds: element.getBoundingClientRect()
            });
          });
        } catch (e) {
          // Skip invalid selectors
        }
      });
      
      // Prioritize department links and those with dropdown indicators
      const prioritized = triggers.sort((a, b) => {
        // Check if text matches department patterns
        const aDept = a.text.match(/^(Women|Men|Girls|Boys|Baby|Kids|Home|Beauty|Shoes|Jewelry|Handbags)/i);
        const bDept = b.text.match(/^(Women|Men|Girls|Boys|Baby|Kids|Home|Beauty|Shoes|Jewelry|Handbags)/i);
        
        if (aDept && !bDept) return -1;
        if (!aDept && bDept) return 1;
        if (a.hasDropdownIndicator && !b.hasDropdownIndicator) return -1;
        if (!a.hasDropdownIndicator && b.hasDropdownIndicator) return 1;
        return 0;
      });
      
      // Return more triggers and don't filter too aggressively
      // Many department links don't have obvious dropdown indicators
      return prioritized.slice(0, 30)
    });
  }

  /**
   * Interact with a trigger element and extract revealed content
   */
  async interactAndExtract(page, trigger) {
    try {
      // Find the trigger element
      let triggerElement;
      try {
        triggerElement = await page.$(trigger.selector);
        if (!triggerElement) {
          // Fallback: find by text
          triggerElement = await page.locator(`text="${trigger.text}"`).first();
        }
      } catch (e) {
        this.logger.debug(`Could not find trigger: ${trigger.selector}`);
        return [];
      }
      
      if (!triggerElement) return [];
      
      // Get initial state
      const initialLinks = await this.countVisibleLinks(page);
      
      // Hover over the trigger
      await triggerElement.hover({ timeout: 2000 });
      
      // Wait for content to appear
      await page.waitForTimeout(500);
      
      // Check if new content appeared
      const afterHoverLinks = await this.countVisibleLinks(page);
      
      if (afterHoverLinks <= initialLinks) {
        // Try clicking if hover didn't work
        try {
          await triggerElement.click({ timeout: 2000 });
          await page.waitForTimeout(500);
        } catch (e) {
          // Click might not work, that's ok
        }
      }
      
      // Extract newly visible navigation items
      const revealed = await page.evaluate((triggerText) => {
        const items = [];
        const processed = new Set();
        
        // Look for dropdown/mega-menu containers
        const dropdownSelectors = [
          // Generic patterns
          '.dropdown:not([style*="none"])',
          '.mega-menu:not([style*="none"])',
          '.submenu:not([style*="none"])',
          '[class*="dropdown"]:not([style*="none"])',
          '[class*="menu"]:not([style*="none"])',
          '.nav-dropdown:not([style*="none"])',
          
          // Macy's specific
          '.flyout-menu',
          '.flyout',
          '[class*="flyout"]',
          '.nav-layer',
          '[id*="flyout"]',
          
          // Gap specific
          '[class*="menu-panel"]',
          '[class*="nav-panel"]',
          
          // Also check for newly visible containers
          'div[style*="block"]',
          'ul[style*="block"]',
          '[aria-expanded="true"] + *',
          '[aria-expanded="true"] ~ *'
        ];
        
        dropdownSelectors.forEach(selector => {
          try {
            const containers = document.querySelectorAll(selector);
            containers.forEach(container => {
              // Check if visible
              const style = window.getComputedStyle(container);
              if (style.display === 'none' || style.visibility === 'hidden') return;
              
              const links = container.querySelectorAll('a');
              links.forEach(link => {
                const href = link.href;
                const text = link.textContent.trim();
                
                if (href && text && !processed.has(href)) {
                  processed.add(href);
                  
                  // Skip non-navigation items
                  const skipPatterns = ['facebook', 'twitter', 'instagram', 'privacy', 'terms'];
                  if (skipPatterns.some(p => text.toLowerCase().includes(p))) return;
                  
                  items.push({
                    text: text,
                    url: href,
                    parent: triggerText,
                    selector: link.id ? `#${link.id}` : 
                            link.className ? `.${link.className.split(' ')[0]}` :
                            'a',
                    isSubcategory: true,
                    depth: 2
                  });
                }
              });
            });
          } catch (e) {
            // Skip invalid selectors
          }
        });
        
        return items;
      }, trigger.text);
      
      // Move away from the trigger to reset state
      await page.mouse.move(0, 0);
      await page.waitForTimeout(200);
      
      this.logger.debug(`Revealed ${revealed.length} items from "${trigger.text}"`);
      return revealed;
      
    } catch (error) {
      this.logger.debug(`Interaction failed for trigger "${trigger.text}": ${error.message}`);
      return [];
    }
  }

  /**
   * Count visible links on the page
   */
  async countVisibleLinks(page) {
    return await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      let count = 0;
      links.forEach(link => {
        const rect = link.getBoundingClientRect();
        const style = window.getComputedStyle(link);
        if (rect.width > 0 && rect.height > 0 && 
            style.display !== 'none' && 
            style.visibility !== 'hidden') {
          count++;
        }
      });
      return count;
    });
  }

  /**
   * Process interaction results into standard format
   */
  processInteractionResults(discoveredItems) {
    const items = [];
    
    discoveredItems.forEach(discovery => {
      // Add the trigger as a main section with dropdown
      if (discovery.trigger) {
        items.push({
          text: discovery.trigger.text,
          name: discovery.trigger.text,
          url: discovery.trigger.href,
          selector: discovery.trigger.selector,
          type: 'main_section',
          has_dropdown: true,
          element_type: discovery.trigger.tagName,
          discovered_via: 'interaction',
          subcategory_count: discovery.items.length
        });
      }
      
      // Add discovered dropdown items
      discovery.items.forEach(item => {
        items.push({
          ...item,
          name: item.text,
          type: 'dropdown_item',
          element_type: 'a',
          discovered_via: 'interaction',
          parent_category: discovery.trigger.text
        });
      });
      
      // Also create a dropdown structure
      if (discovery.items.length > 0) {
        items.push({
          type: 'dropdown',
          trigger_text: discovery.trigger.text,
          trigger_selector: discovery.trigger.selector,
          items: discovery.items,
          discovered_via: 'interaction',
          revealed_by: discovery.interaction
        });
      }
    });
    
    return this.deduplicateItems(items);
  }

  /**
   * Calculate confidence for interaction discovery
   */
  calculateStrategyConfidence(items, discoveredItems) {
    let confidence = 0.5; // Base confidence
    
    // Higher confidence if we found dropdowns
    if (discoveredItems.length > 0) confidence += 0.3;
    
    // Higher confidence based on total items
    if (items.length > 50) confidence += 0.2;
    else if (items.length > 20) confidence += 0.1;
    
    // Check for expected patterns (subcategories)
    const hasSubcategories = items.some(i => i.type === 'dropdown_item');
    if (hasSubcategories) confidence += 0.1;
    
    return Math.max(0.1, Math.min(1, confidence));
  }
}

module.exports = InteractionNavigationStrategy;