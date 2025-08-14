/**
 * NavigationDebugger.js
 * 
 * Diagnostic tool to analyze navigation extraction quality
 * Aligns with UNIVERSAL_SCRAPER_CLAUDE.md requirements for site structure understanding
 * 
 * Purpose:
 * - Debug current navigation extraction capabilities
 * - Identify what we're finding vs what we're missing
 * - Test dropdown/mega-menu detection
 * - Validate against expected site structure
 */

const { chromium } = require('playwright');
const NavigationMapper = require('./NavigationMapper');
const fs = require('fs').promises;
const path = require('path');

class NavigationDebugger {
  constructor(logger) {
    this.logger = logger || console;
    this.browser = null;
    this.debugData = {
      timestamp: new Date().toISOString(),
      url: null,
      findings: {
        current_extraction: null,
        actual_navigation: null,
        missing_elements: [],
        dropdown_analysis: [],
        recommendations: []
      },
      metrics: {
        sections_found: 0,
        sections_expected: 0,
        dropdowns_detected: 0,
        dropdowns_actual: 0,
        extraction_completeness: 0
      }
    };
  }

  async initialize() {
    this.browser = await chromium.launch({
      headless: false, // Run with UI for debugging
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      devtools: true
    });
    this.logger.info('🔍 NavigationDebugger initialized with visual browser');
  }

  /**
   * Main debug method - analyzes navigation extraction quality
   */
  async debugNavigation(url, options = {}) {
    const {
      saveReport = true,
      outputDir = './debug-reports',
      compareWithActual = true
    } = options;

    this.debugData.url = url;
    const domain = new URL(url).hostname;

    this.logger.info('=' .repeat(60));
    this.logger.info(`🔍 NAVIGATION DEBUG SESSION: ${domain}`);
    this.logger.info('=' .repeat(60));

    try {
      // Step 1: Run current NavigationMapper
      this.logger.info('\n📊 Step 1: Testing Current NavigationMapper...');
      const currentExtraction = await this.runCurrentNavigationMapper(url);
      this.debugData.findings.current_extraction = currentExtraction;
      
      // Step 2: Manually inspect actual navigation
      if (compareWithActual) {
        this.logger.info('\n🔎 Step 2: Analyzing Actual Site Navigation...');
        const actualNavigation = await this.analyzeActualNavigation(url);
        this.debugData.findings.actual_navigation = actualNavigation;
      }

      // Step 3: Analyze dropdowns and mega-menus
      this.logger.info('\n📋 Step 3: Detecting Dropdown/Mega-menu Elements...');
      const dropdownAnalysis = await this.analyzeDropdownElements(url);
      this.debugData.findings.dropdown_analysis = dropdownAnalysis;

      // Step 4: Compare and identify gaps
      this.logger.info('\n⚖️ Step 4: Comparing Extracted vs Actual...');
      this.compareResults();

      // Step 5: Generate recommendations
      this.logger.info('\n💡 Step 5: Generating Recommendations...');
      this.generateRecommendations();

      // Print summary
      this.printDebugSummary();

      // Save detailed report
      if (saveReport) {
        await this.saveDebugReport(outputDir, domain);
      }

      return this.debugData;

    } catch (error) {
      this.logger.error('❌ Navigation debug failed:', error);
      throw error;
    }
  }

  /**
   * Run the current NavigationMapper to see what it extracts
   */
  async runCurrentNavigationMapper(url) {
    // Create a mock WorldModel to avoid null reference
    const mockWorldModel = {
      storeSiteNavigation: async () => {}, // No-op for testing
    };
    
    const mapper = new NavigationMapper(this.logger, mockWorldModel);
    
    try {
      await mapper.initialize();
      const startTime = Date.now();
      const result = await mapper.mapSiteNavigation(url);
      const duration = Date.now() - startTime;

      this.logger.info(`  ✅ NavigationMapper completed in ${duration}ms`);
      this.logger.info(`  📁 Main sections found: ${result.main_sections?.length || 0}`);
      this.logger.info(`  📂 Dropdowns found: ${Object.keys(result.dropdown_menus || {}).length}`);
      
      // Log section names
      if (result.main_sections?.length > 0) {
        this.logger.info('  📍 Sections discovered:');
        result.main_sections.slice(0, 10).forEach(section => {
          this.logger.info(`     - ${section.name} ${section.has_dropdown ? '▼' : ''}`);
        });
        if (result.main_sections.length > 10) {
          this.logger.info(`     ... and ${result.main_sections.length - 10} more`);
        }
      }

      await mapper.close();
      return result;

    } catch (error) {
      this.logger.error('  ❌ NavigationMapper error:', error.message);
      await mapper.close();
      return { error: error.message };
    }
  }

