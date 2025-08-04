const { chromium } = require('playwright');

class ConcurrentExplorer {
  constructor(logger, worldModel) {
    this.logger = logger;
    this.worldModel = worldModel;
    this.browsers = [];
    this.explorationResults = new Map();
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
      'home', 'beauty', 'sale', 'new', 'featured', 'collection'
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
      this.exploreSection(baseUrl, section, navigationIntelligence)
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
    const browser = await chromium.launch({
      headless: process.env.HEADLESS_MODE !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.browsers.push(browser);
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      this.logger.info(`🔍 Exploring section: ${section.name}`);
      
      // Navigate to section
      await page.goto(section.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      const sectionIntelligence = {
        section_name: section.name,
        section_url: section.url,
        page_type: await this.classifyPageType(page),
        selectors: await this.extractSelectors(page),
        navigation_paths: await this.extractNavigationPaths(page),
        product_discovery: await this.discoverProducts(page),
        url_patterns: await this.analyzeURLPatterns(page),
        interaction_elements: await this.mapInteractionElements(page)
      };

      // If this section has subcategories, explore them too
      if (section.has_dropdown || sectionIntelligence.navigation_paths.subcategories.length > 0) {
        sectionIntelligence.subcategory_exploration = await this.exploreSubcategories(
          page, 
          sectionIntelligence.navigation_paths.subcategories.slice(0, 3) // Limit for performance
        );
      }

      return sectionIntelligence;

    } catch (error) {
      this.logger.error(`Section exploration failed for ${section.name}:`, error);
      throw error;
    } finally {
      await page.close();
      await context.close();
      await browser.close();
      this.browsers = this.browsers.filter(b => b !== browser);
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
    return await page.evaluate(() => {
      const selectors = {
        navigation: {},
        product: {},
        pricing: {},
        availability: {},
        variants: {},
        images: {},
        filters: {},
        pagination: {}
      };

      // Navigation selectors
      const navElements = {
        breadcrumb: document.querySelector('.breadcrumb, .breadcrumbs, [aria-label="breadcrumb"]'),
        sidebar: document.querySelector('.sidebar, .category-nav, .filters, .facets'),
        pagination: document.querySelector('.pagination, .pager, .page-numbers')
      };

      Object.entries(navElements).forEach(([key, element]) => {
        if (element) {
          selectors.navigation[key] = this.generateReliableSelector(element);
        }
      });

      // Product-related selectors
      const productElements = document.querySelectorAll(
        '.product, .product-item, .product-card, .grid__item, .card-wrapper'
      );
      
      if (productElements.length > 0) {
        const firstProduct = productElements[0];
        
        // Extract product component selectors
        const titleEl = firstProduct.querySelector('h1, h2, h3, .product-title, .card__heading, a');
        const priceEl = firstProduct.querySelector('.price, .money, .product-price, .cost');
        const imageEl = firstProduct.querySelector('img');
        const linkEl = firstProduct.querySelector('a') || firstProduct.closest('a');

        if (titleEl) selectors.product.title = this.generateReliableSelector(titleEl);
        if (priceEl) selectors.pricing.price = this.generateReliableSelector(priceEl);
        if (imageEl) selectors.images.product = this.generateReliableSelector(imageEl);
        if (linkEl) selectors.product.link = this.generateReliableSelector(linkEl);
        
        selectors.product.container = this.generateReliableSelector(firstProduct);
      }

      // Filter selectors
      const filterElements = document.querySelectorAll(
        '.filter, .facet, [data-filter], .filter-option, select'
      );
      
      filterElements.forEach((filter, index) => {
        if (index < 5) { // Limit to prevent overwhelming data
          const filterType = this.classifyFilter(filter);
          if (!selectors.filters[filterType]) {
            selectors.filters[filterType] = [];
          }
          selectors.filters[filterType].push(this.generateReliableSelector(filter));
        }
      });

      // Availability indicators
      const availabilityEl = document.querySelector(
        '.in-stock, .out-of-stock, .availability, .stock-status'
      );
      if (availabilityEl) {
        selectors.availability.status = this.generateReliableSelector(availabilityEl);
      }

      // Variant selectors (for product pages)
      const variantSelects = document.querySelectorAll('select[name*="variant"], select.variant');
      if (variantSelects.length > 0) {
        selectors.variants.dropdown = this.generateReliableSelector(variantSelects[0]);
      }

      // Helper functions defined in page context
      function generateReliableSelector(element) {
        if (!element) return null;
        
        if (element.id) return `#${element.id}`;
        
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) return `.${classes[0]}`;
        }
        
        if (element.getAttribute('data-testid')) {
          return `[data-testid="${element.getAttribute('data-testid')}"]`;
        }
        
        return element.tagName.toLowerCase();
      }

      function classifyFilter(filter) {
        const text = filter.textContent.toLowerCase();
        const name = filter.name?.toLowerCase() || '';
        
        if (text.includes('price') || name.includes('price')) return 'price';
        if (text.includes('color') || name.includes('color')) return 'color';
        if (text.includes('size') || name.includes('size')) return 'size';
        if (text.includes('brand') || name.includes('brand')) return 'brand';
        if (text.includes('category') || name.includes('category')) return 'category';
        
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
        sorting_options: []
      };

      // Find subcategory links
      const subcategorySelectors = [
        '.category-list a',
        '.subcategory a', 
        '.nav-category a',
        '.sidebar a'
      ];

      subcategorySelectors.forEach(selector => {
        const links = document.querySelectorAll(selector);
        links.forEach(link => {
          if (link.textContent.trim() && link.href) {
            paths.subcategories.push({
              name: link.textContent.trim(),
              url: link.href,
              selector: this.generateReliableSelector(link)
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
            selector: this.generateReliableSelector(filter)
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
              selector: this.generateReliableSelector(sortSelect)
            });
          }
        });
      }

      // Helper function for this context
      function generateReliableSelector(element) {
        if (!element) return null;
        if (element.id) return `#${element.id}`;
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) return `.${classes[0]}`;
        }
        return element.tagName.toLowerCase();
      }

      return paths;
    });
  }

