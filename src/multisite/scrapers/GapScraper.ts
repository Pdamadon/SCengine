/**
 * Gap.com Specific Scraper
 * Leverages sector templates with Gap-specific optimizations
 * Handles Gap Inc. brands: Gap, Old Navy, Banana Republic, Athleta
 * 
 * COMPLIANCE:
 * - Respects robots.txt and rate limiting (2-4s delays)
 * - Uses comprehensive selector patterns from sector research
 * - Implements graceful fallbacks for site changes
 */

import { chromium, Browser, Page } from 'playwright';
import SelectorLibrary from '../selectors/SelectorLibrary';
import { Logger } from '../../types/common.types';

const { getPlatformConfig, getEnhancedSelectors } = require('../config/platformConfigs');
const AntiBot = require('../core/AntiBot');

interface GapScraperOptions {
  brightData?: any;
  target_url?: string;
  scraping_type?: string;
}

interface ScrapingJobData {
  scraping_type: string;
  max_pages?: number;
  max_products?: number;
  extract_product_details?: boolean;
}

interface BrowserConfig {
  viewport: { width: number; height: number };
  userAgent: string;
  headers?: Record<string, string>;
}

interface GapCategoryData {
  url: string;
  title: string;
  categoryTitle: string;
  breadcrumb: string[];
  productLinks: string[];
  nextPageUrl: string | null;
  totalProducts: string;
  elementCounts: {
    products: number;
    links: number;
    images: number;
  };
  scrapedAt: string;
}

interface ProductImage {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
}

interface ProductSize {
  value: string;
  text: string;
  available: boolean;
}

interface ProductColor {
  name: string;
  available: boolean;
  swatch: string | null;
}

interface StructuredData {
  name?: string;
  price?: string;
  currency?: string;
  availability?: string;
  brand?: string;
  description?: string;
}

interface GapProductData {
  url: string;
  title: string;
  price: string | null;
  originalPrice: string | null;
  currency: string;
  images: ProductImage[];
  sizes: ProductSize[];
  colors: ProductColor[];
  availability: string;
  brand: string;
  description: string;
  structuredData: StructuredData | null;
  scrapedAt: string;
}

interface GapScrapingResults {
  url: string;
  platform: string;
  scrapingType: string;
  startedAt: string;
  pages: GapCategoryData[];
  products: GapProductData[];
  summary: {
    pagesScraped: number;
    productsFound: number;
    errorsEncountered: number;
    successRate: number;
    duration?: number;
  };
  completedAt?: string;
}

interface ScrapingStats {
  pagesScraped: number;
  productsFound: number;
  errorsEncountered: number;
  startTime: number;
}

interface SelectorSets {
  productLinks: string[];
  pagination: string[];
}

interface ProductSelectors {
  title: string[];
  price: string[];
  images: string[];
  sizes: string[];
  colors: string[];
  availability: string[];
}

type ProgressCallback = (progress: number, message: string) => void;

class GapScraper {
  private logger: Logger;
  private baseUrl: string;
  private jobData: ScrapingJobData;
  private options: GapScraperOptions;
  private browser: Browser | null = null;
  private domain: string;
  private selectorLibrary: SelectorLibrary;
  private config: any;
  private antiBot: any;
  private stats: ScrapingStats;

  constructor(logger: Logger, url: string, jobData: ScrapingJobData, options: GapScraperOptions = {}) {
    this.logger = logger;
    this.baseUrl = url;
    this.jobData = jobData;
    this.options = options;
    this.domain = this.extractDomain(url);
    this.selectorLibrary = new SelectorLibrary();
    
    // Get Gap-specific configuration
    this.config = getPlatformConfig('gap');
    
    // Initialize anti-bot system with Gap-specific settings
    this.antiBot = new AntiBot(logger, {
      brightData: options.brightData || {},
      defaultDelayMs: this.config.antiBot.delayRange[0],
      maxDelayMs: this.config.antiBot.delayRange[1],
    });
    
    this.stats = {
      pagesScraped: 0,
      productsFound: 0,
      errorsEncountered: 0,
      startTime: Date.now(),
    };
  }

