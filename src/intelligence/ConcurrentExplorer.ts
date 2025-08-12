import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { Logger } from '../types/common.types';
import { WorldModel } from './WorldModel';
import { NavigationIntelligence } from './NavigationMapper';

// Legacy imports (will be converted later)
const IntelligentSelectorGenerator = require('./IntelligentSelectorGenerator');
const SelectorValidator = require('./SelectorValidator');
const AdvancedFallbackSystem = require('./AdvancedFallbackSystem');

interface NavigationSection {
  name: string;
  url: string;
  selector: string;
  has_dropdown: boolean;
  element_type: string;
}

interface ExplorationOptions {
  maxConcurrent?: number;
}

interface ExplorationMetadata {
  start_time: number;
  end_time?: number;
  duration_ms?: number;
  retry_count?: number;
  navigation_success?: boolean;
  critical_failure?: boolean;
  error?: string;
  success_rate?: number;
}

interface ExplorationError {
  step: string;
  error: string;
}

interface SelectorMetadata {
  generation_strategy: string;
  confidence_scores: Record<string, number>;
  fallback_count: number;
  validation_results: Record<string, any>;
  extraction_failed?: boolean;
  critical_failure?: boolean;
}

interface Selectors {
  navigation: Record<string, any>;
  product: Record<string, any>;
  pricing: Record<string, any>;
  availability: Record<string, any>;
  variants: Record<string, any>;
  images: Record<string, any>;
  filters: Record<string, any>;
  pagination: Record<string, any>;
  _metadata: SelectorMetadata;
}

interface NavigationPath {
  name: string;
  url: string;
  selector: string;
  value?: string;
}

interface NavigationPaths {
  subcategories: NavigationPath[];
  related_sections: NavigationPath[];
  filter_options: NavigationPath[];
  sorting_options: NavigationPath[];
}

interface Product {
  title: string;
  price: string | null;
  url: string;
  image: string | null;
  container_selector: string;
}

interface ProductDiscovery {
  total_found: number;
  products: Product[];
  working_selector: string | null;
}

interface URLPattern {
  current_url: string;
  url_structure: {
    protocol: string;
    hostname: string;
    pathname: string;
    segments: string[];
  };
  discovered_patterns: {
    product_urls: string | null;
    category_urls: string | null;
    collection_urls: string | null;
  };
}

interface InteractionElement {
  text?: string;
  selector: string;
  purpose?: string;
  action?: string;
  method?: string;
  inputs?: Array<{
    name: string;
    type: string;
    selector: string;
  }>;
}

interface InteractionElements {
  buttons: InteractionElement[];
  forms: InteractionElement[];
  dropdowns: InteractionElement[];
  toggles: InteractionElement[];
}

interface SubcategoryExploration {
  name: string;
  url: string;
  products: ProductDiscovery;
  selectors: Selectors;
}

interface SectionIntelligence {
  section_name: string;
  section_url: string;
  exploration_metadata: ExplorationMetadata;
  page_type: string | null;
  selectors: Selectors | null;
  navigation_paths: NavigationPaths | null;
  product_discovery: ProductDiscovery | null;
  url_patterns: URLPattern | null;
  interaction_elements: InteractionElements | null;
  subcategory_exploration?: SubcategoryExploration[];
  errors: ExplorationError[];
}

interface CompiledResults {
  domain: string;
  sections_explored: number;
  selectors: AggregatedSelectors;
  urlPatterns: AggregatedURLPatterns;
  navigation_intelligence: NavigationIntelligenceSummary;
  exploration_summary: {
    total_products_found: number;
    working_selectors: Array<{
      selector: string;
      success_count: number;
    }>;
    page_types_discovered: string[];
  };
}

interface AggregatedSelectors {
  navigation: Record<string, any>;
  product: Record<string, any>;
  pricing: Record<string, any>;
  availability: Record<string, any>;
  variants: Record<string, any>;
  images: Record<string, any>;
  filters: Record<string, any>;
  pagination: Record<string, any>;
  reliability_scores: Record<string, number>;
  success_rate: number;
}

interface AggregatedURLPatterns {
  product_url: string | null;
  category_url: string | null;
  collection_url: string | null;
  examples: Record<string, string[]>;
}

interface NavigationIntelligenceSummary {
  total_sections: number;
  subcategories_found: number;
  filter_options_found: number;
  interaction_elements: number;
}

class ConcurrentExplorer {
  private logger: Logger;
  private worldModel: WorldModel;
  private browsers: Browser[] = [];
  private explorationResults: Map<string, SectionIntelligence> = new Map();
  private selectorGenerator: any;
  private selectorValidator: any;
  private fallbackSystem: any;

  constructor(logger: Logger, worldModel: WorldModel) {
    this.logger = logger;
    this.worldModel = worldModel;

    // Initialize intelligent selector system
    this.selectorGenerator = new IntelligentSelectorGenerator(logger);
    this.selectorValidator = new SelectorValidator(logger);
    this.fallbackSystem = new AdvancedFallbackSystem(logger);
  }

  async initialize(): Promise<void> {
    this.logger.info('Concurrent Explorer initialized');
  }

