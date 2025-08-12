/**
 * Universal Scraper
 * Fallback scraper for unknown platforms or when platform-specific scrapers fail
 * Uses heuristic-based detection and common e-commerce patterns
 * Enhanced with sector template integration for comprehensive coverage
 */

import { chromium, Browser, Page } from 'playwright';
import SelectorLibrary from '../selectors/SelectorLibrary';
import { Logger } from '../../types/common.types';

interface UniversalScraperOptions {
  target_url?: string;
  scraping_type?: string;
  max_pages?: number;
  max_products?: number;
  extract_product_details?: boolean;
}

interface ScrapingJobData {
  scraping_type: string;
  max_pages?: number;
  max_products?: number;
  extract_product_details?: boolean;
}

interface CategoryPageData {
  url: string;
  title: string;
  h1: string;
  productLinks: string[];
  nextPageUrl: string | null;
  elementCounts: {
    products: number;
    links: number;
    images: number;
    forms: number;
  };
  scrapedAt: string;
}

interface ProductData {
  url: string;
  title: string | null;
  price: string | null;
  description: string | null;
  images: ProductImage[];
  available: boolean;
  scrapedAt: string;
}

interface ProductImage {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
}

interface ScrapingResults {
  url: string;
  platform: string;
  scrapingType: string;
  startedAt: string;
  pages: CategoryPageData[];
  products: ProductData[];
  summary: {
    pagesScraped: number;
    productsFound: number;
    successRate: number;
  };
  completedAt?: string;
}

interface SelectorConfig {
  title: string[];
  price: string[];
  images: string[];
  description: string[];
}

type ProgressCallback = (progress: number, message: string) => void;

class UniversalScraper {
  private logger: Logger;
  private baseUrl: string;
  private jobData: ScrapingJobData;
  private options: UniversalScraperOptions;
  private browser: Browser | null = null;
  private domain: string;
  private selectorLibrary: SelectorLibrary;

  constructor(logger: Logger, url: string, jobData: ScrapingJobData, options: UniversalScraperOptions = {}) {
    this.logger = logger;
    this.baseUrl = url;
    this.jobData = jobData;
    this.options = options;
    this.domain = this.extractDomain(url);
    this.selectorLibrary = new SelectorLibrary();
  }

  async initialize(): Promise<void> {
    try {
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
      this.logger.info('UniversalScraper initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize UniversalScraper:', error);
      throw error;
    }
  }

  /**
   * Scrape a category or listing page using universal patterns
   */
  async scrapeCategoryPage(url: string): Promise<CategoryPageData> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();
    
    // Set a realistic viewport and user agent
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
      this.logger.info(`Universal scraper: Analyzing category page ${url}`);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      
      // Wait for potential dynamic content
      await page.waitForTimeout(3000);

      // Scroll to load any lazy-loaded content
      await this.scrollToLoadContent(page);

