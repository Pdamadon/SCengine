/**
 * DropdownDiscoveryStrategy.js
 * 
 * Specialized strategy for discovering dropdown/mega-menu content
 * Handles hover interactions with better popup management
 * Captures the full hierarchy of navigation menus
 */

const NavigationStrategy = require('../NavigationStrategy');

class DropdownDiscoveryStrategy extends NavigationStrategy {
  constructor(logger, options = {}) {
    super(logger, options);
    this.name = 'DropdownDiscoveryStrategy';
  }

  /**
   * Execute strategy - discover dropdown menu content
   */
  async execute(page) {
    return await this.measureExecution(async () => {
      try {
        this.logger.info('📂 Starting dropdown menu discovery');
        
        // First close any popups that might interfere
        await this.closeInterferingElements(page);
        
        // Find main navigation items that likely have dropdowns
        const menuTriggers = await this.findDropdownTriggers(page);
        this.logger.debug(`Found ${menuTriggers.length} potential dropdown triggers`);
        
        const dropdownContent = [];
        
        // Interact with each trigger
        for (const trigger of menuTriggers) {
          try {
            const content = await this.discoverDropdownContent(page, trigger);
            if (content) {
              dropdownContent.push(content);
            }
          } catch (error) {
            this.logger.debug(`Failed to discover dropdown for ${trigger.text}: ${error.message}`);
          }
        }
        
        // Format results
        const items = this.formatDropdownResults(dropdownContent);
        const confidence = this.calculateConfidence(items, dropdownContent);
        
        this.logger.info(`✅ Dropdown discovery found: ${dropdownContent.length} menus with ${items.length} total items`);
        
        return {
          items: items,
          confidence: confidence,
          metadata: {
            strategy: this.name,
            menusFound: dropdownContent.length,
            totalItems: items.length
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
   * Close elements that might interfere with hover interactions
   */
  async closeInterferingElements(page) {
    try {
      // Dismiss any overlays/modals
      const overlaySelectors = [
        '[class*="overlay"]',
        '[class*="modal"]',
        '[class*="popup"]',
        '[class*="dialog"]',
        '[role="dialog"]',
        '.bx-slab', // BounceX popups
        '[id*="bx-campaign"]'
      ];
      
      for (const selector of overlaySelectors) {
        try {
          const overlay = await page.locator(selector).first();
          if (await overlay.isVisible({ timeout: 100 })) {
            // Try to find and click close button
            const closeBtn = await overlay.locator('button[class*="close"], button[aria-label*="close"]').first();
            if (await closeBtn.isVisible({ timeout: 100 })) {
              await closeBtn.click();
              await page.waitForTimeout(500);
            } else {
              // Click outside to dismiss
              await page.locator('body').click({ position: { x: 10, y: 10 } });
              await page.waitForTimeout(500);
            }
          }
        } catch (e) {
          // Continue
        }
      }
    } catch (e) {
      this.logger.debug('No interfering elements to close');
    }
  }

  /**
   * Find navigation items that likely have dropdown menus
   */
  async findDropdownTriggers(page) {
    return await page.evaluate(() => {
      const triggers = [];
      const processed = new Set();
      
      // Selectors for main navigation items
      const triggerSelectors = [
        // Direct navigation items
        'nav > ul > li > a',
        'nav > ul > li > button',
        '.navigation > ul > li > a',
        '[role="navigation"] > ul > li > a',
        
        // Items with dropdown indicators
        'a[aria-haspopup="true"]',
        'a[aria-expanded]',
        'button[aria-haspopup="true"]',
        'button[aria-expanded]',
        
        // Class-based indicators
        '.has-dropdown > a',
        '.has-submenu > a',
        '.dropdown-toggle',
        '.menu-item-has-children > a',
        
        // Common patterns
        '.nav-item > a',
        '.menu-item > a',
        'header nav a',
        '#mainNavigation > li > a'
      ];
      
      triggerSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const fullText = element.textContent.trim();
            const cleanText = fullText.replace(/\s+/g, ' '); // Normalize whitespace
            const mainText = fullText.split('\n')[0].trim(); // Get main text before line breaks
            const url = element.href || '';
            
            // Skip if already processed
            const key = mainText + url;
            if (processed.has(key)) return;
            processed.add(key);
            
            // Skip non-navigation items
            const skipPatterns = ['sign in', 'cart', 'search', 'account', 'help'];
            if (skipPatterns.some(pattern => mainText.toLowerCase().includes(pattern))) {
              return;
            }
            
            // Check if it likely has a dropdown
            const parent = element.closest('li, .nav-item, .menu-item');
            const indicators = [
              element.getAttribute('aria-haspopup') === 'true',
              element.getAttribute('aria-expanded') !== null,
              parent?.classList.contains('has-dropdown'),
              parent?.classList.contains('has-submenu'),
              parent?.querySelector('.dropdown, .submenu, .mega-menu'),
              parent?.querySelector('[class*="dropdown"]')
            ];
            
            if (indicators.some(ind => ind)) {
              triggers.push({
                text: mainText, // Use cleaned main text
                fullText: fullText, // Keep full text for reference
                selector: selector,
                elementId: element.id,
                className: element.className,
                parentClassName: parent?.className,
                hasAriaPopup: element.getAttribute('aria-haspopup') === 'true',
                hasAriaExpanded: element.getAttribute('aria-expanded') !== null
              });
            }
          });
        } catch (e) {
          // Skip failed selectors
        }
      });
      
      return triggers;
    });
  }

  /**
   * Discover dropdown content for a trigger
   */
  async discoverDropdownContent(page, trigger) {
    try {
      // Find the trigger element
      let triggerElement;
      
      if (trigger.elementId) {
        triggerElement = await page.locator(`#${trigger.elementId}`).first();
      } else {
        // Use getByText which is more reliable for complex text content
        try {
          // First try exact text match
          triggerElement = await page.getByText(trigger.text, { exact: true }).first();
        } catch {
          // Fallback to partial match if exact fails
          triggerElement = await page.getByText(trigger.text.split('\n')[0].trim()).first();
        }
      }
      
      if (!await triggerElement.isVisible({ timeout: 1000 })) {
        return null;
      }
      
      // Hover over the trigger
      await triggerElement.hover();
      await page.waitForTimeout(500); // Wait for dropdown animation
      
      // Extract dropdown content - simplified approach for now
      const dropdownData = await page.evaluate((triggerText) => {
        // Look for visible dropdown content with glasswingshop.com specific selectors
        const dropdownSelectors = [
          '.dropdown-content',  // From your screenshot
          '.dropdown-menu',
          '.submenu',
          '.mega-menu',
          '[class*="dropdown"]',
          '[class*="submenu"]',
          '[role="menu"]'
        ];
        
        let dropdownElement = null;
        
        // Try each selector to find visible dropdown content
        for (const selector of dropdownSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            const rect = element.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const links = element.querySelectorAll('a');
              if (links.length > 0) {
                dropdownElement = element;
                break;
              }
            }
          }
          if (dropdownElement) break;
        }
        
        if (!dropdownElement) {
          // Look for any newly visible element with multiple links
          const allElements = document.querySelectorAll('*');
          for (const element of allElements) {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            if (rect.width > 100 && rect.height > 50 && 
                style.display !== 'none' && style.visibility !== 'hidden') {
              const links = element.querySelectorAll('a');
              if (links.length >= 5) { // Multiple links suggest dropdown content
                dropdownElement = element;
                break;
              }
            }
          }
        }
        
        if (!dropdownElement) return null;
        
        // Extract links from dropdown
        const items = [];
        const links = dropdownElement.querySelectorAll('a');
        
        links.forEach(link => {
          const fullText = link.textContent.trim();
          const mainText = fullText.split('\n')[0].trim();
          const url = link.href;
          
          if (mainText && mainText.length > 0 && url && url !== '#' && url !== 'javascript:void(0)') {
            items.push({
              name: mainText,
              url: url,
              type: 'dropdown_item',
              parent: triggerText,
              level: 2,
              fullText: fullText
            });
          }
        });
        
        return {
          trigger: triggerText,
          items: items,
          menuType: dropdownElement.className.includes('mega') ? 'mega-menu' : 'dropdown'
        };
      }, trigger.text);
      
      // Move mouse away to close dropdown
      await page.mouse.move(10, 10);
      
      return dropdownData;
      
    } catch (error) {
      this.logger.debug(`Failed to get dropdown for ${trigger.text}: ${error.message}`);
      return null;
    }
  }

  /**
   * Format dropdown results into items
   */
  formatDropdownResults(dropdownContent) {
    const items = [];
    
    dropdownContent.forEach(dropdown => {
      if (dropdown && dropdown.items) {
        dropdown.items.forEach(item => {
          items.push({
            name: item.name,
            url: item.url,
            type: 'dropdown',
            isDropdown: true,
            parent: dropdown.trigger,
            level: item.level || 2,
            menuType: dropdown.menuType,
            discovered_via: this.name
          });
        });
      }
    });
    
    return items;
  }

  /**
   * Calculate confidence based on dropdown discovery
   */
  calculateConfidence(items, dropdownContent) {
    if (dropdownContent.length === 0) return 0;
    
    const factors = {
      hasDropdowns: dropdownContent.length > 0 ? 0.3 : 0,
      hasMultipleMenus: dropdownContent.length >= 3 ? 0.2 : dropdownContent.length * 0.06,
      hasMegaMenu: dropdownContent.some(d => d.menuType === 'mega-menu') ? 0.2 : 0,
      hasEnoughItems: items.length >= 20 ? 0.3 : items.length * 0.015
    };
    
    return Object.values(factors).reduce((sum, val) => sum + val, 0);
  }
}

module.exports = DropdownDiscoveryStrategy;