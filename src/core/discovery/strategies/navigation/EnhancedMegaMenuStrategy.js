/**
 * EnhancedMegaMenuStrategy - Consolidated navigation discovery strategy
 *
 * Merges the best features from all navigation strategies:
 * - MegaMenuStrategy: Desktop mega-menu capture with anti-bot
 * - AdaptiveNavigationStrategy: Hint caching and mobile fallback
 * - PopupHandler: Popup/modal dismissal
 * - AriaNavigationStrategy: ARIA selectors
 * - DataAttributeStrategy: Data attribute selectors
 * - InteractionNavigationStrategy: Priority sorting
 *
 * This is the PRIMARY navigation strategy that handles 99% of sites.
 */

const NavigationStrategy = require('./NavigationStrategy');
const PopupHandler = require('./PopupHandler');
const { getQuirksForDomain } = require('../../../config/SiteQuirks');

class EnhancedMegaMenuStrategy extends NavigationStrategy {
  constructor(logger, options = {}) {
    super(logger, options);
    this.name = 'EnhancedMegaMenuStrategy';
    this.description = 'Comprehensive navigation discovery with mega-menu focus';

    // Components
    this.popupHandler = new PopupHandler(logger);
    this.hintCache = options.hintCache; // From AdaptiveNavigationStrategy

    // Configuration
    this.config = {
      maxMenusToCapture: options.maxMenusToCapture || 10,
      hoverDelay: options.hoverDelay || 2000,
      dismissDelay: options.dismissDelay || 500,
      maxSiteTime: options.maxSiteTime || 10000,
      enableMobileFallback: options.enableMobileFallback !== false,
      ...options,
    };

    // Comprehensive selector list (merged from all strategies)
    this.navigationSelectors = this.buildComprehensiveSelectors();
  }

