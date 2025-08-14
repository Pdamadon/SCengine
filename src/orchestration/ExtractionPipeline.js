/**
 * ExtractionPipeline - Wrapper for product extraction components
 * 
 * Coordinates:
 * - ConcurrentExplorer for parallel section exploration
 * - ProductExtractorPool for parallel product extraction
 * - URLQueue for URL management and deduplication
 * - SelectorValidator for selector validation
 * 
 * This provides a clean interface to the extraction phase
 */

const ConcurrentExplorer = require('../intelligence/ConcurrentExplorer');
const ProductExtractorPool = require('../intelligence/extraction/ProductExtractorPool');
const URLQueue = require('../intelligence/extraction/URLQueue');
const SelectorValidator = require('../intelligence/SelectorValidator');
const { chromium } = require('playwright');

class ExtractionPipeline {
  constructor(logger) {
    this.logger = logger;
    
    // Initialize extraction components
    this.concurrentExplorer = null;
    this.extractorPool = null;
    this.urlQueue = null;
    this.selectorValidator = new SelectorValidator(logger);
    
    // Extraction state
    this.browser = null;
    this.extractionResults = [];
  }

  /**
   * Initialize extraction components
   */
  async initialize() {
    // Components will be initialized on demand
    this.logger.info('ExtractionPipeline initialized');
  }

  /**
   * Main extraction method - extract products using learned patterns
   * 
   * @param {string} url - Target URL
   * @param {object} options - Extraction options with patterns, selectors, navigation
   * @returns {object} Extraction results
   */
  async extract(url, options = {}) {
    const domain = new URL(url).hostname;
    const startTime = Date.now();
    
    this.logger.info('Starting product extraction', {
      url,
      domain,
      maxProducts: options.maxProducts,
      maxWorkers: options.maxWorkers
    });

    try {
      // Initialize browser for extraction
      await this.initializeBrowser();
      
      // Initialize components with options
      this.concurrentExplorer = new ConcurrentExplorer(this.logger, null);
      await this.concurrentExplorer.initialize();
      
      this.urlQueue = new URLQueue(this.logger);
      await this.urlQueue.initialize(domain);
      
      this.extractorPool = new ProductExtractorPool(this.logger, {
        maxWorkers: options.maxWorkers || 5,
        headless: process.env.HEADLESS_MODE !== 'false'
      });
      await this.extractorPool.initialize(domain);
      
      // Phase 1: Discover product URLs
      const discoveredUrls = await this.discoverProductUrls(
        url,
        options.navigation,
        options.patterns,
        options.progressCallback
      );
      
      // Phase 2: Extract product details
      const products = await this.extractProducts(
        discoveredUrls,
        options.selectors,
        options.maxProducts,
        options.progressCallback
      );
      
      // Phase 3: Validate and enhance products
      const validatedProducts = await this.validateProducts(products, options.selectors);
      
      // Compile extraction results
      const extractionResult = {
        products: validatedProducts,
        stats: {
          urlsDiscovered: discoveredUrls.length,
          productsExtracted: products.length,
          productsValidated: validatedProducts.length,
          failedExtractions: this.extractorPool.failedUrls?.length || 0
        },
        failedUrls: this.extractorPool.failedUrls || [],
        duration: Date.now() - startTime
      };
      
      this.logger.info('Extraction completed', {
        productsFound: validatedProducts.length,
        duration: extractionResult.duration
      });
      
      return extractionResult;
      
    } catch (error) {
      this.logger.error('Extraction failed', {
        url,
        error: error.message,
        stack: error.stack
      });
      
      return {
        products: [],
        stats: {
          urlsDiscovered: 0,
          productsExtracted: 0,
          productsValidated: 0,
          failedExtractions: 0
        },
        error: error.message,
        duration: Date.now() - startTime
      };
      
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Initialize browser for extraction
   */
  async initializeBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: process.env.HEADLESS_MODE !== 'false',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
    }
  }