  async discoverProducts(page) {
    return await page.evaluate(() => {
      const productSelectors = [
        '.product', '.product-item', '.product-card', '.grid__item',
        '.card-wrapper', '.collection-product-card', '[data-product-id]'
      ];

      let products = [];
      
      for (const selector of productSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach((element, index) => {
            if (index >= 12) return; // Limit products per page
            
            const titleEl = element.querySelector('h1, h2, h3, .product-title, .card__heading, a');
            const priceEl = element.querySelector('.price, .money, .product-price');
            const linkEl = element.querySelector('a') || element.closest('a');
            const imageEl = element.querySelector('img');
            
            if (titleEl && linkEl) {
              products.push({
                title: titleEl.textContent.trim(),
                price: priceEl ? priceEl.textContent.trim() : null,
                url: linkEl.href,
                image: imageEl ? imageEl.src : null,
                container_selector: this.generateReliableSelector(element)
              });
            }
          });
          break; // Found products with this selector
        }
      }
      
      // Helper function for this context
      function generateReliableSelector(element) {
        if (!element) return null;
        if (element.id) return `#${element.id}`;
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) return `.${classes[0]}`;
        }
        return element.tagName.toLowerCase();
      }

      return {
        total_found: products.length,
        products: products,
        working_selector: products.length > 0 ? 
          generateReliableSelector(document.querySelector(
            productSelectors.find(sel => document.querySelectorAll(sel).length > 0)
          )) : null
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
          segments: urlObj.pathname.split('/').filter(s => s)
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
          collection_urls: extractURLPattern(currentUrl, 'collection')
        }
      };
    });
  }

  async mapInteractionElements(page) {
    return await page.evaluate(() => {
      const interactions = {
        buttons: [],
        forms: [],
        dropdowns: [],
        toggles: []
      };

      // Map buttons
      const buttons = document.querySelectorAll('button, .btn, [role="button"]');
      buttons.forEach((button, index) => {
        if (index < 10 && button.textContent.trim()) {
          interactions.buttons.push({
            text: button.textContent.trim(),
            selector: this.generateReliableSelector(button),
            purpose: this.classifyButtonPurpose(button)
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
            selector: this.generateReliableSelector(form),
            inputs: Array.from(form.querySelectorAll('input, select, textarea')).map(input => ({
              name: input.name,
              type: input.type,
              selector: this.generateReliableSelector(input)
            }))
          });
        }
      });

      // Helper functions for this context
      function generateReliableSelector(element) {
        if (!element) return null;
        if (element.id) return `#${element.id}`;
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) return `.${classes[0]}`;
        }
        return element.tagName.toLowerCase();
      }

      function classifyButtonPurpose(button) {
        const text = button.textContent.toLowerCase();
        if (text.includes('add to cart') || text.includes('buy')) return 'purchase';
        if (text.includes('filter') || text.includes('apply')) return 'filtering';
        if (text.includes('search')) return 'search';
        if (text.includes('menu')) return 'navigation';
        return 'general';
      }

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
          selectors: await this.extractSelectors(page)
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
      exploration_summary: {
        total_products_found: results.reduce((sum, r) => sum + (r.product_discovery?.total_found || 0), 0),
        working_selectors: this.identifyWorkingSelectors(results),
        page_types_discovered: [...new Set(results.map(r => r.page_type))]
      }
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
      success_rate: 0
    };

    let totalSuccessfulExtractions = 0;
    let totalAttempts = 0;

    results.forEach(result => {
      if (result.selectors) {
        Object.entries(result.selectors).forEach(([category, selectors]) => {
          if (!aggregated[category]) aggregated[category] = {};
          
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
      examples: {}
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
        if (!patterns.examples.category_urls) patterns.examples.category_urls = [];
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
      interaction_elements: results.reduce((sum, r) => sum + (r.interaction_elements?.buttons?.length || 0), 0)
    };
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