import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { Logger } from '../types/common.types';
import { WorldModel } from './WorldModel';

interface NavigationSection {
  name: string;
  url: string;
  selector: string;
  has_dropdown: boolean;
  element_type: string;
}

interface DropdownItem {
  name: string;
  url: string;
  selector: string;
  is_brand: boolean;
  is_category: boolean;
}

interface DropdownColumn {
  index: number;
  selector: string;
  type: 'brands' | 'categories' | 'featured' | 'general';
  items: Array<{
    name: string;
    url: string;
    selector: string;
  }>;
}

interface DropdownMenu {
  selector: string;
  trigger_selector: string | null;
  items: DropdownItem[];
  columns: DropdownColumn[];
}

interface SidebarNavigationItem {
  name: string;
  url: string | null;
  selector: string;
  type: string;
  is_filter: boolean;
}

interface BreadcrumbItem {
  text: string;
  url: string | null;
  selector: string;
}

interface BreadcrumbPattern {
  selector: string;
  path: BreadcrumbItem[];
}

interface ClickableElement {
  text: string;
  url: string | null;
  selector: string;
  type: string;
  classes: string;
  page_purpose: 'cart' | 'account' | 'search' | 'navigation' | 'product' | 'category' | 'purchase' | 'filtering' | 'general';
}

interface NavigationIntelligence {
  main_sections: NavigationSection[];
  dropdown_menus: Record<string, DropdownMenu>;
  navigation_selectors: {
    main_nav?: string;
  };
  clickable_elements: ClickableElement[];
  site_structure: Record<string, any>;
  breadcrumb_patterns: BreadcrumbPattern[];
  sidebar_navigation: SidebarNavigationItem[];
}

class NavigationMapper {
  private logger: Logger;
  private worldModel: WorldModel;
  private browser: Browser | null = null;

  constructor(logger: Logger, worldModel: WorldModel) {
    this.logger = logger;
    this.worldModel = worldModel;
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: process.env.HEADLESS_MODE !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    this.logger.info('Navigation Mapper initialized');
  }

