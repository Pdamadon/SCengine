/**
 * CategoryTreeBuilder - Pure navigation discovery using breadth-first traversal
 * 
 * Focuses solely on building complete category hierarchies without product discovery.
 * Uses BFS with priority queue to map site structure efficiently.
 * 
 * Key Features:
 * - Breadth-first traversal for complete category mapping
 * - Priority queue (main categories first)
 * - Memory management for large sites
 * - Persistent storage of hierarchical relationships
 * - No product discovery (handled separately by ProductDiscoveryOrchestrator)
 */

const { chromium } = require('playwright');

class CategoryTreeBuilder {
  constructor(logger, options = {}) {
    this.logger = logger;
    this.visitedUrls = new Set();
    
    // Configuration
    this.maxDepth = options.maxDepth || 4;
    this.maxTotalCategories = options.maxTotalCategories || 1000;
    this.maxCategoriesPerLevel = options.maxCategoriesPerLevel || 50;
    this.memoryFlushThreshold = options.memoryFlushThreshold || 200;
    this.requestDelay = options.requestDelay || 1000;
    
    // BFS Queue with priority support
    this.discoveryQueue = [];
    this.processedCount = 0;
    
    // Browser management
    this.browser = null;
    this.context = null;
    
    // Statistics
    this.stats = {
      totalCategories: 0,
      mainCategories: 0,
      subcategories: 0,
      deepCategories: 0,
      skippedDuplicates: 0,
      failedVisits: 0,
      startTime: null
    };
  }

  /**
   * Build complete category tree using breadth-first traversal
   */
  async buildCategoryTree(baseUrl, initialNavigation, options = {}) {
    const startTime = Date.now();
    this.logger.info('🌳 Building category tree with breadth-first traversal', { baseUrl });

    // Reset state
    this.visitedUrls.clear();
    this.discoveryQueue = [];
    this.processedCount = 0;
    this.stats = {
      totalCategories: 0,
      mainCategories: 0,
      subcategories: 0,
      deepCategories: 0,
      skippedDuplicates: 0,
      failedVisits: 0,
      startTime: startTime
    };

    try {
      // Initialize browser
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

      // Create root tree structure
      const tree = {
        url: baseUrl,
        name: 'Root',
        type: 'root',
        depth: 0,
        children: [],
        metadata: {
          discovered_at: new Date().toISOString(),
          discovery_method: 'category_tree_builder',
          total_categories: 0,
          max_depth_reached: 0
        }
      };

      // Extract and queue main sections with priority
      const mainSections = this.extractMainSections(initialNavigation);
      this.logger.info(`Found ${mainSections.length} main sections to explore`);

      // Initialize BFS queue with main sections (highest priority)
      mainSections.forEach((section, index) => {
        if (this.shouldExplore(section)) {
          this.queueCategory({
            item: section,
            depth: 1,
            priority: 1, // Highest priority for main categories
            parent: tree,
            baseUrl: baseUrl
          });
        }
      });

      // BFS traversal
      await this.processBFSQueue();

      // Compile final tree structure
      const duration = Date.now() - startTime;
      
      tree.metadata.total_categories = this.stats.totalCategories;
      tree.metadata.max_depth_reached = Math.max(...tree.children.map(c => this.getMaxDepth(c)));
      tree.metadata.discovery_stats = {
        main_categories: this.stats.mainCategories,
        subcategories: this.stats.subcategories,
        deep_categories: this.stats.deepCategories,
        skipped_duplicates: this.stats.skippedDuplicates,
        failed_visits: this.stats.failedVisits,
        discovery_time_ms: duration
      };

      this.logger.info(`✅ Category tree built in ${duration}ms`, {
        total_categories: this.stats.totalCategories,
        main_categories: this.stats.mainCategories,
        max_depth: tree.metadata.max_depth_reached
      });

      return tree;

    } catch (error) {
      this.logger.error('Failed to build category tree', { error: error.message });
      throw error;
    }
  }

