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

class NavigationTreeBuilder {
  constructor(logger) {
    this.logger = logger;
    this.visitedUrls = new Set();
    this.maxDepth = 4; // Maximum tree depth to prevent infinite recursion
    this.maxBranchWidth = 20; // Max items per level to explore
    this.browser = null;
    this.context = null;
  }

  /**
   * Build complete navigation tree from initial navigation data
   */
  async buildNavigationTree(baseUrl, initialNavigation, options = {}) {
    const startTime = Date.now();
    this.logger.info('🌳 Building hierarchical navigation tree', { baseUrl });

    // Reset state
    this.visitedUrls.clear();
    this.maxDepth = options.maxDepth || 4;
    this.maxBranchWidth = options.maxBranchWidth || 20;

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
      this.logger.info(`✅ Navigation tree built in ${duration}ms`, {
        total_nodes: tree.metadata.total_items,
        max_depth: tree.metadata.max_depth_reached,
        main_categories: tree.children.length
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
    // Otherwise, visit the URL to discover children
    else if (itemUrl && itemUrl !== '#' && this.shouldVisitUrl(itemUrl)) {
      try {
        const children = await this.discoverChildren(itemUrl, depth);
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

    return node;
  }

  /**
   * Discover child navigation by visiting a URL
   */
  async discoverChildren(url, currentDepth) {
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

      return children;

    } catch (error) {
      this.logger.debug(`Failed to discover children for ${url}: ${error.message}`);
      return [];
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