const { chromium } = require('playwright');
const IntelligentSelectorGenerator = require('./IntelligentSelectorGenerator');
const SelectorValidator = require('./SelectorValidator');
const AdvancedFallbackSystem = require('./AdvancedFallbackSystem');

class ConcurrentExplorer {
  constructor(logger, worldModel) {
    this.logger = logger;
    this.worldModel = worldModel;
    this.browsers = [];
    this.explorationResults = new Map();

    // Initialize intelligent selector system
    this.selectorGenerator = new IntelligentSelectorGenerator(logger);
    this.selectorValidator = new SelectorValidator(logger);
    this.fallbackSystem = new AdvancedFallbackSystem(logger);
  }

  async initialize() {
    this.logger.info('Concurrent Explorer initialized');
  }

  async exploreAllSections(baseUrl, navigationIntelligence, options = {}) {
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

  shouldExploreSection(section) {
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

  createBatches(sections, batchSize) {
    const batches = [];
    for (let i = 0; i < sections.length; i += batchSize) {
      batches.push(sections.slice(i, i + batchSize));
    }
    return batches;
  }

  async exploreBatch(baseUrl, sectionBatch, navigationIntelligence) {
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
          this.logger.warn(`❌ Failed to explore section ${section.name}:`, result.reason?.message);
        }
      });
    } catch (error) {
      this.logger.error('Batch exploration failed:', error);
    }
  }

  async exploreSection(baseUrl, section, navigationIntelligence) {
    const startTime = Date.now();
    let browser = null;
    let context = null;
    let page = null;

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
          
          // Close any popups that might have appeared
          await this.closeAnyPopups(page);
          
          navigationSuccess = true;
        } catch (navError) {
          retryCount++;
          this.logger.warn(`Navigation attempt ${retryCount} failed for ${section.name}: ${navError.message}`);

          if (retryCount < maxRetries) {
            await page.waitForTimeout(5000); // Wait before retry
          } else {
            throw new Error(`Failed to navigate to ${section.url} after ${maxRetries} attempts: ${navError.message}`);
          }
        }
      }

      const sectionIntelligence = {
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
        this.logger.warn(`Page classification failed for ${section.name}:`, error.message);
        sectionIntelligence.errors.push({ step: 'page_classification', error: error.message });
        sectionIntelligence.page_type = 'unknown';
      }

      try {
        sectionIntelligence.selectors = await this.extractSelectors(page);
      } catch (error) {
        this.logger.warn(`Selector extraction failed for ${section.name}:`, error.message);
        sectionIntelligence.errors.push({ step: 'selector_extraction', error: error.message });
        sectionIntelligence.selectors = { _metadata: { extraction_failed: true } };
      }

      try {
        sectionIntelligence.navigation_paths = await this.extractNavigationPaths(page);
      } catch (error) {
        this.logger.warn(`Navigation path extraction failed for ${section.name}:`, error.message);
        sectionIntelligence.errors.push({ step: 'navigation_extraction', error: error.message });
        sectionIntelligence.navigation_paths = { subcategories: [] };
      }

      try {
        sectionIntelligence.product_discovery = await this.discoverProducts(page);
      } catch (error) {
        this.logger.warn(`Product discovery failed for ${section.name}:`, error.message);
        sectionIntelligence.errors.push({ step: 'product_discovery', error: error.message });
        sectionIntelligence.product_discovery = { total_found: 0, products: [] };
      }

      try {
        sectionIntelligence.url_patterns = await this.analyzeURLPatterns(page);
      } catch (error) {
        this.logger.warn(`URL pattern analysis failed for ${section.name}:`, error.message);
        sectionIntelligence.errors.push({ step: 'url_analysis', error: error.message });
        sectionIntelligence.url_patterns = { current_url: section.url };
      }

      try {
        sectionIntelligence.interaction_elements = await this.mapInteractionElements(page);
      } catch (error) {
        this.logger.warn(`Interaction element mapping failed for ${section.name}:`, error.message);
        sectionIntelligence.errors.push({ step: 'interaction_mapping', error: error.message });
        sectionIntelligence.interaction_elements = { buttons: [], forms: [] };
      }

      // Enhanced subcategory exploration with error handling
      if (section.has_dropdown || (sectionIntelligence.navigation_paths && sectionIntelligence.navigation_paths.subcategories.length > 0)) {
        try {
          sectionIntelligence.subcategory_exploration = await this.exploreSubcategories(
            page,
            sectionIntelligence.navigation_paths.subcategories.slice(0, 3), // Limit for performance
          );
        } catch (error) {
          this.logger.warn(`Subcategory exploration failed for ${section.name}:`, error.message);
          sectionIntelligence.errors.push({ step: 'subcategory_exploration', error: error.message });
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
      this.logger.error(`❌ Critical section exploration failure for ${section.name}: ${error.message}`, {
        section: section.name,
        url: section.url,
        duration: endTime - startTime,
        error: error.message,
        stack: error.stack,
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
          error: error.message,
        },
        page_type: 'unknown',
        selectors: { _metadata: { critical_failure: true } },
        navigation_paths: { subcategories: [] },
        product_discovery: { total_found: 0, products: [] },
        url_patterns: { current_url: section.url },
        interaction_elements: { buttons: [], forms: [] },
        errors: [{ step: 'critical_failure', error: error.message }],
      };
    } finally {
      // Enhanced cleanup with error handling
      try {
        if (page) {await page.close();}
      } catch (error) {
        this.logger.warn(`Failed to close page for ${section.name}:`, error.message);
      }

      try {
        if (context) {await context.close();}
      } catch (error) {
        this.logger.warn(`Failed to close context for ${section.name}:`, error.message);
      }

      try {
        if (browser) {
          await browser.close();
          this.browsers = this.browsers.filter(b => b !== browser);
        }
      } catch (error) {
        this.logger.warn(`Failed to close browser for ${section.name}:`, error.message);
      }
    }
  }

  async classifyPageType(page) {
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

  async extractSelectors(page) {
    // Inject our intelligent selector classes into the page context
    await page.addScriptTag({
      content: `
        ${this.getIntelligentSelectorScript()}
      `,
    });

    return await page.evaluate(async () => {
      const selectors = {
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
      const intelligentGenerator = new window.IntelligentSelectorGenerator();
      const validator = new window.SelectorValidator();
      const fallbackSystem = new window.AdvancedFallbackSystem();

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
            if (!selectors[category]) {selectors[category] = {};}
            selectors[category][subKey] = result.selector;
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
        selectors.filters[filterType].push(result.selector);
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
      async function generateIntelligentSelector(element, context, { intelligentGenerator, validator, fallbackSystem, document }) {
        try {
          // 1. Generate optimal selector
          const generationResult = intelligentGenerator.generateOptimalSelector(element, { context });

          // 2. Validate the selector
          const validationResult = await validator.validateSelector(
            generationResult.selector,
            document,
            context,
            { requireUnique: false },
          );

          // 3. If validation fails, try fallbacks
          if (!validationResult.isValid || validationResult.confidence < 0.6) {
            const fallbacks = await fallbackSystem.generateFallbackSelectors(
              element,
              generationResult.selector,
              context,
              document,
              { maxFallbacks: 3 },
            );

            // Find best fallback
            for (const fallback of fallbacks) {
              const fallbackValidation = await validator.validateSelector(
                fallback.selector,
                document,
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
      function generateBasicFallback(element) {
        if (!element) {return { selector: null, confidence: 0, strategy: 'basic-fallback' };}

        if (element.id) {
          return { selector: `#${element.id}`, confidence: 0.8, strategy: 'basic-id' };
        }

        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {
            return { selector: `.${classes[0]}`, confidence: 0.4, strategy: 'basic-class' };
          }
        }

        return { selector: element.tagName.toLowerCase(), confidence: 0.2, strategy: 'basic-tag' };
      }

      function classifyFilter(filter) {
        const text = filter.textContent.toLowerCase();
        const name = filter.name?.toLowerCase() || '';
        const className = filter.className.toLowerCase();

        if (text.includes('price') || name.includes('price') || className.includes('price')) {return 'price';}
        if (text.includes('color') || name.includes('color') || className.includes('color')) {return 'color';}
        if (text.includes('size') || name.includes('size') || className.includes('size')) {return 'size';}
        if (text.includes('brand') || name.includes('brand') || className.includes('brand')) {return 'brand';}
        if (text.includes('category') || name.includes('category') || className.includes('category')) {return 'category';}

        return 'general';
      }

      return selectors;
    });
  }

  async extractNavigationPaths(page) {
    return await page.evaluate(() => {
      const paths = {
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
          if (link.textContent.trim() && link.href) {
            paths.subcategories.push({
              name: link.textContent.trim(),
              url: link.href,
              selector: generateBasicSelector(link),
            });
          }
        });
      });

      // Find filter options
      const filters = document.querySelectorAll('.filter-option, .facet-option, [data-filter-value]');
      filters.forEach(filter => {
        if (filter.textContent.trim()) {
          paths.filter_options.push({
            name: filter.textContent.trim(),
            value: filter.getAttribute('data-filter-value') || filter.value,
            selector: generateBasicSelector(filter),
          });
        }
      });

      // Find sorting options
      const sortSelect = document.querySelector('select[name*="sort"], .sort-select');
      if (sortSelect) {
        const options = sortSelect.querySelectorAll('option');
        options.forEach(option => {
          if (option.value && option.textContent.trim()) {
            paths.sorting_options.push({
              name: option.textContent.trim(),
              value: option.value,
              selector: generateBasicSelector(sortSelect),
            });
          }
        });
      }

      // Helper function for this context
      function generateBasicSelector(element) {
        if (!element) {return null;}
        if (element.id) {return `#${element.id}`;}
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {return `.${classes[0]}`;}
        }
        return element.tagName.toLowerCase();
      }

      return paths;
    });
  }

  async closeAnyPopups(page) {
    try {
      const modalCloseSelectors = [
        'button[aria-label*="close"]:visible',
        'button[aria-label*="Close"]:visible',
        '[class*="modal"] button[class*="close"]:visible',
        '[class*="popup"] button[class*="close"]:visible',
        'button:has-text("No Thanks"):visible',
        'button[class*="decline"]:visible',
        '[role="dialog"] button[aria-label*="close"]:visible'
      ];
      
      for (const selector of modalCloseSelectors) {
        try {
          const closeButton = await page.locator(selector).first();
          if (await closeButton.isVisible({ timeout: 500 })) {
            await closeButton.click();
            await page.waitForTimeout(300);
            this.logger.info('Closed popup/modal');
            return true;
          }
        } catch (e) {
          // Try next selector
        }
      }
    } catch (e) {
      // No modal to close
    }
    return false;
  }

  async loadAllProducts(page) {
    this.logger.info('Loading all products on page...');
    
    // Handle Load More buttons
    let loadMoreClicked = 0;
    while (loadMoreClicked < 10) {
      const loadMoreButton = await page.locator([
        'button:has-text("Load More")',
        'button:has-text("Show More")',
        'button:has-text("View More")',
        '[class*="load-more"]',
        '[class*="show-more"]'
      ].join(', ')).first();
      
      if (await loadMoreButton.isVisible({ timeout: 1000 })) {
        await loadMoreButton.click();
        loadMoreClicked++;
        this.logger.info(`Clicked Load More button (${loadMoreClicked}x)`);
        await page.waitForTimeout(2000);
      } else {
        break;
      }
    }
    
    // Scroll to load lazy content
    let previousCount = 0;
    let scrollAttempts = 0;
    
    while (scrollAttempts < 10) {
      const currentCount = await page.evaluate(() => {
        return document.querySelectorAll('[class*="product"]').length;
      });
      
      if (currentCount === previousCount && scrollAttempts > 2) {
        break;
      }
      
      previousCount = currentCount;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      scrollAttempts++;
    }
    
    this.logger.info(`Loaded ${previousCount} products after scrolling`);
  }

  async discoverProducts(page) {
    // First, close any popups and load all products
    await this.closeAnyPopups(page);
    await this.loadAllProducts(page);
    
    return await page.evaluate(() => {
      // Comprehensive product selectors to find product containers
      const productSelectors = [
        '.product', '.product-item', '.product-card', '.grid__item',
        '.card-wrapper', '.collection-product-card', '[data-product-id]',
        '.item', '.product-tile', '.product-wrap', '.product-block',
        'article.product', 'div[data-testid*="product"]', '.plp-item',
        '.productListing', '.product-list-item', '.category-product'
      ];

      const uniqueProducts = new Map(); // Map of product ID to URL
      let workingSelector = null;

      // Try each selector to find product containers
      for (const selector of productSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          workingSelector = selector;
          
          elements.forEach((element) => {
            // Find ALL links within the product container
            const links = element.querySelectorAll('a[href]');
            
            links.forEach(link => {
              const href = link.href;
              // Filter for likely product URLs (not category/filter links)
              if (href && 
                  !href.includes('#') && 
                  !href.includes('javascript:') &&
                  (href.includes('/product') || 
                   href.includes('/p/') || 
                   href.includes('/pd/') ||
                   href.includes('/item/') ||
                   href.includes('.html') ||
                   href.includes('?pid=') ||
                   href.includes('?id='))) {
                
                // Extract product ID to ensure uniqueness (no variants)
                let productId = null;
                const pidMatch = href.match(/pid=(\d+)/);
                const idMatch = href.match(/id=(\d+)/);
                const pathMatch = href.match(/\/p\/([\w-]+)/);
                
                if (pidMatch) productId = pidMatch[1];
                else if (idMatch) productId = idMatch[1];
                else if (pathMatch) productId = pathMatch[1];
                else productId = href; // Use full URL as ID if no pattern matches
                
                // Store only if we haven't seen this product ID
                if (!uniqueProducts.has(productId)) {
                  uniqueProducts.set(productId, href);
                }
              }
            });

            // Also check if the container itself is a link
            const containerLink = element.closest('a');
            if (containerLink && containerLink.href) {
              const href = containerLink.href;
              // Same uniqueness logic
              let productId = null;
              const pidMatch = href.match(/pid=(\d+)/);
              const idMatch = href.match(/id=(\d+)/);
              const pathMatch = href.match(/\/p\/([\w-]+)/);
              
              if (pidMatch) productId = pidMatch[1];
              else if (idMatch) productId = idMatch[1];
              else if (pathMatch) productId = pathMatch[1];
              else productId = href;
              
              if (!uniqueProducts.has(productId)) {
                uniqueProducts.set(productId, href);
              }
            }
          });
          
          // If we found products, stop searching
          if (uniqueProducts.size > 0) break;
        }
      }

      // If no products found with containers, try direct product link patterns
      if (uniqueProducts.size === 0) {
        const allLinks = document.querySelectorAll('a[href]');
        allLinks.forEach(link => {
          const href = link.href;
          // Common product URL patterns
          if (href && (
            href.match(/\/product\.[a-z]+\?[a-z]+=[\w\d]+/i) || // product.do?pid=123
            href.match(/\/p\/[\w\d-]+/i) || // /p/product-name
            href.match(/\/products?\/[\w\d-]+/i) || // /product/name or /products/name
            href.match(/\/item\/[\w\d]+/i) || // /item/12345
            href.match(/\/[\w-]+\/pd\/[\w\d]+/i) || // /category/pd/12345
            href.match(/\/dp\/[\w\d]+/i) // Amazon style /dp/B08XYZ
          )) {
            // Extract product ID for uniqueness
            let productId = href;
            const pidMatch = href.match(/pid=(\d+)/);
            const idMatch = href.match(/id=(\d+)/);
            if (pidMatch) productId = pidMatch[1];
            else if (idMatch) productId = idMatch[1];
            
            if (!uniqueProducts.has(productId)) {
              uniqueProducts.set(productId, href);
            }
          }
        });
      }

      // Convert Map to Array and create simplified product objects
      const products = Array.from(uniqueProducts.values()).map(url => ({
        url: url,
        // We'll extract full details in phase 2
        title: null,
        price: null,
        image: null
      }));

      return {
        total_found: products.length,
        products: products,
        working_selector: workingSelector,
        extraction_method: workingSelector ? 'container_based' : 'pattern_based'
      };
    });
  }

  async analyzeURLPatterns(page) {
    return await page.evaluate(() => {
      const currentUrl = window.location.href;
      const baseUrl = window.location.origin;

      // Helper functions for this context
      function analyzeURLStructure(url) {
        const urlObj = new URL(url);
        return {
          protocol: urlObj.protocol,
          hostname: urlObj.hostname,
          pathname: urlObj.pathname,
          segments: urlObj.pathname.split('/').filter(s => s),
        };
      }

      function extractURLPattern(url, type) {
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

  async mapInteractionElements(page) {
    return await page.evaluate(() => {
      const interactions = {
        buttons: [],
        forms: [],
        dropdowns: [],
        toggles: [],
      };

      // Helper function for generating selectors in this context
      function generateBasicSelectorForElement(element) {
        if (!element) {return null;}
        if (element.id) {return `#${element.id}`;}
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {return `.${classes[0]}`;}
        }
        return element.tagName.toLowerCase();
      }

      // Helper function to classify button purpose
      function classifyButtonPurpose(button) {
        const text = button.textContent.toLowerCase();
        if (text.includes('cart') || text.includes('add to bag')) {return 'add_to_cart';}
        if (text.includes('buy') || text.includes('purchase')) {return 'purchase';}
        if (text.includes('search')) {return 'search';}
        if (text.includes('filter')) {return 'filter';}
        return 'general';
      }

      // Map buttons
      const buttons = document.querySelectorAll('button, .btn, [role="button"]');
      buttons.forEach((button, index) => {
        if (index < 10 && button.textContent.trim()) {
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
          interactions.forms.push({
            action: form.action,
            method: form.method,
            selector: generateBasicSelectorForElement(form),
            inputs: Array.from(form.querySelectorAll('input, select, textarea')).map(input => ({
              name: input.name,
              type: input.type,
              selector: generateBasicSelectorForElement(input),
            })),
          });
        }
      });

      return interactions;
    });
  }

  async exploreSubcategories(page, subcategories) {
    const results = [];

    for (const subcategory of subcategories) {
      try {
        await page.goto(subcategory.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1500);

        const subcategoryData = {
          name: subcategory.name,
          url: subcategory.url,
          products: await this.discoverProducts(page),
          selectors: await this.extractSelectors(page),
        };

        results.push(subcategoryData);
        this.logger.info(`📁 Explored subcategory: ${subcategory.name} (${subcategoryData.products.total_found} products)`);

      } catch (error) {
        this.logger.warn(`Failed to explore subcategory ${subcategory.name}:`, error.message);
      }
    }

    return results;
  }

  async compileExplorationResults(domain) {
    const results = Array.from(this.explorationResults.values());

    const compiled = {
      domain,
      sections_explored: results.length,
      selectors: this.aggregateSelectors(results),
      urlPatterns: this.aggregateURLPatterns(results),
      navigation_intelligence: this.aggregateNavigationIntelligence(results),
      products: this.aggregateProducts(results),
      exploration_summary: {
        total_products_found: results.reduce((sum, r) => sum + (r.product_discovery?.total_found || 0), 0),
        working_selectors: this.identifyWorkingSelectors(results),
        page_types_discovered: [...new Set(results.map(r => r.page_type))],
      },
    };

    this.logger.info(`✅ Compiled exploration results for ${domain}: ${compiled.sections_explored} sections, ${compiled.exploration_summary.total_products_found} products`);

    return compiled;
  }

  aggregateSelectors(results) {
    const aggregated = {
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
          if (!aggregated[category]) {aggregated[category] = {};}

          Object.entries(selectors).forEach(([key, selector]) => {
            if (selector) {
              if (!aggregated[category][key]) {
                aggregated[category][key] = [];
              }
              if (Array.isArray(selector)) {
                aggregated[category][key].push(...selector);
              } else {
                aggregated[category][key].push(selector);
              }
              totalSuccessfulExtractions++;
            }
            totalAttempts++;
          });
        });
      }
    });

    // Calculate success rate
    aggregated.success_rate = totalAttempts > 0 ? totalSuccessfulExtractions / totalAttempts : 0;

    // Deduplicate selectors and calculate reliability scores
    Object.entries(aggregated).forEach(([category, selectors]) => {
      if (typeof selectors === 'object' && selectors !== null) {
        Object.entries(selectors).forEach(([key, selectorArray]) => {
          if (Array.isArray(selectorArray)) {
            // Deduplicate and count occurrences
            const selectorCounts = {};
            selectorArray.forEach(sel => {
              selectorCounts[sel] = (selectorCounts[sel] || 0) + 1;
            });

            // Keep most common selector and calculate reliability
            const bestSelector = Object.entries(selectorCounts)
              .sort(([,a], [,b]) => b - a)[0];

            if (bestSelector) {
              aggregated[category][key] = bestSelector[0];
              aggregated.reliability_scores[`${category}.${key}`] = bestSelector[1] / results.length;
            }
          }
        });
      }
    });

    return aggregated;
  }

  aggregateURLPatterns(results) {
    const patterns = {
      product_url: null,
      category_url: null,
      collection_url: null,
      examples: {},
    };

    results.forEach(result => {
      if (result.url_patterns?.discovered_patterns) {
        Object.entries(result.url_patterns.discovered_patterns).forEach(([type, pattern]) => {
          if (pattern && !patterns[type]) {
            patterns[type] = pattern;
          }
        });
      }

      if (result.section_url) {
        if (!patterns.examples.category_urls) {patterns.examples.category_urls = [];}
        patterns.examples.category_urls.push(result.section_url);
      }
    });

    return patterns;
  }

  aggregateNavigationIntelligence(results) {
    return {
      total_sections: results.length,
      subcategories_found: results.reduce((sum, r) => sum + (r.navigation_paths?.subcategories?.length || 0), 0),
      filter_options_found: results.reduce((sum, r) => sum + (r.navigation_paths?.filter_options?.length || 0), 0),
      interaction_elements: results.reduce((sum, r) => sum + (r.interaction_elements?.buttons?.length || 0), 0),
    };
  }

  aggregateProducts(results) {
    const allProducts = [];
    results.forEach(result => {
      if (result.product_discovery?.products && Array.isArray(result.product_discovery.products)) {
        allProducts.push(...result.product_discovery.products);
      }
    });
    return allProducts;
  }

  identifyWorkingSelectors(results) {
    const working = {};

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
  getIntelligentSelectorScript() {
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

  async cleanup() {
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

module.exports = ConcurrentExplorer;
