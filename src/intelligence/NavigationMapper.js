const { chromium } = require('playwright');

class NavigationMapper {
  constructor(logger, worldModel) {
    this.logger = logger;
    this.worldModel = worldModel;
    this.browser = null;
  }

  async initialize() {
    this.browser = await chromium.launch({
      headless: process.env.HEADLESS_MODE !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    this.logger.info('Navigation Mapper initialized');
  }

  async mapSiteNavigation(url) {
    if (!this.browser) {await this.initialize();}

    const domain = new URL(url).hostname;
    const context = await this.browser.newContext();
    const page = await context.newPage();

    try {
      this.logger.info(`Starting navigation mapping for ${domain}`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      const navigationIntelligence = await this.extractNavigationIntelligence(page);

      // Store in world model
      await this.worldModel.storeSiteNavigation(domain, navigationIntelligence);

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

  async extractNavigationIntelligence(page) {
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

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.logger.info('Navigation Mapper closed');
    }
  }
}

module.exports = NavigationMapper;