      const categoryData = await page.evaluate(() => {
        // Universal product link detection patterns
        const productLinkPatterns = [
          'a[href*="/product"]',
          'a[href*="/products/"]',
          'a[href*="/item"]',
          'a[href*="/p/"]',
          'a[href*="-p-"]',
          'a[href*="/dp/"]', // Amazon
          'a[href*="/gp/product/"]', // Amazon
          '.product a',
          '.product-item a',
          '.product-card a',
          '.item a',
          '[class*="product"] a',
          '[data-testid*="product"] a',
        ];

        // Find all potential product links
        const productLinks = new Set<string>();
        
        productLinkPatterns.forEach(pattern => {
          try {
            const links = document.querySelectorAll(pattern);
            links.forEach(link => {
              const href = (link as HTMLAnchorElement).href;
              if (href && 
                  href.startsWith('http') && 
                  !href.includes('#') &&
                  !href.includes('mailto:') &&
                  !href.includes('tel:')) {
                productLinks.add(href);
              }
            });
          } catch (e) {
            // Continue if selector fails
          }
        });

        // Convert to array and limit
        const uniqueProductLinks = Array.from(productLinks).slice(0, 50);

        // Try to find pagination
        const paginationPatterns = [
          'a[href*="page="]',
          'a[href*="p="]',
          'a[href*="/page/"]',
          '.pagination a',
          '.pager a',
          '[class*="pagination"] a',
          '[aria-label*="Next"]',
          '[aria-label*="next"]',
          'a[rel="next"]',
        ];

        let nextPageUrl: string | null = null;
        
        paginationPatterns.forEach(pattern => {
          if (!nextPageUrl) {
            try {
              const nextLinks = document.querySelectorAll(pattern);
              nextLinks.forEach(link => {
                const linkElement = link as HTMLAnchorElement;
                const text = linkElement.textContent?.toLowerCase().trim() || '';
                const ariaLabel = linkElement.getAttribute('aria-label')?.toLowerCase() || '';
                
                if ((text.includes('next') || 
                     text.includes('→') || 
                     text.includes('>') ||
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

        // Extract basic page info
        const title = document.title || '';
        const h1 = document.querySelector('h1')?.textContent?.trim() || '';
        
        // Count various elements to assess page structure
        const elementCounts = {
          products: document.querySelectorAll('[class*="product"], [data-testid*="product"]').length,
          links: document.querySelectorAll('a').length,
          images: document.querySelectorAll('img').length,
          forms: document.querySelectorAll('form').length,
        };

        return {
          url: window.location.href,
          title: title,
          h1: h1,
          productLinks: uniqueProductLinks,
          nextPageUrl: nextPageUrl,
          elementCounts: elementCounts,
          scrapedAt: new Date().toISOString(),
        };
      });

      this.logger.info(`Universal scraper found ${categoryData.productLinks.length} potential product links`);
      
      return categoryData;

    } catch (error) {
      this.logger.error(`Universal scraper failed for ${url}:`, error);
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * Scrape an individual product page using universal patterns
   */
  async scrapeProductPage(url: string): Promise<ProductData> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
      this.logger.info(`Universal scraper: Analyzing product page ${url}`);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      
      await page.waitForTimeout(2000);

      // Get enhanced selectors before page evaluation
      const titleSelectors = this.selectorLibrary.getComprehensiveSelectors(this.domain, 'title');
      const priceSelectors = this.selectorLibrary.getComprehensiveSelectors(this.domain, 'price');
      const imageSelectors = this.selectorLibrary.getComprehensiveSelectors(this.domain, 'images');
      const descriptionSelectors = this.selectorLibrary.getComprehensiveSelectors(this.domain, 'description');
      
      const productData = await page.evaluate((selectors: SelectorConfig) => {
        let title: string | null = null;
        selectors.title.forEach(selector => {
          if (!title) {
            try {
              const element = document.querySelector(selector);
              if (element?.textContent?.trim()) {
                title = element.textContent.trim();
              }
            } catch (e) {
              // Continue with next selector if this one fails
            }
          }
        });

        let price: string | null = null;
        selectors.price.forEach(selector => {
          if (!price) {
            try {
              const element = document.querySelector(selector);
              if (element?.textContent?.trim()) {
                const text = element.textContent.trim();
                // Look for price patterns
                const priceMatch = text.match(/[\$€£¥][\d,]+\.?\d*/);
                if (priceMatch) {
                  price = text;
                }
              }
            } catch (e) {
              // Continue with next selector
            }
          }
        });

        const images: ProductImage[] = [];
        selectors.images.forEach(selector => {
          try {
            const imgs = document.querySelectorAll(selector);
            imgs.forEach(img => {
              const imgElement = img as HTMLImageElement;
              if (imgElement.src && imgElement.src.startsWith('http')) {
                images.push({
                  src: imgElement.src,
                  alt: imgElement.alt || '',
                  width: imgElement.width || null,
                  height: imgElement.height || null,
                });
              }
            });
          } catch (e) {
            // Continue if selector fails
          }
        });

        let description: string | null = null;
        selectors.description.forEach(selector => {
          if (!description) {
            try {
              const element = document.querySelector(selector);
              if (element?.textContent?.trim() && element.textContent.length > 50) {
                description = element.textContent.trim().substring(0, 500);
              }
            } catch (e) {
              // Continue with next selector
            }
          }
        });

        // Basic availability check
        const availabilityPatterns = [
          'in stock',
          'available',
          'add to cart',
          'buy now',
          'purchase',
        ];

        const pageText = document.body.textContent?.toLowerCase() || '';
        const isAvailable = availabilityPatterns.some(pattern => 
          pageText.includes(pattern)
        );

        return {
          url: window.location.href,
          title: title,
          price: price,
          description: description,
          images: images.slice(0, 5), // Limit to first 5 images
          available: isAvailable,
          scrapedAt: new Date().toISOString(),
        };
      }, {
        title: titleSelectors,
        price: priceSelectors,
        images: imageSelectors,
        description: descriptionSelectors
      });

      this.logger.info(`Universal scraper extracted product: ${productData.title || 'Unknown'}`);
      
      return productData;

    } catch (error) {
      this.logger.error(`Universal scraper failed for ${url}:`, error);
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * Main scraping method - adapts based on job type
   */
  async scrape(progressCallback?: ProgressCallback): Promise<ScrapingResults> {
    const jobType = this.jobData.scraping_type;
    const maxPages = this.jobData.max_pages || 3;
    const maxProducts = this.jobData.max_products || 20;

    this.logger.info(`Universal scraper starting: ${jobType} for ${this.baseUrl}`);

    try {
      if (progressCallback) progressCallback(10, 'Starting universal scraping...');

      let results: ScrapingResults = {
        url: this.baseUrl,
        platform: 'universal',
        scrapingType: jobType,
        startedAt: new Date().toISOString(),
        pages: [],
        products: [],
        summary: {
          pagesScraped: 0,
          productsFound: 0,
          successRate: 0,
        },
      };

      if (jobType === 'category_search' || jobType === 'category') {
        // Scrape category pages
        let currentUrl: string | null = this.baseUrl;
        let pageCount = 0;

        while (currentUrl && pageCount < maxPages) {
          if (progressCallback) {
            const progress = 20 + (pageCount / maxPages) * 60;
            progressCallback(progress, `Scraping page ${pageCount + 1}/${maxPages}`);
          }

          const pageData = await this.scrapeCategoryPage(currentUrl);
          results.pages.push(pageData);
          pageCount++;

          // Collect product links
          const productLinks = pageData.productLinks.slice(0, maxProducts);
          
          // Optionally scrape individual products
          if (this.jobData.extract_product_details !== false && productLinks.length > 0) {
            const productsToScrape = productLinks.slice(0, Math.min(5, maxProducts)); // Limit for performance
            
            for (const productUrl of productsToScrape) {
              try {
                const productData = await this.scrapeProductPage(productUrl);
                results.products.push(productData);
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.warn(`Failed to scrape product ${productUrl}:`, errorMessage);
              }
            }
          }

          // Check for next page
          currentUrl = pageData.nextPageUrl;
        }

        results.summary.pagesScraped = pageCount;
        results.summary.productsFound = results.products.length;

      } else if (jobType === 'product') {
        // Scrape single product page
        if (progressCallback) progressCallback(50, 'Scraping product page...');
        
        const productData = await this.scrapeProductPage(this.baseUrl);
        results.products.push(productData);
        results.summary.productsFound = 1;
      }

      results.summary.successRate = results.summary.productsFound > 0 ? 1.0 : 0.0;
      results.completedAt = new Date().toISOString();

      if (progressCallback) progressCallback(100, 'Universal scraping completed');

      this.logger.info(`Universal scraper completed: ${results.summary.productsFound} products found`);
      
      return results;

    } catch (error) {
      this.logger.error('Universal scraper failed:', error);
      throw error;
    }
  }

  /**
   * Scroll page to load lazy content
   */
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

  /**
   * Extract domain from URL
   */
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
      this.logger.info('UniversalScraper closed successfully');
    }
  }
}

export default UniversalScraper;