  async exploreAllSections(
    baseUrl: string, 
    navigationIntelligence: NavigationIntelligence, 
    options: ExplorationOptions = {}
  ): Promise<CompiledResults> {
    const domain = new URL(baseUrl).hostname;
    const maxConcurrent = options.maxConcurrent || 4;
    const sections = navigationIntelligence.main_sections || [];

    this.logger.info(`Starting concurrent exploration of ${sections.length} sections with ${maxConcurrent} browsers`);

    // Filter sections to explore (exclude brands, focus on categories)
    const sectionsToExplore = sections
      .filter(section => this.shouldExploreSection(section))
      .slice(0, maxConcurrent * 2); // Limit total sections

    // Create batches for concurrent processing
    const batches = this.createBatches(sectionsToExplore, maxConcurrent);

    for (const batch of batches) {
      await this.exploreBatch(baseUrl, batch, navigationIntelligence);
    }

    // Compile and store results
    const compiledResults = await this.compileExplorationResults(domain);
    await this.worldModel.storeSelectorLibrary(domain, compiledResults.selectors);
    await this.worldModel.storeURLPatterns(domain, compiledResults.urlPatterns);

    return compiledResults;
  }

  private shouldExploreSection(section: NavigationSection): boolean {
    const name = section.name.toLowerCase();

    // Skip brand-focused sections
    const brandKeywords = ['brand', 'designer', 'about', 'contact', 'store locator'];
    if (brandKeywords.some(keyword => name.includes(keyword))) {
      return false;
    }

    // Prioritize category sections
    const categoryKeywords = [
      'men', 'women', 'unisex', 'clothing', 'shoes', 'accessories',
      'home', 'beauty', 'sale', 'new', 'featured', 'collection',
    ];

    return categoryKeywords.some(keyword => name.includes(keyword)) ||
           section.has_dropdown; // Sections with dropdowns likely have subcategories
  }

