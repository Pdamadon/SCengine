/**
 * Toast Tab Restaurant Menu Extractor
 * Based on GPT-5's robust dual-mode extraction (navigation + modal)
 * Includes anti-bot protection and mouse movement simulation
 */

const { logger } = require('../utils/logger');

class ToastExtractor {
  constructor() {
    this.selectors = {
      // List page selectors
      root: ["[data-test='menu-root']", "main [data-test*='menu']", "main"],
      section: ["[data-test='menu-section']", "section:has([data-test='menu-section-title'])", "section:has(h2,h3)"],
      sectionTitle: ["[data-test='menu-section-title']", "h2[role='heading']", "h3[role='heading']", "header :is(h2,h3)"],
      item: ["[data-test='menu-item']", "[role='listitem'][data-automation*='menu']", "div:has([data-test*='menu-item-name'])"],
      name: ["[data-test='menu-item-name']", "[role='heading'] :is(h3,h4,span)", "h3,h4,.ItemName"],
      desc: ["[data-test='menu-item-description']", "[class*='Description']", "p"],
      price: ["[data-test='menu-item-price']", "[class*='Price']", "span,div"],
      link: ["a[href*='/item-']", "a[href*='item-']", "button[aria-label*='Customize']"],
      soldOut: ["[data-test='sold-out']", "[aria-disabled='true']", ":text('Sold Out')"],
      pageAvailability: ["[data-test='not-accepting-orders']", "main :text('Not accepting orders')", "[aria-live] :text('Not accepting orders')"],
      
      // Detail page/modal selectors
      detailContainer: ["[data-test='item-detail']", "[role='dialog'] [data-test*='item']", "[role='dialog']", "main"],
      detailName: ["[data-test='item-name']", "[role='dialog'] [role='heading'] :is(h2,h3,h4)", "h1,h2:below([role='dialog'])"],
      detailDesc: ["[data-test='item-description']", "[role='dialog'] p,[role='dialog'] [class*='Description']", "p:below(h1,h2,h3)"],
      detailBasePrice: ["[data-test='base-price']", "[role='dialog'] :text-matches('^\\\\$\\\\s?\\\\d')", ":text-matches('^\\\\$\\\\s?\\\\d')"],
      modifierGroup: ["[data-test='modifier-group']", "[role='group'][aria-labelledby]", "fieldset[role='group']"],
      modifierGroupTitle: ["[data-test='modifier-group-title']", "[aria-labelledby] ~ * :is(h3,h4)", ":text-matches('Choose|Required|Optional','i')"],
      modifierRules: ["[data-test='modifier-group-rules']", "small, .text-xs, .opacity-70"],
      modifierOption: ["[data-test='modifier-option']", "[role='radio'],[role='checkbox']", "label:has(input)"],
      modifierOptionName: ["[data-test='modifier-option-name']", ".flex span:not(:has($))", "label span, .OptionName"],
      modifierOptionPrice: ["[data-test='modifier-option-price']", ":text-matches('[+−-]\\\\s?\\\\$?\\\\d','i')"],
      modifierOptionCalories: ["[data-test='modifier-option-calories']", ":text-matches('\\\\b\\\\d+\\\\s?(k?cal)\\\\b','i')"],
      closeModal: ["[role='dialog'] [aria-label='Close']", "[role='dialog'] button:has(svg[aria-hidden])", "[role='dialog'] button:has-text('Close')"]
    };
  }
  
