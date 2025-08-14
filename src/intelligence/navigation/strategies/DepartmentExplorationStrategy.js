/**
 * DepartmentExplorationStrategy.js
 * 
 * Navigates to main department pages to discover deeper navigation
 * Extracts subcategories, sidebar navigation, and builds complete hierarchy
 * Essential for sites like Macy's and Gap where full navigation requires exploration
 */

const NavigationStrategy = require('../NavigationStrategy');

class DepartmentExplorationStrategy extends NavigationStrategy {
  constructor(logger, options = {}) {
    super(logger, options);
    this.name = 'DepartmentExplorationStrategy';
    this.maxDepartments = options.maxDepartments || 5; // Limit to prevent excessive navigation
    this.browser = null;
  }

  /**
   * Execute strategy - navigate to departments for deep discovery
   */
  async execute(page) {
    return await this.measureExecution(async () => {
      try {
        // First, find main department links
        const departments = await this.findMainDepartments(page);
        
        if (departments.length === 0) {
          this.logger.info(`${this.name}: No department links found`);
          return {
            items: [],
            confidence: 0,
            metadata: {
              strategy: this.name,
              departmentsExplored: 0
            }
          };
        }

        this.logger.info(`${this.name}: Found ${departments.length} departments to explore`);
        
        // Explore each department (limited by maxDepartments)
        const allItems = [];
        const departmentsToExplore = departments.slice(0, this.maxDepartments);
        
        for (const dept of departmentsToExplore) {
          try {
            this.logger.debug(`Exploring department: ${dept.name}`);
            const deptItems = await this.exploreDepartment(page, dept);
            
            // Add department info to each item
            deptItems.forEach(item => {
              item.parent_department = dept.name;
              item.department_url = dept.url;
              allItems.push(item);
            });
            
            this.logger.debug(`Found ${deptItems.length} items in ${dept.name}`);
          } catch (error) {
            this.logger.warn(`Failed to explore ${dept.name}: ${error.message}`);
          }
        }

        // Calculate confidence based on discovery success
        const confidence = this.calculateStrategyConfidence(allItems, departments);

        this.logResults(allItems, confidence, this.performanceMetrics.executionTime);

        return {
          items: allItems,
          confidence: confidence,
          metadata: {
            strategy: this.name,
            departmentsFound: departments.length,
            departmentsExplored: departmentsToExplore.length,
            totalItemsDiscovered: allItems.length
          }
        };

      } catch (error) {
        this.logger.error(`${this.name} failed: ${error.message}`);
        return {
          items: [],
          confidence: 0,
          metadata: {
            error: error.message,
            strategy: this.name
          }
        };
      }
    });
  }

  /**
   * Find main department links on the page
   */
  async findMainDepartments(page) {
    return await page.evaluate(() => {
      const departments = [];
      const processed = new Set();
      
      // Department patterns
      const deptPatterns = [
        /^(Women|Men|Girls|Boys|Baby|Kids|Home|Beauty|Shoes|Jewelry|Handbags|Plus|Petite)/i,
        /^(Electronics|Toys|Sports|Books|Music|Movies|Games|Garden|Tools|Auto)/i
      ];
      
      // Selectors for department links
      const selectors = [
        'nav a',
        'header a',
        '[role="navigation"] a',
        '.main-nav a',
        '.primary-nav a',
        '#mainNavigation a',
        'a[href*="/shop/"]',
        'a[href*="/browse/"]',
        'a[href*="/category"]',
        'a[class*="department"]'
      ];
      
      selectors.forEach(selector => {
        try {
          const links = document.querySelectorAll(selector);
          links.forEach(link => {
            const text = link.textContent.trim();
            const url = link.href;
            
            if (!text || !url || processed.has(url)) return;
            
            // Check if this looks like a department
            const isDepartment = deptPatterns.some(pattern => pattern.test(text));
            
            if (isDepartment && !url.includes('javascript:')) {
              processed.add(url);
              departments.push({
                name: text,
                url: url,
                selector: link.id ? `#${link.id}` : 
                         link.className ? `.${link.className.split(' ')[0]}` : 'a'
              });
            }
          });
        } catch (e) {
          // Continue with next selector
        }
      });
      
      return departments;
    });
  }

  /**
   * Navigate to a department page and extract navigation
   */
  async exploreDepartment(page, dept) {
    const items = [];
    const currentUrl = page.url();
    
    try {
      // Navigate to department page
      await page.goto(dept.url, { 
        waitUntil: 'networkidle',
        timeout: 15000 
      });
      
      // Wait for content to load
      await page.waitForTimeout(2000);
      
      // Extract navigation from department page
      const deptNavigation = await page.evaluate(() => {
        const navItems = [];
        const processed = new Set();
        
        // Look for subcategory navigation
        const selectors = [
          // Sidebar navigation
          '.sidebar a',
          '.left-nav a',
          '.facet a',
          '.filter a',
          '[class*="sidebar"] a',
          '[class*="facet"] a',
          '[class*="filter"] a',
          
          // Category lists
          '.category-list a',
          '.subcategory a',
          '[class*="category"] a',
          '[class*="subcategory"] a',
          
          // Breadcrumb siblings
          '.breadcrumb ~ * a',
          
          // Common patterns
          'aside a',
          '.refinement a',
          '.navigation-list a'
        ];
        
        selectors.forEach(selector => {
          try {
            const links = document.querySelectorAll(selector);
            links.forEach(link => {
              const text = link.textContent.trim();
              const url = link.href;
              
              if (text && url && !processed.has(url)) {
                // Skip utility links
                const skipPatterns = ['view all', 'see all', 'clear', 'reset', 'apply'];
                const shouldSkip = skipPatterns.some(p => text.toLowerCase().includes(p));
                
                if (!shouldSkip && !url.includes('javascript:')) {
                  processed.add(url);
                  navItems.push({
                    text: text,
                    name: text,
                    url: url,
                    type: 'subcategory',
                    element_type: 'a',
                    discovered_via: 'department_exploration'
                  });
                }
              }
            });
          } catch (e) {
            // Continue with next selector
          }
        });
        
        return navItems;
      });
      
      // Add discovered items
      deptNavigation.forEach(item => items.push(item));
      
      // Navigate back to original page
      await page.goto(currentUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });
      
    } catch (error) {
      this.logger.debug(`Error exploring ${dept.name}: ${error.message}`);
      // Try to return to original page
      try {
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      } catch (e) {
        // Page might be in unstable state
      }
    }
    
    return items;
  }

  /**
   * Calculate confidence for department exploration
   */
  calculateStrategyConfidence(items, departments) {
    let confidence = 0.5; // Base confidence
    
    // Higher confidence if we found departments
    if (departments.length > 0) confidence += 0.2;
    
    // Higher confidence based on items discovered
    if (items.length > 50) confidence += 0.3;
    else if (items.length > 20) confidence += 0.2;
    else if (items.length > 10) confidence += 0.1;
    
    // Higher confidence if we have good department coverage
    const itemsPerDept = items.length / Math.max(1, departments.length);
    if (itemsPerDept > 10) confidence += 0.1;
    
    return Math.min(1, confidence);
  }
}

module.exports = DepartmentExplorationStrategy;