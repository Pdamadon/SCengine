/**
 * NavigationTreeBuilder - Builds complete hierarchical navigation tree
 * 
 * Recursively explores navigation to build the full tree structure:
 * - Main categories (Women, Men, Kids, etc.)
 * - Subcategories (Women → Dresses, Tops, etc.)  
 * - Sub-subcategories (Women → Dresses → Casual, Formal, etc.)
 * - Complete depth exploration
 * 
 * This is essential for mapping large e-commerce sites comprehensively.
 */

const { chromium } = require('playwright');
const ProductCatalogStrategy = require('./strategies/ProductCatalogStrategy');

class NavigationTreeBuilder {
  constructor(logger, productCatalogCache = null) {
    this.logger = logger;
    this.visitedUrls = new Set();
    this.maxDepth = 4; // Maximum tree depth to prevent infinite recursion
    this.maxBranchWidth = 20; // Max items per level to explore
    this.browser = null;
    this.context = null;
    
    // Product discovery integration
    this.productCatalogCache = productCatalogCache;
    this.productCatalogStrategy = new ProductCatalogStrategy(logger, {
      productDetectionThreshold: 3,
      maxProductsPerPage: 500,
      enableInfiniteScroll: true,
      enableLoadMoreButtons: true,
      enableTraditionalPagination: false // Avoid complex navigation during tree building
    });
    
    // Statistics tracking
    this.stats = {
      totalNodes: 0,
      productRichNodes: 0,
      totalProducts: 0,
      startTime: null
    };
  }

  /**
   * Build complete navigation tree from initial navigation data
   */
  async buildNavigationTree(baseUrl, initialNavigation, options = {}) {
    const startTime = Date.now();
    this.logger.info('🌳 Building hierarchical navigation tree with product discovery', { baseUrl });

    // Reset state
    this.visitedUrls.clear();
    this.maxDepth = options.maxDepth || 4;
    this.maxBranchWidth = options.maxBranchWidth || 20;
    
    // Initialize statistics
    this.stats = {
      totalNodes: 0,
      productRichNodes: 0,
      totalProducts: 0,
      startTime: startTime
    };

    try {
      // Initialize browser if not provided
      if (!this.browser) {
        this.browser = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.context = await this.browser.newContext({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          viewport: { width: 1920, height: 1080 }
        });
      }

      // Build tree structure from initial navigation
      const tree = {
        url: baseUrl,
        name: 'Root',
        type: 'root',
        depth: 0,
        children: [],
        metadata: {
          discovered_at: new Date().toISOString(),
          total_items: 0,
          max_depth_reached: 0
        }
      };

      // Process main sections into tree nodes
      const mainSections = this.extractMainSections(initialNavigation);
      this.logger.info(`Found ${mainSections.length} main sections to explore`);

      // Explore each main section recursively
      for (let i = 0; i < Math.min(mainSections.length, this.maxBranchWidth); i++) {
        const section = mainSections[i];
        if (this.shouldExplore(section)) {
          const node = await this.exploreNode(section, 1, baseUrl);
          if (node) {
            tree.children.push(node);
            tree.metadata.total_items += this.countNodes(node);
            tree.metadata.max_depth_reached = Math.max(
              tree.metadata.max_depth_reached,
              this.getMaxDepth(node)
            );
          }
        }
      }

      const duration = Date.now() - startTime;
      
      // Add product statistics to tree metadata
      tree.metadata.product_stats = {
        total_products: this.stats.totalProducts,
        product_rich_nodes: this.stats.productRichNodes,
        total_nodes: this.stats.totalNodes,
        product_coverage: this.stats.totalNodes > 0 ? (this.stats.productRichNodes / this.stats.totalNodes * 100).toFixed(1) : 0
      };
      
      this.logger.info(`✅ Enhanced navigation tree built in ${duration}ms`, {
        total_nodes: tree.metadata.total_items,
        max_depth: tree.metadata.max_depth_reached,
        main_categories: tree.children.length,
        total_products: this.stats.totalProducts,
        product_rich_nodes: this.stats.productRichNodes,
        product_coverage: tree.metadata.product_stats.product_coverage + '%'
      });

      return tree;

    } catch (error) {
      this.logger.error('Failed to build navigation tree', { error: error.message });
      throw error;
    }
  }