  /**
   * Manually analyze the actual navigation structure
   */
  async analyzeActualNavigation(url) {
    const context = await this.browser.newContext();
    const page = await context.newPage();

    try {
      // Use domcontentloaded instead of networkidle for Gap.com (faster and more reliable)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      const actualNav = await page.evaluate(() => {
        const analysis = {
          main_navigation: [],
          mega_menus: [],
          mobile_menu: null,
          total_links: 0,
          navigation_patterns: []
        };

        // Find all possible navigation containers
        const navSelectors = [
          'nav', 'header nav', '.navigation', '.main-nav', '.header-nav',
          '[role="navigation"]', '.navbar', '.menu', '.main-menu'
        ];

        navSelectors.forEach(selector => {
          const nav = document.querySelector(selector);
          if (nav) {
            analysis.navigation_patterns.push({
              selector,
              found: true,
              link_count: nav.querySelectorAll('a').length
            });
          }
        });

        // Analyze main navigation items
        const mainNavItems = document.querySelectorAll('nav a, .navigation a, [role="navigation"] a');
        const uniqueLinks = new Set();
        
        mainNavItems.forEach(link => {
          const text = link.textContent.trim();
          const href = link.href;
          
          if (text && href && !uniqueLinks.has(href)) {
            uniqueLinks.add(href);
            
            // Check if this item likely has a dropdown
            const parent = link.closest('li, .nav-item');
            const hasDropdownIndicator = 
              parent?.querySelector('.dropdown, .submenu, .mega-menu') ||
              parent?.querySelector('[class*="arrow"], [class*="caret"], [class*="chevron"]') ||
              link.querySelector('[class*="arrow"], [class*="caret"], [class*="chevron"]');

            analysis.main_navigation.push({
              text,
              href,
              likely_has_dropdown: !!hasDropdownIndicator,
              parent_classes: parent?.className || '',
              aria_expanded: link.getAttribute('aria-expanded'),
              data_attributes: Array.from(link.attributes)
                .filter(attr => attr.name.startsWith('data-'))
                .map(attr => ({ name: attr.name, value: attr.value }))
            });
          }
        });

        // Look for mega-menu containers
        const megaMenuSelectors = [
          '.mega-menu', '.megamenu', '[class*="mega"]', '.dropdown-menu',
          '.submenu', '.sub-menu', '[class*="dropdown"]'
        ];

        megaMenuSelectors.forEach(selector => {
          const menus = document.querySelectorAll(selector);
          menus.forEach(menu => {
            const links = menu.querySelectorAll('a');
            if (links.length > 0) {
              analysis.mega_menus.push({
                selector,
                link_count: links.length,
                is_visible: window.getComputedStyle(menu).display !== 'none',
                categories: Array.from(links).slice(0, 5).map(l => l.textContent.trim())
              });
            }
          });
        });

        // Check for mobile menu
        const mobileMenuButton = document.querySelector('[class*="burger"], [class*="mobile-menu"], [class*="hamburger"]');
        if (mobileMenuButton) {
          analysis.mobile_menu = {
            found: true,
            selector: mobileMenuButton.className || mobileMenuButton.id || 'unknown'
          };
        }

        analysis.total_links = uniqueLinks.size;
        return analysis;
      });

      this.logger.info(`  ✅ Found ${actualNav.total_links} unique navigation links`);
      this.logger.info(`  📊 Main navigation items: ${actualNav.main_navigation.length}`);
      this.logger.info(`  🎯 Mega-menu containers: ${actualNav.mega_menus.length}`);
      