  /**
   * Process BFS queue until complete or limits reached
   */
  async processBFSQueue() {
    this.logger.info(`🔄 Starting BFS processing with ${this.discoveryQueue.length} initial items`);

    while (this.discoveryQueue.length > 0 && this.stats.totalCategories < this.maxTotalCategories) {
      // Sort queue by priority (lower number = higher priority)
      this.discoveryQueue.sort((a, b) => a.priority - b.priority || a.depth - b.depth);
      
      // Get next item to process
      const queueItem = this.discoveryQueue.shift();
      const { item, depth, parent, baseUrl } = queueItem;

      try {
        // Create category node
        const categoryNode = await this.processCategory(item, depth, baseUrl);
        
        if (categoryNode) {
          // Add to parent
          parent.children = parent.children || [];
          parent.children.push(categoryNode);
          
          // Update statistics
          this.updateStats(depth);
          
          this.logger.debug(`📂 Processed: ${categoryNode.name} (depth ${depth})`);
          
          // Memory management - flush if threshold reached
          if (this.stats.totalCategories % this.memoryFlushThreshold === 0) {
            await this.memoryFlush();
          }
          
          // Rate limiting
          await this.delay(this.requestDelay);
        }

      } catch (error) {
        this.logger.warn(`Failed to process category ${item.name || item.text}: ${error.message}`);
        this.stats.failedVisits++;
      }

      this.processedCount++;
      
      // Progress logging
      if (this.processedCount % 10 === 0) {
        this.logger.info(`Progress: ${this.processedCount} processed, ${this.discoveryQueue.length} queued, ${this.stats.totalCategories} categories found`);
      }
    }

    this.logger.info(`🏁 BFS processing complete. Total categories: ${this.stats.totalCategories}`);
  }

  /**
   * Process a single category and discover its children
   */
  async processCategory(item, depth, baseUrl) {
    // Check depth limit
    if (depth > this.maxDepth) {
      this.logger.debug(`Max depth ${this.maxDepth} reached for ${item.name || item.text}`);
      return null;
    }

    // Check if already visited
    const itemUrl = this.normalizeUrl(item.url, baseUrl);
    if (!itemUrl || this.visitedUrls.has(itemUrl)) {
      this.stats.skippedDuplicates++;
      return null;
    }

    this.visitedUrls.add(itemUrl);

    // Create category node
    const categoryNode = {
      name: item.name || item.text,
      url: itemUrl,
      type: this.classifyNodeType(depth),
      depth: depth,
      selector: item.selector,
      children: [],
      metadata: {
        discovered_at: new Date().toISOString(),
        discovery_method: 'category_tree_builder',
        has_dropdown: item.has_dropdown || false
      }
    };

    // Process dropdown children first (already discovered)
    if (item.has_dropdown && item.dropdown_items) {
      this.logger.debug(`Processing dropdown for ${categoryNode.name} with ${item.dropdown_items.length} items`);
      
      item.dropdown_items.forEach(childItem => {
        if (this.shouldExplore(childItem)) {
          this.queueCategory({
            item: childItem,
            depth: depth + 1,
            priority: depth + 1, // Lower priority for deeper items
            parent: categoryNode,
            baseUrl: baseUrl
          });
        }
      });
    }
    // Otherwise, visit URL to discover children
    else if (itemUrl && itemUrl !== '#' && this.shouldVisitUrl(itemUrl)) {
      const children = await this.discoverChildren(itemUrl);
      
      // Queue children for BFS processing
      children.forEach(child => {
        if (this.shouldExplore(child)) {
          this.queueCategory({
            item: child,
            depth: depth + 1,
            priority: depth + 1,
            parent: categoryNode,
            baseUrl: baseUrl
          });
        }
      });
    }

    return categoryNode;
  }

  /**
   * Discover child categories by visiting a URL
   */
  async discoverChildren(url) {
    const page = await this.context.newPage();
    
    try {
      this.logger.debug(`Visiting ${url} to discover child categories`);
      
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 15000 
      });
      
      await page.waitForTimeout(2000); // Let page settle

