const { chromium } = require('playwright');
const NavigationDiscoveryPipeline = require('./navigation/NavigationDiscoveryPipeline');
const NavigationTreeBuilder = require('./navigation/NavigationTreeBuilder');
const MainNavigationStrategy = require('./navigation/strategies/MainNavigationStrategy');
const DropdownDiscoveryStrategy = require('./navigation/strategies/DropdownDiscoveryStrategy');
const AriaNavigationStrategy = require('./navigation/strategies/AriaNavigationStrategy');
const DataAttributeStrategy = require('./navigation/strategies/DataAttributeStrategy');
const VisibleNavigationStrategy = require('./navigation/strategies/VisibleNavigationStrategy');
const HiddenElementStrategy = require('./navigation/strategies/HiddenElementStrategy');
const DepartmentExplorationStrategy = require('./navigation/strategies/DepartmentExplorationStrategy');

class NavigationMapper {
  constructor(logger, worldModel) {
    this.logger = logger;
    this.worldModel = worldModel;
    this.browser = null;
    this.pipeline = null;
    this.treeBuilder = null;
    this.usePipeline = true; // Feature flag to enable/disable pipeline
    this.buildHierarchicalTree = true; // Feature flag for tree building
  }

  async initialize() {
    this.browser = await chromium.launch({
      headless: process.env.HEADLESS_MODE !== 'false',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
    });
    
    // Initialize the discovery pipeline with strategies
    if (this.usePipeline) {
      this.pipeline = new NavigationDiscoveryPipeline(this.logger, this.worldModel);
      
      // Add strategies in priority order - focused on getting clean main navigation
      this.pipeline.addStrategies([
        new MainNavigationStrategy(this.logger),       // Get main departments first
        new DropdownDiscoveryStrategy(this.logger),    // Then get dropdown content
        new AriaNavigationStrategy(this.logger),       // ARIA-based navigation
        new DataAttributeStrategy(this.logger),        // Data attribute patterns
        new VisibleNavigationStrategy(this.logger),    // Visible elements fallback
        new HiddenElementStrategy(this.logger),        // Hidden menus if needed
        new DepartmentExplorationStrategy(this.logger, { maxDepartments: 2 }) // Limited deep exploration
      ]);
      
      this.logger.info('Navigation Mapper initialized with discovery pipeline');
    } else {
      this.logger.info('Navigation Mapper initialized (legacy mode)');
    }
    
    // Initialize tree builder
    if (this.buildHierarchicalTree) {
      this.treeBuilder = new NavigationTreeBuilder(this.logger);
      this.logger.info('Navigation Tree Builder initialized');
    }
  }

