/**
 * MegaMenuStrategy - Captures enterprise desktop mega-menus with hover interactions
 *
 * This strategy specifically handles sophisticated mega-menus found on enterprise sites
 * like Macy's, Nordstrom, etc. that require desktop viewports and hover interactions
 * to reveal rich hierarchical navigation structures.
 *
 * Key features:
 * - Desktop viewport (1920x1080) for proper mega-menu display
 * - Hover interactions to trigger mega-menu display
 * - Hierarchical structure extraction (columns, groups, items)
 * - Category ID extraction from URLs
 * - Rich metadata capture
 */

class MegaMenuStrategy {
  constructor(logger, options = {}) {
    this.logger = logger;
    this.name = 'MegaMenuStrategy';
    this.description = 'Captures desktop mega-menus with hover interactions';

    // Configuration
    this.options = {
      maxMenusToCapture: options.maxMenusToCapture || 5,
      hoverDelay: options.hoverDelay || 2000,
      dismissDelay: options.dismissDelay || 500,
      ...options,
    };
  }

  async execute(page) {
    this.logger.info('🎯 Executing MegaMenuStrategy for enterprise mega-menus');

    try {
      // Check if current page is in desktop mode - if not, create new desktop context
      const viewport = await page.viewportSize();
      const needsDesktopContext = !viewport || viewport.width < 1200;

      if (needsDesktopContext) {
        this.logger.info(`Current viewport: ${viewport?.width || 'unknown'}px - creating desktop context for mega-menus`);
        return await this.executeWithDesktopContext(page);
      }

      // Page is already in desktop mode, execute directly
      return await this.executeDesktopCapture(page);

    } catch (error) {
      this.logger.error(`MegaMenuStrategy execution failed: ${error.message}`);
      return {
        items: [],
        dropdownMenus: {},
        confidence: 0,
        metadata: {
          strategy: this.name,
          error: error.message,
        },
      };
    }
  }

  /**
   * Execute mega-menu capture with a dedicated desktop browser context
   */
  async executeWithDesktopContext(originalPage) {
    const browser = originalPage.context().browser();
    const currentUrl = originalPage.url();

    this.logger.info(`🖥️ Creating desktop context for mega-menu capture at ${currentUrl}`);

    let desktopContext = null;
    let desktopPage = null;

    try {
      // Create new desktop context
      desktopContext = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        isMobile: false,
        hasTouch: false,
        deviceScaleFactor: 1,
      });

      desktopPage = await desktopContext.newPage();

