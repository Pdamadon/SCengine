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
          '--disable-gpu'
        ]
      });
      this.logger.info('GlasswingScraper initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize GlasswingScraper:', error);
      throw error;
    }
  }

  getEssentialSelectors(element) {
    if (!element) return null;
    
    const selectors = [];
    
    // Priority order: ID, class, attribute, tag
    if (element.id) selectors.push(`#${element.id}`);
    
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        selectors.push(`.${classes[0]}`); // Most specific class
        if (classes.length > 1) selectors.push(`.${classes.slice(0, 2).join('.')}`);
      }
    }
    
    // Essential attributes
    const importantAttrs = ['data-testid', 'role', 'type', 'name'];
    importantAttrs.forEach(attr => {
      const value = element.getAttribute(attr);
      if (value) selectors.push(`[${attr}="${value}"]`);
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
        clickable: element.tagName.toLowerCase() === 'a' || element.tagName.toLowerCase() === 'button' || element.onclick !== null
      }
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
        timeout: 30000 
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
          
          if (element.id) selectors.push(`#${element.id}`);
          
          if (element.className) {
            const classes = element.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) {
              selectors.push(`.${classes[0]}`);
              if (classes.length > 1) selectors.push(`.${classes.slice(0, 2).join('.')}`);
            }
          }
          
          const importantAttrs = ['data-testid', 'role', 'type', 'name'];
          importantAttrs.forEach(attr => {
            const value = element.getAttribute(attr);
            if (value) selectors.push(`[${attr}="${value}"]`);
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
              clickable: element.tagName.toLowerCase() === 'a' || element.tagName.toLowerCase() === 'button' || element.onclick !== null
            }
          };
        };
        
        // Find product links
        const productLinks = Array.from(document.querySelectorAll('a[href*="/products/"]'))
          .slice(0, 20)
          .map(link => getEssentialSelectors(link));
        
        // Navigation elements
        const nextPageLink = document.querySelector('a[rel="next"], .pagination a[href*="page="]');
        const prevPageLink = document.querySelector('a[rel="prev"], .pagination a[href*="page="][href*="page=1"]');
        
        return {
          url: window.location.href,
          title: document.title,
          productLinks: productLinks,
          navigation: {
            nextPage: nextPageLink ? getEssentialSelectors(nextPageLink) : null,
            prevPage: prevPageLink ? getEssentialSelectors(prevPageLink) : null
          }
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
        timeout: 30000 
      });
      await page.waitForTimeout(1500);

      const productData = await page.evaluate(() => {
        const getEssentialSelectors = (element) => {
          if (!element) return null;
          
          const selectors = [];
          if (element.id) selectors.push(`#${element.id}`);
          if (element.className) {
            const classes = element.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) selectors.push(`.${classes[0]}`);
          }
          
          const importantAttrs = ['data-testid', 'role', 'type', 'name'];
          importantAttrs.forEach(attr => {
            const value = element.getAttribute(attr);
            if (value) selectors.push(`[${attr}="${value}"]`);
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
              value: element.value || null
            }
          };
        };

        // Extract product data
        const extractProductData = () => {
          const title = document.querySelector('h1, .product-single__title, .product__title');
          const price = document.querySelector('.money, .price, .product-single__price');
          
          return {
            title: title ? title.textContent.trim() : null,
            price: price ? price.textContent.trim() : null,
            url: window.location.href
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
            'select.product-single__variants'
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
                    variantType: variantType
                  };
                });

              const overallType = options.length > 0 ? options[0].variantType : 'unknown';
              
              variants.push({
                type: overallType,
                label: label,
                selector: selector,
                options: options
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
              height: img.height || null
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
          mainImage: document.querySelector('.product-single__photo img, .product__photo img, .featured-image img')
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
            analysis.addToCartButton ? `await page.click('${analysis.addToCartButton.primary}');` : null
          ].filter(action => action !== null),
          scrapedAt: new Date().toISOString()
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
    
    for (let i = 0; i < productLinks.length; i++) {
      const productLink = productLinks[i];
      
      if (!productLink.element.href) continue;
      
      this.logger.info(`Analyzing product ${i + 1}/${productLinks.length}`);
      
      try {
        const productData = await this.scrapeProductPage(productLink.element.href);
        productAnalysis.push(productData);
      } catch (error) {
        this.logger.error(`Error scraping product ${productLink.element.href}:`, error.message);
        productAnalysis.push({ 
          url: productLink.element.href, 
          error: error.message 
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
        successfulScrapes: productAnalysis.filter(p => !p.error).length
      }
    };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.logger.info('GlasswingScraper closed successfully');
    }
  }
}

module.exports = GlasswingScraper;