      await context.close();
      return actualNav;

    } catch (error) {
      this.logger.error('  ❌ Actual navigation analysis failed:', error.message);
      await context.close();
      throw error;
    }
  }

  /**
   * Specifically analyze dropdown and mega-menu elements
   */
  async analyzeDropdownElements(url) {
    const context = await this.browser.newContext();
    const page = await context.newPage();

    try {
      // Use domcontentloaded for consistency
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Try hovering over main nav items to reveal dropdowns
      const dropdownAnalysis = await page.evaluate(async () => {
        const analysis = {
          hover_reveals: [],
          click_reveals: [],
          always_visible: [],
          dropdown_triggers: []
        };

        // Helper to check element visibility
        const isVisible = (el) => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 style.opacity !== '0';
        };

        // Find potential dropdown triggers
        const triggers = document.querySelectorAll('nav li, .nav-item, [class*="nav"] > *');
        
        for (const trigger of triggers) {
          const link = trigger.querySelector('a');
          if (!link) continue;

          const triggerText = link.textContent.trim();
          
          // Look for associated dropdown content
          const dropdownSelectors = [
            '.dropdown', '.mega-menu', '.submenu', 
            '[class*="dropdown"]', '[class*="menu"]'
          ];
          
          let dropdown = null;
          for (const selector of dropdownSelectors) {
            dropdown = trigger.querySelector(selector);
            if (dropdown) break;
          }

          if (dropdown) {
            analysis.dropdown_triggers.push({
              trigger_text: triggerText,
              initially_visible: isVisible(dropdown),
              dropdown_selector: dropdown.className,
              link_count: dropdown.querySelectorAll('a').length
            });
          }
        }

        return analysis;
      });

      // Now try hovering to see what reveals
      this.logger.info('  🖱️ Testing hover interactions...');
      const hoverResults = await this.testHoverInteractions(page);
      dropdownAnalysis.hover_reveals = hoverResults;

      await context.close();
      return dropdownAnalysis;

    } catch (error) {
      this.logger.error('  ❌ Dropdown analysis failed:', error.message);
      await context.close();
      throw error;
    }
  }

  /**
   * Test hover interactions to reveal hidden menus
   */
  async testHoverInteractions(page) {
    const hoverResults = [];

    try {
      // Get main navigation items
      const navItems = await page.$$('nav > ul > li, nav [class*="item"]');
      
      for (let i = 0; i < Math.min(navItems.length, 10); i++) {
        const item = navItems[i];
        
        // Get text before hover
        const linkText = await item.$eval('a', el => el.textContent.trim()).catch(() => 'unknown');
        
        // Count visible dropdowns before hover
        const beforeCount = await page.evaluate(() => 
          document.querySelectorAll('.dropdown:not([style*="none"]), .mega-menu:not([style*="none"])').length
        );
        
        // Hover over the item
        await item.hover();
        await page.waitForTimeout(500);
        
        // Count visible dropdowns after hover
        const afterCount = await page.evaluate(() => 
          document.querySelectorAll('.dropdown:not([style*="none"]), .mega-menu:not([style*="none"])').length
        );
        
        if (afterCount > beforeCount) {
          hoverResults.push({
            trigger: linkText,
            revealed_elements: afterCount - beforeCount,
            hover_success: true
          });
          this.logger.info(`    ✅ Hover on "${linkText}" revealed ${afterCount - beforeCount} element(s)`);
        }
      }
    } catch (error) {
      this.logger.warn('    ⚠️ Hover test error:', error.message);
    }

    return hoverResults;
  }

  /**
   * Compare extracted vs actual navigation
   */
  compareResults() {
    const current = this.debugData.findings.current_extraction;
    const actual = this.debugData.findings.actual_navigation;

    if (!current || !actual) return;

    // Calculate metrics
    this.debugData.metrics.sections_found = current.main_sections?.length || 0;
    this.debugData.metrics.sections_expected = actual.main_navigation?.length || 0;
    this.debugData.metrics.dropdowns_detected = current.main_sections?.filter(s => s.has_dropdown).length || 0;
    this.debugData.metrics.dropdowns_actual = actual.main_navigation?.filter(s => s.likely_has_dropdown).length || 0;

    // Calculate completeness
    if (this.debugData.metrics.sections_expected > 0) {
      this.debugData.metrics.extraction_completeness = 
        (this.debugData.metrics.sections_found / this.debugData.metrics.sections_expected) * 100;
    }

    // Identify missing elements
    const extractedUrls = new Set(current.main_sections?.map(s => s.url) || []);
    const missing = actual.main_navigation?.filter(nav => !extractedUrls.has(nav.href)) || [];
    
    this.debugData.findings.missing_elements = missing.map(m => ({
      text: m.text,
      href: m.href,
      likely_has_dropdown: m.likely_has_dropdown
    }));
  }

  /**
   * Generate recommendations based on findings
   */
  generateRecommendations() {
    const recommendations = [];
    const metrics = this.debugData.metrics;

    // Check extraction completeness
    if (metrics.extraction_completeness < 50) {
      recommendations.push({
        priority: 'HIGH',
        issue: 'Low navigation extraction rate',
        suggestion: 'NavigationMapper may need different selectors or wait strategies'
      });
    }

    // Check dropdown detection
    if (metrics.dropdowns_detected < metrics.dropdowns_actual) {
      recommendations.push({
        priority: 'HIGH', 
        issue: `Missing dropdown detection (${metrics.dropdowns_detected}/${metrics.dropdowns_actual})`,
        suggestion: 'Implement hover/click interactions to reveal hidden menus'
      });
    }

    // Check for mega-menus
    const megaMenus = this.debugData.findings.actual_navigation?.mega_menus || [];
    if (megaMenus.length > 0 && !this.debugData.findings.current_extraction?.dropdown_menus) {
      recommendations.push({
        priority: 'HIGH',
        issue: 'Mega-menu containers not being extracted',
        suggestion: 'Add mega-menu specific selectors and interaction handlers'
      });
    }

    // Check hover reveals
    const hoverReveals = this.debugData.findings.dropdown_analysis?.hover_reveals || [];
    if (hoverReveals.length > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        issue: `${hoverReveals.length} menus require hover interaction`,
        suggestion: 'Implement HoverNavigationExtractor for complete discovery'
      });
    }

    this.debugData.findings.recommendations = recommendations;
  }

  /**
   * Print debug summary to console
   */
  printDebugSummary() {
    this.logger.info('\n' + '=' .repeat(60));
    this.logger.info('📊 NAVIGATION DEBUG SUMMARY');
    this.logger.info('=' .repeat(60));

    const metrics = this.debugData.metrics;
    
    this.logger.info('\n📈 Extraction Metrics:');
    this.logger.info(`  • Sections Found: ${metrics.sections_found}/${metrics.sections_expected}`);
    this.logger.info(`  • Completeness: ${metrics.extraction_completeness.toFixed(1)}%`);
    this.logger.info(`  • Dropdowns Detected: ${metrics.dropdowns_detected}/${metrics.dropdowns_actual}`);

    if (this.debugData.findings.missing_elements.length > 0) {
      this.logger.info('\n⚠️ Missing Navigation Elements:');
      this.debugData.findings.missing_elements.slice(0, 5).forEach(missing => {
        this.logger.info(`  • ${missing.text} ${missing.likely_has_dropdown ? '(has dropdown)' : ''}`);
      });
      if (this.debugData.findings.missing_elements.length > 5) {
        this.logger.info(`  ... and ${this.debugData.findings.missing_elements.length - 5} more`);
      }
    }

    if (this.debugData.findings.recommendations.length > 0) {
      this.logger.info('\n💡 Recommendations:');
      this.debugData.findings.recommendations.forEach(rec => {
        this.logger.info(`  [${rec.priority}] ${rec.issue}`);
        this.logger.info(`    → ${rec.suggestion}`);
      });
    }

    this.logger.info('\n' + '=' .repeat(60));
  }

  /**
   * Save detailed debug report to file
   */
  async saveDebugReport(outputDir, domain) {
    try {
      await fs.mkdir(outputDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `navigation-debug-${domain}-${timestamp}.json`;
      const filepath = path.join(outputDir, filename);

      await fs.writeFile(filepath, JSON.stringify(this.debugData, null, 2));
      
      this.logger.info(`\n💾 Debug report saved to: ${filepath}`);
    } catch (error) {
      this.logger.error('Failed to save debug report:', error.message);
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.logger.info('NavigationDebugger closed');
    }
  }
}

module.exports = NavigationDebugger;