      // Extract navigation from this page
      const children = await page.evaluate(() => {
        const items = [];
        const processed = new Set();

        // Look for subcategory navigation with enhanced selectors
        const selectors = [
          // Sidebar navigation
          '.sidebar nav a',
          '.sidebar a[href]',
          '[class*="sidebar"] a',
          'aside nav a',
          'aside a[href]',
          
          // Category-specific navigation
          '.category-nav a',
          '.subcategory-list a',
          '.category-menu a',
          '[class*="category"] a',
          
          // Filter/refinement navigation
          '.refinement a',
          '.filter-options a',
          '[class*="filter"] a',
          '[class*="refine"] a',
          
          // Left navigation
          '.left-nav a',
          '.left-navigation a',
          '[class*="left-nav"] a',
          
          // Generic navigation patterns
          'nav.secondary a',
          '.nav-secondary a',
          '.subnav a'
        ];

        selectors.forEach(selector => {
          try {
            const links = document.querySelectorAll(selector);
            links.forEach(link => {
              const text = link.textContent?.trim();
              const href = link.href;
              
              if (text && href && !processed.has(href)) {
                processed.add(href);
                
                // Enhanced filtering for non-navigation items
                const skipPatterns = [
                  'sign in', 'sign up', 'log in', 'login', 'register',
                  'cart', 'bag', 'checkout', 'wishlist',
                  'help', 'support', 'contact', 'about',
                  'account', 'profile', 'settings',
                  'facebook', 'twitter', 'instagram', 'pinterest',
                  'privacy', 'terms', 'cookies', 'policy',
                  'store locator', 'gift card', 'email',
                  'download', 'app', 'mobile'
                ];
                
                const shouldSkip = skipPatterns.some(p => 
                  text.toLowerCase().includes(p)
                );
                
                // Also skip non-category URLs
                const urlSkipPatterns = [
                  'javascript:', '#', 'mailto:', 'tel:',
                  '/account', '/login', '/cart', '/help'
                ];
                
                const urlShouldSkip = urlSkipPatterns.some(p => 
                  href.toLowerCase().includes(p)
                );
                
                if (!shouldSkip && !urlShouldSkip && text.length > 1) {
                  items.push({
                    text: text,
                    name: text,
                    url: href,
                    selector: selector,
                    discovered_by: 'category_tree_builder'
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

      this.logger.debug(`Found ${children.length} child categories at ${url}`);
      return children;

    } catch (error) {
      this.logger.debug(`Failed to discover children for ${url}: ${error.message}`);
      return [];
    } finally {
      await page.close();
    }
  }

  /**
   * Add item to BFS queue with priority
   */
  queueCategory(queueItem) {
    // Avoid queueing duplicates
    const itemUrl = this.normalizeUrl(queueItem.item.url, queueItem.baseUrl);
    if (!itemUrl || this.visitedUrls.has(itemUrl)) {
      return;
    }

    // Check per-level limits
    const sameDepthItems = this.discoveryQueue.filter(qi => qi.depth === queueItem.depth);
    if (sameDepthItems.length >= this.maxCategoriesPerLevel) {
      this.logger.debug(`Skipping category at depth ${queueItem.depth} - level limit reached`);
      return;
    }

    this.discoveryQueue.push(queueItem);
  }

  /**
   * Memory management - can be extended to persist to disk/database
   */
  async memoryFlush() {
    this.logger.debug(`Memory flush at ${this.stats.totalCategories} categories`);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    // Could implement persistence here for very large sites
    // await this.persistIntermediateResults();
  }

  /**
   * Update statistics based on category depth
   */
  updateStats(depth) {
    this.stats.totalCategories++;
    
    if (depth === 1) {
      this.stats.mainCategories++;
    } else if (depth === 2) {
      this.stats.subcategories++;
    } else {
      this.stats.deepCategories++;
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

    // Enhanced clickable elements processing
    if (navigation.clickable_elements && Array.isArray(navigation.clickable_elements)) {
      const mainNavElements = navigation.clickable_elements.filter(el => 
        el.page_purpose === 'navigation' || 
        el.page_purpose === 'category' ||
        (el.selector && el.selector.includes('nav'))
      );
      sections.push(...mainNavElements);
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
    
    // Priority categories for e-commerce and general sites
    const priorityTerms = [
      // E-commerce categories
      'women', 'men', 'kids', 'baby', 'girls', 'boys',
      'clothing', 'shoes', 'accessories', 'home', 'beauty',
      'jewelry', 'handbags', 'furniture', 'electronics',
      'sports', 'outdoor', 'health', 'books', 'toys',
      
      // General site categories
      'products', 'services', 'solutions', 'industries',
      'categories', 'departments', 'collections',
      'new', 'sale', 'clearance', 'featured'
    ];
    
    // Also include items that look like categories
    const categoryPatterns = [
      /^[a-zA-Z\s&]{2,30}$/, // Simple text patterns
      /collection/i,
      /category/i,
      /department/i
    ];
    
    const matchesPriority = priorityTerms.some(term => text.includes(term));
    const matchesPattern = categoryPatterns.some(pattern => pattern.test(text));
    
    return matchesPriority || matchesPattern;
  }

  /**
   * Determine if we should visit this URL
   */
  shouldVisitUrl(url) {
    if (!url || url === '#') return false;
    
    // Skip external URLs
    if (url.includes('facebook.com') || 
        url.includes('twitter.com') || 
        url.includes('instagram.com') ||
        url.includes('youtube.com') ||
        url.includes('linkedin.com')) {
      return false;
    }
    
    // Skip non-navigation URLs
    const skipPatterns = [
      '/account', '/signin', '/login', '/cart', '/checkout',
      '/help', '/customer-service', '/privacy', '/terms',
      '/contact', '/about', '/store-locator', '/gift-card'
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
   * Classify node type based on depth
   */
  classifyNodeType(depth) {
    if (depth === 1) return 'main_category';
    if (depth === 2) return 'subcategory';
    if (depth === 3) return 'sub_subcategory';
    return 'deep_category';
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
   * Simple delay utility
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
   * Get discovery statistics
   */
  getStats() {
    return {
      ...this.stats,
      queue_size: this.discoveryQueue.length,
      visited_urls: this.visitedUrls.size,
      processed_count: this.processedCount
    };
  }
}

module.exports = CategoryTreeBuilder;