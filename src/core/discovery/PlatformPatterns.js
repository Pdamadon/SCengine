/**
 * PlatformPatterns - Comprehensive platform-specific patterns for e-commerce sites
 * 
 * Day 5 Implementation: Platform-Specific Navigation & Product Patterns
 * Each platform has unique characteristics we can leverage for better extraction
 */

class PlatformPatterns {
  constructor() {
    this.patterns = {
      // ============= SHOPIFY =============
      shopify: {
        name: 'Shopify',
        detection: {
          globals: ['Shopify', 'ShopifyAnalytics'],
          meta: ['shopify-checkout-api-token', 'shopify-digital-wallet'],
          scripts: ['cdn.shopify.com', 'shopify.com/s/files'],
          elements: ['#shopify-features', 'form[action="/cart/add"]'],
          bodyClasses: ['template-product', 'template-collection']
        },
        navigation: {
          patterns: [
            {
              name: 'shopify-dropdown-nav',
              selectors: {
                container: 'li.dropdown-toggle, .site-nav__item--has-dropdown',
                trigger: 'p.dropdown-title, .site-nav__link',
                dropdown: '.dropdown-content, .site-nav__dropdown'
              },
              interaction: 'hover'
            },
            {
              name: 'shopify-mobile-nav',
              selectors: {
                container: '.mobile-nav__item',
                trigger: '.mobile-nav__link',
                dropdown: '.mobile-nav__dropdown'
              },
              interaction: 'click'
            }
          ]
        },
        products: {
          listingPages: [
            '/collections/all',
            '/collections/*',
            '/products'
          ],
          productCards: [
            '.product-card',
            '.product-item',
            '.product-grid-item',
            'article.product',
            '.collection-product'
          ],
          productLinks: [
            'a[href*="/products/"]',
            '.product-card__link',
            '.product-item__link'
          ],
          pagination: {
            next: '.pagination__next, a[rel="next"]',
            container: '.pagination, .pager',
            pageLinks: '.pagination__item a'
          },
          ajax: {
            loadMore: '[data-load-more], .load-more__btn',
            infiniteScroll: '[data-infinite-scroll]'
          }
        },
        extraction: {
          title: [
            'h1.product__title',
            '.product-single__title',
            '[itemprop="name"]'
          ],
          price: [
            '.price__regular .price-item',
            '.product__price',
            '[data-price]',
            '.money'
          ],
          image: [
            '.product__image img',
            '.product-single__photo img',
            '[itemprop="image"]'
          ],
          variants: {
            container: '.product-form__variants',
            options: '.product-form__input input[type="radio"]'
          }
        }
      },

      // ============= BIGCOMMERCE =============
      bigcommerce: {
        name: 'BigCommerce',
        detection: {
          globals: ['BCData', 'stencilBootstrap'],
          meta: ['bc-api-url'],
          scripts: ['bigcommerce.com', 'checkout-sdk.bigcommerce'],
          elements: ['[data-cart-api]', '.bc-product-form'],
          bodyClasses: ['bc-category', 'bc-product']
        },
        navigation: {
          patterns: [
            {
              name: 'bigcommerce-nav',
              selectors: {
                container: '.navPages-item--hasSubMenu',
                trigger: '.navPages-action',
                dropdown: '.navPage-subMenu'
              },
              interaction: 'hover'
            }
          ]
        },
        products: {
          listingPages: [
            '/categories/*',
            '/brands/*',
            '/search'
          ],
          productCards: [
            '.product',
            '.productGrid-item',
            'article[data-product-id]'
          ],
          productLinks: [
            'a.product-item-link',
            '.card-title > a',
            'h4.card-title a'
          ],
          pagination: {
            next: '.pagination-link--next',
            container: '.pagination',
            pageLinks: '.pagination-link'
          }
        },
        extraction: {
          title: ['h1.productView-title', '[data-product-title]'],
          price: ['.price--main', '[data-product-price]', '.productView-price'],
          image: ['.productView-image img', '[data-main-image]']
        }
      },

      // ============= WOOCOMMERCE =============
      woocommerce: {
        name: 'WooCommerce',
        detection: {
          globals: ['woocommerce_params', 'wc_add_to_cart_params'],
          meta: ['generator[content*="WooCommerce"]'],
          scripts: ['woocommerce', 'wc-add-to-cart'],
          elements: ['.woocommerce', '.woocommerce-page'],
          bodyClasses: ['woocommerce', 'woocommerce-page']
        },
        navigation: {
          patterns: [
            {
              name: 'woo-nav',
              selectors: {
                container: '.menu-item-has-children',
                trigger: '> a',
                dropdown: '.sub-menu, .dropdown-menu'
              },
              interaction: 'hover'
            }
          ]
        },
        products: {
          listingPages: [
            '/shop',
            '/product-category/*',
            '/product-tag/*'
          ],
          productCards: [
            'li.product',
            '.products .product',
            '.woocommerce-loop-product'
          ],
          productLinks: [
            'a.woocommerce-loop-product__link',
            '.woocommerce-loop-product__title',
            'h2.woocommerce-loop-product__title a'
          ],
          pagination: {
            next: '.woocommerce-pagination .next',
            container: '.woocommerce-pagination',
            pageLinks: '.page-numbers'
          }
        },
        extraction: {
          title: ['h1.product_title', '.product_title'],
          price: [
            '.price .woocommerce-Price-amount',
            '.summary .price',
            'p.price'
          ],
          image: ['.woocommerce-product-gallery__image img', '.wp-post-image']
        }
      },

      // ============= MAGENTO =============
      magento: {
        name: 'Magento',
        detection: {
          globals: ['Mage', 'VarienForm'],
          meta: ['generator[content*="Magento"]'],
          scripts: ['mage/', 'skin/frontend/', 'static/frontend/'],
          elements: ['.magento-page', '[data-mage-init]'],
          bodyClasses: ['catalog-product-view', 'catalog-category-view']
        },
        navigation: {
          patterns: [
            {
              name: 'magento-nav',
              selectors: {
                container: '.level-top.parent',
                trigger: '> a',
                dropdown: '.level1, .submenu'
              },
              interaction: 'hover'
            }
          ]
        },
        products: {
          listingPages: [
            '/catalogsearch/result',
            '*.html'  // Magento uses .html for category pages
          ],
          productCards: [
            'li.product-item',
            '.product-item',
            '[data-product-id]'
          ],
          productLinks: [
            'a.product-item-link',
            '.product-item-info a'
          ],
          pagination: {
            next: '.action.next',
            container: '.pages',
            pageLinks: '.pages-item a'
          }
        },
        extraction: {
          title: ['h1.page-title', '[itemprop="name"]'],
          price: [
            '[data-price-type="finalPrice"]',
            '.price-box .price',
            '.special-price .price'
          ],
          image: ['.gallery-placeholder img', '.product-image-main']
        }
      },

      // ============= CUSTOM/UNKNOWN =============
      custom: {
        name: 'Custom/Unknown Platform',
        detection: {
          // This is the fallback - always matches
          fallback: true
        },
        navigation: {
          patterns: [
            {
              name: 'universal-nav',
              selectors: {
                // Try common patterns
                container: 'nav li, .nav-item, .menu-item',
                trigger: 'a, button',
                dropdown: 'ul, .dropdown, .submenu, .sub-menu'
              },
              interaction: 'hover'
            }
          ]
        },
        products: {
          // Use universal patterns
          productCards: [
            '[class*="product"]',
            '[data-product]',
            'article',
            '.item',
            '.card'
          ],
          productLinks: [
            'a[href*="product"]',
            'a[href*="item"]',
            '.product-link',
            '.item-link'
          ]
        },
        extraction: {
          // Use common selectors
          title: ['h1', 'h2', '[itemprop="name"]', '.product-title'],
          price: ['[class*="price"]', '[data-price]', '.cost', '.amount'],
          image: ['img[alt*="product"]', '.main-image', 'picture img']
        }
      }
    };
  }

