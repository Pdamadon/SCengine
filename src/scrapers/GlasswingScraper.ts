import { chromium, Browser, Page } from 'playwright';
import { Logger } from '../types/common.types';

interface ElementSelector {
  primary: string;
  alternatives: string[];
  playwrightAction: string;
  element: {
    tag: string;
    text: string | null;
    href?: string | null;
    clickable?: boolean;
    value?: string | null;
  };
}

interface CategoryData {
  url: string;
  title: string;
  productLinks: ElementSelector[];
  navigation: {
    nextPage: ElementSelector | null;
    prevPage: ElementSelector | null;
  };
}

interface ProductImage {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
}

interface VariantOption {
  value: string;
  text: string;
  available: boolean;
  selected: boolean;
  variantType: 'size' | 'color' | 'material' | 'unknown';
}

interface ProductVariant {
  type: 'size' | 'color' | 'material' | 'unknown';
  label: string;
  selector: string;
  options: VariantOption[];
}

interface ProductData {
  title: string | null;
  price: string | null;
  description: string | null;
  descriptionHtml: string | null;
  descriptionLength: number;
  url: string;
}

interface ElementAnalysis {
  title: ElementSelector | null;
  price: ElementSelector | null;
  addToCartButton: ElementSelector | null;
  sizeSelector: ElementSelector | null;
  quantityInput: ElementSelector | null;
  mainImage: ElementSelector | null;
}

interface ScrapedProduct {
  url: string;
  productData: ProductData;
  variants: ProductVariant[];
  images: ProductImage[];
  elements: ElementAnalysis;
  workflowActions: string[];
  scrapedAt: string;
  error?: string;
  category?: string;
  categoryType?: string;
}

interface Category {
  name: string;
  url: string;
  type: 'main_navigation' | 'dropdown_menu' | 'fallback';
}

interface CategoryResult {
  category: Category;
  result?: CompleteCollectionResult;
  products_found?: number;
  products_scraped?: number;
  error?: string;
}

interface CompleteCollectionResult {
  site: string;
  timestamp: string;
  collection: string;
  paginationData: {
    pagesScraped: number;
    totalProductLinksFound: number;
    productsProcessed: number;
  };
  categoryAnalysis: CategoryData;
  allCategoryPages: CategoryData[];
  productAnalysis: ScrapedProduct[];
  summary: {
    totalProductsFound: number;
    detailedProductPages: number;
    successfulScrapes: number;
    successRate: string | number;
  };
}

interface FirstProductsResult {
  site: string;
  timestamp: string;
  categoryAnalysis: CategoryData;
  productAnalysis: ScrapedProduct[];
  summary: {
    totalProductsFound: number;
    detailedProductPages: number;
    successfulScrapes: number;
  };
}

interface ProgressUpdate {
  stage: string;
  message: string;
  progress: number;
  categories_complete?: number;
  total_categories?: number;
  products_scraped?: number;
}

interface IntelligenceSummary {
  sections_mapped: number;
  selectors_identified: number;
  intelligence_score: number;
}

interface NavigationItem {
  text?: string;
  title?: string;
  href: string;
}

interface NavigationSection {
  text?: string;
  title?: string;
  href: string;
}

interface DropdownMenu {
  items: NavigationItem[];
}

interface NavigationData {
  navigation_map?: {
    main_sections?: NavigationSection[];
    dropdown_menus?: Record<string, DropdownMenu>;
  };
}

interface CategoryBasedResult {
  site: string;
  timestamp: string;
  intelligence: {
    sections_mapped: number;
    selectors_identified: number;
    intelligence_score: number;
  };
  categories: {
    discovered: number;
    processed: number;
    successful: number;
  };
  products: {
    total_found: number;
    total_scraped: number;
    max_requested: number | null;
  };
  categoryResults: CategoryResult[];
  allProducts: ScrapedProduct[];
  summary: {
    success: boolean;
    categories_discovered: number;
    categories_processed: number;
    products_scraped: number;
    intelligence_used: boolean;
  };
}

type ProgressCallback = (update: ProgressUpdate) => void;

class GlasswingScraper {
  private logger: Logger;
  private browser: Browser | null = null;
  private domain: string = 'glasswingshop.com';
  private baseUrl: string = 'https://glasswingshop.com';

