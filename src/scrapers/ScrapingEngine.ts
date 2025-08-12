import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as cheerio from 'cheerio';
import { Logger } from '../types/common.types';

interface ProductLink {
  text: string;
  href: string;
  selector: string;
}

interface PriceElement {
  text: string;
  className: string;
  tagName: string;
  selector: string;
}

interface NavigationLink {
  text: string;
  href: string;
}

interface ImageInfo {
  src: string;
  alt: string;
}

interface EcommerceIndicators {
  has_add_to_cart: boolean;
  has_shopping_cart: boolean;
  has_product_grid: boolean;
  has_search: boolean;
  product_count: number;
  navigation_count: number;
  platform: string;
  ecommerce_score: number;
}

interface BasicScrapeResult {
  title: string;
  url: string;
  h1_tags: string[];
  product_links: ProductLink[];
  price_elements: PriceElement[];
  navigation_links: NavigationLink[];
  images: ImageInfo[];
  meta_description: string;
  ecommerce_indicators: EcommerceIndicators;
}

interface Metadata {
  title: string;
  description: string | null;
  siteName: string | null;
  type: string | null;
  platform: string;
  language: string;
}

interface SearchInfo {
  selector: string;
  placeholder: string;
}

interface Navigation {
  mainMenu: NavigationLink[];
  categories: any[];
  filters: any[];
  search: SearchInfo | null;
}

interface Product {
  title: string | null;
  price: string | null;
  image: string | null;
  link: string | null;
  selector: string;
  variants: string[];
}

interface EcommercePatterns {
  hasCart: boolean;
  hasWishlist: boolean;
  hasFilters: boolean;
  hasPagination: boolean;
  hasProductGrid: boolean;
  hasProductList: boolean;
  hasSearch: boolean;
  hasUserAccount: boolean;
  hasCheckout: boolean;
  ecommerceScore: number;
}

interface PageStructure {
  hasHeader: boolean;
  hasFooter: boolean;
  hasSidebar: boolean;
  hasMain: boolean;
  totalElements: number;
  scriptTags: number;
  styleTags: number;
}

interface SiteStructure {
  url: string;
  timestamp: string;
  metadata: Metadata;
  navigation: Navigation;
  products: Product[];
  ecommercePatterns: EcommercePatterns;
  pageStructure: PageStructure;
}

interface UniversalSelectors {
  productLinks: string[];
  prices: string[];
  addToCart: string[];
  cart: string[];
  navigation: string[];
  search: string[];
  products: string[];
}

class ScrapingEngine {
  private logger: Logger;
  private browser: Browser | null = null;
  private contexts: BrowserContext[] = [];
  private maxConcurrentPages: number;
  private requestDelayMin: number;
  private requestDelayMax: number;
  private headless: boolean;