      // Navigate to the same URL in desktop mode
      await desktopPage.goto(currentUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });

      // Wait for page to settle
      await desktopPage.waitForTimeout(3000);

      this.logger.info(`✅ Desktop context loaded: ${await desktopPage.title()}`);

      // Now execute the mega-menu capture in desktop mode
      return await this.executeDesktopCapture(desktopPage);

    } catch (error) {
      this.logger.error(`Failed to create desktop context: ${error.message}`);
      return {
        items: [],
        dropdownMenus: {},
        confidence: 0,
        metadata: {
          strategy: this.name,
          error: `Desktop context failed: ${error.message}`,
          attempted_desktop_capture: true,
        },
      };
    } finally {
      // Clean up desktop context
      if (desktopPage) {await desktopPage.close();}
      if (desktopContext) {await desktopContext.close();}
      this.logger.debug('🧹 Desktop context cleaned up');
    }
  }

  /**
   * Execute mega-menu capture in an already desktop-sized page
   */
  async executeDesktopCapture(page) {
    this.logger.debug('🎯 Executing desktop mega-menu capture');

    // Find main navigation elements that could trigger mega-menus
    const megaMenuTriggers = await this.findMegaMenuTriggers(page);

    if (megaMenuTriggers.length === 0) {
      this.logger.debug('No mega-menu triggers found in desktop mode');
      return {
        items: [],
        dropdownMenus: {},
        confidence: 0,
        metadata: {
          strategy: this.name,
          triggersFound: 0,
          desktopMode: true,
        },
      };
    }

    this.logger.info(`Found ${megaMenuTriggers.length} potential mega-menu triggers in desktop mode`);

    const capturedMenus = {};
    const allItems = [];
    let menuIndex = 0;

    // Capture mega-menus up to the limit
    for (const trigger of megaMenuTriggers.slice(0, this.options.maxMenusToCapture)) {
      try {
        const menuData = await this.captureMegaMenu(page, trigger, menuIndex);

        if (menuData && menuData.navigation && menuData.navigation.columns?.length > 0) {
          const menuKey = `megamenu_${trigger.category}`;
          capturedMenus[menuKey] = menuData;

          // Convert to items format for compatibility
          const items = this.convertMegaMenuToItems(menuData.navigation, trigger.category);
          allItems.push(...items);

          this.logger.info(`✅ Captured desktop mega-menu for ${trigger.category}: ${menuData.navigation.summary?.total_items || 0} items`);
          menuIndex++;
        }

      } catch (error) {
        this.logger.warn(`Failed to capture mega-menu for ${trigger.category}: ${error.message}`);
      }
    }

    const confidence = this.calculateConfidence(capturedMenus, megaMenuTriggers.length);

    return {
      items: allItems,
      dropdownMenus: capturedMenus,
      confidence: confidence,
      metadata: {
        strategy: this.name,
        triggersFound: megaMenuTriggers.length,
        menusCaptured: Object.keys(capturedMenus).length,
        totalItems: allItems.length,
        captureMethod: 'hover_interaction_desktop',
        desktopMode: true,
        viewportSize: await page.viewportSize(),
      },
    };
  }

  /**
   * Find elements that could trigger mega-menus
   */
  async findMegaMenuTriggers(page) {
    return await page.evaluate(() => {
      const triggers = [];

      // Look for main navigation links that could have mega-menus
      const selectors = [
        'nav [role="link"]',
        'header nav a',
        '.main-nav a',
        '.primary-nav a',
        '.navigation a',
        '[role="navigation"] a',
      ];

      const processed = new Set();

      selectors.forEach(selector => {
        try {
          const links = document.querySelectorAll(selector);

          links.forEach(link => {
            const text = link.textContent?.trim();
            const href = link.href;

            if (!text || !href || processed.has(href)) {return;}
            processed.add(href);

            // Filter out utility/promotional links, keep main categories
            const skipPatterns = [
              /sign.?in/i, /account/i, /cart/i, /checkout/i, /login/i,
              /search/i, /help/i, /support/i, /contact/i, /about/i,
              /store.?locator/i, /stores/i, /careers/i, /investors/i,
              /gift.?card/i, /credit.?card/i, /rewards/i, /registry/i,
              /shipping/i, /returns/i, /track/i, /wishlist/i, /list/i,
              /privacy/i, /terms/i, /policy/i, /legal/i,
            ];

            const shouldSkip = skipPatterns.some(pattern => pattern.test(text));
            const isShortCategoryName = text.length >= 3 && text.length <= 25;
            const looksLikeCategory = /^[a-zA-Z\s&]+$/.test(text) && !text.includes('.');

            // Prioritize main navigation elements over subcategory links
            const isMainNavElement = link.parentElement?.classList.contains('fob-item') ||
                                   link.classList.contains('menu-link-heavy') ||
                                   link.parentElement?.classList.contains('primary-nav') ||
                                   link.parentElement?.classList.contains('main-nav');

            // Skip subcategory links (menu-link-sm) unless they're main nav
            const isSubcategoryLink = link.classList.contains('menu-link-sm');

            if (!shouldSkip && isShortCategoryName && looksLikeCategory &&
                (isMainNavElement || !isSubcategoryLink)) {
              triggers.push({
                category: text,
                url: href,
                element: {
                  tagName: link.tagName,
                  className: link.className,
                  textContent: text,
                },
                // Store selector path for later hover
                selectorInfo: {
                  id: link.id,
                  className: link.className,
                  textContent: text,
                  role: link.getAttribute('role'),
                },
              });
            }
          });
        } catch (e) {
          // Continue with other selectors
        }
      });

      return triggers;
    });
  }

  /**
   * Capture mega-menu for a specific trigger
   */
  async captureMegaMenu(page, trigger, menuIndex) {
    this.logger.debug(`Capturing mega-menu for ${trigger.category}`);

    try {
      // Find the trigger element and hover
      const triggerElement = await this.findTriggerElement(page, trigger);

      if (!triggerElement) {
        this.logger.warn(`Could not find trigger element for ${trigger.category}`);
        return null;
      }

      // Hover to trigger mega-menu
      await triggerElement.hover();
      this.logger.debug(`Hovered over ${trigger.category} trigger`);

      // Wait for mega-menu to appear
      await page.waitForTimeout(this.options.hoverDelay);

      // Capture the mega-menu structure using the same logic as our working script
      const megaMenuData = await page.evaluate((categoryName) => {
        // Look for flyout container specific to this category
        const flyoutContainer = document.querySelector(`#${categoryName}.flyout-container`) ||
                              document.querySelector(`[id*="${categoryName}"].flyout-container`) ||
                              document.querySelector('.flyout-container:visible, .mega-menu:visible, .dropdown-content:visible');

        if (!flyoutContainer) {
          return { error: `No flyout container found for ${categoryName}` };
        }

        const navigationStructure = {
          category: categoryName,
          timestamp: new Date().toISOString(),
          url: window.location.href,
          columns: [],
        };

        // Find all category cells (columns in the mega-menu)
        const categoryColumns = flyoutContainer.querySelectorAll('.category-cell.grid-y, .mega-menu-column, .menu-column');

        categoryColumns.forEach((column, columnIndex) => {
          const columnData = {
            index: columnIndex,
            groups: [],
          };

          // Find category groups within this column
          const categoryGroups = column.querySelectorAll('.category-group, .menu-group, .nav-group');

          categoryGroups.forEach(group => {
            // Extract group title
            const titleElement = group.querySelector('h5 span, h4, h3, .group-title, .menu-title');
            const groupTitle = titleElement ? titleElement.textContent.trim() : 'Unknown';

            const groupData = {
              title: groupTitle,
              items: [],
            };

            // Find all links within this group
            const links = group.querySelectorAll('a');

            links.forEach(link => {
              const titleSpan = link.querySelector('span');
              const itemTitle = titleSpan ? titleSpan.textContent.trim() : link.textContent.trim();
              const itemUrl = link.href;

              // Extract category ID from URL if present
              const idMatch = itemUrl.match(/[?&]id=(\d+)/);
              const categoryId = idMatch ? idMatch[1] : null;

              if (itemTitle && itemUrl && itemUrl !== '#') {
                groupData.items.push({
                  title: itemTitle,
                  url: itemUrl,
                  categoryId: categoryId,
                });
              }
            });

            if (groupData.items.length > 0) {
              columnData.groups.push(groupData);
            }
          });

          if (columnData.groups.length > 0) {
            navigationStructure.columns.push(columnData);
          }
        });

        // Generate summary statistics
        const totalGroups = navigationStructure.columns.reduce((sum, col) => sum + col.groups.length, 0);
        const totalItems = navigationStructure.columns.reduce((sum, col) =>
          sum + col.groups.reduce((groupSum, group) => groupSum + group.items.length, 0), 0);

        navigationStructure.summary = {
          total_columns: navigationStructure.columns.length,
          total_groups: totalGroups,
          total_items: totalItems,
        };

        return navigationStructure;
      }, trigger.category);

      // Move mouse away to dismiss menu
      await page.mouse.move(10, 10);
      await page.waitForTimeout(this.options.dismissDelay);

      // Return structured data with metadata
      return {
        metadata: {
          site: new URL(page.url()).hostname,
          navigation_type: 'desktop_mega_menu',
          capture_method: 'hover_interaction',
          timestamp: new Date().toISOString(),
          user_agent: 'Desktop Chrome',
          viewport: await page.viewportSize(),
        },
        navigation: megaMenuData,
      };

    } catch (error) {
      this.logger.warn(`Failed to capture mega-menu for ${trigger.category}: ${error.message}`);
      return null;
    }
  }

  /**
   * Find the trigger element on the page
   */
  async findTriggerElement(page, trigger) {
    try {
      // Try multiple approaches to find the element

      // First try by text content
      const byText = page.getByRole('link', { name: trigger.category }).first();
      if (await byText.isVisible({ timeout: 1000 })) {
        return byText;
      }

      // Try by ID if available
      if (trigger.selectorInfo.id) {
        const byId = page.locator(`#${trigger.selectorInfo.id}`);
        if (await byId.isVisible({ timeout: 1000 })) {
          return byId;
        }
      }

      // Try by className and text combination
      if (trigger.selectorInfo.className) {
        const byClass = page.locator(`.${trigger.selectorInfo.className.split(' ')[0]}`);
        const elements = await byClass.all();

        for (const element of elements) {
          const text = await element.textContent();
          if (text?.trim().toLowerCase() === trigger.category.toLowerCase()) {
            if (await element.isVisible()) {
              return element;
            }
          }
        }
      }

      return null;
    } catch (error) {
      this.logger.debug(`Error finding trigger element: ${error.message}`);
      return null;
    }
  }

  /**
   * Convert mega-menu structure to flat items for compatibility
   */
  convertMegaMenuToItems(navigationData, categoryName) {
    const items = [];

    if (!navigationData.columns) {return items;}

    navigationData.columns.forEach((column, columnIndex) => {
      column.groups.forEach((group, groupIndex) => {
        group.items.forEach((item, itemIndex) => {
          items.push({
            name: item.title,
            text: item.title,
            url: item.url,
            selector: `megamenu-${categoryName}-col${columnIndex}-group${groupIndex}-item${itemIndex}`,
            type: 'mega_menu_item',
            category: categoryName,
            group: group.title,
            categoryId: item.categoryId,
            column: columnIndex,
            groupIndex: groupIndex,
            has_dropdown: false,
            discovered_by: 'MegaMenuStrategy',
          });
        });
      });
    });

    return items;
  }

  /**
   * Calculate confidence based on results
   */
  calculateConfidence(capturedMenus, totalTriggers) {
    const menuCount = Object.keys(capturedMenus).length;

    if (menuCount === 0) {return 0;}

    // Base confidence on success rate and items found
    let confidence = Math.min(menuCount / totalTriggers, 1.0) * 0.6; // Success rate component

    // Bonus for rich menus
    const totalItems = Object.values(capturedMenus).reduce((sum, menu) => {
      return sum + (menu.navigation?.summary?.total_items || 0);
    }, 0);

    if (totalItems > 50) {confidence += 0.3;} // Rich mega-menus bonus
    else if (totalItems > 20) {confidence += 0.2;}
    else if (totalItems > 10) {confidence += 0.1;}

    // Bonus for multiple columns (indicates true mega-menu)
    const hasMultiColumn = Object.values(capturedMenus).some(menu =>
      menu.navigation?.summary?.total_columns > 1,
    );
    if (hasMultiColumn) {confidence += 0.1;}

    return Math.min(confidence, 1.0);
  }
}

module.exports = MegaMenuStrategy;