  async initialize(): Promise<void> {
    try {
      // Initialize browser with anti-bot configuration
      const browserConfig = await this.antiBot.getBrowserConfig(this.domain);
      
      this.browser = await chromium.launch({
        headless: process.env.HEADLESS_MODE !== 'false',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--disable-gpu',
        ],
      });
      
      this.logger.info('GapScraper initialized successfully', {
        domain: this.domain,
        antiBot: this.antiBot.getHealthStatus(),
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize GapScraper:', error);
      throw error;
    }
  }

  /**
   * Scrape Gap category page using enhanced selectors
   */
  async scrapeCategoryPage(url: string): Promise<GapCategoryData> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();
    
    try {
      // Apply anti-bot measures
      await this.antiBot.applyDelay(this.domain);
      const browserConfig: BrowserConfig = await this.antiBot.getBrowserConfig(this.domain);
      
      await page.setViewportSize(browserConfig.viewport);
      await page.setUserAgent(browserConfig.userAgent);
      
      // Set realistic headers
      await page.setExtraHTTPHeaders(browserConfig.headers || {});
      
      this.logger.info(`Gap scraper: Analyzing category page ${url}`);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      
      // Wait for Gap's dynamic content to load
      await page.waitForTimeout(3000);

      // Scroll to trigger lazy loading
      await this.scrollToLoadContent(page);

      // Get Gap-specific selectors
      const productLinkSelectors = this.getGapProductLinkSelectors();
      const paginationSelectors = this.getGapPaginationSelectors();
      
      const categoryData = await page.evaluate((selectors: SelectorSets) => {
        const productLinks = new Set<string>();
        
        // Find product links using Gap-specific patterns
        selectors.productLinks.forEach(selector => {
          try {
            const links = document.querySelectorAll(selector);
            links.forEach(link => {
              const linkElement = link as HTMLAnchorElement;
              if (linkElement.href && 
                  linkElement.href.startsWith('http') && 
                  !linkElement.href.includes('#') &&
                  !linkElement.href.includes('mailto:') &&
                  !linkElement.href.includes('tel:') &&
                  (linkElement.href.includes('/browse/product') || 
                   linkElement.href.includes('/products/') ||
                   linkElement.href.includes('/p/'))) {
                productLinks.add(linkElement.href);
              }
            });
          } catch (e) {
            // Continue if selector fails
          }
        });

        // Find next page using Gap pagination patterns
        let nextPageUrl: string | null = null;
        selectors.pagination.forEach(selector => {
          if (!nextPageUrl) {
            try {
              const nextLinks = document.querySelectorAll(selector);
              nextLinks.forEach(link => {
                const linkElement = link as HTMLAnchorElement;
                const text = linkElement.textContent?.toLowerCase().trim() || '';
                const ariaLabel = linkElement.getAttribute('aria-label')?.toLowerCase() || '';
                
                if ((text.includes('next') || 
                     text.includes('→') || 
                     text.includes('>') ||
                     text.match(/^\d+$/) || // Page numbers
                     ariaLabel.includes('next')) &&
                     linkElement.href && 
                     linkElement.href !== window.location.href) {
                  nextPageUrl = linkElement.href;
                }
              });
            } catch (e) {
              // Continue if selector fails
            }
          }
        });

        // Extract Gap-specific page metadata
        const gapMetadata = {
          categoryTitle: document.querySelector('.category-title, .plp-header h1, h1')?.textContent?.trim() || '',
          breadcrumb: Array.from(document.querySelectorAll('.breadcrumb a, .breadcrumbs a, nav a')).map(a => a.textContent?.trim() || ''),
          totalProducts: document.querySelector('.results-count, .product-count')?.textContent?.trim() || '',
        };

        return {
          url: window.location.href,
          title: document.title || '',
          categoryTitle: gapMetadata.categoryTitle,
          breadcrumb: gapMetadata.breadcrumb,
          productLinks: Array.from(productLinks).slice(0, 50),
          nextPageUrl: nextPageUrl,
          totalProducts: gapMetadata.totalProducts,
          elementCounts: {
            products: document.querySelectorAll('[class*="product"], .product-tile').length,
            links: document.querySelectorAll('a').length,
            images: document.querySelectorAll('img').length,
          },
          scrapedAt: new Date().toISOString(),
        };
      }, {
        productLinks: productLinkSelectors,
        pagination: paginationSelectors,
      });

      this.logger.info(`Gap scraper found ${categoryData.productLinks.length} product links on ${url}`, {
        categoryTitle: categoryData.categoryTitle,
        totalProducts: categoryData.totalProducts,
      });

      this.stats.pagesScraped++;
      await this.antiBot.handleRequestSuccess(this.domain);
      
      return categoryData;

    } catch (error) {
      this.logger.error(`Gap scraper failed for category ${url}:`, error);
      this.stats.errorsEncountered++;
      await this.antiBot.handleRequestFailure(this.domain, error);
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * Scrape Gap product page using enhanced selectors
   */
  async scrapeProductPage(url: string): Promise<GapProductData> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();
    
    try {
      // Apply anti-bot measures
      await this.antiBot.applyDelay(this.domain);
      const browserConfig: BrowserConfig = await this.antiBot.getBrowserConfig(this.domain);
      
      await page.setViewportSize(browserConfig.viewport);
      await page.setUserAgent(browserConfig.userAgent);
      
      this.logger.info(`Gap scraper: Analyzing product page ${url}`);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      
      // Wait for Gap's product details to load
      await page.waitForTimeout(2000);

      // Get Gap-specific enhanced selectors
      const titleSelectors = getEnhancedSelectors('gap', 'title');
      const priceSelectors = getEnhancedSelectors('gap', 'price');
      const imageSelectors = getEnhancedSelectors('gap', 'images');
      const sizeSelectors = getEnhancedSelectors('gap', 'sizes');
      const colorSelectors = getEnhancedSelectors('gap', 'colors');
      const availabilitySelectors = getEnhancedSelectors('gap', 'availability');
      
      const productData = await page.evaluate((selectors: ProductSelectors) => {
        // Extract title using Gap-specific selectors
        let title: string | null = null;
        selectors.title.forEach(selector => {
          if (!title) {
            try {
              const element = document.querySelector(selector);
              if (element?.textContent?.trim()) {
                title = element.textContent.trim();
              }
            } catch (e) {}
          }
        });

        // Extract price using Gap-specific patterns
        let price: string | null = null;
        let originalPrice: string | null = null;
        selectors.price.forEach(selector => {
          if (!price) {
            try {
              const element = document.querySelector(selector);
              if (element?.textContent?.trim()) {
                const text = element.textContent.trim();
                const priceMatch = text.match(/\$[\d,]+\.?\d*/);
                if (priceMatch) {
                  price = text;
                  // Check for original price if this is a sale price
                  const parent = element.parentElement;
                  if (parent && parent.textContent && parent.textContent.includes('was')) {
                    const originalMatch = parent.textContent.match(/was\s*\$[\d,]+\.?\d*/i);
                    if (originalMatch) {
                      originalPrice = originalMatch[0].replace(/was\s*/i, '');
                    }
                  }
                }
              }
            } catch (e) {}
          }
        });

        // Extract images using Gap-specific selectors
        const images: ProductImage[] = [];
        selectors.images.forEach(selector => {
          try {
            const imgs = document.querySelectorAll(selector);
            imgs.forEach(img => {
              const imgElement = img as HTMLImageElement;
              if (imgElement.src && imgElement.src.startsWith('http') && !imgElement.src.includes('placeholder')) {
                images.push({
                  src: imgElement.src,
                  alt: imgElement.alt || '',
                  width: imgElement.width || null,
                  height: imgElement.height || null,
                });
              }
            });
          } catch (e) {}
        });

        // Extract sizes using Gap-specific selectors
        const sizes: ProductSize[] = [];
        selectors.sizes.forEach(selector => {
          try {
            const sizeElements = document.querySelectorAll(selector);
            sizeElements.forEach(el => {
              if (el.tagName === 'SELECT') {
                const options = el.querySelectorAll('option');
                options.forEach(option => {
                  const optionElement = option as HTMLOptionElement;
                  if (optionElement.value && optionElement.textContent?.trim()) {
                    sizes.push({
                      value: optionElement.value,
                      text: optionElement.textContent.trim(),
                      available: !optionElement.disabled,
                    });
                  }
                });
              } else if (el.tagName === 'BUTTON') {
                const buttonElement = el as HTMLButtonElement;
                sizes.push({
                  value: buttonElement.getAttribute('data-value') || buttonElement.textContent?.trim() || '',
                  text: buttonElement.textContent?.trim() || '',
                  available: !buttonElement.disabled && !buttonElement.classList.contains('disabled'),
                });
              }
            });
          } catch (e) {}
        });

        // Extract colors using Gap-specific selectors
        const colors: ProductColor[] = [];
        selectors.colors.forEach(selector => {
          try {
            const colorElements = document.querySelectorAll(selector);
            colorElements.forEach(el => {
              const element = el as HTMLElement;
              const colorName = element.getAttribute('data-color') || 
                              element.getAttribute('aria-label') || 
                              element.getAttribute('title') || 
                              element.textContent?.trim() || '';
              if (colorName) {
                colors.push({
                  name: colorName,
                  available: !(element as any).disabled && !element.classList.contains('disabled'),
                  swatch: element.style.backgroundColor || null,
                });
              }
            });
          } catch (e) {}
        });

        // Check availability using Gap-specific patterns
        let availability = 'unknown';
        selectors.availability.forEach(selector => {
          try {
            const element = document.querySelector(selector);
            if (element?.textContent) {
              const text = element.textContent.toLowerCase();
              if (text.includes('in stock') || text.includes('available')) {
                availability = 'in_stock';
              } else if (text.includes('out of stock') || text.includes('unavailable')) {
                availability = 'out_of_stock';
              }
            }
          } catch (e) {}
        });

        // If no specific availability found, check for add to cart button
        if (availability === 'unknown') {
          const addToCartButton = document.querySelector('button[data-test="add-to-bag-button"], .add-to-cart, .add-to-bag');
          if (addToCartButton && !(addToCartButton as HTMLButtonElement).disabled) {
            availability = 'in_stock';
          }
        }

        // Extract structured data if available (Gap often uses this)
        let structuredData: StructuredData | null = null;
        try {
          const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
          jsonLdScripts.forEach(script => {
            try {
              const data = JSON.parse(script.textContent || '');
              if (data['@type'] === 'Product') {
                structuredData = {
                  name: data.name,
                  price: data.offers?.price,
                  currency: data.offers?.priceCurrency,
                  availability: data.offers?.availability,
                  brand: data.brand?.name,
                  description: data.description,
                };
              }
            } catch (e) {}
          });
        } catch (e) {}

        const extractBrandFromUrl = (): string => {
          const hostname = window.location.hostname.toLowerCase();
          if (hostname.includes('gap.')) return 'Gap';
          if (hostname.includes('oldnavy.')) return 'Old Navy';
          if (hostname.includes('bananarepublic.')) return 'Banana Republic';
          if (hostname.includes('athleta.')) return 'Athleta';
          return 'Gap Inc.';
        };

        return {
          url: window.location.href,
          title: title || structuredData?.name || '',
          price: price || (structuredData?.price ? `$${structuredData.price}` : null),
          originalPrice: originalPrice,
          currency: structuredData?.currency || 'USD',
          images: images.slice(0, 10), // Limit to first 10 images
          sizes: sizes,
          colors: colors,
          availability: availability,
          brand: structuredData?.brand || extractBrandFromUrl(),
          description: structuredData?.description || '',
          structuredData: structuredData,
          scrapedAt: new Date().toISOString(),
        };
      }, {
        title: titleSelectors,
        price: priceSelectors,
        images: imageSelectors,
        sizes: sizeSelectors,
        colors: colorSelectors,
        availability: availabilitySelectors,
      });

      this.logger.info(`Gap scraper extracted product: ${productData.title || 'Unknown'}`, {
        price: productData.price,
        availability: productData.availability,
        sizes: productData.sizes.length,
        colors: productData.colors.length,
      });

      this.stats.productsFound++;
      await this.antiBot.handleRequestSuccess(this.domain);
      
      return productData;

    } catch (error) {
      this.logger.error(`Gap scraper failed for product ${url}:`, error);
      this.stats.errorsEncountered++;
      await this.antiBot.handleRequestFailure(this.domain, error);
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * Main scraping method
   */
  async scrape(progressCallback?: ProgressCallback): Promise<GapScrapingResults> {
    const jobType = this.jobData.scraping_type;
    const maxPages = this.jobData.max_pages || 3;
    const maxProducts = this.jobData.max_products || 20;

    this.logger.info(`Gap scraper starting: ${jobType} for ${this.baseUrl}`, {
      maxPages,
      maxProducts,
      domain: this.domain,
    });

    try {
      if (progressCallback) progressCallback(10, 'Starting Gap.com scraping...');

      let results: GapScrapingResults = {
        url: this.baseUrl,
        platform: 'gap',
        scrapingType: jobType,
        startedAt: new Date().toISOString(),
        pages: [],
        products: [],
        summary: {
          pagesScraped: 0,
          productsFound: 0,
          errorsEncountered: 0,
          successRate: 0,
        },
      };

      if (jobType === 'category_search' || jobType === 'category') {
        // Scrape Gap category pages
        let currentUrl: string | null = this.baseUrl;
        let pageCount = 0;

        while (currentUrl && pageCount < maxPages) {
          if (progressCallback) {
            const progress = 20 + (pageCount / maxPages) * 60;
            progressCallback(progress, `Scraping Gap.com page ${pageCount + 1}/${maxPages}`);
          }

          const pageData = await this.scrapeCategoryPage(currentUrl);
          results.pages.push(pageData);
          pageCount++;

          // Collect product links for detailed scraping
          const productLinks = pageData.productLinks.slice(0, maxProducts);
          
          // Scrape individual products if requested
          if (this.jobData.extract_product_details !== false && productLinks.length > 0) {
            const productsToScrape = productLinks.slice(0, Math.min(10, maxProducts));
            
            for (const productUrl of productsToScrape) {
              try {
                const productData = await this.scrapeProductPage(productUrl);
                results.products.push(productData);
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.warn(`Failed to scrape Gap product ${productUrl}:`, errorMessage);
              }
            }
          }

          // Check for next page
          currentUrl = pageData.nextPageUrl;
        }

      } else if (jobType === 'product') {
        // Scrape single Gap product page
        if (progressCallback) progressCallback(50, 'Scraping Gap.com product page...');
        
        const productData = await this.scrapeProductPage(this.baseUrl);
        results.products.push(productData);
      }

      results.summary = {
        pagesScraped: this.stats.pagesScraped,
        productsFound: this.stats.productsFound,
        errorsEncountered: this.stats.errorsEncountered,
        successRate: this.stats.productsFound > 0 ? 1.0 - (this.stats.errorsEncountered / (this.stats.productsFound + this.stats.errorsEncountered)) : 0.0,
        duration: Date.now() - this.stats.startTime,
      };

      results.completedAt = new Date().toISOString();

      if (progressCallback) progressCallback(100, 'Gap.com scraping completed');

      this.logger.info(`Gap scraper completed successfully`, results.summary);
      
      return results;

    } catch (error) {
      this.logger.error('Gap scraper failed:', error);
      throw error;
    }
  }

  /**
   * Helper methods
   */
  
  private getGapProductLinkSelectors(): string[] {
    return [
      // Gap-specific product link patterns
      'a[href*="/browse/product"]',
      '.product-tile a',
      '.product-card a',
      '.category-page .product a',
      // Generic patterns as fallback
      ...this.selectorLibrary.getComprehensiveSelectors(this.domain, 'products').map(sel => 
        sel.includes('a') ? sel : `${sel} a`
      ),
    ];
  }

  private getGapPaginationSelectors(): string[] {
    return [
      // Gap-specific pagination patterns
      '.pagination a[rel="next"]',
      '.pagination .next',
      '.page-nav a[aria-label*="Next"]',
      '.pager-next a',
      // Generic patterns
      'a[href*="page="]',
      'a[href*="p="]',
      '.pagination a',
      '[aria-label*="Next"]',
    ];
  }

  private async scrollToLoadContent(page: Page): Promise<void> {
    try {
      await page.evaluate(async () => {
        for (let i = 0; i < 3; i++) {
          window.scrollTo(0, document.body.scrollHeight * (i + 1) / 3);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        window.scrollTo(0, 0);
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to scroll page:', errorMessage);
    }
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch (error) {
      return url.toLowerCase();
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.logger.info('GapScraper closed successfully');
    }
  }
}

export default GapScraper;