  constructor(logger: Logger) {
    this.logger = logger;
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
      this.logger.info('GlasswingScraper initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize GlasswingScraper:', error);
      throw error;
    }
  }

  private getEssentialSelectors(element: Element | null): ElementSelector | null {
    if (!element) return null;

    const selectors: string[] = [];

    // Priority order: ID, class, attribute, tag
    const htmlElement = element as HTMLElement;
    if (htmlElement.id) selectors.push(`#${htmlElement.id}`);

    if (htmlElement.className) {
      const classes = htmlElement.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        selectors.push(`.${classes[0]}`); // Most specific class
        if (classes.length > 1) selectors.push(`.${classes.slice(0, 2).join('.')}`);
      }
    }

    // Essential attributes
    const importantAttrs = ['data-testid', 'role', 'type', 'name'];
    importantAttrs.forEach(attr => {
      const value = htmlElement.getAttribute(attr);
      if (value) selectors.push(`[${attr}="${value}"]`);
    });

    // Tag as fallback
    selectors.push(element.tagName.toLowerCase());

    const linkElement = element as HTMLAnchorElement;
    return {
      primary: selectors[0] || element.tagName.toLowerCase(),
      alternatives: selectors.slice(1, 4),
      playwrightAction: `page.click('${selectors[0] || element.tagName.toLowerCase()}')`,
      element: {
        tag: element.tagName.toLowerCase(),
        text: element.textContent?.trim().substring(0, 50) || null,
        href: linkElement.href || null,
        clickable: element.tagName.toLowerCase() === 'a' || element.tagName.toLowerCase() === 'button' || (htmlElement as any).onclick !== null,
      },
    };
  }

  async scrapeCategoryPage(categoryUrl: string = '/collections/clothing-collection'): Promise<CategoryData> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });

    const fullUrl = categoryUrl.startsWith('http') ? categoryUrl : this.baseUrl + categoryUrl;

    try {
      this.logger.info(`Scraping category page: ${fullUrl}`);

      await page.goto(fullUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(2000);

      // Scroll to load products
      await page.evaluate(async () => {
        for (let i = 0; i < 5; i++) {
          window.scrollTo(0, document.body.scrollHeight);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      });

      const categoryData = await page.evaluate(() => {
        const getEssentialSelectors = (element: Element | null): ElementSelector | null => {
          if (!element) return null;
          
          const selectors: string[] = [];
          const htmlElement = element as HTMLElement;

          if (htmlElement.id) selectors.push(`#${htmlElement.id}`);

          if (htmlElement.className) {
            const classes = htmlElement.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) {
              selectors.push(`.${classes[0]}`);
              if (classes.length > 1) selectors.push(`.${classes.slice(0, 2).join('.')}`);
            }
          }

          const importantAttrs = ['data-testid', 'role', 'type', 'name'];
          importantAttrs.forEach(attr => {
            const value = htmlElement.getAttribute(attr);
            if (value) selectors.push(`[${attr}="${value}"]`);
          });

          selectors.push(element.tagName.toLowerCase());

          const linkElement = element as HTMLAnchorElement;
          return {
            primary: selectors[0] || element.tagName.toLowerCase(),
            alternatives: selectors.slice(1, 4),
            playwrightAction: `page.click('${selectors[0] || element.tagName.toLowerCase()}')`,
            element: {
              tag: element.tagName.toLowerCase(),
              text: element.textContent?.trim().substring(0, 50) || null,
              href: linkElement.href || null,
              clickable: element.tagName.toLowerCase() === 'a' || element.tagName.toLowerCase() === 'button' || (htmlElement as any).onclick !== null,
            },
          };
        };

        // Find product links and deduplicate by href
        const productLinksMap = new Map<string, ElementSelector>();
        Array.from(document.querySelectorAll('a[href*="/products/"]'))
          .forEach(link => {
            const linkElement = link as HTMLAnchorElement;
            if (linkElement.href && !productLinksMap.has(linkElement.href)) {
              const selector = getEssentialSelectors(link);
              if (selector) {
                productLinksMap.set(linkElement.href, selector);
              }
            }
          });

        const productLinks = Array.from(productLinksMap.values()).slice(0, 20);

        // Navigation elements - Look for pagination links
        let nextPageLink: Element | null = null;
        let prevPageLink: Element | null = null;

        // Find all page links
        const pageLinks = Array.from(document.querySelectorAll('a[href*="page="]'));

        // Look for "next" link specifically
        nextPageLink = pageLinks.find(link =>
          link.textContent?.trim().toLowerCase() === 'next' ||
          link.textContent?.trim().toLowerCase() === 'Next' ||
          link.textContent?.trim() === '→' ||
          link.getAttribute('aria-label')?.toLowerCase().includes('next'),
        ) || null;

        // Look for "prev" or "previous" link
        prevPageLink = pageLinks.find(link =>
          link.textContent?.trim().toLowerCase() === 'prev' ||
          link.textContent?.trim().toLowerCase() === 'previous' ||
          link.textContent?.trim().toLowerCase() === 'Previous' ||
          link.textContent?.trim() === '←' ||
          link.getAttribute('aria-label')?.toLowerCase().includes('prev'),
        ) || null;

        // If no explicit next/prev, use numeric logic
        if (!nextPageLink && pageLinks.length > 0) {
          // Get current page from URL
          const currentUrl = new URL(window.location.href);
          const currentPage = parseInt(currentUrl.searchParams.get('page') || '1');

          // Look for next page number
          nextPageLink = pageLinks.find(link => {
            const linkElement = link as HTMLAnchorElement;
            const linkUrl = new URL(linkElement.href);
            const linkPage = parseInt(linkUrl.searchParams.get('page') || '1');
            return linkPage === currentPage + 1;
          }) || null;
        }

        return {
          url: window.location.href,
          title: document.title,
          productLinks: productLinks,
          navigation: {
            nextPage: getEssentialSelectors(nextPageLink),
            prevPage: getEssentialSelectors(prevPageLink),
          },
        };
      });

      this.logger.info(`Found ${categoryData.productLinks.length} products on category page`);
      return categoryData;

    } finally {
      await page.close();
    }
  }

  async scrapeProductPage(productUrl: string): Promise<ScrapedProduct> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });

    const fullUrl = productUrl.startsWith('http') ? productUrl : this.baseUrl + productUrl;

    try {
      this.logger.info(`Scraping product page: ${fullUrl}`);

      await page.goto(fullUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(1500);

      const productData = await page.evaluate(() => {
        const getEssentialSelectors = (element: Element | null): ElementSelector | null => {
          if (!element) return null;

          const selectors: string[] = [];
          const htmlElement = element as HTMLElement;
          
          if (htmlElement.id) selectors.push(`#${htmlElement.id}`);
          if (htmlElement.className) {
            const classes = htmlElement.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) selectors.push(`.${classes[0]}`);
          }

          const importantAttrs = ['data-testid', 'role', 'type', 'name'];
          importantAttrs.forEach(attr => {
            const value = htmlElement.getAttribute(attr);
            if (value) selectors.push(`[${attr}="${value}"]`);
          });

          selectors.push(element.tagName.toLowerCase());

          const inputElement = element as HTMLInputElement;
          return {
            primary: selectors[0],
            alternatives: selectors.slice(1, 3),
            playwrightAction: element.tagName.toLowerCase() === 'select'
              ? `page.selectOption('${selectors[0]}', 'value')`
              : `page.click('${selectors[0]}')`,
            element: {
              tag: element.tagName.toLowerCase(),
              text: element.textContent?.trim().substring(0, 30) || null,
              value: inputElement.value || null,
            },
          };
        };

        // Extract product data
        const extractProductData = (): ProductData => {
          const title = document.querySelector('h1, .product-single__title, .product__title');
          const price = document.querySelector('.money, .price, .product-single__price');

          // Extract product description/details
          const extractDescription = (): { text: string | null; html: string | null; length: number } => {
            // Common selectors for product descriptions
            const descriptionSelectors = [
              '.product-single__description',
              '.product__description',
              '.product-description',
              '.product-details',
              '.product-content',
              '.rte',
              '.product-single__content .rte',
              '[class*="description"]',
              '[class*="detail"]',
            ];

            let description: string | null = null;
            let descriptionHtml: string | null = null;

            // Try each selector until we find content
            for (const selector of descriptionSelectors) {
              const element = document.querySelector(selector);
              if (element && element.textContent?.trim()) {
                description = element.textContent.trim();
                descriptionHtml = element.innerHTML.trim();
                break;
              }
            }

            // Fallback: Look for any content-rich div near product info
            if (!description) {
              const contentDivs = document.querySelectorAll('div p, .product-single div, .product-form ~ div');
              for (const div of contentDivs) {
                const text = div.textContent?.trim() || '';
                if (text.length > 50 && !text.includes('$') && !text.match(/size|color|quantity/i)) {
                  description = text;
                  descriptionHtml = div.innerHTML.trim();
                  break;
                }
              }
            }

            return {
              text: description,
              html: descriptionHtml,
              length: description ? description.length : 0,
            };
          };

          const descriptionData = extractDescription();

          return {
            title: title ? title.textContent?.trim() || null : null,
            price: price ? price.textContent?.trim() || null : null,
            description: descriptionData.text,
            descriptionHtml: descriptionData.html,
            descriptionLength: descriptionData.length,
            url: window.location.href,
          };
        };

        // Extract variant data with type detection
        const extractVariantData = (): ProductVariant[] => {
          const variants: ProductVariant[] = [];

          const selectors = [
            'select[name*="id"]',
            'select[name*="Size"]',
            'select[name*="Color"]',
            '.product-form select',
            '.variant-selector select',
            'select.product-single__variants',
          ];

          selectors.forEach(selector => {
            const variantSelect = document.querySelector(selector) as HTMLSelectElement;
            if (variantSelect && variants.length === 0) {

              const label = variantSelect.previousElementSibling?.textContent?.trim() ||
                           variantSelect.closest('.product-form__input')?.querySelector('label')?.textContent?.trim() ||
                           variantSelect.getAttribute('name') ||
                           'Variant';

              const options = Array.from(variantSelect.querySelectorAll('option'))
                .filter(option => option.value && option.textContent?.trim())
                .map(option => {
                  const text = option.textContent?.trim() || '';

                  // Determine variant type
                  let variantType: VariantOption['variantType'] = 'unknown';
                  if (text.match(/^(XXS|XS|S|M|L|XL|XXL|\d+|\d+\/\d+|One Size|O\/S|Default Title)$/i)) {
                    variantType = 'size';
                  } else if (text.match(/^(Black|White|Red|Blue|Green|Yellow|Orange|Purple|Pink|Brown|Gray|Grey|Navy|Beige|Cream|Ivory|Khaki|Olive|Maroon|Tan|Gold|Silver)$/i)) {
                    variantType = 'color';
                  } else if (text.match(/^(Cotton|Wool|Silk|Linen|Polyester|Denim|Leather|Suede|Canvas)$/i)) {
                    variantType = 'material';
                  } else if (label.toLowerCase().includes('size')) {
                    variantType = 'size';
                  } else if (label.toLowerCase().includes('color') || label.toLowerCase().includes('colour')) {
                    variantType = 'color';
                  }

                  return {
                    value: option.value,
                    text: text,
                    available: !option.disabled,
                    selected: option.selected,
                    variantType: variantType,
                  };
                });

              const overallType = options.length > 0 ? options[0].variantType : 'unknown';

              variants.push({
                type: overallType,
                label: label,
                selector: selector,
                options: options,
              });
            }
          });

          return variants;
        };

        // Extract images
        const extractImages = (): ProductImage[] => {
          return Array.from(document.querySelectorAll('.product-single__photo img, .product__photo img, .featured-image img, img[alt*="product"]'))
            .filter(img => {
              const imgElement = img as HTMLImageElement;
              return imgElement.src && imgElement.src.includes('http');
            })
            .map(img => {
              const imgElement = img as HTMLImageElement;
              return {
                src: imgElement.src,
                alt: imgElement.alt || '',
                width: imgElement.width || null,
                height: imgElement.height || null,
              };
            })
            .slice(0, 3);
        };

        // Essential product page elements
        const elements = {
          title: document.querySelector('h1, .product-single__title, .product__title'),
          price: document.querySelector('.money, .price, .product-single__price'),
          addToCartButton: document.querySelector('button[type="submit"], .btn-product-form, button'),
          sizeSelector: document.querySelector('select[name*="id"], select[name*="Size"], .product-form select'),
          quantityInput: document.querySelector('input[name="quantity"], .quantity input'),
          mainImage: document.querySelector('.product-single__photo img, .product__photo img, .featured-image img'),
        };

        const analysis: ElementAnalysis = {
          title: getEssentialSelectors(elements.title),
          price: getEssentialSelectors(elements.price),
          addToCartButton: getEssentialSelectors(elements.addToCartButton),
          sizeSelector: getEssentialSelectors(elements.sizeSelector),
          quantityInput: getEssentialSelectors(elements.quantityInput),
          mainImage: getEssentialSelectors(elements.mainImage),
        };

        const productData = extractProductData();
        const variants = extractVariantData();
        const images = extractImages();

        return {
          url: window.location.href,
          productData: productData,
          variants: variants,
          images: images,
          elements: analysis,
          workflowActions: [
            analysis.sizeSelector && variants.length > 0 ? `await page.selectOption('${analysis.sizeSelector.primary}', '${variants[0]?.options[1]?.value || variants[0]?.options[0]?.value}');` : null,
            analysis.quantityInput ? `await page.fill('${analysis.quantityInput.primary}', '1');` : null,
            analysis.addToCartButton ? `await page.click('${analysis.addToCartButton.primary}');` : null,
          ].filter((action): action is string => action !== null),
          scrapedAt: new Date().toISOString(),
        };
      });

      this.logger.info(`Product scraped: ${productData.productData.title}`);
      return productData;

    } finally {
      await page.close();
    }
  }

  async scrapeFirstProducts(categoryUrl: string = '/collections/clothing-collection', maxProducts: number = 10): Promise<FirstProductsResult> {
    const categoryData = await this.scrapeCategoryPage(categoryUrl);
    const productAnalysis: ScrapedProduct[] = [];

    const productLinks = categoryData.productLinks.slice(0, maxProducts);

    this.logger.info(`Processing ${productLinks.length} unique product links:`);
    productLinks.forEach((link, index) => {
      this.logger.info(`  ${index + 1}. ${link.element.href}`);
    });

    for (let i = 0; i < productLinks.length; i++) {
      const productLink = productLinks[i];

      if (!productLink.element.href) continue;

      this.logger.info(`Analyzing product ${i + 1}/${productLinks.length}: ${productLink.element.href}`);

      try {
        const productData = await this.scrapeProductPage(productLink.element.href);
        productAnalysis.push(productData);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error scraping product ${productLink.element.href}:`, errorMessage);
        productAnalysis.push({
          url: productLink.element.href,
          error: errorMessage,
          productData: { title: null, price: null, description: null, descriptionHtml: null, descriptionLength: 0, url: productLink.element.href },
          variants: [],
          images: [],
          elements: { title: null, price: null, addToCartButton: null, sizeSelector: null, quantityInput: null, mainImage: null },
          workflowActions: [],
          scrapedAt: new Date().toISOString(),
        });
      }
    }

    return {
      site: this.domain,
      timestamp: new Date().toISOString(),
      categoryAnalysis: categoryData,
      productAnalysis: productAnalysis,
      summary: {
        totalProductsFound: categoryData.productLinks.length,
        detailedProductPages: productAnalysis.length,
        successfulScrapes: productAnalysis.filter(p => !p.error).length,
      },
    };
  }

  async scrapeCompleteCollection(categoryUrl: string = '/collections/clothing-collection', maxProducts: number | null = null): Promise<CompleteCollectionResult> {
    this.logger.info(`Starting complete collection scrape for: ${categoryUrl}`);

    const allProductLinks: ElementSelector[] = [];
    const allCategoryData: CategoryData[] = [];
    const productAnalysis: ScrapedProduct[] = [];
    let currentPage: string | null = categoryUrl;
    let pageCount = 0;
    let totalProductsFound = 0;

    // Step 1: Paginate through all pages to collect all product links
    while (currentPage && pageCount < 200) { // Expanded safety limit for comprehensive scraping
      pageCount++;
      this.logger.info(`Scraping page ${pageCount}: ${currentPage}`);

      try {
        const categoryData = await this.scrapeCategoryPage(currentPage);
        allCategoryData.push(categoryData);

        // Add unique product links
        const newLinks = categoryData.productLinks.filter(link =>
          !allProductLinks.some(existing => existing.element.href === link.element.href),
        );

        allProductLinks.push(...newLinks);
        totalProductsFound += newLinks.length;

        this.logger.info(`Page ${pageCount}: Found ${newLinks.length} new products (total: ${allProductLinks.length})`);

        // Check for next page
        if (categoryData.navigation?.nextPage?.element?.href) {
          currentPage = categoryData.navigation.nextPage.element.href;
        } else {
          this.logger.info('No more pages found');
          break;
        }

        // Apply maxProducts limit if specified
        if (maxProducts && allProductLinks.length >= maxProducts) {
          this.logger.info(`Reached maxProducts limit of ${maxProducts}`);
          break;
        }

        // Delay between pages
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error scraping page ${pageCount}: ${errorMessage}`);
        break;
      }
    }

    // Step 2: Limit product links if maxProducts specified
    const productLinksToScrape = maxProducts
      ? allProductLinks.slice(0, maxProducts)
      : allProductLinks;

    this.logger.info(`Found ${allProductLinks.length} total products across ${pageCount} pages`);
    this.logger.info(`Processing ${productLinksToScrape.length} products...`);

    // Step 3: Scrape individual product pages
    for (let i = 0; i < productLinksToScrape.length; i++) {
      const productLink = productLinksToScrape[i];

      if (!productLink.element.href) continue;

      this.logger.info(`Analyzing product ${i + 1}/${productLinksToScrape.length}: ${productLink.element.href}`);

      try {
        const productData = await this.scrapeProductPage(productLink.element.href);
        productAnalysis.push(productData);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error scraping product ${productLink.element.href}:`, errorMessage);
        productAnalysis.push({
          url: productLink.element.href,
          error: errorMessage,
          productData: { title: null, price: null, description: null, descriptionHtml: null, descriptionLength: 0, url: productLink.element.href },
          variants: [],
          images: [],
          elements: { title: null, price: null, addToCartButton: null, sizeSelector: null, quantityInput: null, mainImage: null },
          workflowActions: [],
          scrapedAt: new Date().toISOString(),
        });
      }

      // Progress logging every 10 products
      if ((i + 1) % 10 === 0 || i === productLinksToScrape.length - 1) {
        const successful = productAnalysis.filter(p => !p.error).length;
        this.logger.info(`Progress: ${i + 1}/${productLinksToScrape.length} products (${successful} successful)`);
      }
    }

    return {
      site: this.domain,
      timestamp: new Date().toISOString(),
      collection: categoryUrl,
      paginationData: {
        pagesScraped: pageCount,
        totalProductLinksFound: allProductLinks.length,
        productsProcessed: productLinksToScrape.length,
      },
      categoryAnalysis: allCategoryData[0], // First page for compatibility
      allCategoryPages: allCategoryData,
      productAnalysis: productAnalysis,
      summary: {
        totalProductsFound: allProductLinks.length,
        detailedProductPages: productAnalysis.length,
        successfulScrapes: productAnalysis.filter(p => !p.error).length,
        successRate: productAnalysis.length > 0 ? (productAnalysis.filter(p => !p.error).length / productAnalysis.length * 100).toFixed(1) : 0,
      },
    };
  }

  // Main method called by ScrapingWorker for category-based scraping
  async scrapeWithCategories(maxProducts: number | null = null, progressCallback: ProgressCallback | null = null): Promise<CategoryBasedResult> {
    this.logger.info(`Starting category-based scraping for ${this.domain}`);
    
    try {
      // Initialize if not already done
      if (!this.browser) {
        await this.initialize();
      }

      // Use the intelligence system to discover all categories first
      const SiteIntelligence = require('../intelligence/SiteIntelligence');
      const siteIntelligence = new SiteIntelligence(this.logger);
      await siteIntelligence.initialize();

      // Build comprehensive site intelligence
      const intelligence = await siteIntelligence.buildComprehensiveSiteIntelligence(this.baseUrl, {
        forceRefresh: false, // Use cached if available
        maxConcurrent: 4,
        maxSubcategories: 3
      });

      if (progressCallback) {
        progressCallback({
          stage: 'intelligence_complete',
          message: `Site intelligence built: ${intelligence.summary.sections_mapped} sections discovered`,
          progress: 25
        });
      }

      // Extract all discovered categories
      const categories: Category[] = [];
      
      // Get navigation data from intelligence
      const navigationData: NavigationData = await siteIntelligence.worldModel.getSiteNavigation(this.domain);
      if (navigationData?.navigation_map?.main_sections) {
        navigationData.navigation_map.main_sections.forEach(section => {
          if (section.href && section.href.includes('collections')) {
            categories.push({
              name: section.text || section.title || 'Unknown Category',
              url: section.href.startsWith('http') ? section.href : this.baseUrl + section.href,
              type: 'main_navigation'
            });
          }
        });
      }

      // Add dropdown menu categories
      if (navigationData?.navigation_map?.dropdown_menus) {
        Object.values(navigationData.navigation_map.dropdown_menus).forEach(dropdown => {
          if (dropdown.items) {
            dropdown.items.forEach(item => {
              if (item.href && item.href.includes('collections')) {
                categories.push({
                  name: item.text || item.title || 'Unknown Category',
                  url: item.href.startsWith('http') ? item.href : this.baseUrl + item.href,
                  type: 'dropdown_menu'
                });
              }
            });
          }
        });
      }

      // Fallback to default collections if no categories discovered
      if (categories.length === 0) {
        this.logger.warn('No categories discovered from intelligence, using fallback');
        categories.push({
          name: 'Clothing Collection',
          url: this.baseUrl + '/collections/clothing-collection',
          type: 'fallback'
        });
      }

      this.logger.info(`Found ${categories.length} categories to scrape`);
      
      if (progressCallback) {
        progressCallback({
          stage: 'categories_discovered',
          message: `Found ${categories.length} categories to scrape`,
          progress: 35
        });
      }

      // Scrape products from all categories
      const allProducts: ScrapedProduct[] = [];
      const categoryResults: CategoryResult[] = [];
      let totalProductsProcessed = 0;

      for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        this.logger.info(`Scraping category ${i + 1}/${categories.length}: ${category.name}`);

        try {
          // Calculate products to scrape from this category
          const productsPerCategory = maxProducts ? Math.ceil(maxProducts / categories.length) : null;
          
          const categoryResult = await this.scrapeCompleteCollection(
            category.url, 
            productsPerCategory
          );

          categoryResults.push({
            category: category,
            result: categoryResult,
            products_found: categoryResult.summary.totalProductsFound,
            products_scraped: categoryResult.summary.detailedProductPages
          });

          // Add products to master list
          if (categoryResult.productAnalysis) {
            categoryResult.productAnalysis.forEach(product => {
              if (!product.error) {
                allProducts.push({
                  ...product,
                  category: category.name,
                  categoryType: category.type
                });
              }
            });
          }

          totalProductsProcessed += categoryResult.summary.detailedProductPages;

          if (progressCallback) {
            const progress = 35 + ((i + 1) / categories.length) * 60; // 35% to 95%
            progressCallback({
              stage: 'scraping_categories',
              message: `Completed category ${i + 1}/${categories.length}: ${category.name} (${categoryResult.summary.detailedProductPages} products)`,
              progress: Math.round(progress),
              categories_complete: i + 1,
              total_categories: categories.length,
              products_scraped: totalProductsProcessed
            });
          }

          // Apply maxProducts limit across all categories
          if (maxProducts && allProducts.length >= maxProducts) {
            this.logger.info(`Reached maxProducts limit of ${maxProducts}`);
            break;
          }

          // Delay between categories
          await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Error scraping category ${category.name}:`, errorMessage);
          categoryResults.push({
            category: category,
            error: errorMessage
          });
        }
      }

      // Cleanup intelligence system
      await siteIntelligence.close();

      const finalResult: CategoryBasedResult = {
        site: this.domain,
        timestamp: new Date().toISOString(),
        intelligence: {
          sections_mapped: intelligence.summary.sections_mapped,
          selectors_identified: intelligence.summary.selectors_identified,
          intelligence_score: intelligence.summary.intelligence_score
        },
        categories: {
          discovered: categories.length,
          processed: categoryResults.length,
          successful: categoryResults.filter(r => !r.error).length
        },
        products: {
          total_found: categoryResults.reduce((sum, cat) => sum + (cat.products_found || 0), 0),
          total_scraped: allProducts.length,
          max_requested: maxProducts
        },
        categoryResults: categoryResults,
        allProducts: maxProducts ? allProducts.slice(0, maxProducts) : allProducts,
        summary: {
          success: true,
          categories_discovered: categories.length,
          categories_processed: categoryResults.length,
          products_scraped: allProducts.length,
          intelligence_used: true
        }
      };

      if (progressCallback) {
        progressCallback({
          stage: 'complete',
          message: `Scraping complete: ${allProducts.length} products from ${categories.length} categories`,
          progress: 100
        });
      }

      this.logger.info(`Category-based scraping completed: ${allProducts.length} products from ${categories.length} categories`);
      return finalResult;

    } catch (error) {
      this.logger.error('Category-based scraping failed:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.logger.info('GlasswingScraper closed successfully');
    }
  }
}

export default GlasswingScraper;