  private createBatches<T>(sections: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < sections.length; i += batchSize) {
      batches.push(sections.slice(i, i + batchSize));
    }
    return batches;
  }

  private async exploreBatch(
    baseUrl: string, 
    sectionBatch: NavigationSection[], 
    navigationIntelligence: NavigationIntelligence
  ): Promise<void> {
    const explorationPromises = sectionBatch.map(section =>
      this.exploreSection(baseUrl, section, navigationIntelligence),
    );

    try {
      const batchResults = await Promise.allSettled(explorationPromises);

      batchResults.forEach((result, index) => {
        const section = sectionBatch[index];
        if (result.status === 'fulfilled') {
          this.explorationResults.set(section.name, result.value);
          this.logger.info(`✅ Successfully explored section: ${section.name}`);
        } else {
          const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
          this.logger.warn(`❌ Failed to explore section ${section.name}:`, reason);
        }
      });
    } catch (error) {
      this.logger.error('Batch exploration failed:', error);
    }
  }

  private async exploreSection(
    baseUrl: string, 
    section: NavigationSection, 
    navigationIntelligence: NavigationIntelligence
  ): Promise<SectionIntelligence> {
    const startTime = Date.now();
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      browser = await chromium.launch({
        headless: process.env.HEADLESS_MODE !== 'false',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });

      this.browsers.push(browser);
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      });
      page = await context.newPage();

      // Enhanced error handling with retries
      this.logger.info(`🔍 Exploring section: ${section.name} (${section.url})`);

      let navigationSuccess = false;
      let retryCount = 0;
      const maxRetries = 2;

      while (!navigationSuccess && retryCount < maxRetries) {
        try {
          await page.goto(section.url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          await page.waitForTimeout(2000);
          navigationSuccess = true;
        } catch (navError) {
          retryCount++;
          const errorMessage = navError instanceof Error ? navError.message : String(navError);
          this.logger.warn(`Navigation attempt ${retryCount} failed for ${section.name}: ${errorMessage}`);

          if (retryCount < maxRetries) {
            await page.waitForTimeout(5000); // Wait before retry
          } else {
            throw new Error(`Failed to navigate to ${section.url} after ${maxRetries} attempts: ${errorMessage}`);
          }
        }
      }

      const sectionIntelligence: SectionIntelligence = {
        section_name: section.name,
        section_url: section.url,
        exploration_metadata: {
          start_time: startTime,
          retry_count: retryCount,
          navigation_success: navigationSuccess,
        },
        page_type: null,
        selectors: null,
        navigation_paths: null,
        product_discovery: null,
        url_patterns: null,
        interaction_elements: null,
        errors: [],
      };

      // Enhanced data extraction with individual error handling
      try {
        sectionIntelligence.page_type = await this.classifyPageType(page);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Page classification failed for ${section.name}:`, errorMessage);
        sectionIntelligence.errors.push({ step: 'page_classification', error: errorMessage });
        sectionIntelligence.page_type = 'unknown';
      }

      try {
        sectionIntelligence.selectors = await this.extractSelectors(page);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Selector extraction failed for ${section.name}:`, errorMessage);
        sectionIntelligence.errors.push({ step: 'selector_extraction', error: errorMessage });
        sectionIntelligence.selectors = {
          navigation: {},
          product: {},
          pricing: {},
          availability: {},
          variants: {},
          images: {},
          filters: {},
          pagination: {},
          _metadata: { 
            generation_strategy: 'intelligent',
            confidence_scores: {},
            fallback_count: 0,
            validation_results: {},
            extraction_failed: true 
          }
        };
      }

      try {
        sectionIntelligence.navigation_paths = await this.extractNavigationPaths(page);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Navigation path extraction failed for ${section.name}:`, errorMessage);
        sectionIntelligence.errors.push({ step: 'navigation_extraction', error: errorMessage });
        sectionIntelligence.navigation_paths = { 
          subcategories: [], 
          related_sections: [], 
          filter_options: [], 
          sorting_options: [] 
        };
      }

      try {
        sectionIntelligence.product_discovery = await this.discoverProducts(page);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Product discovery failed for ${section.name}:`, errorMessage);
        sectionIntelligence.errors.push({ step: 'product_discovery', error: errorMessage });
        sectionIntelligence.product_discovery = { total_found: 0, products: [], working_selector: null };
      }

      try {
        sectionIntelligence.url_patterns = await this.analyzeURLPatterns(page);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`URL pattern analysis failed for ${section.name}:`, errorMessage);
        sectionIntelligence.errors.push({ step: 'url_analysis', error: errorMessage });
        sectionIntelligence.url_patterns = { 
          current_url: section.url,
          url_structure: {
            protocol: '',
            hostname: '',
            pathname: '',
            segments: []
          },
          discovered_patterns: {
            product_urls: null,
            category_urls: null,
            collection_urls: null
          }
        };
      }

      try {
        sectionIntelligence.interaction_elements = await this.mapInteractionElements(page);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Interaction element mapping failed for ${section.name}:`, errorMessage);
        sectionIntelligence.errors.push({ step: 'interaction_mapping', error: errorMessage });
        sectionIntelligence.interaction_elements = { 
          buttons: [], 
          forms: [], 
          dropdowns: [], 
          toggles: [] 
        };
      }

      // Enhanced subcategory exploration with error handling
      if (section.has_dropdown || (sectionIntelligence.navigation_paths && sectionIntelligence.navigation_paths.subcategories.length > 0)) {
        try {
          sectionIntelligence.subcategory_exploration = await this.exploreSubcategories(
            page,
            sectionIntelligence.navigation_paths!.subcategories.slice(0, 3), // Limit for performance
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Subcategory exploration failed for ${section.name}:`, errorMessage);
          sectionIntelligence.errors.push({ step: 'subcategory_exploration', error: errorMessage });
          sectionIntelligence.subcategory_exploration = [];
        }
      }

      // Add completion metrics
      const endTime = Date.now();
      sectionIntelligence.exploration_metadata.end_time = endTime;
      sectionIntelligence.exploration_metadata.duration_ms = endTime - startTime;
      sectionIntelligence.exploration_metadata.success_rate = sectionIntelligence.errors.length === 0 ? 1.0 :
        Math.max(0, 1 - (sectionIntelligence.errors.length / 6)); // 6 main extraction steps

      this.logger.info(`✅ Section exploration completed: ${section.name} (${sectionIntelligence.exploration_metadata.duration_ms}ms, ${sectionIntelligence.errors.length} errors)`);

      return sectionIntelligence;

    } catch (error) {
      const endTime = Date.now();
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      this.logger.error(`❌ Critical section exploration failure for ${section.name}: ${errorMessage}`, {
        section: section.name,
        url: section.url,
        duration: endTime - startTime,
        error: errorMessage,
        stack: errorStack,
      });

      // Return partial intelligence even on critical failure
      return {
        section_name: section.name,
        section_url: section.url,
        exploration_metadata: {
          start_time: startTime,
          end_time: endTime,
          duration_ms: endTime - startTime,
          critical_failure: true,
          error: errorMessage,
        },
        page_type: 'unknown',
        selectors: {
          navigation: {},
          product: {},
          pricing: {},
          availability: {},
          variants: {},
          images: {},
          filters: {},
          pagination: {},
          _metadata: { 
            generation_strategy: 'intelligent',
            confidence_scores: {},
            fallback_count: 0,
            validation_results: {},
            critical_failure: true 
          }
        },
        navigation_paths: { 
          subcategories: [], 
          related_sections: [], 
          filter_options: [], 
          sorting_options: [] 
        },
        product_discovery: { total_found: 0, products: [], working_selector: null },
        url_patterns: { 
          current_url: section.url,
          url_structure: {
            protocol: '',
            hostname: '',
            pathname: '',
            segments: []
          },
          discovered_patterns: {
            product_urls: null,
            category_urls: null,
            collection_urls: null
          }
        },
        interaction_elements: { 
          buttons: [], 
          forms: [], 
          dropdowns: [], 
          toggles: [] 
        },
        errors: [{ step: 'critical_failure', error: errorMessage }],
      };
    } finally {
      // Enhanced cleanup with error handling
      try {
        if (page) {
          await page.close();
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to close page for ${section.name}:`, errorMessage);
      }

      try {
        if (context) {
          await context.close();
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to close context for ${section.name}:`, errorMessage);
      }

      try {
        if (browser) {
          await browser.close();
          this.browsers = this.browsers.filter(b => b !== browser);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to close browser for ${section.name}:`, errorMessage);
      }
    }
  }

  private async classifyPageType(page: Page): Promise<string> {
    return await page.evaluate(() => {
      const url = window.location.href;
      const bodyClasses = document.body.className.toLowerCase();

      if (url.includes('/product/') || bodyClasses.includes('product')) {
        return 'product_detail';
      }
      if (url.includes('/collection') || url.includes('/category') || bodyClasses.includes('collection')) {
        return 'product_listing';
      }
      if (bodyClasses.includes('home') || url === window.location.origin + '/') {
        return 'homepage';
      }
      if (url.includes('/search') || bodyClasses.includes('search')) {
        return 'search_results';
      }

      return 'category_page';
    });
  }

  private async extractSelectors(page: Page): Promise<Selectors> {
    // Inject our intelligent selector classes into the page context
    await page.addScriptTag({
      content: this.getIntelligentSelectorScript(),
    });

    return await page.evaluate(async () => {
      const selectors: Selectors = {
        navigation: {},
        product: {},
        pricing: {},
        availability: {},
        variants: {},
        images: {},
        filters: {},
        pagination: {},
        _metadata: {
          generation_strategy: 'intelligent',
          confidence_scores: {},
          fallback_count: 0,
          validation_results: {},
        },
      };

      // Initialize intelligent systems in page context
      const intelligentGenerator = new (window as any).IntelligentSelectorGenerator();
      const validator = new (window as any).SelectorValidator();
      const fallbackSystem = new (window as any).AdvancedFallbackSystem();

      // Navigation selectors with intelligent generation
      const navElements = {
        breadcrumb: document.querySelector('.breadcrumb, .breadcrumbs, [aria-label="breadcrumb"]'),
        sidebar: document.querySelector('.sidebar, .category-nav, .filters, .facets'),
        pagination: document.querySelector('.pagination, .pager, .page-numbers'),
      };

      for (const [key, element] of Object.entries(navElements)) {
        if (element) {
          const result = await generateIntelligentSelector(element, `navigation.${key}`, {
            intelligentGenerator,
            validator,
            fallbackSystem,
            document,
          });
          selectors.navigation[key] = result.selector;
          selectors._metadata.confidence_scores[`navigation.${key}`] = result.confidence;
        }
      }

      // Product-related selectors with enhanced intelligence
      const productElements = document.querySelectorAll(
        '.product, .product-item, .product-card, .grid__item, .card-wrapper',
      );

      if (productElements.length > 0) {
        const firstProduct = productElements[0];

        // Extract product component selectors with context awareness
        const componentMap = {
          title: {
            element: firstProduct.querySelector('h1, h2, h3, .product-title, .card__heading, a'),
            context: 'product.title',
          },
          price: {
            element: firstProduct.querySelector('.price, .money, .product-price, .cost'),
            context: 'pricing.price',
          },
          image: {
            element: firstProduct.querySelector('img'),
            context: 'images.product',
          },
          link: {
            element: firstProduct.querySelector('a') || firstProduct.closest('a'),
            context: 'product.link',
          },
          container: {
            element: firstProduct,
            context: 'product.container',
          },
        };

        for (const [componentKey, { element, context }] of Object.entries(componentMap)) {
          if (element) {
            const result = await generateIntelligentSelector(element, context, {
              intelligentGenerator,
              validator,
              fallbackSystem,
              document,
            });

            const [category, subKey] = context.split('.');
            if (!selectors[category as keyof Selectors]) {
              (selectors as any)[category] = {};
            }
            (selectors as any)[category][subKey] = result.selector;
            selectors._metadata.confidence_scores[context] = result.confidence;
          }
        }
      }

      // Enhanced filter selectors with classification
      const filterElements = document.querySelectorAll(
        '.filter, .facet, [data-filter], .filter-option, select',
      );

      for (let i = 0; i < Math.min(filterElements.length, 5); i++) {
        const filter = filterElements[i];
        const filterType = classifyFilter(filter);
        const context = `filters.${filterType}`;

        const result = await generateIntelligentSelector(filter, context, {
          intelligentGenerator,
          validator,
          fallbackSystem,
          document,
        });

        if (!selectors.filters[filterType]) {
          selectors.filters[filterType] = [];
        }
        (selectors.filters[filterType] as any[]).push(result.selector);
        selectors._metadata.confidence_scores[`${context}.${i}`] = result.confidence;
      }

      // Availability indicators
      const availabilityEl = document.querySelector(
        '.in-stock, .out-of-stock, .availability, .stock-status',
      );
      if (availabilityEl) {
        const result = await generateIntelligentSelector(availabilityEl, 'availability.status', {
          intelligentGenerator,
          validator,
          fallbackSystem,
          document,
        });
        selectors.availability.status = result.selector;
        selectors._metadata.confidence_scores['availability.status'] = result.confidence;
      }

      // Variant selectors (for product pages)
      const variantSelects = document.querySelectorAll('select[name*="variant"], select.variant');
      if (variantSelects.length > 0) {
        const result = await generateIntelligentSelector(variantSelects[0], 'variants.dropdown', {
          intelligentGenerator,
          validator,
          fallbackSystem,
          document,
        });
        selectors.variants.dropdown = result.selector;
        selectors._metadata.confidence_scores['variants.dropdown'] = result.confidence;
      }

      // Helper function for intelligent selector generation
      async function generateIntelligentSelector(element: Element, context: string, systems: any): Promise<any> {
        try {
          // 1. Generate optimal selector
          const generationResult = systems.intelligentGenerator.generateOptimalSelector(element, { context });

          // 2. Validate the selector
          const validationResult = await systems.validator.validateSelector(
            generationResult.selector,
            systems.document,
            context,
            { requireUnique: false },
          );

          // 3. If validation fails, try fallbacks
          if (!validationResult.isValid || validationResult.confidence < 0.6) {
            const fallbacks = await systems.fallbackSystem.generateFallbackSelectors(
              element,
              generationResult.selector,
              context,
              systems.document,
              { maxFallbacks: 3 },
            );

            // Find best fallback
            for (const fallback of fallbacks) {
              const fallbackValidation = await systems.validator.validateSelector(
                fallback.selector,
                systems.document,
                context,
              );

              if (fallbackValidation.isValid && fallbackValidation.confidence > 0.5) {
                return {
                  selector: fallback.selector,
                  confidence: fallbackValidation.confidence,
                  strategy: fallback.strategy,
                  isFallback: true,
                };
              }
            }
          }

          return {
            selector: generationResult.selector,
            confidence: Math.min(generationResult.confidence, validationResult.confidence),
            strategy: generationResult.strategy,
            isFallback: false,
          };

        } catch (error) {
          console.warn('Intelligent selector generation failed:', error);
          // Fallback to basic generation
          return generateBasicFallback(element);
        }
      }

      // Basic fallback for error cases
      function generateBasicFallback(element: Element | null): any {
        if (!element) {
          return { selector: null, confidence: 0, strategy: 'basic-fallback' };
        }

        if ((element as HTMLElement).id) {
          return { selector: `#${(element as HTMLElement).id}`, confidence: 0.8, strategy: 'basic-id' };
        }

        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {
            return { selector: `.${classes[0]}`, confidence: 0.4, strategy: 'basic-class' };
          }
        }

        return { selector: element.tagName.toLowerCase(), confidence: 0.2, strategy: 'basic-tag' };
      }

      function classifyFilter(filter: Element): string {
        const text = filter.textContent?.toLowerCase() || '';
        const name = (filter as HTMLInputElement).name?.toLowerCase() || '';
        const className = element.className.toLowerCase();

        if (text.includes('price') || name.includes('price') || className.includes('price')) {
          return 'price';
        }
        if (text.includes('color') || name.includes('color') || className.includes('color')) {
          return 'color';
        }
        if (text.includes('size') || name.includes('size') || className.includes('size')) {
          return 'size';
        }
        if (text.includes('brand') || name.includes('brand') || className.includes('brand')) {
          return 'brand';
        }
        if (text.includes('category') || name.includes('category') || className.includes('category')) {
          return 'category';
        }

        return 'general';
      }

      return selectors;
    });
  }

  private async extractNavigationPaths(page: Page): Promise<NavigationPaths> {
    return await page.evaluate(() => {
      const paths: NavigationPaths = {
        subcategories: [],
        related_sections: [],
        filter_options: [],
        sorting_options: [],
      };

      // Find subcategory links
      const subcategorySelectors = [
        '.category-list a',
        '.subcategory a',
        '.nav-category a',
        '.sidebar a',
      ];

      subcategorySelectors.forEach(selector => {
        const links = document.querySelectorAll(selector);
        links.forEach(link => {
          if (link.textContent?.trim() && (link as HTMLAnchorElement).href) {
            paths.subcategories.push({
              name: link.textContent.trim(),
              url: (link as HTMLAnchorElement).href,
              selector: generateBasicSelector(link),
            });
          }
        });
      });

      // Find filter options
      const filters = document.querySelectorAll('.filter-option, .facet-option, [data-filter-value]');
      filters.forEach(filter => {
        if (filter.textContent?.trim()) {
          paths.filter_options.push({
            name: filter.textContent.trim(),
            value: filter.getAttribute('data-filter-value') || (filter as HTMLInputElement).value,
            url: '',
            selector: generateBasicSelector(filter),
          });
        }
      });

      // Find sorting options
      const sortSelect = document.querySelector('select[name*="sort"], .sort-select') as HTMLSelectElement;
      if (sortSelect) {
        const options = sortSelect.querySelectorAll('option');
        options.forEach(option => {
          if ((option as HTMLOptionElement).value && option.textContent?.trim()) {
            paths.sorting_options.push({
              name: option.textContent.trim(),
              value: (option as HTMLOptionElement).value,
              url: '',
              selector: generateBasicSelector(sortSelect),
            });
          }
        });
      }

      // Helper function for this context
      function generateBasicSelector(element: Element | null): string {
        if (!element) {
          return '';
        }
        if ((element as HTMLElement).id) {
          return `#${(element as HTMLElement).id}`;
        }
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {
            return `.${classes[0]}`;
          }
        }
        return element.tagName.toLowerCase();
      }

      return paths;
    });
  }

  private async discoverProducts(page: Page): Promise<ProductDiscovery> {
    return await page.evaluate(() => {
      const productSelectors = [
        '.product', '.product-item', '.product-card', '.grid__item',
        '.card-wrapper', '.collection-product-card', '[data-product-id]',
      ];

      const products: Product[] = [];

      // Helper function for generating selectors in page context
      function generateBasicSelector(element: Element | null): string {
        if (!element) {
          return '';
        }
        if ((element as HTMLElement).id) {
          return `#${(element as HTMLElement).id}`;
        }
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {
            return `.${classes[0]}`;
          }
        }
        return element.tagName.toLowerCase();
      }

      for (const selector of productSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach((element, index) => {
            if (index >= 12) {
              return;
            } // Limit products per page

            const titleEl = element.querySelector('h1, h2, h3, .product-title, .card__heading, a');
            const priceEl = element.querySelector('.price, .money, .product-price');
            const linkEl = element.querySelector('a') || element.closest('a');
            const imageEl = element.querySelector('img') as HTMLImageElement;

            if (titleEl && linkEl) {
              products.push({
                title: titleEl.textContent?.trim() || '',
                price: priceEl ? priceEl.textContent?.trim() || null : null,
                url: (linkEl as HTMLAnchorElement).href,
                image: imageEl ? imageEl.src : null,
                container_selector: generateBasicSelector(element),
              });
            }
          });
          break; // Found products with this selector
        }
      }

      return {
        total_found: products.length,
        products: products,
        working_selector: products.length > 0 ?
          productSelectors.find(sel => document.querySelectorAll(sel).length > 0) || null : null,
      };
    });
  }

  private async analyzeURLPatterns(page: Page): Promise<URLPattern> {
    return await page.evaluate(() => {
      const currentUrl = window.location.href;
      const baseUrl = window.location.origin;

      // Helper functions for this context
      function analyzeURLStructure(url: string) {
        const urlObj = new URL(url);
        return {
          protocol: urlObj.protocol,
          hostname: urlObj.hostname,
          pathname: urlObj.pathname,
          segments: urlObj.pathname.split('/').filter(s => s),
        };
      }

      function extractURLPattern(url: string, type: string): string | null {
        if (url.includes(`/${type}/`) || url.includes(`/${type}s/`)) {
          return url.replace(/\/[^\/]+$/, `/{${type}_handle}`);
        }
        return null;
      }

      return {
        current_url: currentUrl,
        url_structure: analyzeURLStructure(currentUrl),
        discovered_patterns: {
          product_urls: extractURLPattern(currentUrl, 'product'),
          category_urls: extractURLPattern(currentUrl, 'category'),
          collection_urls: extractURLPattern(currentUrl, 'collection'),
        },
      };
    });
  }

  private async mapInteractionElements(page: Page): Promise<InteractionElements> {
    return await page.evaluate(() => {
      const interactions: InteractionElements = {
        buttons: [],
        forms: [],
        dropdowns: [],
        toggles: [],
      };

      // Helper function for generating selectors in this context
      function generateBasicSelectorForElement(element: Element | null): string {
        if (!element) {
          return '';
        }
        if ((element as HTMLElement).id) {
          return `#${(element as HTMLElement).id}`;
        }
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {
            return `.${classes[0]}`;
          }
        }
        return element.tagName.toLowerCase();
      }

      // Helper function to classify button purpose
      function classifyButtonPurpose(button: Element): string {
        const text = button.textContent?.toLowerCase() || '';
        if (text.includes('cart') || text.includes('add to bag')) {
          return 'add_to_cart';
        }
        if (text.includes('buy') || text.includes('purchase')) {
          return 'purchase';
        }
        if (text.includes('search')) {
          return 'search';
        }
        if (text.includes('filter')) {
          return 'filter';
        }
        return 'general';
      }

      // Map buttons
      const buttons = document.querySelectorAll('button, .btn, [role="button"]');
      buttons.forEach((button, index) => {
        if (index < 10 && button.textContent?.trim()) {
          interactions.buttons.push({
            text: button.textContent.trim(),
            selector: generateBasicSelectorForElement(button),
            purpose: classifyButtonPurpose(button),
          });
        }
      });

      // Map forms
      const forms = document.querySelectorAll('form');
      forms.forEach((form, index) => {
        if (index < 3) {
          const formElement = form as HTMLFormElement;
          interactions.forms.push({
            action: formElement.action,
            method: formElement.method,
            selector: generateBasicSelectorForElement(form),
            inputs: Array.from(form.querySelectorAll('input, select, textarea')).map(input => ({
              name: (input as HTMLInputElement).name || '',
              type: (input as HTMLInputElement).type || '',
              selector: generateBasicSelectorForElement(input),
            })),
          });
        }
      });

      return interactions;
    });
  }

  private async exploreSubcategories(page: Page, subcategories: NavigationPath[]): Promise<SubcategoryExploration[]> {
    const results: SubcategoryExploration[] = [];

    for (const subcategory of subcategories) {
      try {
        await page.goto(subcategory.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1500);

        const subcategoryData: SubcategoryExploration = {
          name: subcategory.name,
          url: subcategory.url,
          products: await this.discoverProducts(page),
          selectors: await this.extractSelectors(page),
        };

        results.push(subcategoryData);
        this.logger.info(`📁 Explored subcategory: ${subcategory.name} (${subcategoryData.products.total_found} products)`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to explore subcategory ${subcategory.name}:`, errorMessage);
      }
    }

    return results;
  }

  private async compileExplorationResults(domain: string): Promise<CompiledResults> {
    const results = Array.from(this.explorationResults.values());

    const compiled: CompiledResults = {
      domain,
      sections_explored: results.length,
      selectors: this.aggregateSelectors(results),
      urlPatterns: this.aggregateURLPatterns(results),
      navigation_intelligence: this.aggregateNavigationIntelligence(results),
      exploration_summary: {
        total_products_found: results.reduce((sum, r) => sum + (r.product_discovery?.total_found || 0), 0),
        working_selectors: this.identifyWorkingSelectors(results),
        page_types_discovered: [...new Set(results.map(r => r.page_type))].filter(Boolean),
      },
    };

    this.logger.info(`✅ Compiled exploration results for ${domain}: ${compiled.sections_explored} sections, ${compiled.exploration_summary.total_products_found} products`);

    return compiled;
  }

  private aggregateSelectors(results: SectionIntelligence[]): AggregatedSelectors {
    const aggregated: AggregatedSelectors = {
      navigation: {},
      product: {},
      pricing: {},
      availability: {},
      variants: {},
      images: {},
      filters: {},
      pagination: {},
      reliability_scores: {},
      success_rate: 0,
    };

    let totalSuccessfulExtractions = 0;
    let totalAttempts = 0;

    results.forEach(result => {
      if (result.selectors) {
        Object.entries(result.selectors).forEach(([category, selectors]) => {
          if (category === '_metadata') return;
          if (!aggregated[category as keyof AggregatedSelectors]) {
            (aggregated as any)[category] = {};
          }

          if (selectors && typeof selectors === 'object') {
            Object.entries(selectors).forEach(([key, selector]) => {
              if (selector) {
                if (!(aggregated as any)[category][key]) {
                  (aggregated as any)[category][key] = [];
                }
                if (Array.isArray(selector)) {
                  (aggregated as any)[category][key].push(...selector);
                } else {
                  (aggregated as any)[category][key].push(selector);
                }
                totalSuccessfulExtractions++;
              }
              totalAttempts++;
            });
          }
        });
      }
    });

    // Calculate success rate
    aggregated.success_rate = totalAttempts > 0 ? totalSuccessfulExtractions / totalAttempts : 0;

    // Deduplicate selectors and calculate reliability scores
    Object.entries(aggregated).forEach(([category, selectors]) => {
      if (typeof selectors === 'object' && selectors !== null && category !== 'reliability_scores' && category !== 'success_rate') {
        Object.entries(selectors).forEach(([key, selectorArray]) => {
          if (Array.isArray(selectorArray)) {
            // Deduplicate and count occurrences
            const selectorCounts: Record<string, number> = {};
            selectorArray.forEach((sel: any) => {
              if (typeof sel === 'string') {
                selectorCounts[sel] = (selectorCounts[sel] || 0) + 1;
              }
            });

            // Keep most common selector and calculate reliability
            const bestSelector = Object.entries(selectorCounts)
              .sort(([,a], [,b]) => b - a)[0];

            if (bestSelector) {
              (aggregated as any)[category][key] = bestSelector[0];
              aggregated.reliability_scores[`${category}.${key}`] = bestSelector[1] / results.length;
            }
          }
        });
      }
    });

    return aggregated;
  }

  private aggregateURLPatterns(results: SectionIntelligence[]): AggregatedURLPatterns {
    const patterns: AggregatedURLPatterns = {
      product_url: null,
      category_url: null,
      collection_url: null,
      examples: {},
    };

    results.forEach(result => {
      if (result.url_patterns?.discovered_patterns) {
        Object.entries(result.url_patterns.discovered_patterns).forEach(([type, pattern]) => {
          if (pattern && !(patterns as any)[type]) {
            (patterns as any)[type] = pattern;
          }
        });
      }

      if (result.section_url) {
        if (!patterns.examples.category_urls) {
          patterns.examples.category_urls = [];
        }
        patterns.examples.category_urls.push(result.section_url);
      }
    });

    return patterns;
  }

  private aggregateNavigationIntelligence(results: SectionIntelligence[]): NavigationIntelligenceSummary {
    return {
      total_sections: results.length,
      subcategories_found: results.reduce((sum, r) => sum + (r.navigation_paths?.subcategories?.length || 0), 0),
      filter_options_found: results.reduce((sum, r) => sum + (r.navigation_paths?.filter_options?.length || 0), 0),
      interaction_elements: results.reduce((sum, r) => sum + (r.interaction_elements?.buttons?.length || 0), 0),
    };
  }

  private identifyWorkingSelectors(results: SectionIntelligence[]): Array<{ selector: string; success_count: number }> {
    const working: Record<string, number> = {};

    results.forEach(result => {
      if (result.product_discovery?.working_selector) {
        const selector = result.product_discovery.working_selector;
        working[selector] = (working[selector] || 0) + 1;
      }
    });

    return Object.entries(working)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([selector, count]) => ({ selector, success_count: count }));
  }

  /**
   * Get the intelligent selector script to inject into page context
   * @returns {string} JavaScript code for intelligent selector generation
   */
  private getIntelligentSelectorScript(): string {
    // This is a simplified version - in production, you'd want to bundle the actual classes
    return `
      // Simplified IntelligentSelectorGenerator for page context
      class IntelligentSelectorGenerator {
        generateOptimalSelector(element, options = {}) {
          if (!element) return { selector: null, confidence: 0, strategy: 'none' };
          
          // Data attributes (highest priority)
          const dataAttrs = ['data-testid', 'data-test', 'data-cy', 'data-id', 'data-product-id'];
          for (const attr of dataAttrs) {
            const value = element.getAttribute(attr);
            if (value) {
              return {
                selector: \`[\${attr}="\${value}"]\`,
                confidence: 0.95,
                strategy: 'data-attribute'
              };
            }
          }
          
          // Semantic class analysis
          if (element.className) {
            const classes = element.className.split(' ').filter(c => c.trim());
            const semanticClasses = classes.filter(cls => this.isSemanticClass(cls));
            if (semanticClasses.length > 0) {
              const selector = '.' + semanticClasses.slice(0, 2).join('.');
              return {
                selector,
                confidence: 0.8,
                strategy: 'semantic-class'
              };
            }
            
            // Use first class as fallback
            if (classes.length > 0) {
              return {
                selector: \`.\${classes[0]}\`,
                confidence: 0.5,
                strategy: 'first-class'
              };
            }
          }
          
          // ID selector
          if (element.id) {
            return {
              selector: \`#\${element.id}\`,
              confidence: 0.9,
              strategy: 'id'
            };
          }
          
          // Tag name fallback
          return {
            selector: element.tagName.toLowerCase(),
            confidence: 0.2,
            strategy: 'tag'
          };
        }
        
        isSemanticClass(className) {
          const semanticKeywords = [
            'product', 'title', 'price', 'image', 'button', 'link', 'card', 'item',
            'container', 'wrapper', 'content', 'header', 'footer', 'nav'
          ];
          return semanticKeywords.some(keyword => 
            className.toLowerCase().includes(keyword.toLowerCase())
          );
        }
      }
      
      // Simplified SelectorValidator for page context
      class SelectorValidator {
        async validateSelector(selector, document, context, options = {}) {
          if (!selector) return { isValid: false, confidence: 0 };
          
          try {
            const elements = document.querySelectorAll(selector);
            if (elements.length === 0) {
              return { isValid: false, confidence: 0, reason: 'No elements found' };
            }
            
            // Check visibility
            let visibleCount = 0;
            elements.forEach(el => {
              const rect = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              if (rect.width > 0 && rect.height > 0 && style.display !== 'none') {
                visibleCount++;
              }
            });
            
            const confidence = elements.length === 1 ? 0.9 : 
                              elements.length <= 5 ? 0.7 : 0.5;
            
            return {
              isValid: visibleCount > 0,
              confidence: confidence * (visibleCount / elements.length),
              elementCount: elements.length,
              visibleCount
            };
          } catch (error) {
            return { isValid: false, confidence: 0, reason: error.message };
          }
        }
      }
      
      // Simplified AdvancedFallbackSystem for page context
      class AdvancedFallbackSystem {
        async generateFallbackSelectors(element, failedSelector, context, document, options = {}) {
          const fallbacks = [];
          
          if (!element) return fallbacks;
          
          // Sibling-based fallbacks
          if (element.parentElement) {
            const siblings = Array.from(element.parentElement.children);
            const index = siblings.indexOf(element);
            if (index >= 0) {
              fallbacks.push({
                selector: \`\${element.tagName.toLowerCase()}:nth-child(\${index + 1})\`,
                confidence: 0.4,
                strategy: 'positional'
              });
            }
          }
          
          // Content-based fallbacks for short text
          const text = element.textContent?.trim();
          if (text && text.length < 30 && text.length > 2) {
            const escapedText = text.replace(/"/g, '\\"');
            fallbacks.push({
              selector: \`*:contains("\${escapedText}")\`,
              confidence: 0.6,
              strategy: 'content-based'
            });
          }
          
          // Parent-child relationship fallbacks
          if (element.parentElement) {
            const parentClasses = element.parentElement.className.split(' ').filter(c => c.trim());
            if (parentClasses.length > 0) {
              fallbacks.push({
                selector: \`.\${parentClasses[0]} \${element.tagName.toLowerCase()}\`,
                confidence: 0.5,
                strategy: 'parent-child'
              });
            }
          }
          
          return fallbacks.slice(0, options.maxFallbacks || 3);
        }
      }
      
      // Make classes available globally
      window.IntelligentSelectorGenerator = IntelligentSelectorGenerator;
      window.SelectorValidator = SelectorValidator;
      window.AdvancedFallbackSystem = AdvancedFallbackSystem;
    `;
  }

  async cleanup(): Promise<void> {
    // Close any remaining browsers
    for (const browser of this.browsers) {
      try {
        await browser.close();
      } catch (error) {
        this.logger.warn('Error closing browser:', error);
      }
    }
    this.browsers = [];
    this.logger.info('Concurrent Explorer cleanup completed');
  }
}

export default ConcurrentExplorer;