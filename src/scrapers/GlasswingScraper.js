const { chromium } = require('playwright');

class GlasswingScraper {
  constructor(logger) {
    this.logger = logger;
    this.browser = null;
    this.domain = 'glasswingshop.com';
    this.baseUrl = 'https://glasswingshop.com';
  }

  async initialize() {
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

  getEssentialSelectors(element) {
    if (!element) {return null;}

    const selectors = [];

    // Priority order: ID, class, attribute, tag
    if (element.id) {selectors.push(`#${element.id}`);}

    if (element.className) {
      const classes = element.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        selectors.push(`.${classes[0]}`); // Most specific class
        if (classes.length > 1) {selectors.push(`.${classes.slice(0, 2).join('.')}`);}
      }
    }

    // Essential attributes
    const importantAttrs = ['data-testid', 'role', 'type', 'name'];
    importantAttrs.forEach(attr => {
      const value = element.getAttribute(attr);
      if (value) {selectors.push(`[${attr}="${value}"]`);}
    });

    // Tag as fallback
    selectors.push(element.tagName.toLowerCase());

    return {
      primary: selectors[0] || element.tagName.toLowerCase(),
      alternatives: selectors.slice(1, 4),
      playwrightAction: `page.click('${selectors[0] || element.tagName.toLowerCase()}')`,
      element: {
        tag: element.tagName.toLowerCase(),
        text: element.textContent?.trim().substring(0, 50) || null,
        href: element.href || null,
        clickable: element.tagName.toLowerCase() === 'a' || element.tagName.toLowerCase() === 'button' || element.onclick !== null,
      },
    };
  }

  async scrapeCategoryPage(categoryUrl = '/collections/clothing-collection') {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser.newPage();
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
        const getEssentialSelectors = (element) => {
          const selectors = [];

          if (element.id) {selectors.push(`#${element.id}`);}

          if (element.className) {
            const classes = element.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) {
              selectors.push(`.${classes[0]}`);
              if (classes.length > 1) {selectors.push(`.${classes.slice(0, 2).join('.')}`);}
            }
          }

          const importantAttrs = ['data-testid', 'role', 'type', 'name'];
          importantAttrs.forEach(attr => {
            const value = element.getAttribute(attr);
            if (value) {selectors.push(`[${attr}="${value}"]`);}
          });

          selectors.push(element.tagName.toLowerCase());

          return {
            primary: selectors[0] || element.tagName.toLowerCase(),
            alternatives: selectors.slice(1, 4),
            playwrightAction: `page.click('${selectors[0] || element.tagName.toLowerCase()}')`,
            element: {
              tag: element.tagName.toLowerCase(),
              text: element.textContent?.trim().substring(0, 50) || null,
              href: element.href || null,
              clickable: element.tagName.toLowerCase() === 'a' || element.tagName.toLowerCase() === 'button' || element.onclick !== null,
            },
          };
        };

        // Find product links and deduplicate by href
        const productLinksMap = new Map();
        Array.from(document.querySelectorAll('a[href*="/products/"]'))
          .forEach(link => {
            if (link.href && !productLinksMap.has(link.href)) {
              productLinksMap.set(link.href, getEssentialSelectors(link));
            }
          });

        const productLinks = Array.from(productLinksMap.values()).slice(0, 20);

        // Navigation elements - Look for pagination links
        let nextPageLink = null;
        let prevPageLink = null;

        // Find all page links
        const pageLinks = Array.from(document.querySelectorAll('a[href*="page="]'));

        // Look for "next" link specifically
        nextPageLink = pageLinks.find(link =>
          link.textContent.trim().toLowerCase() === 'next' ||
          link.textContent.trim().toLowerCase() === 'Next' ||
          link.textContent.trim() === '→' ||
          link.getAttribute('aria-label')?.toLowerCase().includes('next'),
        );

        // Look for "prev" or "previous" link
        prevPageLink = pageLinks.find(link =>
          link.textContent.trim().toLowerCase() === 'prev' ||
          link.textContent.trim().toLowerCase() === 'previous' ||
          link.textContent.trim().toLowerCase() === 'Previous' ||
          link.textContent.trim() === '←' ||
          link.getAttribute('aria-label')?.toLowerCase().includes('prev'),
        );

        // If no explicit next/prev, use numeric logic
        if (!nextPageLink && pageLinks.length > 0) {
          // Get current page from URL
          const currentUrl = new URL(window.location.href);
          const currentPage = parseInt(currentUrl.searchParams.get('page') || '1');

          // Look for next page number
          nextPageLink = pageLinks.find(link => {
            const linkUrl = new URL(link.href);
            const linkPage = parseInt(linkUrl.searchParams.get('page') || '1');
            return linkPage === currentPage + 1;
          });
        }

