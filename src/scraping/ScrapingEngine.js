const { chromium } = require('playwright');
const cheerio = require('cheerio');

class ScrapingEngine {
  constructor(logger) {
    this.logger = logger;
    this.browser = null;
    this.contexts = [];
    this.maxConcurrentPages = parseInt(process.env.CONCURRENT_BROWSERS) || 5;
    this.requestDelayMin = parseInt(process.env.REQUEST_DELAY_MIN) || 1000;
    this.requestDelayMax = parseInt(process.env.REQUEST_DELAY_MAX) || 3000;
    this.headless = process.env.HEADLESS_MODE !== 'false';
  }

  async initialize() {
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
          '--disable-gpu'
        ]
      });
      
      this.logger.info('Scraping engine initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize scraping engine:', error);
      this.logger.error('Error details:', {
        message: error.message,
        stack: error.stack,
        platform: process.platform,
        arch: process.arch,
        browsers_path: process.env.PLAYWRIGHT_BROWSERS_PATH
      });
      throw error;
    }
  }

  async createContext() {
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US'
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    this.contexts.push(context);
    return context;
  }

  async performBasicScrape(url) {
    if (!this.browser) {
      await this.initialize();
    }
    
    const context = await this.createContext();
    const page = await context.newPage();
    
    try {
      this.logger.info(`Performing basic scrape for: ${url}`);
      
      await page.goto(url, { waitUntil: 'networkidle' });
      await this.randomDelay();
      
      // Extract basic page information
      const result = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          h1_tags: Array.from(document.querySelectorAll('h1')).map(h1 => h1.textContent?.trim()).filter(text => text),
          product_links: Array.from(document.querySelectorAll('a[href*="product"], a[href*="item"]')).slice(0, 10).map(a => ({
            text: a.textContent?.trim(),
            href: a.href
          })),
          images: Array.from(document.querySelectorAll('img')).slice(0, 5).map(img => ({
            src: img.src,
            alt: img.alt
          })),
          price_elements: Array.from(document.querySelectorAll('[class*="price"], [class*="cost"], .money, [data-price]')).slice(0, 10).map(el => ({
            text: el.textContent?.trim(),
            className: el.className,
            tagName: el.tagName
          })),
          meta_description: document.querySelector('meta[name="description"]')?.content || '',
          ecommerce_indicators: {
            has_add_to_cart: !!document.querySelector('[class*="add-to-cart"], [class*="buy"], button[type="submit"]'),
            has_shopping_cart: !!document.querySelector('[class*="cart"], [href*="cart"]'),
            has_product_grid: !!document.querySelector('[class*="product"], [class*="item"]'),
            platform_indicators: {
              shopify: !!document.querySelector('[data-shopify], script[src*="shopify"]'),
              woocommerce: !!document.querySelector('.woocommerce, [class*="woocommerce"]'),
              magento: !!document.querySelector('[class*="magento"], script[src*="magento"]')
            }
          }
        };
      });
      
      this.logger.info(`Basic scrape completed for: ${url}`);
      return result;
      
    } catch (error) {
      this.logger.error(`Basic scrape failed for ${url}:`, error);
      throw error;
    } finally {
      await page.close();
      await context.close();
      this.contexts = this.contexts.filter(ctx => ctx !== context);
    }
  }

  async analyzeSite(url) {
    if (!this.browser) {
      await this.initialize();
    }
    const context = await this.createContext();
    const page = await context.newPage();
    
    try {
      this.logger.info(`Analyzing site: ${url}`);
      
      await page.goto(url, { waitUntil: 'networkidle' });
      await this.randomDelay();

      const siteStructure = {
        url,
        timestamp: new Date().toISOString(),
        metadata: await this.extractMetadata(page),
        navigation: await this.extractNavigation(page),
        products: await this.extractProducts(page),
        ecommercePatterns: await this.detectEcommercePatterns(page),
        pageStructure: await this.analyzePageStructure(page)
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

  async extractMetadata(page) {
    return await page.evaluate(() => {
      const getMetaContent = (name) => {
        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return meta ? meta.content : null;
      };

      const detectPlatform = () => {
        const indicators = {
          shopify: [
            'Shopify.theme',
            'shopify-section',
            '/cdn/shop/',
            'myshopify.com'
          ],
          woocommerce: [
            'woocommerce',
            'wp-content',
            'wc-',
            'cart-empty'
          ],
          magento: [
            'Magento',
            'mage-',
            'catalog-product',
            'checkout/cart'
          ]
        };

        const bodyHTML = document.body.innerHTML;
        const url = window.location.href;

        for (const [platform, patterns] of Object.entries(indicators)) {
          if (patterns.some(pattern => 
            bodyHTML.includes(pattern) || url.includes(pattern)
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
        language: document.documentElement.lang || 'en'
      };
    });
  }


  async extractNavigation(page) {
    return await page.evaluate(() => {
      const generateSelector = (element) => {
        if (element.id) return `#${element.id}`;
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) return `.${classes[0]}`;
        }
        return element.tagName.toLowerCase();
      };

      const navigation = {
        mainMenu: [],
        categories: [],
        filters: [],
        search: null
      };

      const navSelectors = [
        'nav',
        '.navigation',
        '.main-menu',
        '.header-nav',
        '.nav-menu'
      ];

      navSelectors.forEach(selector => {
        const navElement = document.querySelector(selector);
        if (navElement) {
          const links = navElement.querySelectorAll('a');
          links.forEach(link => {
            if (link.href && link.textContent.trim()) {
              navigation.mainMenu.push({
                text: link.textContent.trim(),
                href: link.href,
                selector: generateSelector(link)
              });
            }
          });
        }
      });

      const searchInput = document.querySelector(
        'input[type="search"], input[name*="search"], input[placeholder*="search" i]'
      );
      if (searchInput) {
        navigation.search = {
          selector: generateSelector(searchInput),
          placeholder: searchInput.placeholder
        };
      }

      return navigation;
    });
  }

  async extractProducts(page) {
    return await page.evaluate(() => {
      const generateSelector = (element) => {
        if (element.id) return `#${element.id}`;
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) return `.${classes[0]}`;
        }
        return element.tagName.toLowerCase();
      };

      const getProductTitle = (element) => {
        const titleSelectors = [
          '.product-title',
          '.title',
          'h1', 'h2', 'h3',
          '.name',
          '[data-title]'
        ];
        
        for (let selector of titleSelectors) {
          const titleEl = element.querySelector(selector);
          if (titleEl && titleEl.textContent.trim()) {
            return titleEl.textContent.trim();
          }
        }
        return null;
      };

      const getProductPrice = (element) => {
        const priceSelectors = [
          '.price',
          '.product-price',
          '.cost',
          '[data-price]',
          '.amount'
        ];
        
        for (let selector of priceSelectors) {
          const priceEl = element.querySelector(selector);
          if (priceEl && priceEl.textContent.trim()) {
            return priceEl.textContent.trim();
          }
        }
        return null;
      };

      const getProductImage = (element) => {
        const img = element.querySelector('img');
        return img ? img.src : null;
      };

      const getProductLink = (element) => {
        const link = element.querySelector('a') || element.closest('a');
        return link ? link.href : null;
      };

      const getProductVariants = (element) => {
        const variants = [];
        const variantSelectors = element.querySelectorAll('.variant, .option, [data-variant]');
        variantSelectors.forEach(variant => {
          if (variant.textContent.trim()) {
            variants.push(variant.textContent.trim());
          }
        });
        return variants;
      };

      const products = [];
      
      const productSelectors = [
        '.product',
        '.product-item',
        '.product-card',
        '[data-product]',
        '.grid-product',
        '.product-list-item'
      ];

      productSelectors.forEach(selector => {
        const productElements = document.querySelectorAll(selector);
        productElements.forEach((element, index) => {
          if (index >= 20) return;

          const product = {
            title: getProductTitle(element),
            price: getProductPrice(element),
            image: getProductImage(element),
            link: getProductLink(element),
            selector: generateSelector(element),
            variants: getProductVariants(element)
          };

          if (product.title || product.price) {
            products.push(product);
          }
        });
      });

      return products;
    });
  }

  async detectEcommercePatterns(page) {
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
        hasCheckout: !!document.querySelector('.checkout, .proceed-checkout, [href*="checkout"]')
      };

      patterns.ecommerceScore = Object.values(patterns).filter(Boolean).length;
      return patterns;
    });
  }

  async analyzePageStructure(page) {
    const content = await page.content();
    const $ = cheerio.load(content);
    
    return {
      hasHeader: $('header, .header, .site-header').length > 0,
      hasFooter: $('footer, .footer, .site-footer').length > 0,
      hasSidebar: $('.sidebar, .side-nav, .filters').length > 0,
      hasMain: $('main, .main, .content, .main-content').length > 0,
      totalElements: $('*').length,
      scriptTags: $('script').length,
      styleTags: $('style, link[rel="stylesheet"]').length
    };
  }

  async randomDelay() {
    const delay = Math.random() * (this.requestDelayMax - this.requestDelayMin) + this.requestDelayMin;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async close() {
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

module.exports = ScrapingEngine;