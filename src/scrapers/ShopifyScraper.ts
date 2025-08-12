import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { Logger } from '../types/common.types';

const RedisCache = require('./RedisCache');

interface ShopifySelectors {
  product: {
    title: string;
    price: string;
    variants: string;
    images: string;
    description: string;
    addToCart: string;
    availability: string;
  };
  navigation: {
    collections: string;
    products: string;
    menu: string;
    search: string;
  };
  listing: {
    productItems: string;
    productGrid: string;
    pagination: string;
  };
}

interface NavigationPatterns {
  shopify: {
    collectionUrl: string;
    productUrl: string;
    searchUrl: string;
    categoryNavigation: string;
  };
}

interface Collection {
  name: string;
  url: string;
}

interface ShopifyProduct {
  title: string;
  price: string;
  url: string | null;
  image: string | null;
  element?: string;
  collection?: string;
}

interface ProductVariant {
  name: string;
  value: string;
  available: boolean;
}

interface DetailedProductData {
  url: string;
  title: string | null;
  price: string | null;
  variants: ProductVariant[];
  images: string[];
  description: string | null;
  canPurchase: boolean;
}

interface IntentAnalysis {
  hasSpecificItem: boolean;
  itemType: string | null;
  color: string | null;
  priceRange: { max: number } | null;
  material: string | null;
}

interface ShopifyStructure {
  collections: Collection[];
  totalProducts: number;
  hasSearch: boolean;
  hasCart: boolean;
  navigation: any[];
}

interface StoryStep {
  stepNumber: number;
  timestamp: string;
  human: string;
  technical: string;
  currentUrl: string;
  discoveries: Record<string, any>;
}

interface ShoppingSuession {
  url: string;
  userIntent: string;
  timestamp: string;
  storySteps: StoryStep[];
  technicalSteps: string[];
  discoveries: {
    collections?: Collection[];
    selectedProduct?: DetailedProductData;
  };
  products: ShopifyProduct[];
}

interface ScrapeOptions {
  maxCollections?: number;
}

class ShopifyScraper {
  private logger: Logger;
  private browser: Browser | null = null;
  private cache: any;
  private selectors: ShopifySelectors;
  private navigationPatterns: NavigationPatterns;

  constructor(logger: Logger) {
    this.logger = logger;
    this.cache = new RedisCache(logger);
    this.selectors = this.getShopifySelectors();
    this.navigationPatterns = this.getNavigationPatterns();
  }

  private getShopifySelectors(): ShopifySelectors {
    return {
      product: {
        title: 'h1, .product-single__title, .product__title, .product-title',
        price: '.money, .price, .product-price, .product__price',
        variants: 'select option, .variant-input, .product-form__option',
        images: '.product-single__photo img, .product__photo img, .product-images img',
        description: '.product-single__description, .product__description, .rte',
        addToCart: '.btn--add-to-cart, [name="add"], .product-form__cart-submit',
        availability: '.product-form__buttons, .product-availability',
      },
      navigation: {
        collections: 'a[href*="/collections/"]',
        products: 'a[href*="/products/"]',
        menu: 'nav, .navigation, .main-menu, .header-nav',
        search: 'input[type="search"], input[name*="search"], .search-input',
      },
      listing: {
        productItems: '.product-item, .product-card, .grid-product, .product',
        productGrid: '.product-grid, .products-grid, .collection-grid',
        pagination: '.pagination, .pager, .page-numbers',
      },
    };
  }

  private getNavigationPatterns(): NavigationPatterns {
    return {
      shopify: {
        collectionUrl: '/collections/{category}',
        productUrl: '/products/{handle}',
        searchUrl: '/search?q={query}',
        categoryNavigation: 'direct_collection_access',
      },
    };
  }

  async initialize(): Promise<void> {
    try {
      // Only try Redis if we have connection details configured
      if (process.env.REDIS_HOST || process.env.REDIS_URL) {
        await this.cache.connect();
      } else {
        this.logger.info('Redis not configured, using memory cache for Shopify scraper');
        this.cache.memoryCache = new Map();
        this.cache.connected = false;
      }

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
      this.logger.info('Shopify scraper initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Shopify scraper:', error);
      throw error;
    }
  }