  async mapSiteNavigation(url: string): Promise<NavigationIntelligence> {
    if (!this.browser) {
      await this.initialize();
    }

    if (!this.browser) {
      throw new Error('Failed to initialize browser');
    }

    const domain = new URL(url).hostname;
    const context: BrowserContext = await this.browser.newContext();
    const page: Page = await context.newPage();

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

  private async extractNavigationIntelligence(page: Page): Promise<NavigationIntelligence> {
    return await page.evaluate(() => {
      const intelligence: NavigationIntelligence = {
        main_sections: [],
        dropdown_menus: {},
        navigation_selectors: {},
        clickable_elements: [],
        site_structure: {},
        breadcrumb_patterns: [],
        sidebar_navigation: [],
      };

      // Helper function to generate reliable CSS selector
      const generateSelector = (element: Element): string => {
        if (element.id) {
          return `#${element.id}`;
        }

        if (element.className && typeof element.className === 'string') {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {
            return `.${classes[0]}`;
          }
        }

        if (element.getAttribute('data-testid')) {
          return `[data-testid="${element.getAttribute('data-testid')}"]`;
        }

        // Generate path-based selector as fallback
        const path: string[] = [];
        let current: Element | null = element;
        while (current && current !== document.body) {
          let selector = current.tagName.toLowerCase();
          if (current.className && typeof current.className === 'string') {
            const firstClass = current.className.split(' ')[0];
            if (firstClass) {
              selector += `.${firstClass}`;
            }
          }
          path.unshift(selector);
          current = current.parentElement;
          if (path.length > 4) {
            break;
          }
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
            if (link.textContent?.trim() && (link as HTMLAnchorElement).href) {
              const section: NavigationSection = {
                name: link.textContent.trim(),
                url: (link as HTMLAnchorElement).href,
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
        const dropdownInfo: DropdownMenu = {
          selector: generateSelector(dropdown),
          trigger_selector: findDropdownTrigger(dropdown),
          items: [],
          columns: [],
        };

        // Extract dropdown items
        const items = dropdown.querySelectorAll('a');
        items.forEach(item => {
          if (item.textContent?.trim() && (item as HTMLAnchorElement).href) {
            dropdownInfo.items.push({
              name: item.textContent.trim(),
              url: (item as HTMLAnchorElement).href,
              selector: generateSelector(item),
              is_brand: isBrandLink(item as HTMLAnchorElement),
              is_category: isCategoryLink(item as HTMLAnchorElement),
            });
          }
        });

        // Detect column structure
        const columns = dropdown.querySelectorAll('.column, .menu-column, .nav-column');
        columns.forEach((column, colIndex) => {
          const columnInfo: DropdownColumn = {
            index: colIndex,
            selector: generateSelector(column),
            type: classifyColumn(column),
            items: [],
          };

          const columnLinks = column.querySelectorAll('a');
          columnLinks.forEach(link => {
            if (link.textContent?.trim()) {
              columnInfo.items.push({
                name: link.textContent.trim(),
                url: (link as HTMLAnchorElement).href || '',
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
            if (item.textContent?.trim()) {
              intelligence.sidebar_navigation.push({
                name: item.textContent.trim(),
                url: (item as HTMLAnchorElement).href || null,
                selector: generateSelector(item),
                type: item.tagName.toLowerCase(),
                is_filter: item.textContent.toLowerCase().includes('filter') ||
                          (item.className && item.className.includes('filter')),
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
          const breadcrumbPath: BreadcrumbItem[] = [];

          items.forEach(item => {
            if (item.textContent?.trim()) {
              breadcrumbPath.push({
                text: item.textContent.trim(),
                url: (item as HTMLAnchorElement).href || null,
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
        if (index >= 100) {
          return;
        }

        const text = element.textContent?.trim() || '';
        if (text && text.length < 100) {
          intelligence.clickable_elements.push({
            text: text,
            url: (element as HTMLAnchorElement).href || null,
            selector: generateSelector(element),
            type: element.tagName.toLowerCase(),
            classes: element.className?.toString() || '',
            page_purpose: classifyElementPurpose(element, text),
          });
        }
      });

      // Helper functions (defined within the page context)
      function hasDropdownMenu(element: Element): boolean {
        const parent = element.closest('li, .nav-item, .menu-item');
        if (parent) {
          return !!(parent.querySelector('.dropdown, .submenu, .mega-menu') ||
                   parent.querySelector('[data-dropdown]'));
        }
        return false;
      }

      function findDropdownTrigger(dropdown: Element): string | null {
        const parent = dropdown.parentElement;
        const trigger = parent?.querySelector('a, button, [data-toggle]');
        return trigger ? generateSelector(trigger) : null;
      }

      function isBrandLink(element: HTMLAnchorElement): boolean {
        const text = element.textContent?.toLowerCase() || '';
        const url = element.href?.toLowerCase() || '';

        return url.includes('/brand') ||
               url.includes('/designer') ||
               (text.match(/^[A-Z][a-z]+\s*[A-Z]*[a-z]*$/) && // Brand name pattern
               !text.includes('shop') &&
               !text.includes('new') &&
               !text.includes('sale')) || false;
      }

      function isCategoryLink(element: HTMLAnchorElement): boolean {
        const text = element.textContent?.toLowerCase() || '';
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

      function classifyColumn(column: Element): 'brands' | 'categories' | 'featured' | 'general' {
        const text = column.textContent?.toLowerCase() || '';

        if (text.includes('brand') || text.includes('designer')) {
          return 'brands';
        }
        if (text.includes('category') || text.includes('shop')) {
          return 'categories';
        }
        if (text.includes('new') || text.includes('featured')) {
          return 'featured';
        }

        return 'general';
      }

      function classifyElementPurpose(element: Element, text: string): ClickableElement['page_purpose'] {
        const lowerText = text.toLowerCase();
        const url = (element as HTMLAnchorElement).href?.toLowerCase() || '';

        if (lowerText.includes('cart') || lowerText.includes('bag')) {
          return 'cart';
        }
        if (lowerText.includes('account') || lowerText.includes('login')) {
          return 'account';
        }
        if (lowerText.includes('search')) {
          return 'search';
        }
        if (lowerText.includes('menu') || lowerText.includes('navigation')) {
          return 'navigation';
        }
        if (url.includes('/product')) {
          return 'product';
        }
        if (url.includes('/collection') || url.includes('/category')) {
          return 'category';
        }
        if (lowerText.includes('add to cart') || lowerText.includes('buy')) {
          return 'purchase';
        }
        if (lowerText.includes('filter') || lowerText.includes('sort')) {
          return 'filtering';
        }

        return 'general';
      }

      return intelligence;
    });
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.logger.info('Navigation Mapper closed');
    }
  }
}

export default NavigationMapper;