  /**
   * Recursively explore a navigation node
   */
  async exploreNode(item, depth, baseUrl) {
    // Check depth limit
    if (depth > this.maxDepth) {
      this.logger.debug(`Max depth ${this.maxDepth} reached`);
      return null;
    }

    // Check if already visited
    const itemUrl = this.normalizeUrl(item.url, baseUrl);
    if (this.visitedUrls.has(itemUrl)) {
      this.logger.debug(`Already visited: ${itemUrl}`);
      return null;
    }

    this.visitedUrls.add(itemUrl);

    // Create node
    const node = {
      name: item.name || item.text,
      url: itemUrl,
      type: this.classifyNodeType(item, depth),
      depth: depth,
      selector: item.selector,
      has_dropdown: item.has_dropdown || false,
      children: [],
      metadata: {
        discovered_at: new Date().toISOString(),
        exploration_method: item.discovered_by || 'navigation'
      }
    };

    // If this item has a dropdown, extract children from dropdown
    if (item.has_dropdown && item.dropdown_items) {
      this.logger.debug(`Processing dropdown for ${node.name} with ${item.dropdown_items.length} items`);
      
      for (let i = 0; i < Math.min(item.dropdown_items.length, this.maxBranchWidth); i++) {
        const childItem = item.dropdown_items[i];
        const childNode = await this.exploreNode(childItem, depth + 1, baseUrl);
        if (childNode) {
          node.children.push(childNode);
        }
      }
    }
    // Otherwise, visit the URL to discover children AND products
    else if (itemUrl && itemUrl !== '#' && this.shouldVisitUrl(itemUrl)) {
      try {
        // Discover children navigation
        const childrenResult = await this.discoverChildrenAndProducts(itemUrl, depth, node);
        const children = childrenResult.children;
        
        // Add products to node if discovered
        if (childrenResult.products && childrenResult.products.length > 0) {
          node.products = childrenResult.products;
          node.productCount = childrenResult.products.length;
          node.isProductRich = true;
          node.productAnalysis = childrenResult.productAnalysis;
          
          // Update statistics
          this.stats.productRichNodes++;
          this.stats.totalProducts += childrenResult.products.length;
          
          this.logger.info(`🛍️ ${node.name}: Found ${childrenResult.products.length} products`);
          
          // Store products if cache available
          if (this.productCatalogCache) {
            try {
              const domain = new URL(baseUrl).hostname;
              await this.productCatalogCache.storeProducts(domain, node);
            } catch (cacheError) {
              this.logger.warn('Failed to cache products:', cacheError.message);
            }
          }
        }
        
        this.logger.debug(`Found ${children.length} children for ${node.name}`);
        
        // Recursively explore children
        for (let i = 0; i < Math.min(children.length, this.maxBranchWidth); i++) {
          const child = children[i];
          const childNode = await this.exploreNode(child, depth + 1, baseUrl);
          if (childNode) {
            node.children.push(childNode);
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to explore ${node.name}: ${error.message}`);
      }
    }

    // Update statistics
    this.stats.totalNodes++;

    return node;
  }

  /**
   * Discover child navigation AND products by visiting a URL
   */
  async discoverChildrenAndProducts(url, currentDepth, parentNode) {
    const page = await this.context.newPage();
    
    try {
      this.logger.debug(`Visiting ${url} to discover children (depth ${currentDepth})`);
      
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 15000 
      });
      
      await page.waitForTimeout(2000); // Let page settle

      // Extract navigation from this page
      const children = await page.evaluate(() => {
        const items = [];
        const processed = new Set();

        // Look for subcategory navigation
        const selectors = [
          '.sidebar nav a',
          '.category-nav a',
          '.subcategory-list a',
          '.refinement a',
          '[class*="sidebar"] a',
          '[class*="filter"] a',
          '[class*="category"] a',
          'aside a',
          '.left-nav a'
        ];

        selectors.forEach(selector => {
          try {
            const links = document.querySelectorAll(selector);
            links.forEach(link => {
              const text = link.textContent.trim();
              const href = link.href;
              
              if (text && href && !processed.has(href)) {
                processed.add(href);
                
                // Filter out non-navigation items
                const skipPatterns = [
                  'sign in', 'cart', 'help', 'account',
                  'facebook', 'twitter', 'instagram',
                  'privacy', 'terms', 'cookies'
                ];
                
                const shouldSkip = skipPatterns.some(p => 
                  text.toLowerCase().includes(p)
                );
                
                if (!shouldSkip && !href.includes('javascript:')) {
                  items.push({
                    text: text,
                    name: text,
                    url: href,
                    selector: link.className || null
                  });
                }
              }
            });
          } catch (e) {
            // Continue with other selectors
          }
        });

        return items;
      });

      // NEW: Product discovery on this page
      let productResult = null;
      try {
        this.logger.debug(`Running product discovery on ${url}`);
        productResult = await this.productCatalogStrategy.execute(page);
      } catch (productError) {
        this.logger.warn(`Product discovery failed for ${url}: ${productError.message}`);
        productResult = { items: [], confidence: 0, metadata: { error: productError.message } };
      }

      return {
        children,
        products: productResult.items || [],
        productAnalysis: productResult.metadata || {},
        productConfidence: productResult.confidence || 0
      };

    } catch (error) {
      this.logger.debug(`Failed to discover children for ${url}: ${error.message}`);
      return {
        children: [],
        products: [],
        productAnalysis: { error: error.message },
        productConfidence: 0
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Extract main sections from initial navigation intelligence
   */
  extractMainSections(navigation) {
    const sections = [];

    // Get main sections
    if (navigation.main_sections && Array.isArray(navigation.main_sections)) {
      sections.push(...navigation.main_sections);
    }

    // Also get dropdown menus as they often contain main categories
    if (navigation.dropdown_menus) {
      Object.values(navigation.dropdown_menus).forEach(dropdown => {
        if (dropdown.items && Array.isArray(dropdown.items)) {
          dropdown.items.forEach(item => {
            // Mark that this came from a dropdown
            sections.push({
              ...item,
              has_dropdown: true,
              dropdown_items: dropdown.items
            });
          });
        }
      });
    }

    // Deduplicate by URL
    const seen = new Set();
    return sections.filter(section => {
      const key = section.url || section.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Determine if we should explore this navigation item
   */
  shouldExplore(item) {
    if (!item.name && !item.text) return false;
    
    const text = (item.name || item.text).toLowerCase();
    
    // Priority categories for e-commerce
    const priorityTerms = [
      'women', 'men', 'kids', 'baby', 'girls', 'boys',
      'clothing', 'shoes', 'accessories', 'home', 'beauty',
      'jewelry', 'handbags', 'furniture', 'electronics'
    ];
    
    return priorityTerms.some(term => text.includes(term));
  }

  /**
   * Determine if we should visit this URL
   */
  shouldVisitUrl(url) {
    if (!url || url === '#') return false;
    
    // Skip external URLs
    if (url.includes('facebook.com') || 
        url.includes('twitter.com') || 
        url.includes('instagram.com')) {
      return false;
    }
    
    // Skip non-navigation URLs
    const skipPatterns = [
      '/account', '/signin', '/login', '/cart', '/checkout',
      '/help', '/customer-service', '/privacy', '/terms'
    ];
    
    return !skipPatterns.some(pattern => url.includes(pattern));
  }

  /**
   * Normalize URL for comparison
   */
  normalizeUrl(url, baseUrl) {
    if (!url) return null;
    if (url === '#') return null;
    
    try {
      // Handle relative URLs
      if (url.startsWith('/')) {
        const base = new URL(baseUrl);
        return `${base.origin}${url}`;
      }
      
      // Already absolute
      if (url.startsWith('http')) {
        return url;
      }
      
      // Relative path
      return new URL(url, baseUrl).href;
    } catch {
      return url;
    }
  }

  /**
   * Classify node type based on depth and content
   */
  classifyNodeType(item, depth) {
    if (depth === 1) return 'main_category';
    if (depth === 2) return 'subcategory';
    if (depth === 3) return 'sub_subcategory';
    return 'deep_category';
  }

  /**
   * Count total nodes in tree
   */
  countNodes(node) {
    let count = 1;
    if (node.children) {
      node.children.forEach(child => {
        count += this.countNodes(child);
      });
    }
    return count;
  }

  /**
   * Get maximum depth of tree
   */
  getMaxDepth(node) {
    if (!node.children || node.children.length === 0) {
      return node.depth;
    }
    
    let maxChildDepth = node.depth;
    node.children.forEach(child => {
      maxChildDepth = Math.max(maxChildDepth, this.getMaxDepth(child));
    });
    
    return maxChildDepth;
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * Pretty print the navigation tree
   */
  printTree(node, indent = '') {
    console.log(`${indent}${node.name} (${node.type}) - ${node.children.length} children`);
    if (node.children) {
      node.children.forEach(child => {
        this.printTree(child, indent + '  ');
      });
    }
  }
}

module.exports = NavigationTreeBuilder;