  /**
   * Phase 1: Discover product URLs from navigation
   */
  async discoverProductUrls(baseUrl, navigation, patterns, progressCallback) {
    this.logger.info('Discovering product URLs');
    
    const discoveredUrls = new Set();
    
    // Use navigation sections to find product listing pages
    const sectionsToExplore = this.selectSectionsForExploration(navigation);
    
    if (progressCallback) {
      progressCallback(10, `Exploring ${sectionsToExplore.length} sections for products`);
    }
    
    // Explore each section to find product URLs
    for (let i = 0; i < sectionsToExplore.length; i++) {
      const section = sectionsToExplore[i];
      
      try {
        const page = await this.browser.newPage();
        await page.goto(section.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Find product URLs on the page
        const urls = await this.findProductUrlsOnPage(page, patterns);
        
        urls.forEach(url => discoveredUrls.add(url));
        
        this.logger.debug(`Found ${urls.length} products in ${section.name}`, {
          section: section.name,
          urlCount: urls.length
        });
        
        await page.close();
        
        if (progressCallback) {
          const progress = 10 + ((i + 1) / sectionsToExplore.length * 30);
          progressCallback(progress, `Discovered ${discoveredUrls.size} product URLs`);
        }
        
      } catch (error) {
        this.logger.warn(`Failed to explore section ${section.name}`, {
          error: error.message
        });
      }
    }
    
    // Add URLs to queue
    const urlArray = Array.from(discoveredUrls);
    await this.urlQueue.addBatch(urlArray);
    
    this.logger.info(`Discovered ${urlArray.length} unique product URLs`);
    
    return urlArray;
  }

  /**
   * Select sections for exploration based on navigation
   */
  selectSectionsForExploration(navigation) {
    if (!navigation || !navigation.main_sections) {
      return [];
    }
    
    // Prioritize category sections
    const sections = navigation.main_sections
      .filter(section => {
        const text = (section.name || section.text || '').toLowerCase();
        // Skip utility sections
        return !/(account|cart|help|contact|about|sign|login)/i.test(text);
      })
      .slice(0, 10); // Limit to 10 sections
    
    return sections;
  }

  /**
   * Find product URLs on a page using patterns
   */
  async findProductUrlsOnPage(page, patterns) {
    // Use patterns if available
    if (patterns && patterns.length > 0) {
      const topPattern = patterns[0];
      
      return await page.evaluate((pattern) => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        const productUrls = [];
        
        // Create regex from pattern
        const regex = new RegExp(pattern.pattern);
        
        links.forEach(link => {
          const href = link.href;
          if (regex.test(href)) {
            productUrls.push(href);
          }
        });
        
        return productUrls;
      }, topPattern);
    }
    
    // Fallback: use common product URL patterns
    return await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      const productUrls = [];
      
      const productPatterns = [
        /\/product\//i,
        /\/products\//i,
        /\/p\//i,
        /\/pd\//i,
        /\/item\//i,
        /\/shop\/.*\/\d+/i,
        /\?product_id=/i,
        /\?p=\d+/i
      ];
      
      links.forEach(link => {
        const href = link.href;
        if (productPatterns.some(pattern => pattern.test(href))) {
          productUrls.push(href);
        }
      });
      
      return productUrls;
    });
  }

  /**
   * Phase 2: Extract product details from URLs
   */
  async extractProducts(urls, selectors, maxProducts, progressCallback) {
    this.logger.info(`Extracting details from ${urls.length} product URLs`);
    
    // Limit URLs if maxProducts specified
    const urlsToProcess = maxProducts ? urls.slice(0, maxProducts) : urls;
    
    // Create extraction function
    const extractionFunction = this.createExtractionFunction(selectors);
    
    // Process URLs in batches
    const products = await this.extractorPool.processBatch(
      urlsToProcess,
      extractionFunction,
      (processed, total) => {
        if (progressCallback) {
          const progress = 40 + (processed / total * 40);
          progressCallback(progress, `Extracted ${processed}/${total} products`);
        }
      }
    );
    
    this.logger.info(`Extracted ${products.length} products`);
    
    return products;
  }

  /**
   * Create extraction function for product details
   */
  createExtractionFunction(selectors) {
    return async (page, url) => {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000); // Wait for dynamic content
        
        const product = await page.evaluate((selectors) => {
          const extractText = (selector) => {
            if (!selector) return null;
            const element = document.querySelector(selector);
            return element ? element.textContent.trim() : null;
          };
          
          const extractAttribute = (selector, attr) => {
            if (!selector) return null;
            const element = document.querySelector(selector);
            return element ? element.getAttribute(attr) : null;
          };
          
          const extractImages = (selector) => {
            if (!selector) return [];
            const elements = document.querySelectorAll(selector);
            return Array.from(elements).map(img => img.src || img.getAttribute('data-src'));
          };
          
          return {
            title: extractText(selectors.product_title),
            price: extractText(selectors.product_price),
            description: extractText(selectors.product_description),
            images: extractImages(selectors.product_image),
            url: window.location.href,
            in_stock: document.querySelector(selectors.add_to_cart) !== null
          };
        }, selectors);
        
        return product;
        
      } catch (error) {
        this.logger.debug(`Failed to extract product from ${url}`, {
          error: error.message
        });
        return null;
      }
    };
  }

  /**
   * Phase 3: Validate and enhance products
   */
  async validateProducts(products, selectors) {
    this.logger.info(`Validating ${products.length} products`);
    
    const validatedProducts = [];
    
    for (const product of products) {
      if (!product) continue;
      
      // Basic validation
      if (product.title && (product.price || product.description)) {
        // Clean and enhance product data
        const enhanced = {
          ...product,
          title: this.cleanText(product.title),
          price: this.cleanPrice(product.price),
          description: this.cleanText(product.description),
          images: product.images?.filter(img => img) || [],
          extracted_at: new Date().toISOString()
        };
        
        validatedProducts.push(enhanced);
      }
    }
    
    this.logger.info(`Validated ${validatedProducts.length} products`);
    
    return validatedProducts;
  }

  /**
   * Clean text content
   */
  cleanText(text) {
    if (!text) return '';
    return text
      .replace(/\s+/g, ' ')
      .replace(/[\n\r\t]/g, ' ')
      .trim();
  }

  /**
   * Clean price text
   */
  cleanPrice(price) {
    if (!price) return null;
    // Extract numeric price
    const match = price.match(/[\d,]+\.?\d*/);
    return match ? match[0] : price;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.extractorPool) {
      await this.extractorPool.shutdown();
    }
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    
    this.logger.info('ExtractionPipeline cleaned up');
  }
}

module.exports = ExtractionPipeline;