  constructor(logger: Logger) {
    this.logger = logger;
    this.maxConcurrentPages = parseInt(process.env.CONCURRENT_BROWSERS || '5');
    this.requestDelayMin = parseInt(process.env.REQUEST_DELAY_MIN || '1000');
    this.requestDelayMax = parseInt(process.env.REQUEST_DELAY_MAX || '3000');
    this.headless = process.env.HEADLESS_MODE !== 'false';
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Playwright browser...');
      this.logger.info(`Platform: ${process.platform}, Architecture: ${process.arch}`);
      this.logger.info(`PLAYWRIGHT_BROWSERS_PATH: ${process.env.PLAYWRIGHT_BROWSERS_PATH}`);

      this.browser = await chromium.launch({
        headless: this.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      });

      this.logger.info('Scraping engine initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize scraping engine:', error);
      this.logger.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        platform: process.platform,
        arch: process.arch,
        browsers_path: process.env.PLAYWRIGHT_BROWSERS_PATH,
      });
      throw error;
    }
  }

  async createContext(): Promise<BrowserContext> {
    const context = await this.browser!.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    this.contexts.push(context);
    return context;
  }

  async performBasicScrape(url: string): Promise<BasicScrapeResult> {
    if (!this.browser) {
      await this.initialize();
    }

    const context = await this.createContext();
    const page = await context.newPage();

    try {
      this.logger.info(`Performing universal scrape for: ${url}`);

      await page.goto(url, { waitUntil: 'networkidle' });
      await this.randomDelay();

      // Universal extraction using comprehensive selectors
      const result = await page.evaluate(() => {
        const universalSelectors: UniversalSelectors = {
          productLinks: [
            'a[href*="/product"]', 'a[href*="/item"]', 'a[href*="/p/"]', 'a[href*="/products/"]',
            '.product-item a', '.product-card a', '.product a', '.item a',
            '[data-product] a', '[data-product-id] a', '.grid-item a',
            'a[href*="/shop/"]', 'a[href*="/store/"]', '.collection-item a',
          ],
          prices: [
            '.price', '.product-price', '.cost', '.amount', '.money', '.sale-price',
            '[data-price]', '[data-cost]', '.price-current', '.price-now',
            '.regular-price', '.special-price', '.final-price', '.product-cost',
            '[class*="price"]', '[class*="cost"]', '[class*="money"]',
          ],
          addToCart: [
            '.add-to-cart', '.addtocart', '.btn-add-cart', '.add-cart',
            'button[data-action*="add"]', 'button[data-add-to-cart]',
            '.product-form button[type="submit"]', '.btn-primary',
            'button[class*="add"]', 'input[value*="add" i]',
          ],
          cart: [
            '.cart', '.shopping-cart', '.minicart', '.bag', '.basket',
            '[href*="/cart"]', '[data-cart]', '.cart-icon', '.cart-count',
          ],
          navigation: [
            'nav', '.navigation', '.nav', '.menu', '.main-menu',
            '.header-nav', '.primary-nav', '.site-nav', '.navbar',
          ],
          search: [
            'input[type="search"]', 'input[name*="search"]', 'input[placeholder*="search" i]',
            '.search-input', '.search-field', '.search-box', '[data-search]',
          ],
          products: [
            '.product', '.product-item', '.product-card', '.grid-item',
            '.collection-item', '[data-product]', '.item', '.listing-item',
          ],
        };

        const findElements = (selectors: string[]): Element[] => {
          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) return Array.from(elements);
          }
          return [];
        };

        const detectPlatform = (): string => {
          const indicators: Record<string, string[]> = {
            shopify: ['shopify', 'cdn/shop/', 'myshopify.com', 'shopify-section'],
            woocommerce: ['woocommerce', 'wp-content', 'wc-', 'single-product'],
            magento: ['magento', 'mage-', 'catalog-product', 'checkout/cart'],
            bigcommerce: ['bigcommerce', 'bc-sf-filter', '/product/'],
            squarespace: ['squarespace', 'static1.squarespace'],
            etsy: ['etsy.com', 'etsystatic.com'],
            amazon: ['amazon.com', 'ssl-images-amazon'],
            custom: [],
          };

          const html = document.documentElement.outerHTML.toLowerCase();
          const url = window.location.href.toLowerCase();

          for (const [platform, patterns] of Object.entries(indicators)) {
            if (patterns.some(pattern => html.includes(pattern) || url.includes(pattern))) {
              return platform;
            }
          }
          return 'unknown';
        };

        // Universal product link extraction
        const productLinkElements = findElements(universalSelectors.productLinks);
        const product_links: ProductLink[] = productLinkElements.slice(0, 20).map(a => {
          const linkElement = a as HTMLAnchorElement;
          return {
            text: linkElement.textContent?.trim() || '',
            href: linkElement.href,
            selector: linkElement.className ? `.${linkElement.className.split(' ')[0]}` : 'a',
          };
        }).filter(link => link.text && link.href);

        // Universal price extraction
        const priceElements = findElements(universalSelectors.prices);
        const price_elements: PriceElement[] = priceElements.slice(0, 15).map(el => {
          const element = el as HTMLElement;
          return {
            text: element.textContent?.trim() || '',
            className: element.className,
            tagName: element.tagName,
            selector: element.className ? `.${element.className.split(' ')[0]}` : element.tagName.toLowerCase(),
          };
        }).filter(price => price.text && /[\$£€¥₹]|\d+[\.\,]\d+|\d+/.test(price.text));

        // Universal navigation detection
        const navElements = findElements(universalSelectors.navigation);
        const navigation_links: NavigationLink[] = navElements.slice(0, 5).map(nav => {
          const links = nav.querySelectorAll('a');
          return Array.from(links).slice(0, 8).map(a => {
            const linkElement = a as HTMLAnchorElement;
            return {
              text: linkElement.textContent?.trim() || '',
              href: linkElement.href,
            };
          }).filter(link => link.text && link.text.length < 50);
        }).flat();

        // Universal search detection
        const searchElements = findElements(universalSelectors.search);
        const search_available = searchElements.length > 0;

        // Universal cart detection
        const cartElements = findElements(universalSelectors.cart);
        const cart_available = cartElements.length > 0;

        // Universal product grid detection
        const productElements = findElements(universalSelectors.products);
        const product_count = productElements.length;

        // Add-to-cart detection
        const addToCartElements = findElements(universalSelectors.addToCart);
        const add_to_cart_available = addToCartElements.length > 0;

        return {
          title: document.title,
          url: window.location.href,
          h1_tags: Array.from(document.querySelectorAll('h1')).map(h1 => h1.textContent?.trim() || '').filter(text => text),
          product_links,
          price_elements,
          navigation_links: navigation_links.slice(0, 10),
          images: Array.from(document.querySelectorAll('img')).slice(0, 8).map(img => {
            const imgElement = img as HTMLImageElement;
            return {
              src: imgElement.src,
              alt: imgElement.alt,
            };
          }).filter(img => img.src && !img.src.startsWith('data:')),
          meta_description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
          ecommerce_indicators: {
            has_add_to_cart: add_to_cart_available,
            has_shopping_cart: cart_available,
            has_product_grid: product_count > 0,
            has_search: search_available,
            product_count: product_count,
            navigation_count: navElements.length,
            platform: detectPlatform(),
            ecommerce_score: (
              (add_to_cart_available ? 1 : 0) +
              (cart_available ? 1 : 0) +
              (product_count > 0 ? 1 : 0) +
              (price_elements.length > 0 ? 1 : 0) +
              (search_available ? 1 : 0)
            ) / 5,
          },
        };
      });

      this.logger.info(`Universal scrape completed for: ${url} - Found ${result.product_links.length} products, ${result.price_elements.length} prices, platform: ${result.ecommerce_indicators.platform}`);
      return result;

    } catch (error) {
      this.logger.error(`Universal scrape failed for ${url}:`, error);
      throw error;
    } finally {
      await page.close();
      await context.close();
      this.contexts = this.contexts.filter(ctx => ctx !== context);
    }
  }

  async analyzeSite(url: string): Promise<SiteStructure> {
    if (!this.browser) {
      await this.initialize();
    }
    const context = await this.createContext();
    const page = await context.newPage();

    try {
      this.logger.info(`Analyzing site: ${url}`);

      await page.goto(url, { waitUntil: 'networkidle' });
      await this.randomDelay();

      const siteStructure: SiteStructure = {
        url,
        timestamp: new Date().toISOString(),
        metadata: await this.extractMetadata(page),
        navigation: await this.extractNavigation(page),
        products: await this.extractProducts(page),
        ecommercePatterns: await this.detectEcommercePatterns(page),
        pageStructure: await this.analyzePageStructure(page),
      };

      this.logger.info(`Site analysis completed for ${url}`);
      return siteStructure;

    } catch (error) {
      this.logger.error(`Site analysis failed for ${url}:`, error);
      throw error;
    } finally {
      await page.close();
      await context.close();
      this.contexts = this.contexts.filter(ctx => ctx !== context);
    }
  }

  async extractMetadata(page: Page): Promise<Metadata> {
    return await page.evaluate(() => {
      const getMetaContent = (name: string): string | null => {
        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return meta ? meta.getAttribute('content') : null;
      };

      const detectPlatform = (): string => {
        const indicators: Record<string, string[]> = {
          shopify: [
            'Shopify.theme',
            'shopify-section',
            '/cdn/shop/',
            'myshopify.com',
          ],
          woocommerce: [
            'woocommerce',
            'wp-content',
            'wc-',
            'cart-empty',
          ],
          magento: [
            'Magento',
            'mage-',
            'catalog-product',
            'checkout/cart',
          ],
        };

        const bodyHTML = document.body.innerHTML;
        const url = window.location.href;

        for (const [platform, patterns] of Object.entries(indicators)) {
          if (patterns.some(pattern =>
            bodyHTML.includes(pattern) || url.includes(pattern),
          )) {
            return platform;
          }
        }

        return 'unknown';
      };

      return {
        title: document.title,
        description: getMetaContent('description'),
        siteName: getMetaContent('og:site_name') || getMetaContent('application-name'),
        type: getMetaContent('og:type'),
        platform: detectPlatform(),
        language: document.documentElement.lang || 'en',
      };
    });
  }

  async extractNavigation(page: Page): Promise<Navigation> {
    return await page.evaluate(() => {
      const generateSelector = (element: Element): string => {
        const htmlElement = element as HTMLElement;
        if (htmlElement.id) return `#${htmlElement.id}`;
        if (htmlElement.className) {
          const classes = htmlElement.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) return `.${classes[0]}`;
        }
        return element.tagName.toLowerCase();
      };

      const navigation: Navigation = {
        mainMenu: [],
        categories: [],
        filters: [],
        search: null,
      };

      const navSelectors = [
        'nav',
        '.navigation',
        '.main-menu',
        '.header-nav',
        '.nav-menu',
      ];

      navSelectors.forEach(selector => {
        const navElement = document.querySelector(selector);
        if (navElement) {
          const links = navElement.querySelectorAll('a');
          links.forEach(link => {
            const linkElement = link as HTMLAnchorElement;
            if (linkElement.href && linkElement.textContent?.trim()) {
              navigation.mainMenu.push({
                text: linkElement.textContent.trim(),
                href: linkElement.href,
                selector: generateSelector(linkElement),
              });
            }
          });
        }
      });

      const searchInput = document.querySelector(
        'input[type="search"], input[name*="search"], input[placeholder*="search" i]',
      );
      if (searchInput) {
        const inputElement = searchInput as HTMLInputElement;
        navigation.search = {
          selector: generateSelector(searchInput),
          placeholder: inputElement.placeholder,
        };
      }

      return navigation;
    });
  }

  async extractProducts(page: Page): Promise<Product[]> {
    return await page.evaluate(() => {
      const generateSelector = (element: Element): string => {
        const htmlElement = element as HTMLElement;
        if (htmlElement.id) return `#${htmlElement.id}`;
        if (htmlElement.className) {
          const classes = htmlElement.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) return `.${classes[0]}`;
        }
        return element.tagName.toLowerCase();
      };

      const getProductTitle = (element: Element): string | null => {
        const titleSelectors = [
          '.product-title',
          '.title',
          'h1', 'h2', 'h3',
          '.name',
          '[data-title]',
        ];

        for (const selector of titleSelectors) {
          const titleEl = element.querySelector(selector);
          if (titleEl && titleEl.textContent?.trim()) {
            return titleEl.textContent.trim();
          }
        }
        return null;
      };

      const getProductPrice = (element: Element): string | null => {
        const priceSelectors = [
          '.price',
          '.product-price',
          '.cost',
          '[data-price]',
          '.amount',
        ];

        for (const selector of priceSelectors) {
          const priceEl = element.querySelector(selector);
          if (priceEl && priceEl.textContent?.trim()) {
            return priceEl.textContent.trim();
          }
        }
        return null;
      };

      const getProductImage = (element: Element): string | null => {
        const img = element.querySelector('img');
        return img ? (img as HTMLImageElement).src : null;
      };

      const getProductLink = (element: Element): string | null => {
        const link = element.querySelector('a') || element.closest('a');
        return link ? (link as HTMLAnchorElement).href : null;
      };

      const getProductVariants = (element: Element): string[] => {
        const variants: string[] = [];
        const variantSelectors = element.querySelectorAll('.variant, .option, [data-variant]');
        variantSelectors.forEach(variant => {
          if (variant.textContent?.trim()) {
            variants.push(variant.textContent.trim());
          }
        });
        return variants;
      };

      const products: Product[] = [];

      const productSelectors = [
        '.product',
        '.product-item',
        '.product-card',
        '[data-product]',
        '.grid-product',
        '.product-list-item',
      ];

      productSelectors.forEach(selector => {
        const productElements = document.querySelectorAll(selector);
        productElements.forEach((element, index) => {
          if (index >= 20) return;

          const product: Product = {
            title: getProductTitle(element),
            price: getProductPrice(element),
            image: getProductImage(element),
            link: getProductLink(element),
            selector: generateSelector(element),
            variants: getProductVariants(element),
          };

          if (product.title || product.price) {
            products.push(product);
          }
        });
      });

      return products;
    });
  }

  async detectEcommercePatterns(page: Page): Promise<EcommercePatterns> {
    return await page.evaluate(() => {
      const patterns = {
        hasCart: !!document.querySelector('.cart, [data-cart], .shopping-cart, .bag'),
        hasWishlist: !!document.querySelector('.wishlist, .favorites, [data-wishlist]'),
        hasFilters: !!document.querySelector('.filters, .filter, .facets, .sidebar-filters'),
        hasPagination: !!document.querySelector('.pagination, .pager, .page-numbers'),
        hasProductGrid: !!document.querySelector('.product-grid, .products-grid, .grid-products'),
        hasProductList: !!document.querySelector('.product-list, .products-list'),
        hasSearch: !!document.querySelector('input[type="search"], .search-form, .search-input'),
        hasUserAccount: !!document.querySelector('.account, .user, .login, .sign-in'),
        hasCheckout: !!document.querySelector('.checkout, .proceed-checkout, [href*="checkout"]'),
      };

      return {
        ...patterns,
        ecommerceScore: Object.values(patterns).filter(Boolean).length,
      };
    });
  }

  async analyzePageStructure(page: Page): Promise<PageStructure> {
    const content = await page.content();
    const $ = cheerio.load(content);

    return {
      hasHeader: $('header, .header, .site-header').length > 0,
      hasFooter: $('footer, .footer, .site-footer').length > 0,
      hasSidebar: $('.sidebar, .side-nav, .filters').length > 0,
      hasMain: $('main, .main, .content, .main-content').length > 0,
      totalElements: $('*').length,
      scriptTags: $('script').length,
      styleTags: $('style, link[rel="stylesheet"]').length,
    };
  }

  async randomDelay(): Promise<void> {
    const delay = Math.random() * (this.requestDelayMax - this.requestDelayMin) + this.requestDelayMin;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async close(): Promise<void> {
    try {
      for (const context of this.contexts) {
        await context.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
      this.logger.info('Scraping engine closed successfully');
    } catch (error) {
      this.logger.error('Error closing scraping engine:', error);
    }
  }
}

export default ScrapingEngine;