  async mapSiteNavigation(url) {
    if (!this.browser) {await this.initialize();}

    const domain = new URL(url).hostname;
    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
      this.logger.info(`Starting navigation mapping for ${domain}`);

      // Use domcontentloaded and then wait for JS to render
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Additional wait to ensure JavaScript has rendered navigation
      await page.waitForTimeout(3000);
      
      // Wait for navigation elements to appear
      try {
        await page.waitForSelector('nav, header, [role="navigation"], [class*="nav"], [class*="menu"]', { 
          timeout: 5000,
          state: 'visible'
        });
        this.logger.info('Navigation elements detected on page');
      } catch (e) {
        this.logger.warn('No navigation elements found with initial selectors, continuing anyway');
      }
      
      // Close any popups that might block navigation discovery
      await this.closeAnyPopups(page);

      const navigationIntelligence = await this.extractNavigationIntelligence(page);
      
      // Build hierarchical tree if enabled
      if (this.buildHierarchicalTree && this.treeBuilder) {
        try {
          this.logger.info('Building hierarchical navigation tree...');
          const navigationTree = await this.treeBuilder.buildNavigationTree(
            url, 
            navigationIntelligence,
            {
              maxDepth: 3,
              maxBranchWidth: 15
            }
          );
          
          // Add tree to navigation intelligence
          navigationIntelligence.hierarchical_tree = navigationTree;
          navigationIntelligence.tree_metadata = {
            total_nodes: navigationTree.metadata.total_items,
            max_depth: navigationTree.metadata.max_depth_reached,
            categories: navigationTree.children.length
          };
          
          this.logger.info(`Navigation tree built: ${navigationTree.metadata.total_items} nodes, depth ${navigationTree.metadata.max_depth_reached}`);
          
        } catch (error) {
          this.logger.error('Failed to build navigation tree:', error);
          // Continue without tree - flat navigation still works
        }
      }

      // Store in world model if available
      if (this.worldModel && this.worldModel.storeSiteNavigation) {
        await this.worldModel.storeSiteNavigation(domain, navigationIntelligence);
      }

      this.logger.info(`Navigation mapping completed for ${domain}`);
      return navigationIntelligence;

    } catch (error) {
      this.logger.error(`Navigation mapping failed for ${domain}:`, error);
      throw error;
    } finally {
      await page.close();
      await context.close();
    }
  }

  async closeAnyPopups(page) {
    try {
      const modalCloseSelectors = [
        // Aria labels
        'button[aria-label*="close"]:visible',
        'button[aria-label*="Close"]:visible',
        'button[aria-label*="dismiss"]:visible',
        
        // Modal/popup close buttons
        '[class*="modal"] button[class*="close"]:visible',
        '[class*="popup"] button[class*="close"]:visible',
        '[class*="overlay"] button[class*="close"]:visible',
        '.modal button.close:visible',
        '.popup button.close:visible',
        
        // Text-based close buttons
        'button:has-text("No Thanks"):visible',
        'button:has-text("Close"):visible',
        'button:has-text("X"):visible',
        'button:has-text("×"):visible',
        'button:has-text("Dismiss"):visible',
        'button:has-text("Maybe Later"):visible',
        
        // Cookie/privacy banners
        'button[class*="accept-cookies"]:visible',
        'button[class*="cookie-accept"]:visible',
        'button:has-text("Accept"):visible',
        'button:has-text("I Agree"):visible',
        'button:has-text("Got It"):visible',
        
        // Email signup dismissals
        'button[class*="decline"]:visible',
        '[class*="email-signup"] button[class*="close"]:visible',
        '[class*="newsletter"] button[class*="close"]:visible',
        
        // Generic close icons
        'button.close:visible',
        'a.close:visible',
        '[class*="close-button"]:visible',
        '[class*="close-icon"]:visible',
        '[class*="dialog"] button[class*="close"]:visible',
        '[role="dialog"] button[aria-label*="close"]:visible'
      ];
      
      let closedCount = 0;
      
      // Try to close multiple popups/overlays
      for (const selector of modalCloseSelectors) {
        try {
          const closeButtons = await page.locator(selector).all();
          for (const button of closeButtons) {
            try {
              if (await button.isVisible({ timeout: 100 })) {
                await button.click();
                closedCount++;
                await page.waitForTimeout(200);
              }
            } catch (e) {
              // Skip if can't click
            }
          }
        } catch (e) {
          // Try next selector
        }
      }
      
      // Also try to click outside any modal/overlay to dismiss
      if (closedCount === 0) {
        try {
          // Click on body to dismiss any click-outside dismissable overlays
          await page.locator('body').click({ position: { x: 10, y: 10 }, timeout: 500 });
        } catch (e) {
          // Ignore if can't click
        }
      }
      
      if (closedCount > 0) {
        this.logger.info(`Closed ${closedCount} popup(s)/modal(s)`);
        // Wait a bit longer for animations to complete
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      // No modal to close
    }
    return false;
  }

  async extractNavigationIntelligence(page) {
    // Use pipeline if enabled
    if (this.usePipeline && this.pipeline) {
      try {
        this.logger.info('Using NavigationDiscoveryPipeline for enhanced discovery');
        
        const pipelineResults = await this.pipeline.discover(page, {
          maxStrategies: 10,  // Run ALL strategies
          minConfidence: 0.2,  // Lower threshold for comprehensive discovery
          parallel: false, // Sequential for better debugging
          earlyExit: false  // Don't stop early - get everything!
        });
        
        // Convert pipeline results to legacy format
        return this.convertPipelineToLegacyFormat(pipelineResults);
        
      } catch (error) {
        this.logger.error('Pipeline discovery failed, falling back to legacy:', error.message);
        // Fall through to legacy method
      }
    }
    
    // Legacy extraction method (current implementation)
    return await page.evaluate(() => {
      const intelligence = {
        main_sections: [],
        dropdown_menus: {},
        navigation_selectors: {},
        clickable_elements: [],
        site_structure: {},
        breadcrumb_patterns: [],
        sidebar_navigation: [],
      };

      // Helper function to generate reliable CSS selector
      const generateSelector = (element) => {
        if (element.id) {return `#${element.id}`;}

        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {return `.${classes[0]}`;}
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
            if (firstClass) {selector += `.${firstClass}`;}
          }
          path.unshift(selector);
          current = current.parentElement;
          if (path.length > 4) {break;} // Limit depth
        }

        return path.join(' > ');
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
      ];

      for (const selector of mainNavSelectors) {
        const navElement = document.querySelector(selector);
        if (navElement) {
          intelligence.navigation_selectors.main_nav = selector;

          // Find main section links
          const sectionLinks = navElement.querySelectorAll('a');
          sectionLinks.forEach(link => {
            if (link.textContent.trim() && link.href) {
              const section = {
                name: link.textContent.trim(),
                url: link.href,
                selector: generateSelector(link),
                has_dropdown: hasDropdownMenu(link),
                element_type: link.tagName.toLowerCase(),
              };

              intelligence.main_sections.push(section);
            }
          });
          break;
        }
      }

      // Extract dropdown menu structures
      const dropdownElements = document.querySelectorAll(
        '.dropdown, .mega-menu, .submenu, [data-dropdown], .nav-dropdown',
      );

      dropdownElements.forEach((dropdown, index) => {
        const dropdownInfo = {
          selector: generateSelector(dropdown),
          trigger_selector: findDropdownTrigger(dropdown),
          items: [],
          columns: [],
        };

        // Extract dropdown items
        const items = dropdown.querySelectorAll('a');
        items.forEach(item => {
          if (item.textContent.trim() && item.href) {
            dropdownInfo.items.push({
              name: item.textContent.trim(),
              url: item.href,
              selector: generateSelector(item),
              is_brand: isBrandLink(item),
              is_category: isCategoryLink(item),
            });
          }
        });

        // Detect column structure
        const columns = dropdown.querySelectorAll('.column, .menu-column, .nav-column');
        columns.forEach((column, colIndex) => {
          const columnInfo = {
            index: colIndex,
            selector: generateSelector(column),
            type: classifyColumn(column),
            items: [],
          };

          const columnLinks = column.querySelectorAll('a');
          columnLinks.forEach(link => {
            if (link.textContent.trim()) {
              columnInfo.items.push({
                name: link.textContent.trim(),
                url: link.href,
                selector: generateSelector(link),
              });
            }
          });

          dropdownInfo.columns.push(columnInfo);
        });

        intelligence.dropdown_menus[`dropdown_${index}`] = dropdownInfo;
      });

      // Extract sidebar navigation (common in category pages)
      const sidebarSelectors = [
        '.sidebar',
        '.category-nav',
        '.filters',
        '.facets',
        '.left-nav',
        '.side-navigation',
      ];

      for (const selector of sidebarSelectors) {
        const sidebar = document.querySelector(selector);
        if (sidebar) {
          const categories = sidebar.querySelectorAll('a, button');
          categories.forEach(item => {
            if (item.textContent.trim()) {
              intelligence.sidebar_navigation.push({
                name: item.textContent.trim(),
                url: item.href || null,
                selector: generateSelector(item),
                type: item.tagName.toLowerCase(),
                is_filter: item.textContent.toLowerCase().includes('filter') ||
                          item.className.includes('filter'),
              });
            }
          });
          break;
        }
      }

      // Extract breadcrumb patterns
      const breadcrumbSelectors = [
        '.breadcrumb',
        '.breadcrumbs',
        '[aria-label="breadcrumb"]',
        '.nav-breadcrumb',
      ];

      for (const selector of breadcrumbSelectors) {
        const breadcrumb = document.querySelector(selector);
        if (breadcrumb) {
          const items = breadcrumb.querySelectorAll('a, span');
          const breadcrumbPath = [];

          items.forEach(item => {
            if (item.textContent.trim()) {
              breadcrumbPath.push({
                text: item.textContent.trim(),
                url: item.href || null,
                selector: generateSelector(item),
              });
            }
          });

          if (breadcrumbPath.length > 0) {
            intelligence.breadcrumb_patterns.push({
              selector: selector,
              path: breadcrumbPath,
            });
          }
          break;
        }
      }

      // Extract all clickable elements for comprehensive mapping
      const clickableElements = document.querySelectorAll('a, button, [role="button"], [onclick]');
      clickableElements.forEach((element, index) => {
        if (index >= 100) {return;} // Limit to prevent overwhelming data

        const text = element.textContent.trim();
        if (text && text.length < 100) {
          intelligence.clickable_elements.push({
            text: text,
            url: element.href || null,
            selector: generateSelector(element),
            type: element.tagName.toLowerCase(),
            classes: element.className,
            page_purpose: classifyElementPurpose(element, text),
          });
        }
      });

      // Helper functions (defined within the page context)
      function hasDropdownMenu(element) {
        const parent = element.closest('li, .nav-item, .menu-item');
        if (parent) {
          return !!(parent.querySelector('.dropdown, .submenu, .mega-menu') ||
                   parent.querySelector('[data-dropdown]'));
        }
        return false;
      }

      function findDropdownTrigger(dropdown) {
        const parent = dropdown.parentElement;
        const trigger = parent?.querySelector('a, button, [data-toggle]');
        return trigger ? generateSelector(trigger) : null;
      }

      function isBrandLink(element) {
        const text = element.textContent.toLowerCase();
        const url = element.href?.toLowerCase() || '';

        return url.includes('/brand') ||
               url.includes('/designer') ||
               text.match(/^[A-Z][a-z]+\s*[A-Z]*[a-z]*$/) && // Brand name pattern
               !text.includes('shop') &&
               !text.includes('new') &&
               !text.includes('sale');
      }

      function isCategoryLink(element) {
        const text = element.textContent.toLowerCase();
        const url = element.href?.toLowerCase() || '';

        const categoryKeywords = [
          'clothing', 'shoes', 'accessories', 'bags', 'jewelry',
          'shirts', 'pants', 'dresses', 'jackets', 'sweaters',
          'new arrivals', 'sale', 'featured',
        ];

        return categoryKeywords.some(keyword =>
          text.includes(keyword) || url.includes(keyword),
        );
      }

      function classifyColumn(column) {
        const text = column.textContent.toLowerCase();

        if (text.includes('brand') || text.includes('designer')) {return 'brands';}
        if (text.includes('category') || text.includes('shop')) {return 'categories';}
        if (text.includes('new') || text.includes('featured')) {return 'featured';}

        return 'general';
      }

      function classifyElementPurpose(element, text) {
        const lowerText = text.toLowerCase();
        const url = element.href?.toLowerCase() || '';

        if (lowerText.includes('cart') || lowerText.includes('bag')) {return 'cart';}
        if (lowerText.includes('account') || lowerText.includes('login')) {return 'account';}
        if (lowerText.includes('search')) {return 'search';}
        if (lowerText.includes('menu') || lowerText.includes('navigation')) {return 'navigation';}
        if (url.includes('/product')) {return 'product';}
        if (url.includes('/collection') || url.includes('/category')) {return 'category';}
        if (lowerText.includes('add to cart') || lowerText.includes('buy')) {return 'purchase';}
        if (lowerText.includes('filter') || lowerText.includes('sort')) {return 'filtering';}

        return 'general';
      }

      return intelligence;
    });
  }

  /**
   * Convert pipeline results to legacy NavigationMapper format
   * This ensures backward compatibility with existing code
   */
  convertPipelineToLegacyFormat(pipelineResults) {
    const { navigation_map, discovery_metadata } = pipelineResults;
    
    // The pipeline already returns in a compatible format
    // Just add any missing fields for complete compatibility
    const legacyFormat = {
      main_sections: navigation_map.main_sections || [],
      dropdown_menus: navigation_map.dropdown_menus || {},
      navigation_selectors: navigation_map.navigation_selectors || {},
      clickable_elements: navigation_map.clickable_elements || [],
      site_structure: {},
      breadcrumb_patterns: navigation_map.breadcrumb_patterns || [],
      sidebar_navigation: navigation_map.sidebar_navigation || [],
      _pipeline_metadata: discovery_metadata // Store pipeline metadata for debugging
    };
    
    // Log discovery summary
    this.logger.info(`Pipeline discovered: ${legacyFormat.main_sections.length} main sections, ${Object.keys(legacyFormat.dropdown_menus).length} dropdowns`);
    if (discovery_metadata) {
      this.logger.info(`Strategies used: ${discovery_metadata.strategies_used?.join(', ')}`);
      this.logger.info(`Discovery confidence: ${(discovery_metadata.confidence * 100).toFixed(1)}%`);
    }
    
    return legacyFormat;
  }

  async close() {
    if (this.treeBuilder) {
      await this.treeBuilder.cleanup();
    }
    if (this.browser) {
      await this.browser.close();
      this.logger.info('Navigation Mapper closed');
    }
  }
}

module.exports = NavigationMapper;