  async scrapeShopifyStore(url: string, userIntent: string, options: ScrapeOptions = {}): Promise<ShoppingSuession> {
    if (!this.browser) {
      await this.initialize();
    }

    const context = await this.browser!.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();

    try {
      this.logger.info(`Starting Shopify scrape for: ${url}`);

      const shoppingSession: ShoppingSuession = {
        url,
        userIntent,
        timestamp: new Date().toISOString(),
        storySteps: [],
        technicalSteps: [],
        discoveries: {},
        products: [],
      };

      let stepNumber = 0;

      const addStoryStep = (humanAction: string, technicalAction: string, discoveries: Record<string, any> = {}): StoryStep => {
        stepNumber++;
        const step: StoryStep = {
          stepNumber,
          timestamp: new Date().toISOString(),
          human: humanAction,
          technical: technicalAction,
          currentUrl: page.url(),
          discoveries,
        };

        shoppingSession.storySteps.push(step);
        shoppingSession.technicalSteps.push(technicalAction);

        this.logger.info(`STEP ${stepNumber}: ${humanAction}`);
        if (Object.keys(discoveries).length > 0) {
          this.logger.info('Discovered:', discoveries);
        }

        return step;
      };

      // Step 1: Navigate to store
      addStoryStep(
        `I'm visiting ${new URL(url).hostname} to ${userIntent.toLowerCase()}`,
        `Navigate to ${url} using optimized Shopify strategy`,
        { goal: 'Establish connection and identify store structure' },
      );

      // Try direct navigation first, fallback to category if homepage fails
      let navigationSuccess = false;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
        navigationSuccess = true;
      } catch (error) {
        this.logger.warn('Homepage navigation failed, trying category approach');

        // Try known working categories for Shopify stores
        const fallbackCategories = ['/collections/all', '/collections/featured', '/collections/new'];
        for (const category of fallbackCategories) {
          try {
            await page.goto(url + category, { waitUntil: 'domcontentloaded', timeout: 10000 });
            await page.waitForTimeout(1000);
            navigationSuccess = true;
            break;
          } catch (categoryError) {
            continue;
          }
        }
      }

      if (!navigationSuccess) {
        throw new Error('Unable to access store via homepage or category pages');
      }

      // Step 2: Discover collections (Phase 1 of two-phase approach)
      const domain = new URL(url).hostname;
      let collections: Collection[] = await this.cache.getCollections(domain);

      if (!collections) {
        this.logger.info('Collections not cached, discovering all collections...');
        collections = await this.discoverAllCollections(page, url);
        await this.cache.cacheCollections(domain, collections);
      }

      addStoryStep(
        `I can see this is a Shopify store with ${collections.length} different categories to explore`,
        'Phase 1: Discover and cache all collections for systematic exploration',
        {
          platform: 'shopify',
          collections: collections.length,
          cached: collections.length > 0,
          phase: 'collection_discovery',
        },
      );

      shoppingSession.discoveries.collections = collections;

      // Step 3: Find relevant collections based on intent (Phase 2 preparation)
      const intentAnalysis = this.analyzeShoppingIntent(userIntent);
      const relevantCollections = this.selectRelevantCollections(collections, intentAnalysis);

      addStoryStep(
        `Based on my search for "${userIntent}", I've identified ${relevantCollections.length} relevant categories to explore`,
        'Phase 2 preparation: Select target collections based on shopping intent',
        {
          targetCollections: relevantCollections.map(c => c.name),
          reasoning: intentAnalysis.hasSpecificItem ? `Looking for ${intentAnalysis.itemType}` : 'General browsing',
          strategy: 'focused_collection_targeting',
        },
      );

      // Step 4: Extract products from relevant collections (Phase 2 execution)
      let allProducts: ShopifyProduct[] = [];
      let collectionsScraped = 0;
      const maxCollections = options.maxCollections || 3; // Limit for demo

      for (const collection of relevantCollections.slice(0, maxCollections)) {
        try {
          addStoryStep(
            `Now I'm exploring the ${collection.name} section to find products that match my needs`,
            `Navigate to collection: ${collection.url}`,
            {
              collectionName: collection.name,
              progress: `${collectionsScraped + 1}/${Math.min(relevantCollections.length, maxCollections)}`,
            },
          );

          const collectionProducts = await this.scrapeCollectionProducts(page, collection);
          allProducts = allProducts.concat(collectionProducts);
          collectionsScraped++;

          await this.cache.cacheProducts(collection.url, collectionProducts);
          await this.cache.incrementCollectionCount(domain);

          this.logger.info(`Found ${collectionProducts.length} products in ${collection.name}`);

          // Add small delay between collections
          await page.waitForTimeout(1000);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Failed to scrape collection ${collection.name}:`, errorMessage);
        }
      }

      addStoryStep(
        `Perfect! I've found ${allProducts.length} products across ${collectionsScraped} categories that I can explore`,
        'Phase 2 complete: Successfully extracted products from targeted collections',
        {
          totalProducts: allProducts.length,
          collectionsScraped: collectionsScraped,
          strategy: 'dynamic_collection_iteration',
          cached: true,
        },
      );

      shoppingSession.products = allProducts;

      // Step 5: Examine detailed product if products found
      if (allProducts.length > 0) {
        const selectedProduct = this.selectBestProduct(allProducts, intentAnalysis);

        addStoryStep(
          `"${selectedProduct.title}" looks interesting with its ${selectedProduct.price} price point. Let me get more details`,
          `Navigate to product page: ${selectedProduct.url}`,
          {
            productChoice: selectedProduct.title,
            reason: this.explainProductSelection(selectedProduct, intentAnalysis),
          },
        );

        if (selectedProduct.url) {
          await page.goto(selectedProduct.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(3000);

          // Step 6: Deep product analysis
          const productDetails = await this.extractDetailedProductData(page);

          addStoryStep(
            `Perfect! This ${productDetails.title} costs ${productDetails.price} and comes in ${productDetails.variants.length} options. ${productDetails.canPurchase ? 'I can buy this now' : 'Currently unavailable'}`,
            'Complete product data extraction with variants, pricing, and purchase options',
            {
              variants: productDetails.variants.map(v => v.name),
              canPurchase: productDetails.canPurchase,
              dataCompleteness: 'Full product profile captured',
            },
          );

          shoppingSession.discoveries.selectedProduct = productDetails;
        }
      }

      // Step 7: Shopping session complete
      addStoryStep(
        'My shopping research is complete. I\'ve successfully explored the store, found products matching my needs, and gathered all the information needed to make a purchase decision',
        'Shopify scraping session completed with comprehensive data extraction',
        {
          sessionDuration: Date.now() - new Date(shoppingSession.timestamp).getTime(),
          dataQuality: 'Complete shopping flow with human reasoning',
          totalSteps: stepNumber,
          outcome: 'Ready for AI training data generation',
        },
      );

      return shoppingSession;

    } catch (error) {
      this.logger.error('Shopify scraping failed:', error);
      throw error;
    } finally {
      await page.close();
      await context.close();
    }
  }

  async analyzeShopifyStructure(page: Page): Promise<ShopifyStructure> {
    return await page.evaluate((selectors: ShopifySelectors) => {
      const structure: ShopifyStructure = {
        collections: [],
        totalProducts: 0,
        hasSearch: false,
        hasCart: false,
        navigation: [],
      };

      // Find all collection links
      const collectionLinks = document.querySelectorAll(selectors.navigation.collections);
      const seenCollections = new Set<string>();

      collectionLinks.forEach(link => {
        const linkElement = link as HTMLAnchorElement;
        const url = linkElement.href;
        const name = linkElement.textContent?.trim() || '';

        if (name && url && !seenCollections.has(url)) {
          seenCollections.add(url);
          structure.collections.push({ name, url });
        }
      });

      // Count visible products
      const productLinks = document.querySelectorAll(selectors.navigation.products);
      structure.totalProducts = productLinks.length;

      // Check for search functionality
      structure.hasSearch = !!document.querySelector(selectors.navigation.search);

      // Check for cart functionality
      structure.hasCart = !!(
        document.querySelector('[href*="/cart"]') ||
        document.querySelector('.cart') ||
        document.querySelector('[data-cart]')
      );

      return structure;
    }, this.selectors);
  }

  async extractShopifyProducts(page: Page): Promise<ShopifyProduct[]> {
    return await page.evaluate((selectors: ShopifySelectors) => {
      const products: ShopifyProduct[] = [];
      const productElements = document.querySelectorAll(selectors.listing.productItems);

      productElements.forEach((element, index) => {
        if (index >= 20) return; // Limit to 20 products

        const titleEl = element.querySelector(selectors.product.title);
        const priceEl = element.querySelector(selectors.product.price);
        const linkEl = element.querySelector('a') || element.closest('a');
        const imageEl = element.querySelector('img');

        if (titleEl || priceEl) {
          const linkElement = linkEl as HTMLAnchorElement;
          const imageElement = imageEl as HTMLImageElement;
          
          products.push({
            title: titleEl ? titleEl.textContent?.trim() || 'Product' : 'Product',
            price: priceEl ? priceEl.textContent?.trim() || 'Price not available' : 'Price not available',
            url: linkElement ? linkElement.href : null,
            image: imageElement ? imageElement.src : null,
            element: element.tagName,
          });
        }
      });

      return products;
    }, this.selectors);
  }

  async extractDetailedProductData(page: Page): Promise<DetailedProductData> {
    return await page.evaluate((selectors: ShopifySelectors) => {
      const details: DetailedProductData = {
        url: window.location.href,
        title: null,
        price: null,
        variants: [],
        images: [],
        description: null,
        canPurchase: false,
      };

      // Extract title
      const titleEl = document.querySelector(selectors.product.title);
      if (titleEl) details.title = titleEl.textContent?.trim() || null;

      // Extract price
      const priceEl = document.querySelector(selectors.product.price);
      if (priceEl) details.price = priceEl.textContent?.trim() || null;

      // Extract variants
      const variantSelects = document.querySelectorAll('select');
      variantSelects.forEach(select => {
        const selectElement = select as HTMLSelectElement;
        const options = Array.from(selectElement.options);
        options.forEach(option => {
          if (option.value && option.textContent?.trim() &&
              !option.textContent.toLowerCase().includes('choose') &&
              !option.textContent.toLowerCase().includes('default')) {
            details.variants.push({
              name: option.textContent.trim(),
              value: option.value,
              available: !option.disabled,
            });
          }
        });
      });

      // Extract images
      const imageElements = document.querySelectorAll(selectors.product.images);
      imageElements.forEach(img => {
        const imgElement = img as HTMLImageElement;
        if (imgElement.src && !imgElement.src.includes('data:')) {
          details.images.push(imgElement.src);
        }
      });

      // Check if can purchase
      const addToCartBtn = document.querySelector(selectors.product.addToCart);
      if (addToCartBtn) {
        const buttonElement = addToCartBtn as HTMLButtonElement;
        details.canPurchase = !buttonElement.disabled;
      }

      // Extract description
      const descEl = document.querySelector(selectors.product.description);
      if (descEl) details.description = descEl.textContent?.trim() || null;

      return details;
    }, this.selectors);
  }

  private analyzeShoppingIntent(intent: string): IntentAnalysis {
    const analysis: IntentAnalysis = {
      hasSpecificItem: false,
      itemType: null,
      color: null,
      priceRange: null,
      material: null,
    };

    // Extract item type
    const itemTypes = ['shoes', 'boots', 'shirt', 'pants', 'dress', 'jacket', 'coat', 'hat', 'bag', 'jewelry', 'watch'];
    for (const item of itemTypes) {
      if (intent.toLowerCase().includes(item)) {
        analysis.itemType = item;
        analysis.hasSpecificItem = true;
        break;
      }
    }

    // Extract color
    const colors = ['black', 'white', 'red', 'blue', 'green', 'brown', 'gray', 'pink'];
    for (const color of colors) {
      if (intent.toLowerCase().includes(color)) {
        analysis.color = color;
        break;
      }
    }

    // Extract price range
    const priceMatch = intent.match(/under\s*\$?(\d+)/i);
    if (priceMatch) {
      analysis.priceRange = { max: parseInt(priceMatch[1]) };
    }

    return analysis;
  }

  private selectBestProduct(products: ShopifyProduct[], intentAnalysis: IntentAnalysis): ShopifyProduct {
    // Simple selection logic - prefer products that match intent
    let bestProduct = products[0];

    for (const product of products) {
      let score = 0;

      if (intentAnalysis.itemType &&
          product.title.toLowerCase().includes(intentAnalysis.itemType)) {
        score += 10;
      }

      if (intentAnalysis.color &&
          product.title.toLowerCase().includes(intentAnalysis.color)) {
        score += 5;
      }

      if (score > 0) {
        bestProduct = product;
        break;
      }
    }

    return bestProduct;
  }

  private explainProductSelection(product: ShopifyProduct, intentAnalysis: IntentAnalysis): string {
    const reasons: string[] = [];

    if (intentAnalysis.itemType &&
        product.title.toLowerCase().includes(intentAnalysis.itemType)) {
      reasons.push(`matches my search for ${intentAnalysis.itemType}`);
    }

    if (intentAnalysis.color &&
        product.title.toLowerCase().includes(intentAnalysis.color)) {
      reasons.push(`available in ${intentAnalysis.color}`);
    }

    if (reasons.length === 0) {
      reasons.push('first available option that looks interesting');
    }

    return reasons.join(' and ');
  }

  async discoverAllCollections(page: Page, baseUrl: string): Promise<Collection[]> {
    const collections = await page.evaluate(() => {
      const collectionLinks = document.querySelectorAll('a[href*="/collections/"]');
      const collections: Collection[] = [];
      const seenUrls = new Set<string>();

      collectionLinks.forEach(link => {
        const linkElement = link as HTMLAnchorElement;
        const url = linkElement.href;
        const name = linkElement.textContent?.trim() || '';

        if (name && url && !seenUrls.has(url) &&
            !url.includes('/collections/all') &&
            !url.includes('/collections/frontpage') &&
            name.length > 0 && name.length < 100) {
          seenUrls.add(url);
          collections.push({ name, url });
        }
      });

      return collections;
    });

    this.logger.info(`Discovered ${collections.length} unique collections`);
    return collections;
  }

  private selectRelevantCollections(collections: Collection[], intentAnalysis: IntentAnalysis): Collection[] {
    let relevant: Collection[] = [];

    // If looking for specific item type, find matching collections
    if (intentAnalysis.hasSpecificItem && intentAnalysis.itemType) {
      relevant = collections.filter(col =>
        col.name.toLowerCase().includes(intentAnalysis.itemType!.toLowerCase()) ||
        col.url.toLowerCase().includes(intentAnalysis.itemType!.toLowerCase()),
      );
    }

    // If no specific matches or general browsing, select popular categories
    if (relevant.length === 0) {
      const popularKeywords = ['featured', 'new', 'best', 'popular', 'sale', 'men', 'women', 'unisex', 'shoes', 'clothing'];
      relevant = collections.filter(col => {
        const name = col.name.toLowerCase();
        return popularKeywords.some(keyword => name.includes(keyword));
      });
    }

    // If still no matches, take first few collections
    if (relevant.length === 0) {
      relevant = collections.slice(0, 5);
    }

    // Limit to reasonable number for performance
    return relevant.slice(0, 10);
  }

  async scrapeCollectionProducts(page: Page, collection: Collection): Promise<ShopifyProduct[]> {
    try {
      await page.goto(collection.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(3000); // Wait for dynamic content

      const products = await page.evaluate((selectors: ShopifySelectors, collectionName: string) => {
        const products: ShopifyProduct[] = [];

        // Try multiple product selectors for better coverage
        const productSelectors = [
          '.grid__item',
          '.product-item',
          '.card-wrapper',
          '.collection-product-card',
          '[data-product-id]',
        ];

        for (const selector of productSelectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            elements.forEach((element, index) => {
              if (index >= 24) return; // Limit per collection

              // Extract product data
              const titleEl = element.querySelector('h3, .card__heading, .product-item__title, a');
              const priceEl = element.querySelector('.price, .money, .product-item__price');
              const linkEl = element.querySelector('a') || element.closest('a');
              const imageEl = element.querySelector('img');

              if (titleEl && linkEl) {
                const linkElement = linkEl as HTMLAnchorElement;
                const imageElement = imageEl as HTMLImageElement;
                
                products.push({
                  title: titleEl.textContent?.trim() || '',
                  price: priceEl ? priceEl.textContent?.trim() || 'Price not available' : 'Price not available',
                  url: linkElement.href,
                  image: imageElement ? imageElement.src : null,
                  collection: collectionName,
                });
              }
            });
            break; // Found products with this selector, no need to try others
          }
        }

        return products;
      }, this.selectors, collection.name);

      this.logger.info(`Extracted ${products.length} products from ${collection.name}`);
      return products;

    } catch (error) {
      this.logger.error(`Failed to scrape collection ${collection.name}:`, error);
      return [];
    }
  }

  async close(): Promise<void> {
    if (this.cache) {
      await this.cache.close();
    }
    if (this.browser) {
      await this.browser.close();
      this.logger.info('Shopify scraper closed successfully');
    }
  }
}

export default ShopifyScraper;