  /**
   * Detect platform from page indicators
   */
  async detectPlatform(page) {
    const indicators = await page.evaluate(() => {
      const checkGlobals = (names) => names.some(name => window[name] !== undefined);
      const checkMeta = (names) => names.some(name => 
        document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)
      );
      const checkScripts = (patterns) => {
        const scripts = Array.from(document.scripts).map(s => s.src);
        return patterns.some(pattern => 
          scripts.some(src => src.includes(pattern))
        );
      };
      const checkElements = (selectors) => selectors.some(sel => 
        document.querySelector(sel) !== null
      );
      const checkBodyClasses = (classes) => {
        const bodyClasses = document.body.className;
        return classes.some(cls => bodyClasses.includes(cls));
      };

      return {
        // Check each platform's indicators
        shopify: checkGlobals(['Shopify', 'ShopifyAnalytics']) ||
                 checkScripts(['cdn.shopify.com']) ||
                 checkElements(['form[action*="/cart/add"]']),
        
        bigcommerce: checkGlobals(['BCData', 'stencilBootstrap']) ||
                     checkElements(['[data-cart-api]']),
        
        woocommerce: checkGlobals(['woocommerce_params']) ||
                     checkBodyClasses(['woocommerce']),
        
        magento: checkGlobals(['Mage']) ||
                checkBodyClasses(['catalog-product-view']),
        
        // Additional detection info
        generator: document.querySelector('meta[name="generator"]')?.content,
        bodyClasses: document.body.className
      };
    });

    // Determine platform
    if (indicators.shopify) return 'shopify';
    if (indicators.bigcommerce) return 'bigcommerce';
    if (indicators.woocommerce) return 'woocommerce';
    if (indicators.magento) return 'magento';
    
    return 'custom';
  }

  /**
   * Get patterns for detected platform
   */
  getPlatformPatterns(platform) {
    return this.patterns[platform] || this.patterns.custom;
  }

  /**
   * Get navigation patterns for platform
   */
  getNavigationPatterns(platform) {
    const platformPatterns = this.getPlatformPatterns(platform);
    return platformPatterns.navigation.patterns;
  }

  /**
   * Get product extraction patterns for platform
   */
  getProductPatterns(platform) {
    const platformPatterns = this.getPlatformPatterns(platform);
    return platformPatterns.products;
  }

  /**
   * Get extraction selectors for platform
   */
  getExtractionSelectors(platform) {
    const platformPatterns = this.getPlatformPatterns(platform);
    return platformPatterns.extraction;
  }

  /**
   * Test platform detection on multiple URLs
   */
  async testPlatformDetection(urls, page) {
    const results = {};
    
    for (const url of urls) {
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        const platform = await this.detectPlatform(page);
        results[url] = {
          platform,
          patterns: this.getPlatformPatterns(platform)
        };
      } catch (error) {
        results[url] = {
          error: error.message
        };
      }
    }
    
    return results;
  }
}

module.exports = PlatformPatterns;