  /**
   * Build comprehensive selector list from all strategies
   */
  buildComprehensiveSelectors() {
    return {
      // Main navigation containers (from multiple strategies)
      containers: [
        'nav', '[role="navigation"]', '.navigation', '.nav',
        '.main-nav', '.primary-nav', '.header-nav', '.navbar',
        '#mainNavigation', '.site-nav', '.global-nav',
        // ARIA-based
        '[aria-label*="navigation"]', '[aria-label*="menu"]',
        // Data attribute based
        '[data-nav]', '[data-navigation]', '[data-menu]',
        // Mobile specific
        '.mobile-nav', '.mobile-menu', '.hamburger-menu',
      ],

      // Trigger elements for dropdowns/mega-menus
      // FOCUSED: Only top-level navigation items, not dropdown content
      triggers: [
        // glasswingshop.com pattern: nav > ul > li.dropdown-toggle
        'nav > ul > li.dropdown-toggle',
        'nav > ul > li[class*="dropdown"]',
        'nav > ul > li.has-dropdown',
        'nav > ul > li.has-submenu',
        
        // Generic top-level patterns (inspired by Playwright snippet best practices)
        'nav > ul > li', 'nav > li', 'nav > div > li',
        '[role="navigation"] > ul > li', '[role="navigation"] > li',
        '[role="menubar"] > li', 
        '.navigation > ul > li', '.navigation > li',
        '.main-nav > ul > li', '.main-nav > li',
        '.primary-nav > ul > li', '.primary-nav > li',
        '.header-nav > ul > li', '.header-nav > li',
        
        // Direct nav children with specific patterns
        'nav [data-menu] > li', 'nav [data-nav] > li',
        
        // Top-level items with ARIA indicators
        'nav > ul > li[aria-haspopup]',
        
        // Fallback: any immediate nav children
        'nav > *[class*="nav"]', 'nav > *[class*="menu"]',
      ],

      // Dropdown/mega-menu containers
      dropdowns: [
        '.dropdown', '.mega-menu', '.megamenu', '.submenu',
        '[class*="dropdown"]', '[class*="mega"]', '[class*="menu"]',
        '.nav-dropdown', '.flyout-menu', '.flyout',
        '[class*="flyout"]', '.nav-layer', '[id*="flyout"]',
        // Gap specific
        '[class*="menu-panel"]', '[class*="nav-panel"]',
        // ARIA controlled
        '[aria-expanded="true"] + *', '[aria-expanded="true"] ~ *',
        // Data attribute controlled
        '[data-dropdown-content]', '[data-menu-content]',
      ],
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

        this.logger.info(`🚀 Enhanced navigation discovery for ${domain}`);

        // Step 1: Handle popups/modals first (was missing in original!)
        await this.handlePopups(page);

        // Step 2: Add human-like behavior for problematic sites
        await this.spoofHumanBehavior(page, domain);

        // Step 3: Load cached hints if available
        const hints = await this.loadHints(domain);

        // Step 4: Check if mobile-first site
        const isMobileFirst = this.checkMobileFirst(domain);

        if (isMobileFirst && this.config.enableMobileFallback) {
          this.logger.info(`📱 Using mobile-first approach for ${domain}`);
          return await this.executeMobileFallback(page, hints);
        }

        // Step 5: Try desktop mega-menu approach (primary method)
        const desktopResults = await this.executeDesktopCapture(page, hints);

        // Step 6: If desktop fails, try mobile fallback
        if (desktopResults.items.length < 5 && this.config.enableMobileFallback) {
          this.logger.info('Desktop capture insufficient, trying mobile fallback...');
          return await this.executeMobileFallback(page, hints);
        }

        // Step 7: Store successful hints for future runs
        if (desktopResults.items.length >= 5) {
          await this.storeHints(domain, desktopResults.hints);
        }

        return desktopResults;

      } catch (error) {
        this.logger.error(`Enhanced strategy failed: ${error.message}`);
        return this.emptyResult(error.message);
      }
    });
  }

  /**
   * Handle popups and modals
   */
  async handlePopups(page) {
    try {
      const popupsClosed = await this.popupHandler.closePopups(page);
      if (popupsClosed > 0) {
        this.logger.info(`✅ Closed ${popupsClosed} popup(s)`);
      }
      await this.popupHandler.waitForPageReady(page);
    } catch (error) {
      this.logger.warn(`Popup handling failed: ${error.message}`);
    }
  }

  /**
   * Spoof human behavior for anti-bot bypass
   */
  async spoofHumanBehavior(page, domain) {
    const problematicDomains = ['homedepot.com', 'walmart.com', 'bestbuy.com', 'target.com'];

    if (!problematicDomains.some(d => domain.includes(d))) {
      return;
    }

    this.logger.debug(`🤖 Spoofing human behavior for ${domain}`);

    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      await page.waitForTimeout(2000);

      // Random mouse movements
      await page.mouse.move(100, 100);
      await page.waitForTimeout(500);
      await page.mouse.move(500, 200);
      await page.waitForTimeout(500);

      // Random scroll
      await page.evaluate(() => window.scrollBy(0, 100));
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollBy(0, -100));

    } catch (error) {
      this.logger.debug(`Human spoofing failed: ${error.message}`);
    }
  }

  /**
   * Check if site is mobile-first
   */
  checkMobileFirst(domain) {
    const mobileFirstSites = [
      'macys.com', 'homedepot.com', 'amazon.com', 'bestbuy.com',
      'target.com', 'walmart.com', 'costco.com',
    ];
    return mobileFirstSites.some(site => domain.includes(site));
  }

  /**
   * Execute desktop mega-menu capture
   */
  async executeDesktopCapture(page, hints) {
    this.logger.info('🖥️ Executing desktop mega-menu capture');

    // Check viewport and create desktop context if needed
    const viewport = await page.viewportSize();
    const needsDesktopContext = !viewport || viewport.width < 1200;

    if (needsDesktopContext) {
      return await this.executeWithDesktopContext(page);
    }

    // Find triggers with priority sorting
    const triggers = await this.findNavigationTriggers(page, hints);

    if (triggers.length === 0) {
      this.logger.warn('No navigation triggers found');
      return this.emptyResult('no_triggers');
    }

    this.logger.info(`Found ${triggers.length} navigation triggers`);

    // Capture dropdowns/mega-menus
    const capturedMenus = {};
    const allItems = [];

    for (const trigger of triggers.slice(0, this.config.maxMenusToCapture)) {
      try {
        const menuData = await this.captureMegaMenu(page, trigger);

        if (menuData && menuData.items && menuData.items.length > 0) {
          capturedMenus[trigger.text] = menuData;
          allItems.push(...menuData.items);

          this.logger.info(`✅ Captured menu for "${trigger.text}": ${menuData.items.length} items`);
        }
      } catch (error) {
        this.logger.debug(`Failed to capture menu for ${trigger.text}: ${error.message}`);
      }
    }

    const confidence = this.calculateConfidence(allItems, capturedMenus);

    return {
      items: allItems,
      dropdownMenus: capturedMenus,
      confidence: confidence,
      metadata: {
        strategy: this.name,
        triggersFound: triggers.length,
        menusCaptured: Object.keys(capturedMenus).length,
        totalItems: allItems.length,
        viewportSize: viewport,
      },
      hints: this.generateHints(triggers, capturedMenus),
    };
  }

  /**
   * Execute with dedicated desktop context
   */
  async executeWithDesktopContext(originalPage) {
    const browser = originalPage.context().browser();
    const currentUrl = originalPage.url();

    this.logger.info('Creating desktop context for mega-menu capture');

    let desktopContext = null;
    let desktopPage = null;

    try {
      desktopContext = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        isMobile: false,
        hasTouch: false,
        deviceScaleFactor: 1,
      });

      desktopPage = await desktopContext.newPage();
      await desktopPage.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await desktopPage.waitForTimeout(3000);

      // Handle popups in desktop context too
      await this.handlePopups(desktopPage);

      // Now capture in desktop mode
      const hints = null; // Hints from original context don't apply
      return await this.executeDesktopCapture(desktopPage, hints);

    } catch (error) {
      this.logger.error(`Desktop context failed: ${error.message}`);
      return this.emptyResult(`desktop_context_failed: ${error.message}`);
    } finally {
      if (desktopPage) {await desktopPage.close();}
      if (desktopContext) {await desktopContext.close();}
    }
  }

  /**
   * Find navigation triggers with priority sorting
   */
  async findNavigationTriggers(page, hints) {
    const triggers = await page.evaluate((selectors) => {
      const found = [];
      const processed = new Set();

      // Helper to check if element is visible
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 &&
               style.display !== 'none' && style.visibility !== 'hidden';
      };

      // Process all trigger selectors
      selectors.triggers.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            // Extract only the immediate label text, not all nested content
            // This fixes glasswingshop.com where nested dropdowns cause massive text strings
            const labelElement = element.querySelector('.dropdown-title, .nav-label, .nav-text, > a:first-child, > span:first-child');
            const text = labelElement ? labelElement.textContent.trim() : 
                        element.firstChild?.nodeType === 3 ? element.firstChild.textContent.trim() :
                        element.textContent.trim();
            const key = text + (element.href || '');

            if (!text || processed.has(key)) {return;}
            processed.add(key);

            // Skip non-navigation items
            const skipPatterns = [
              'sign in', 'login', 'cart', 'bag', 'account',
              'help', 'support', 'facebook', 'twitter', 'instagram',
            ];

            if (skipPatterns.some(p => text.toLowerCase().includes(p))) {return;}
            if (!isVisible(element)) {return;}

            // Check for dropdown indicators
            const hasDropdownIndicator =
              element.getAttribute('aria-haspopup') === 'true' ||
              element.getAttribute('aria-expanded') !== null ||
              element.classList.toString().includes('dropdown') ||
              element.classList.toString().includes('menu') ||
              element.querySelector('[class*="arrow"], [class*="chevron"], [class*="caret"]');

            found.push({
              text: text,
              selector: element.id ? `#${element.id}` :
                element.className ? `.${element.className.split(' ')[0]}` :
                  selector,
              href: element.href || null,
              hasDropdownIndicator: hasDropdownIndicator,
              isPriority: false, // Will be set below
            });
          });
        } catch (e) {
          // Skip invalid selectors
        }
      });

      // Priority sorting (departments first)
      const departmentPatterns = [
        'Women', 'Men', 'Girls', 'Boys', 'Baby', 'Kids',
        'Home', 'Beauty', 'Shoes', 'Jewelry', 'Handbags',
        'Electronics', 'Furniture', 'Sports', 'Toys',
      ];

      found.forEach(trigger => {
        const isDepartment = departmentPatterns.some(dept =>
          trigger.text.toLowerCase().includes(dept.toLowerCase()),
        );
        trigger.isPriority = isDepartment || trigger.hasDropdownIndicator;
      });

      // Sort by priority
      return found.sort((a, b) => {
        if (a.isPriority && !b.isPriority) {return -1;}
        if (!a.isPriority && b.isPriority) {return 1;}
        return 0;
      });

    }, this.navigationSelectors);

    // Apply hints if available
    if (hints && hints.successfulTriggers) {
      const hintedTriggers = triggers.filter(t =>
        hints.successfulTriggers.includes(t.text),
      );
      const otherTriggers = triggers.filter(t =>
        !hints.successfulTriggers.includes(t.text),
      );
      return [...hintedTriggers, ...otherTriggers];
    }

    return triggers;
  }

  /**
   * Capture mega-menu for a trigger
   */
  async captureMegaMenu(page, trigger) {
    try {
      // Get site-specific quirks
      const currentUrl = page.url();
      const quirks = getQuirksForDomain(currentUrl);

      // Find trigger element
      let triggerElement = await page.$(trigger.selector);
      if (!triggerElement) {
        triggerElement = await page.locator(`text="${trigger.text}"`).first();
      }

      if (!triggerElement) {return null;}

      // Get initial state
      const initialLinks = await this.countVisibleLinks(page);

      // Handle site-specific quirks before hovering
      if (quirks.needsMouseOffBetweenHovers) {
        // Move mouse away first for sites like glasswingshop.com
        await page.mouse.move(100, 100);
        await page.waitForTimeout(quirks.mouseOffDelay || 500);
      }

      // Hover over trigger
      await triggerElement.hover({ timeout: 2000 });
      await page.waitForTimeout(this.config.hoverDelay);

      // Check if new content appeared
      const afterHoverLinks = await this.countVisibleLinks(page);

      if (afterHoverLinks <= initialLinks) {
        // Try clicking if hover didn't work
        try {
          await triggerElement.click({ timeout: 2000 });
          await page.waitForTimeout(this.config.hoverDelay);
        } catch (e) {
          // Click might fail, that's ok
        }
      }

      // Extract revealed content
      const menuData = await this.extractMegaMenuContent(page, trigger.text);

      // Move away to reset (enhanced for quirky sites)
      if (quirks.needsMouseOffBetweenHovers) {
        await page.mouse.move(500, 500);
        await page.waitForTimeout(quirks.mouseOffDelay || 500);
      } else {
        await page.mouse.move(0, 0);
        await page.waitForTimeout(this.config.dismissDelay);
      }

      return menuData;

    } catch (error) {
      this.logger.debug(`Menu capture failed for ${trigger.text}: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract mega-menu content
   */
  async extractMegaMenuContent(page, triggerText) {
    return await page.evaluate((selectors, triggerText) => {
      const items = [];
      const processed = new Set();

      // Look for dropdown/mega-menu containers
      selectors.dropdowns.forEach(selector => {
        try {
          const containers = document.querySelectorAll(selector);
          containers.forEach(container => {
            // Check if visible
            const style = window.getComputedStyle(container);
            if (style.display === 'none' || style.visibility === 'hidden') {return;}

            const links = container.querySelectorAll('a');
            links.forEach(link => {
              const href = link.href;
              const text = link.textContent.trim();

              if (href && text && !processed.has(href)) {
                processed.add(href);

                // Skip non-navigation
                const skipPatterns = ['facebook', 'twitter', 'instagram', 'privacy', 'terms'];
                if (skipPatterns.some(p => text.toLowerCase().includes(p))) {return;}

                items.push({
                  text: text,
                  name: text,
                  url: href,
                  parent: triggerText,
                  type: 'dropdown_item',
                  element_type: 'a',
                });
              }
            });
          });
        } catch (e) {
          // Skip invalid selectors
        }
      });

      return { items: items, trigger: triggerText };

    }, this.navigationSelectors, triggerText);
  }

  /**
   * Mobile fallback execution
   */
  async executeMobileFallback(page, hints) {
    this.logger.info('📱 Executing mobile fallback');

    try {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 812 });

      // Look for mobile menu button
      const mobileMenuButton = await page.locator(
        '[class*="hamburger"], [class*="menu-toggle"], [aria-label*="menu"]',
      ).first();

      if (await mobileMenuButton.isVisible()) {
        await mobileMenuButton.click();
        await page.waitForTimeout(1000);
      }

      // Extract mobile navigation
      const mobileNav = await page.evaluate((selectors) => {
        const items = [];

        // Look for mobile nav containers
        const mobileSelectors = [
          '.mobile-nav', '.mobile-menu', '.off-canvas',
          '.side-menu', '.slide-menu', '[class*="mobile"]',
        ];

        mobileSelectors.forEach(selector => {
          const containers = document.querySelectorAll(selector);
          containers.forEach(container => {
            const links = container.querySelectorAll('a');
            links.forEach(link => {
              const text = link.textContent.trim();
              const href = link.href;

              if (text && href) {
                items.push({
                  text: text,
                  name: text,
                  url: href,
                  type: 'mobile_nav',
                  element_type: 'a',
                });
              }
            });
          });
        });

        return items;
      }, this.navigationSelectors);

      return {
        items: mobileNav,
        confidence: mobileNav.length > 5 ? 0.7 : 0.3,
        metadata: {
          strategy: this.name,
          mode: 'mobile_fallback',
          itemCount: mobileNav.length,
        },
      };

    } catch (error) {
      this.logger.error(`Mobile fallback failed: ${error.message}`);
      return this.emptyResult('mobile_fallback_failed');
    }
  }

  /**
   * Count visible links
   */
  async countVisibleLinks(page) {
    return await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      let count = 0;
      links.forEach(link => {
        const rect = link.getBoundingClientRect();
        const style = window.getComputedStyle(link);
        if (rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden') {
          count++;
        }
      });
      return count;
    });
  }

  /**
   * Load hints from cache
   */
  async loadHints(domain) {
    if (!this.hintCache) {return null;}

    try {
      const hints = await this.hintCache.get(`nav_hints:${domain}`);
      if (hints) {
        this.logger.debug(`Loaded navigation hints for ${domain}`);
        return JSON.parse(hints);
      }
    } catch (error) {
      this.logger.debug(`Failed to load hints: ${error.message}`);
    }

    return null;
  }

  /**
   * Store successful hints
   */
  async storeHints(domain, hints) {
    if (!this.hintCache || !hints) {return;}

    try {
      await this.hintCache.set(
        `nav_hints:${domain}`,
        JSON.stringify(hints),
        7 * 24 * 60 * 60, // 7 days TTL
      );
      this.logger.debug(`Stored navigation hints for ${domain}`);
    } catch (error) {
      this.logger.debug(`Failed to store hints: ${error.message}`);
    }
  }

  /**
   * Generate hints from successful capture
   */
  generateHints(triggers, capturedMenus) {
    return {
      successfulTriggers: Object.keys(capturedMenus),
      triggerSelectors: triggers.filter(t =>
        Object.keys(capturedMenus).includes(t.text),
      ).map(t => t.selector),
    };
  }

  /**
   * Calculate confidence score
   */
  calculateConfidence(items, capturedMenus) {
    let confidence = 0.5;

    if (Object.keys(capturedMenus).length > 5) {confidence += 0.3;}
    else if (Object.keys(capturedMenus).length > 2) {confidence += 0.2;}

    if (items.length > 50) {confidence += 0.2;}
    else if (items.length > 20) {confidence += 0.1;}

    return Math.min(confidence, 1.0);
  }

  /**
   * Return empty result
   */
  emptyResult(reason) {
    return {
      items: [],
      dropdownMenus: {},
      confidence: 0,
      metadata: {
        strategy: this.name,
        reason: reason,
      },
    };
  }
}

module.exports = EnhancedMegaMenuStrategy;