  /**
   * Anti-bot protection: Simulate human mouse movements
   */
  async simulateHumanBehavior(page) {
    // Random mouse movements
    const viewport = page.viewportSize();
    if (!viewport) return;
    
    const movements = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < movements; i++) {
      const x = Math.random() * viewport.width;
      const y = Math.random() * viewport.height;
      await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 10) });
      await page.waitForTimeout(100 + Math.random() * 200);
    }
    
    // Random scroll
    await page.evaluate(() => {
      const scrollAmount = Math.random() * 200 - 100;
      window.scrollBy(0, scrollAmount);
    });
    
    await page.waitForTimeout(500 + Math.random() * 500);
  }
  
  /**
   * Find first working selector from list
   */
  async findSelector(page, candidates) {
    for (const selector of candidates) {
      try {
        const element = await page.$(selector);
        if (element) return selector;
      } catch (e) {
        continue;
      }
    }
    return candidates[0]; // Fallback
  }
  
  /**
   * Smart scroll to load lazy content
   */
  async scrollToLoad(page, containerSel, maxIterations = 12) {
    let previousCount = 0;
    
    for (let i = 0; i < maxIterations; i++) {
      // Count elements
      const count = await page.$$eval(`${containerSel} *`, els => els.length).catch(() => 0);
      
      // Human-like pause before scrolling
      await page.waitForTimeout(500 + Math.random() * 1000);
      
      // Human-like scroll with random variation
      await this.simulateHumanBehavior(page);
      
      const scrollAmount = 0.6 + Math.random() * 0.4; // Vary scroll amount
      await page.evaluate((amount) => {
        window.scrollBy({
          top: window.innerHeight * amount,
          behavior: 'smooth'
        });
      }, scrollAmount);
      
      // Wait for smooth scroll to complete
      await page.waitForTimeout(800 + Math.random() * 400);
      
      // Wait for content to load
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      
      // Additional wait for lazy loading
      await page.waitForTimeout(500 + Math.random() * 500);
      
      // Check if new content loaded
      if (count <= previousCount) break;
      previousCount = count;
    }
    
    logger.debug(`Scrolled ${maxIterations} times, loaded ${previousCount} elements`);
  }
  
  /**
   * Extract menu list with categories and items
   */
  async extractMenuList(page) {
    // Human-like pause before starting extraction
    await page.waitForTimeout(1500 + Math.random() * 1000);
    
    // Wait for menu to load
    const rootSel = await this.findSelector(page, this.selectors.root);
    await page.waitForSelector(rootSel, { state: 'attached', timeout: 30000 }).catch(() => {});
    
    // Wait for content to fully render
    await page.waitForTimeout(1000 + Math.random() * 500);
    
    // Scroll to load all items with human-like behavior
    await this.scrollToLoad(page, rootSel);
    
    // Extract data
    const sectionSel = await this.findSelector(page, this.selectors.section);
    const data = await page.evaluate((selectors, sectionSel) => {
      const getText = (el) => (el?.textContent || '').trim();
      
      const sections = Array.from(document.querySelectorAll(sectionSel));
      
      return sections.map(section => {
        // Get category name
        let categoryName = null;
        for (const sel of selectors.sectionTitle) {
          const titleEl = section.querySelector(sel);
          if (titleEl) {
            categoryName = getText(titleEl);
            break;
          }
        }
        
        // Get items in category
        const items = [];
        for (const itemSel of selectors.item) {
          const itemElements = section.querySelectorAll(itemSel);
          
          itemElements.forEach(itemEl => {
            // Extract item data
            let name = null, description = null, price = null, href = null, isButton = false, soldOut = false;
            
            // Name
            for (const sel of selectors.name) {
              const nameEl = itemEl.querySelector(sel);
              if (nameEl) {
                name = getText(nameEl);
                break;
              }
            }
            
            // Description
            for (const sel of selectors.desc) {
              const descEl = itemEl.querySelector(sel);
              if (descEl) {
                description = getText(descEl);
                break;
              }
            }
            
            // Price
            for (const sel of selectors.price) {
              const priceEl = itemEl.querySelector(sel);
              if (priceEl) {
                const priceText = getText(priceEl);
                const priceMatch = priceText.match(/\\$[\\d.,]+/);
                price = priceMatch ? priceMatch[0] : priceText;
                break;
              }
            }
            
            // Link or button
            for (const sel of selectors.link) {
              const linkEl = itemEl.querySelector(sel);
              if (linkEl) {
                href = linkEl.href || null;
                isButton = !href;
                break;
              }
            }
            
            // Sold out
            soldOut = selectors.soldOut.some(sel => itemEl.querySelector(sel) !== null);
            
            if (name) {
              items.push({
                name,
                category: categoryName,
                description,
                price,
                href,
                isButton,
                soldOut
              });
            }
          });
        }
        
        return items;
      }).flat();
    }, this.selectors, sectionSel);
    
    return data;
  }
  
  /**
   * Extract item details via navigation (preferred)
   */
  async extractDetailViaNavigation(browser, itemUrl, category) {
    const page = await browser.newPage();
    
    try {
      // Human-like delay before navigation
      await page.waitForTimeout(1000 + Math.random() * 1500);
      
      // Navigate with anti-bot behavior
      await this.simulateHumanBehavior(page);
      await page.goto(itemUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      // Wait for network to settle
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      
      // Additional wait for dynamic content
      await page.waitForTimeout(1500 + Math.random() * 1000);
      
      // Wait for content
      const containerSel = await this.findSelector(page, this.selectors.detailContainer);
      await page.waitForSelector(containerSel, { state: 'attached', timeout: 30000 }).catch(() => {});
      
      // Extract details
      const details = await this.scrapeDetailFromContext(page, category);
      
      return details;
      
    } finally {
      await page.close();
    }
  }
  
  /**
   * Extract item details via modal (fallback)
   */
  async extractDetailViaModal(page, itemElement, category) {
    // Human-like pause before clicking
    await page.waitForTimeout(800 + Math.random() * 700);
    
    // Click to open modal with human behavior
    await this.simulateHumanBehavior(page);
    
    for (const sel of this.selectors.link) {
      const button = await itemElement.$(sel);
      if (button) {
        // Hover before clicking (human-like)
        await button.hover();
        await page.waitForTimeout(200 + Math.random() * 300);
        await button.click({ force: false });
        break;
      }
    }
    
    // Wait for modal animation
    await page.waitForTimeout(500 + Math.random() * 500);
    
    // Wait for modal to be visible
    const containerSel = await this.findSelector(page, this.selectors.detailContainer);
    await page.waitForSelector(containerSel, { state: 'visible', timeout: 30000 });
    
    // Wait for content to load in modal
    await page.waitForTimeout(1000 + Math.random() * 500);
    
    // Extract details
    const details = await this.scrapeDetailFromContext(page, category);
    
    // Close modal
    for (const sel of this.selectors.closeModal) {
      const closeBtn = await page.$(sel);
      if (closeBtn) {
        await closeBtn.click().catch(() => {});
        break;
      }
    }
    
    // Fallback: ESC key
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(100);
    
    return details;
  }
  
  /**
   * Core detail extraction from current context
   */
  async scrapeDetailFromContext(page, category) {
    const data = await page.evaluate((selectors) => {
      const getText = (el) => (el?.textContent || '').trim();
      
      // Basic info
      let name = null, description = null, basePrice = null, soldOut = false;
      
      for (const sel of selectors.detailName) {
        const el = document.querySelector(sel);
        if (el) {
          name = getText(el);
          break;
        }
      }
      
      for (const sel of selectors.detailDesc) {
        const el = document.querySelector(sel);
        if (el) {
          description = getText(el);
          break;
        }
      }
      
      for (const sel of selectors.detailBasePrice) {
        const el = document.querySelector(sel);
        if (el) {
          const priceText = getText(el);
          const priceMatch = priceText.match(/\\$[\\d.,]+/);
          basePrice = priceMatch ? priceMatch[0] : priceText;
          break;
        }
      }
      
      soldOut = selectors.soldOut.some(sel => document.querySelector(sel) !== null);
      
      // Modifiers
      const modifiers = [];
      
      for (const groupSel of selectors.modifierGroup) {
        const groups = document.querySelectorAll(groupSel);
        
        groups.forEach(group => {
          let groupName = null;
          
          // Group title
          for (const sel of selectors.modifierGroupTitle) {
            const titleEl = group.querySelector(sel);
            if (titleEl) {
              groupName = getText(titleEl);
              break;
            }
          }
          
          // Rules (min/max/required)
          let rulesText = '';
          for (const sel of selectors.modifierRules) {
            const rulesEl = group.querySelector(sel);
            if (rulesEl) {
              rulesText = getText(rulesEl);
              break;
            }
          }
          
          // Parse rules
          const minMatch = /choose\\s+(\\d+)/i.exec(rulesText);
          const upToMatch = /up to\\s+(\\d+)/i.exec(rulesText);
          const required = /required/i.test(rulesText) || (minMatch && Number(minMatch[1]) > 0);
          const min = minMatch ? Number(minMatch[1]) : (required ? 1 : 0);
          const max = upToMatch ? Number(upToMatch[1]) : (minMatch ? Number(minMatch[1]) : null);
          const selectionType = max && max > 1 ? 'multiple' : 'single';
          
          // Options
          const options = [];
          for (const optSel of selectors.modifierOption) {
            const optElements = group.querySelectorAll(optSel);
            
            optElements.forEach(optEl => {
              let optName = null, priceDelta = null, calories = null;
              
              for (const sel of selectors.modifierOptionName) {
                const nameEl = optEl.querySelector(sel);
                if (nameEl) {
                  optName = getText(nameEl);
                  break;
                }
              }
              
              for (const sel of selectors.modifierOptionPrice) {
                const priceEl = optEl.querySelector(sel);
                if (priceEl) {
                  priceDelta = getText(priceEl);
                  break;
                }
              }
              
              for (const sel of selectors.modifierOptionCalories) {
                const calEl = optEl.querySelector(sel);
                if (calEl) {
                  calories = getText(calEl);
                  break;
                }
              }
              
              const input = optEl.querySelector('input[type="radio"], input[type="checkbox"]');
              const isDefault = input?.checked || false;
              const isDisabled = input?.disabled || false;
              
              if (optName) {
                options.push({
                  name: optName,
                  priceDelta,
                  calories,
                  default: isDefault,
                  soldOut: isDisabled
                });
              }
            });
          }
          
          if (groupName || options.length > 0) {
            modifiers.push({
              groupName,
              min,
              max,
              required,
              selectionType,
              options
            });
          }
        });
      }
      
      return {
        name,
        description,
        basePrice,
        soldOut,
        modifiers
      };
    }, this.selectors);
    
    data.category = category;
    return data;
  }
  
  /**
   * Main extraction method
   */
  async extract(page, url) {
    logger.info(`🍜 Extracting Toast menu from: ${url}`);
    
    // Add human-like delay before navigation
    await page.waitForTimeout(1000 + Math.random() * 2000);
    
    // Navigate to restaurant with multiple wait conditions
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });
    
    // Wait for network to settle
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    
    // Additional wait for dynamic content
    await page.waitForTimeout(2000 + Math.random() * 1000);
    
    // Simulate human scrolling and mouse movement
    await this.simulateHumanBehavior(page);
    
    // Check if accepting orders
    let acceptingOrders = true;
    for (const sel of this.selectors.pageAvailability) {
      if (await page.$(sel)) {
        acceptingOrders = false;
        break;
      }
    }
    
    if (!acceptingOrders) {
      return {
        status: 'closed',
        message: 'Restaurant not accepting orders',
        items: []
      };
    }
    
    // Step 1: Extract menu list
    const menuItems = await this.extractMenuList(page);
    logger.info(`Found ${menuItems.length} menu items`);
    
    // Step 2: Extract details for each item
    const detailedItems = [];
    const browser = page.context().browser();
    
    for (let idx = 0; idx < menuItems.length; idx++) {
      const item = menuItems[idx];
      
      // Add delay between items to avoid rate limiting (except for first item)
      if (idx > 0) {
        await page.waitForTimeout(1000 + Math.random() * 2000);
      }
      
      try {
        let details = null;
        
        if (item.href && item.href.startsWith('http')) {
          // Prefer navigation to item URL
          details = await this.extractDetailViaNavigation(browser, item.href, item.category);
        } else if (item.isButton) {
          // Fallback to modal
          const itemElement = await page.$(`text="${item.name}"`).catch(() => null);
          if (itemElement) {
            details = await this.extractDetailViaModal(page, itemElement, item.category);
          }
        }
        
        if (details) {
          // Merge with list data if needed
          if (!details.name) details.name = item.name;
          if (!details.description && item.description) details.description = item.description;
          if (!details.basePrice && item.price) details.basePrice = item.price;
          
          detailedItems.push(details);
        } else {
          // Use list data as fallback
          detailedItems.push({
            name: item.name,
            category: item.category,
            description: item.description,
            basePrice: item.price,
            soldOut: item.soldOut,
            modifiers: []
          });
        }
        
      } catch (error) {
        logger.warn(`Failed to extract details for ${item.name}: ${error.message}`);
        // Use list data as fallback
        detailedItems.push({
          name: item.name,
          category: item.category,
          description: item.description,
          basePrice: item.price,
          soldOut: item.soldOut,
          modifiers: []
        });
      }
    }
    
    return {
      status: 'success',
      url,
      acceptingOrders,
      scrapedAt: new Date().toISOString(),
      itemCount: detailedItems.length,
      items: detailedItems
    };
  }
}

module.exports = ToastExtractor;