        return {
          url: window.location.href,
          title: document.title,
          productLinks: productLinks,
          navigation: {
            nextPage: nextPageLink ? getEssentialSelectors(nextPageLink) : null,
            prevPage: prevPageLink ? getEssentialSelectors(prevPageLink) : null,
          },
        };
      });

      this.logger.info(`Found ${categoryData.productLinks.length} products on category page`);
      return categoryData;

    } finally {
      await page.close();
    }
  }

  async scrapeProductPage(productUrl) {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser.newPage();
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
        const getEssentialSelectors = (element) => {
          if (!element) {return null;}

          const selectors = [];
          if (element.id) {selectors.push(`#${element.id}`);}
          if (element.className) {
            const classes = element.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) {selectors.push(`.${classes[0]}`);}
          }

          const importantAttrs = ['data-testid', 'role', 'type', 'name'];
          importantAttrs.forEach(attr => {
            const value = element.getAttribute(attr);
            if (value) {selectors.push(`[${attr}="${value}"]`);}
          });

          selectors.push(element.tagName.toLowerCase());

          return {
            primary: selectors[0],
            alternatives: selectors.slice(1, 3),
            playwrightAction: element.tagName.toLowerCase() === 'select'
              ? `page.selectOption('${selectors[0]}', 'value')`
              : `page.click('${selectors[0]}')`,
            element: {
              tag: element.tagName.toLowerCase(),
              text: element.textContent?.trim().substring(0, 30) || null,
              value: element.value || null,
            },
          };
        };

        // Extract product data
        const extractProductData = () => {
          const title = document.querySelector('h1, .product-single__title, .product__title');
          const price = document.querySelector('.money, .price, .product-single__price');

          // Extract product description/details
          const extractDescription = () => {
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

            let description = null;
            let descriptionHtml = null;

            // Try each selector until we find content
            for (const selector of descriptionSelectors) {
              const element = document.querySelector(selector);
              if (element && element.textContent.trim()) {
                description = element.textContent.trim();
                descriptionHtml = element.innerHTML.trim();
                break;
              }
            }

            // Fallback: Look for any content-rich div near product info
            if (!description) {
              const contentDivs = document.querySelectorAll('div p, .product-single div, .product-form ~ div');
              for (const div of contentDivs) {
                const text = div.textContent.trim();
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
            title: title ? title.textContent.trim() : null,
            price: price ? price.textContent.trim() : null,
            description: descriptionData.text,
            descriptionHtml: descriptionData.html,
            descriptionLength: descriptionData.length,
            url: window.location.href,
          };
        };

        // Extract variant data with type detection
        const extractVariantData = () => {
          const variants = [];

          const selectors = [
            'select[name*="id"]',
            'select[name*="Size"]',
            'select[name*="Color"]',
            '.product-form select',
            '.variant-selector select',
            'select.product-single__variants',
          ];

          selectors.forEach(selector => {
            const variantSelect = document.querySelector(selector);
            if (variantSelect && variants.length === 0) {

              const label = variantSelect.previousElementSibling?.textContent?.trim() ||
                           variantSelect.closest('.product-form__input')?.querySelector('label')?.textContent?.trim() ||
                           variantSelect.getAttribute('name') ||
                           'Variant';

              const options = Array.from(variantSelect.querySelectorAll('option'))
                .filter(option => option.value && option.textContent.trim())
                .map(option => {
                  const text = option.textContent.trim();

                  // Determine variant type
                  let variantType = 'unknown';
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
        const extractImages = () => {
          return Array.from(document.querySelectorAll('.product-single__photo img, .product__photo img, .featured-image img, img[alt*="product"]'))
            .filter(img => img.src && img.src.includes('http'))
            .map(img => ({
              src: img.src,
              alt: img.alt || '',
              width: img.width || null,
              height: img.height || null,
            }))
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

        const analysis = {};
        Object.keys(elements).forEach(key => {
          analysis[key] = getEssentialSelectors(elements[key]);
        });

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
          ].filter(action => action !== null),
          scrapedAt: new Date().toISOString(),
        };
      });

      this.logger.info(`Product scraped: ${productData.productData.title}`);
      return productData;

    } finally {
      await page.close();
    }
  }

  async scrapeFirstProducts(categoryUrl = '/collections/clothing-collection', maxProducts = 10) {
    const categoryData = await this.scrapeCategoryPage(categoryUrl);
    const productAnalysis = [];

    const productLinks = categoryData.productLinks.slice(0, maxProducts);

    this.logger.info(`Processing ${productLinks.length} unique product links:`);
    productLinks.forEach((link, index) => {
      this.logger.info(`  ${index + 1}. ${link.element.href}`);
    });

    for (let i = 0; i < productLinks.length; i++) {
      const productLink = productLinks[i];

      if (!productLink.element.href) {continue;}

      this.logger.info(`Analyzing product ${i + 1}/${productLinks.length}: ${productLink.element.href}`);

      try {
        const productData = await this.scrapeProductPage(productLink.element.href);
        productAnalysis.push(productData);
      } catch (error) {
        this.logger.error(`Error scraping product ${productLink.element.href}:`, error.message);
        productAnalysis.push({
          url: productLink.element.href,
          error: error.message,
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

  async scrapeCompleteCollection(categoryUrl = '/collections/clothing-collection', maxProducts = null) {
    this.logger.info(`Starting complete collection scrape for: ${categoryUrl}`);

    const allProductLinks = [];
    const allCategoryData = [];
    const productAnalysis = [];
    let currentPage = categoryUrl;
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
        this.logger.error(`Error scraping page ${pageCount}: ${error.message}`);
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

      if (!productLink.element.href) {continue;}

      this.logger.info(`Analyzing product ${i + 1}/${productLinksToScrape.length}: ${productLink.element.href}`);

      try {
        const productData = await this.scrapeProductPage(productLink.element.href);
        productAnalysis.push(productData);
      } catch (error) {
        this.logger.error(`Error scraping product ${productLink.element.href}:`, error.message);
        productAnalysis.push({
          url: productLink.element.href,
          error: error.message,
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
  async scrapeWithCategories(maxProducts = null, progressCallback = null) {
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
      const categories = [];
      
      // Get navigation data from intelligence
      const navigationData = await siteIntelligence.worldModel.getSiteNavigation(this.domain);
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
      const allProducts = [];
      const categoryResults = [];
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
          this.logger.error(`Error scraping category ${category.name}:`, error.message);
          categoryResults.push({
            category: category,
            error: error.message
          });
        }
      }

      // Cleanup intelligence system
      await siteIntelligence.close();

      const finalResult = {
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

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.logger.info('GlasswingScraper closed successfully');
    }
  }
}

module.exports = GlasswingScraper;
