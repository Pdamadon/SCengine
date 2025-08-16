/**
 * AdaptiveNavigationStrategy.js
 * 
 * Enterprise-grade navigation discovery that scales to complex sites
 * Uses intelligent selector evolution with timed panel detection
 * Implements site-level inference and hint caching for performance
 */

const NavigationStrategy = require('../NavigationStrategy');

class AdaptiveNavigationStrategy extends NavigationStrategy {
  constructor(logger, options = {}) {
    super(logger, options);
    this.name = 'AdaptiveNavigationStrategy';
    this.hintCache = options.hintCache; // Redis cache instance
    this.maxSiteTime = options.maxSiteTime || 6000; // 6s budget per site
    this.maxTogglersToSample = options.maxTogglersToSample || 2; // For site-level inference
  }

  /**
   * Execute strategy - adaptive navigation discovery
   */
  async execute(page) {
    return await this.measureExecution(async () => {
      try {
        const url = page.url();
        const domain = new URL(url).hostname;
        
        this.logger.info(`🧭 Starting adaptive navigation discovery for ${domain}`);
        
        // Add human-like interaction for problematic sites
        await this.spoofHumanBehavior(page, domain);
        
        // Try to load cached hints first
        const hints = await this.loadHints(domain);
        
        // Check if this is a mobile-first site
        const mobileFirstSites = ['macys.com', 'homedepot.com', 'amazon.com', 'bestbuy.com'];
        const isMobileFirst = mobileFirstSites.some(site => domain.includes(site));
        
        if (isMobileFirst) {
          this.logger.info(`📱 Using mobile-first approach for ${domain}`);
          return await this.tryMobileFallback(page, hints);
        }
        
        // Phase 1: Header container discovery (desktop approach)
        const headerCandidates = await this.findHeaderContainers(page, hints);
        
        if (headerCandidates.length === 0) {
          this.logger.warn('No header containers found');
          return await this.emptyResult('no_header_containers', page);
        }

        // Phase 2: Test each header candidate
        for (const header of headerCandidates) {
          const result = await this.exploreHeaderCandidate(page, header, hints);
          
          if (result.items.length >= 5) { // Good enough threshold
            // Store successful hints for future runs
            await this.storeHints(domain, result.hints);
            
            this.logger.info(`✅ Adaptive navigation found: ${result.items.length} items (confidence: ${(result.confidence * 100).toFixed(1)}%)`);
            return result;
          }
        }

        // Fallback to mobile if desktop failed
        this.logger.info('Desktop failed, trying mobile viewport...');
        const mobileResult = await this.tryMobileFallback(page, hints);
        
        return mobileResult;
        
      } catch (error) {
        this.logger.error(`${this.name} failed: ${error.message}`);
        return await this.emptyResult(error.message, page);
      }
    });
  }

  /**
   * Spoof human-like behavior to bypass anti-bot detection
   */
  async spoofHumanBehavior(page, domain) {
    // List of domains that need human spoofing
    const problematicDomains = ['homedepot.com', 'walmart.com', 'bestbuy.com'];
    
    if (!problematicDomains.some(d => domain.includes(d))) {
      return; // Skip spoofing for non-problematic sites
    }
    
    this.logger.debug(`🤖 Spoofing human behavior for ${domain}`);
    
    try {
      // 0. Wait for DOM to be fully loaded
      this.logger.debug(`🤖 Waiting for DOM content to load...`);
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      
      // Wait a bit more for dynamic content
      await page.waitForTimeout(2000);
      
      // Check if page has actually loaded by looking for common elements
      const hasContent = await page.evaluate(() => {
        const links = document.querySelectorAll('a').length;
        const divs = document.querySelectorAll('div').length;
        return links > 5 && divs > 10; // Basic content check
      });
      
      if (!hasContent) {
        this.logger.debug(`🤖 Page appears to still be loading, waiting longer...`);
        await page.waitForTimeout(3000);
      }
      
      this.logger.debug(`🤖 DOM loaded, starting human behavior simulation...`);
      
      // 1. Random initial delay (humans don't act immediately)
      const initialDelay = 500 + Math.random() * 800; // 500-1300ms
      await page.waitForTimeout(initialDelay);
      
      // 2. Simulate realistic mouse movement
      const viewport = page.viewportSize();
      const startX = Math.random() * viewport.width;
      const startY = Math.random() * viewport.height;
      
      // Move mouse to random starting position
      await page.mouse.move(startX, startY);
      await page.waitForTimeout(100 + Math.random() * 200);
      
      // 3. Simulate reading behavior - scroll down a bit
      const scrollAmount = 200 + Math.random() * 400; // 200-600px
      await page.evaluate((amount) => {
        window.scrollBy({
          top: amount,
          behavior: 'smooth'
        });
      }, scrollAmount);
      
      // 4. Wait like a human reading
      await page.waitForTimeout(500 + Math.random() * 1000);
      
      // 5. Scroll back to top to find navigation
      await page.evaluate(() => {
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      });
      
      // 6. Final delay before starting analysis
      await page.waitForTimeout(300 + Math.random() * 500);
      
      // 7. Find and hover over clickable elements to trigger dynamic content
      const clickableElements = await page.evaluate(() => {
        const elements = [];
        const selectors = ['button', 'a', '[role="button"]', '.nav', '.menu'];
        
        for (const selector of selectors) {
          const found = document.querySelectorAll(selector);
          for (let i = 0; i < Math.min(found.length, 5); i++) {
            const el = found[i];
            const rect = el.getBoundingClientRect();
            if (rect.top <= 300 && rect.width > 0 && rect.height > 0) {
              elements.push({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                text: el.textContent.trim().substring(0, 30)
              });
            }
          }
        }
        return elements.slice(0, 3); // Top 3 elements
      });
      
      // Hover over clickable elements to trigger dynamic menus/content
      for (const element of clickableElements) {
        this.logger.debug(`🤖 Hovering over element: ${element.text}`);
        await page.mouse.move(element.x, element.y, { steps: 3 });
        await page.waitForTimeout(800 + Math.random() * 400); // Realistic hover time
        
        // Move away slightly to avoid triggering click handlers
        await page.mouse.move(element.x + 20, element.y + 10, { steps: 2 });
        await page.waitForTimeout(200 + Math.random() * 300);
      }
      
      // 8. Final position in header area
      const headerY = 50 + Math.random() * 100; // Top 150px
      const headerX = viewport.width * 0.3 + Math.random() * (viewport.width * 0.4); // Center area
      await page.mouse.move(headerX, headerY, { steps: 5 }); // Gradual movement
      
      this.logger.debug(`🤖 Human behavior simulation completed for ${domain} (hovered over ${clickableElements.length} elements)`);
      
    } catch (error) {
      this.logger.debug(`Human spoofing failed: ${error.message}`);
      // Continue anyway - spoofing is optional
    }
  }

  /**
   * Find header containers using explicit rule tiers
   */
  async findHeaderContainers(page, hints = {}) {
    return await page.evaluate((cachedHeaderHint) => {
      const containers = [];
      
      // Define validation and scoring functions in the page context
      const validateHeaderContainer = (element) => {
        const rect = element.getBoundingClientRect();
        
        // Gate rules (must pass all) - more permissive for enterprise sites
        const rules = [
          rect.top <= 300, // In top header region (expanded for enterprise sites)
          rect.width >= window.innerWidth * 0.2, // Spans decent width (further reduced)
          element.querySelectorAll('a, button').length >= 1, // Has interactive elements (very permissive)
          rect.height > 0 && rect.width > 0, // Visible
          !isDominatedByUtilityLinks(element) // Not utility zone
        ];
        
        return rules.every(rule => rule);
      };
      
      const isDominatedByUtilityLinks = (element) => {
        const utilityKeywords = [
          'sign in', 'login', 'account', 'cart', 'bag', 'checkout',
          'help', 'support', 'contact', 'store locator', 'gift card'
        ];
        
        const links = element.querySelectorAll('a');
        if (links.length === 0) return false;
        
        // For enterprise sites with many links, sample the first 20 for efficiency
        const linksToCheck = Array.from(links).slice(0, 20);
        
        const utilityCount = linksToCheck.filter(link => {
          const text = link.textContent.toLowerCase().trim();
          return utilityKeywords.some(keyword => text.includes(keyword));
        }).length;
        
        // Only exclude if majority of top links are utility (more lenient for enterprise)
        return utilityCount > linksToCheck.length * 0.8; // >80% utility = exclude
      };
      
      const scoreHeaderContainer = (element, rect) => {
        let score = 0;
        
        // Position scoring
        if (rect.top <= 100) score += 3;
        else if (rect.top <= 220) score += 2;
        
        // Width scoring  
        if (rect.width >= window.innerWidth * 0.8) score += 2;
        else if (rect.width >= window.innerWidth * 0.6) score += 1;
        
        // Link density scoring
        const links = element.querySelectorAll('a, button').length;
        if (links >= 8) score += 2;
        else if (links >= 5) score += 1;
        else if (links >= 2) score += 0.5; // Give some credit for minimal nav
        
        // Stickiness bonus
        const style = window.getComputedStyle(element);
        if (style.position === 'fixed' || style.position === 'sticky') {
          score += 1;
        }
        
        // ARIA hint (weak signal)
        if (element.getAttribute('role') === 'navigation') score += 1;
        
        // Class hints
        const className = element.className || '';
        if (className.includes('nav') || className.includes('header')) score += 0.5;
        
        return score;
      };
      
      // Try cached hint first
      if (cachedHeaderHint) {
        try {
          const cached = document.querySelector(cachedHeaderHint);
          if (cached && validateHeaderContainer(cached)) {
            containers.push({
              element: cached,
              selector: cachedHeaderHint,
              source: 'cache'
            });
            return containers; // Return early if cache hit
          }
        } catch (e) {
          // Cache hint failed, continue with discovery
        }
      }
      
      // Header discovery selectors (explicit rules) - enterprise patterns
      const headerSelectors = [
        'header',
        '.header',
        '#header',
        'nav[role="navigation"]',
        'nav',
        '.navigation',
        '.main-nav',
        '.primary-nav',
        '.site-nav',
        '.nav-menu', // glasswingshop specific
        '#nav-menu', // glasswingshop specific
        '#mobile-nav', // Macy's mobile navigation
        '.mobile-nav',
        '.mobile-navigation',
        
        // Enterprise patterns
        '[data-testid*="nav"]',
        '[data-testid*="header"]',
        '[class*="header"]',
        '[class*="navigation"]',
        '[class*="nav"]',
        '[class*="menu"]',
        '[class*="top-bar"]',
        '[class*="site-header"]',
        '[class*="global-nav"]',
        '[class*="main-navigation"]',
        '[class*="primary-navigation"]',
        
        // ID patterns
        '#navigation',
        '#nav',
        '#mainNav',
        '#primaryNav',
        '#siteNav',
        '#globalNav',
        '#nav-header',           // Macy's specific
        '#nav-header-root',      // Macy's specific
        '.navigation-rail',      // Macy's specific
        
        // ARIA and accessibility
        '[role="banner"] nav',
        '[role="banner"] [role="navigation"]',
        'nav[aria-label]',
        
        // Fallback - any container with many links in top area
        'div',
        'section'
      ];
      
      for (const selector of headerSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          
          for (const element of elements) {
            if (validateHeaderContainer(element)) {
              const rect = element.getBoundingClientRect();
              
              containers.push({
                element: element,
                selector: selector,
                source: 'discovery',
                bounds: {
                  top: rect.top,
                  width: rect.width,
                  height: rect.height
                },
                score: scoreHeaderContainer(element, rect)
              });
            }
          }
        } catch (e) {
          // Skip failed selectors
        }
      }
      
      // Sort by score (higher is better)
      containers.sort((a, b) => (b.score || 0) - (a.score || 0));
      
      return containers.slice(0, 3); // Top 3 candidates
      
    }, hints.headerSelector || null);
  }


  /**
   * Explore a header candidate for navigation items
   */
  async exploreHeaderCandidate(page, headerCandidate, hints) {
    this.logger.debug(`Exploring header: ${headerCandidate.selector}`);
    
    // Find togglers in this header
    const togglers = await this.findTogglers(page, headerCandidate, hints);
    
    if (togglers.length === 0) {
      return await this.emptyResult('no_togglers_found', page);
    }

    const items = [];
    const discoveredHints = {
      headerSelector: headerCandidate.selector,
      togglerPatterns: [],
      panelStrategy: null
    };

    // Phase 2: Handle both interactive togglers and simple nav links
    let siteInteractionMode = 'unknown'; // 'hover', 'click', 'mixed', 'simple'
    
    // First, try to find simple navigation links (no interaction needed)
    const simpleNavItems = await this.extractSimpleNavLinks(page, headerCandidate);
    if (simpleNavItems.length >= 3) {
      // Site uses simple navigation, no interaction needed
      items.push(...simpleNavItems);
      siteInteractionMode = 'simple';
      this.logger.debug(`Found ${simpleNavItems.length} simple navigation links`);
    } else {
      // Try interactive exploration
      const sampleSize = Math.min(this.maxTogglersToSample, togglers.length);
      
      for (let i = 0; i < sampleSize; i++) {
        const toggler = togglers[i];
        const result = await this.exploreToggler(page, toggler, 'probe');
        
        if (result.items.length > 0) {
          items.push(...result.items);
          
          // Learn interaction mode
          if (result.openedOnHover) {
            siteInteractionMode = siteInteractionMode === 'unknown' ? 'hover' : 
                                 siteInteractionMode === 'click' ? 'mixed' : 'hover';
          } else if (result.openedOnClick) {
            siteInteractionMode = siteInteractionMode === 'unknown' ? 'click' : 
                                 siteInteractionMode === 'hover' ? 'mixed' : 'click';
          }
          
          // Store successful pattern
          discoveredHints.togglerPatterns.push({
            text: toggler.text,
            selector: toggler.relativeSelector,
            interactionMode: result.openedOnHover ? 'hover' : 'click'
          });
        }
      }

      this.logger.debug(`Site interaction mode detected: ${siteInteractionMode}`);

      // Phase 3: Apply learned behavior to remaining togglers
      if (siteInteractionMode !== 'simple' && siteInteractionMode !== 'unknown') {
        const remainingTogglers = togglers.slice(sampleSize);
        const preferredInteraction = siteInteractionMode === 'click' ? 'click' : 'hover';
        
        for (const toggler of remainingTogglers) {
          const result = await this.exploreToggler(page, toggler, preferredInteraction);
          if (result.items.length > 0) {
            items.push(...result.items);
          }
        }
      }
    }

    const confidence = this.calculateConfidence(items, togglers.length);
    
    return {
      items: items,
      confidence: confidence,
      hints: discoveredHints,
      metadata: {
        strategy: this.name,
        headerUsed: headerCandidate.selector,
        togglersFound: togglers.length,
        siteInteractionMode: siteInteractionMode
      }
    };
  }

  /**
   * Find navigation togglers in header
   */
  async findTogglers(page, headerCandidate, hints) {
    return await page.evaluate(({ headerSelector, cachedPatterns }) => {
      const header = document.querySelector(headerSelector);
      if (!header) return [];
      
      const togglers = [];
      const processed = new Set();
      
      // Define validation functions in page context
      const isValidToggler = (element, text, url) => {
        // Text validation
        if (!text || text.length < 2 || text.length > 40) return false;
        
        // Skip utility keywords
        const utilityPatterns = [
          'sign in', 'login', 'account', 'cart', 'bag', 'checkout',
          'help', 'support', 'contact', 'search', 'store locator'
        ];
        
        const lowerText = text.toLowerCase();
        if (utilityPatterns.some(pattern => lowerText.includes(pattern))) {
          return false;
        }
        
        // Department/category hints (flexible matching)
        const categoryHints = [
          'women', 'woman', 'men', 'man', 'kids', 'children', 'baby',
          'home', 'furniture', 'kitchen', 'bedroom', 'bath',
          'shoes', 'clothing', 'accessories', 'jewelry', 'bags',
          'beauty', 'fragrance', 'makeup', 'skincare',
          'electronics', 'toys', 'sports', 'outdoor',
          'sale', 'clearance', 'new arrivals', 'brands', 'collections',
          'unisex', 'all' // glasswingshop specific
        ];
        
        const hasCategory = categoryHints.some(hint => 
          lowerText.includes(hint) || hint.includes(lowerText)
        );
        
        // URL validation (if present)
        const hasGoodUrl = !url || 
          url.includes('/collection') || 
          url.includes('/category') || 
          url.includes('/department') ||
          url.split('/').length <= 4; // Not too deep
        
        // For navigation areas, be more permissive
        const isInNav = element.closest('nav, .nav, .navigation, [role="navigation"]');
        const isReasonableLength = text.length >= 3 && text.length <= 30;
        
        return hasCategory || (hasGoodUrl && isReasonableLength) || (isInNav && isReasonableLength);
      };
      
      const getRelativeSelector = (element, headerRoot) => {
        const path = [];
        let current = element;
        
        while (current && current !== headerRoot && path.length < 5) {
          const tag = current.tagName.toLowerCase();
          const classes = Array.from(current.classList).filter(c => 
            !c.includes('hover') && !c.includes('active') && !c.includes('open')
          );
          
          if (current.id && !current.id.includes('random')) {
            path.unshift(`${tag}#${current.id}`);
          } else if (classes.length > 0) {
            path.unshift(`${tag}.${classes[0]}`);
          } else {
            const siblings = Array.from(current.parentElement?.children || [])
              .filter(el => el.tagName === current.tagName);
            const index = siblings.indexOf(current);
            path.unshift(`${tag}:nth-of-type(${index + 1})`);
          }
          
          current = current.parentElement;
        }
        
        return path.join(' > ');
      };
      
      // Try cached patterns first
      if (cachedPatterns && cachedPatterns.length > 0) {
        for (const pattern of cachedPatterns) {
          try {
            const element = header.querySelector(pattern.selector);
            if (element && !processed.has(element)) {
              togglers.push({
                element: element,
                text: element.textContent.trim(),
                relativeSelector: pattern.selector,
                source: 'cache',
                preferredInteraction: pattern.interactionMode
              });
              processed.add(element);
            }
          } catch (e) {
            // Failed cache pattern
          }
        }
      }
      
      // Discovery patterns for togglers (include simple nav links)
      const togglerSelectors = [
        'a[aria-haspopup="true"]',
        'button[aria-haspopup="true"]',
        'a[aria-expanded]',
        'button[aria-expanded]',
        '.dropdown-toggle',
        '.has-dropdown > a',
        '.has-submenu > a',
        '.menu-item-has-children > a',
        'nav > ul > li > a',        // glasswingshop pattern
        'nav > div > a',
        'nav a',                   // simple nav links
        '.nav-item > a',
        '.menu-item > a',
        'li > a'                   // any list item link
      ];
      
      for (const selector of togglerSelectors) {
        try {
          const elements = header.querySelectorAll(selector);
          
          for (const element of elements) {
            if (processed.has(element)) continue;
            
            const text = element.textContent.trim();
            const url = element.href || '';
            
            // Classification rules
            if (isValidToggler(element, text, url)) {
              const relativeSelector = getRelativeSelector(element, header);
              
              togglers.push({
                element: element,
                text: text,
                url: url,
                relativeSelector: relativeSelector,
                source: 'discovery'
              });
              processed.add(element);
            }
          }
        } catch (e) {
          // Skip failed selector
        }
      }
      
      return togglers.slice(0, 12); // Limit to prevent excessive exploration
      
    }, { headerSelector: headerCandidate.selector, cachedPatterns: hints.togglerPatterns });
  }

  /**
   * Extract simple navigation links that don't require interaction
   */
  async extractSimpleNavLinks(page, headerCandidate) {
    return await page.evaluate((headerSelector) => {
      const header = document.querySelector(headerSelector);
      if (!header) return [];
      
      const items = [];
      const processed = new Set();
      
      // Look for navigation links that appear to be main categories
      const navLinks = header.querySelectorAll('a');
      
      for (const link of navLinks) {
        const text = link.textContent.trim();
        const url = link.href;
        
        if (processed.has(url) || !text || text.length < 2) continue;
        
        // Skip utility links
        const utilityPatterns = [
          'sign in', 'login', 'account', 'cart', 'bag', 'checkout',
          'help', 'support', 'contact', 'search', 'store locator'
        ];
        
        const lowerText = text.toLowerCase();
        if (utilityPatterns.some(pattern => lowerText.includes(pattern))) {
          continue;
        }
        
        // Mobile navigation depth filtering - only get top-level items
        const isMobileNav = headerSelector.includes('mobile');
        if (isMobileNav) {
          // For mobile nav, only take direct children or first-level categories
          const depth = this.getNavigationDepth(link, header);
          if (depth > 2) continue; // Skip deeply nested items
          
          // Also skip if it has a parent category link (subcategory)
          const parentCategory = link.closest('li, .category, .nav-item');
          if (parentCategory && parentCategory !== link.parentElement) {
            const parentLink = parentCategory.querySelector('a');
            if (parentLink && parentLink !== link && items.some(item => item.url === parentLink.href)) {
              continue; // Skip subcategory if we already have the parent
            }
          }
        }
        
        // Check if it looks like a category link
        const categoryHints = [
          'women', 'woman', 'men', 'man', 'kids', 'children', 'baby',
          'home', 'furniture', 'kitchen', 'bedroom', 'bath',
          'shoes', 'clothing', 'accessories', 'jewelry', 'bags',
          'beauty', 'fragrance', 'makeup', 'skincare',
          'electronics', 'toys', 'sports', 'outdoor',
          'sale', 'clearance', 'new arrivals', 'brands', 'collections',
          'unisex', 'all'
        ];
        
        const hasCategory = categoryHints.some(hint => 
          lowerText.includes(hint) || hint.includes(lowerText)
        );
        
        const hasCollectionUrl = url && url.includes('/collection');
        const isInNav = link.closest('nav, .nav, .navigation');
        const isReasonableLength = text.length >= 3 && text.length <= 30;
        
        if ((hasCategory || hasCollectionUrl || (isInNav && isReasonableLength)) && text.length <= 40) {
          items.push({
            name: text,
            url: url,
            type: 'simple_nav',
            level: 1,
            discovered_via: 'AdaptiveNavigationStrategy'
          });
          processed.add(url);
        }
      }
      
      return items;
    }, headerCandidate.selector);
  }

  /**
   * Explore individual toggler with smart interaction protocol
   */
  async exploreToggler(page, toggler, mode = 'probe') {
    try {
      // Find the toggler element
      const togglerElement = await page.locator(`text="${toggler.text}"`).first();
      
      if (!await togglerElement.isVisible({ timeout: 1000 })) {
        return { items: [], openedOnHover: false, openedOnClick: false };
      }

      let panelFound = false;
      let openedOnHover = false;
      let openedOnClick = false;
      
      // Try hover first (unless mode is 'click')
      if (mode !== 'click') {
        await togglerElement.hover();
        panelFound = await this.waitForPanel(page, 400);
        if (panelFound) openedOnHover = true;
      }
      
      // Try click if hover failed or mode is 'click'
      if (!panelFound) {
        await togglerElement.click();
        panelFound = await this.waitForPanel(page, 350);
        if (panelFound) openedOnClick = true;
      }
      
      if (!panelFound) {
        return { items: [], openedOnHover, openedOnClick };
      }

      // Extract panel content
      const panelItems = await this.extractPanelContent(page, toggler.text);
      
      // Close panel
      await page.mouse.move(10, 10);
      await page.waitForTimeout(100);
      
      return {
        items: panelItems,
        openedOnHover,
        openedOnClick
      };
      
    } catch (error) {
      this.logger.debug(`Failed to explore toggler ${toggler.text}: ${error.message}`);
      return { items: [], openedOnHover: false, openedOnClick: false };
    }
  }

  /**
   * Wait for panel to appear using timed polls
   */
  async waitForPanel(page, maxWait = 400) {
    const pollIntervals = [120, 260, 400];
    const startTime = Date.now();
    
    for (const interval of pollIntervals) {
      if (Date.now() - startTime >= maxWait) break;
      
      await page.waitForTimeout(interval);
      
      const panelVisible = await page.evaluate(() => {
        // Look for newly visible panels
        const candidates = document.querySelectorAll([
          '.dropdown-content',
          '.dropdown-menu', 
          '.submenu',
          '.mega-menu',
          '[class*="dropdown"]',
          '[aria-hidden="false"]',
          '[style*="block"]'
        ].join(','));
        
        for (const candidate of candidates) {
          const rect = candidate.getBoundingClientRect();
          if (rect.width > 100 && rect.height > 50) {
            const links = candidate.querySelectorAll('a');
            if (links.length >= 3) return true;
          }
        }
        
        return false;
      });
      
      if (panelVisible) return true;
    }
    
    return false;
  }

  /**
   * Extract content from visible panel
   */
  async extractPanelContent(page, parentName) {
    return await page.evaluate((parent) => {
      const items = [];
      
      // Find visible panels
      const panels = document.querySelectorAll([
        '.dropdown-content',
        '.dropdown-menu',
        '.submenu', 
        '.mega-menu',
        '[class*="dropdown"]'
      ].join(','));
      
      for (const panel of panels) {
        const rect = panel.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        
        const links = panel.querySelectorAll('a');
        
        for (const link of links) {
          const text = link.textContent.trim();
          const url = link.href;
          
          if (text && text.length > 0 && url && url !== '#') {
            items.push({
              name: text,
              url: url,
              type: 'dropdown',
              parent: parent,
              level: 2,
              discovered_via: 'AdaptiveNavigationStrategy'
            });
          }
        }
      }
      
      return items;
    }, parentName);
  }

  /**
   * Mobile fallback strategy
   */
  async tryMobileFallback(page, hints) {
    try {
      const domain = new URL(page.url()).hostname;
      this.logger.info(`📱 Mobile fallback for ${domain}`);
      
      // Page should already be in mobile viewport from test setup
      await page.waitForTimeout(1000);
      
      // Try direct mobile navigation extraction first (for sites like Macy's)
      let mobileItems = await this.extractDirectMobileNav(page, domain);
      
      if (mobileItems.length < 5) {
        // Try hamburger menu approach
        const hamburger = await page.locator([
          'button[aria-label*="menu"]',
          'button[aria-label*="Menu"]', 
          '.hamburger',
          '.menu-toggle',
          '[class*="mobile-menu"]'
        ].join(',')).first();
        
        if (await hamburger.isVisible({ timeout: 1000 })) {
          await hamburger.click();
          await page.waitForTimeout(500);
          mobileItems = await this.extractMobileMenu(page);
        }
      }
      
      if (mobileItems.length >= 5) {
        const sampleItems = mobileItems.slice(0, 6).map(item => item.name);
        this.logger.info(`📱 Mobile extraction successful: ${mobileItems.length} items (${sampleItems.join(', ')})`);
        
        return {
          items: mobileItems,
          confidence: 0.8,
          metadata: {
            strategy: this.name,
            source: 'mobile_fallback',
            domain: domain
          }
        };
      }
      
      return await this.emptyResult('mobile_fallback_failed', page);
      
    } catch (error) {
      return await this.emptyResult(`mobile_error: ${error.message}`, page);
    }
  }
  
  /**
   * Extract navigation directly from mobile-specific containers
   */
  async extractDirectMobileNav(page, domain) {
    this.logger.debug(`🔍 Extracting direct mobile nav for ${domain}`);
    
    // First, check what elements exist on the page
    const pageInfo = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        hasMobileNav: !!document.querySelector('#mobile-nav, .mobile-nav'),
        mobileNavContent: document.querySelector('#mobile-nav, .mobile-nav')?.innerHTML?.substring(0, 200),
        totalLinks: document.querySelectorAll('a').length,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      };
    });
    
    this.logger.debug(`📱 Page info:`, pageInfo);
    
    const result = await page.evaluate((domain) => {
      const items = [];
      const processed = new Set();
      const debugInfo = { domain, checks: [] };
      
      // Site-specific patterns
      const isMacys = domain.includes('macys.com');
      const isHomeDepot = domain.includes('homedepot.com');
      const isAmazon = domain.includes('amazon.com');
      const isBestBuy = domain.includes('bestbuy.com');
      const isLowes = domain.includes('lowes.com');
      
      debugInfo.checks.push(`Site detection: Macy's=${isMacys}, HomeDepot=${isHomeDepot}`);
      
      if (isMacys) {
        debugInfo.checks.push('Checking Macy\'s mobile nav...');
        
        // Macy's has #mobile-nav with comprehensive navigation
        const mobileNav = document.querySelector('#mobile-nav, .mobile-nav');
        debugInfo.checks.push(`Mobile nav found: ${!!mobileNav}`);
        
        if (mobileNav) {
          const links = mobileNav.querySelectorAll('a');
          debugInfo.checks.push(`Links in mobile nav: ${links.length}`);
          
          const departmentKeywords = [
            'women', 'men', 'kids', 'children', 'baby', 'home', 'beauty', 
            'shoes', 'handbags', 'jewelry', 'sale', 'clearance', 'new'
          ];
          
          debugInfo.checks.push(`Processing ${links.length} links with ${departmentKeywords.length} keywords`);
          
          for (const link of links) {
            const text = link.textContent.trim();
            const url = link.href;
            
            if (!url || processed.has(url) || text.length < 3 || text.length > 30) continue;
            
            // For Macy's, extract main departments (not all 1400 subcategories)
            const lowerText = text.toLowerCase();
            const isDepartment = departmentKeywords.some(dept => lowerText.includes(dept));
            
            if (isDepartment) {
              processed.add(url);
              items.push({
                name: text,
                url: url,
                selector: '#mobile-nav',
                element_type: 'a',
                has_dropdown: false,
                type: 'main_section',
                level: 1,
                discovered_via: 'mobile_direct'
              });
              
              debugInfo.checks.push(`✅ Found department: "${text}"`);
              
              // Limit to reasonable number for main navigation
              if (items.length >= 15) break;
            } else {
              debugInfo.checks.push(`❌ Skipped: "${text}" (not department)`);
            }
          }
          
          debugInfo.checks.push(`Final items count: ${items.length}`);
        } else {
          debugInfo.checks.push('❌ No mobile nav element found');
        }
      }
      
      if (isHomeDepot || isLowes) {
        // Home improvement stores have navigation in top area
        const departmentKeywords = [
          'appliances', 'bath', 'building', 'electrical', 'flooring',
          'garden', 'hardware', 'heating', 'kitchen', 'lighting',
          'lumber', 'paint', 'plumbing', 'storage', 'tools', 'windows',
          'doors', 'outdoor', 'lawn', 'decor'
        ];
        
        const links = Array.from(document.querySelectorAll('a'));
        for (const link of links) {
          const rect = link.getBoundingClientRect();
          const text = link.textContent.trim();
          const url = link.href;
          
          // Only links in top area (0-200px) as discovered in our analysis
          if (rect.top > 200 || !url || processed.has(url) || text.length < 3) continue;
          
          const lowerText = text.toLowerCase();
          const isDepartment = departmentKeywords.some(dept => lowerText.includes(dept));
          
          if (isDepartment) {
            processed.add(url);
            items.push({
              name: text,
              url: url,
              selector: 'mobile_top_area',
              element_type: 'a',
              has_dropdown: false,
              type: 'main_section',
              level: 1,
              discovered_via: 'mobile_direct'
            });
          }
        }
      }
      
      if (isAmazon) {
        // Amazon has department navigation in various locations
        const departmentKeywords = [
          'books', 'electronics', 'computers', 'home', 'garden', 'tools',
          'grocery', 'health', 'beauty', 'toys', 'games', 'clothing',
          'shoes', 'jewelry', 'sports', 'outdoors', 'automotive',
          'industrial', 'kindle', 'movies', 'music'
        ];
        
        const links = Array.from(document.querySelectorAll('a'));
        for (const link of links) {
          const rect = link.getBoundingClientRect();
          const text = link.textContent.trim();
          const url = link.href;
          
          if (rect.top > 300 || !url || processed.has(url) || text.length < 3) continue;
          
          const lowerText = text.toLowerCase();
          const isDepartment = departmentKeywords.some(dept => lowerText.includes(dept));
          
          if (isDepartment) {
            processed.add(url);
            items.push({
              name: text,
              url: url,
              selector: 'amazon_mobile',
              element_type: 'a',
              has_dropdown: false,
              type: 'main_section',
              level: 1,
              discovered_via: 'mobile_direct'
            });
          }
        }
      }
      
      if (isBestBuy) {
        // Best Buy electronics categories
        const departmentKeywords = [
          'tv', 'computer', 'laptop', 'phone', 'tablet', 'audio',
          'camera', 'gaming', 'appliances', 'smart home', 'car',
          'health', 'wearable', 'office', 'software'
        ];
        
        const links = Array.from(document.querySelectorAll('a'));
        for (const link of links) {
          const rect = link.getBoundingClientRect();
          const text = link.textContent.trim();
          const url = link.href;
          
          if (rect.top > 300 || !url || processed.has(url) || text.length < 3) continue;
          
          const lowerText = text.toLowerCase();
          const isDepartment = departmentKeywords.some(dept => lowerText.includes(dept));
          
          if (isDepartment) {
            processed.add(url);
            items.push({
              name: text,
              url: url,
              selector: 'bestbuy_mobile',
              element_type: 'a',
              has_dropdown: false,
              type: 'main_section',
              level: 1,
              discovered_via: 'mobile_direct'
            });
          }
        }
      }
      
      debugInfo.checks.push(`Total items extracted: ${items.length}`);
      return { items, debugInfo };
    }, domain);
    
    // Log the debug information
    this.logger.debug(`🔍 Mobile extraction debug for ${domain}:`, result.debugInfo.checks);
    this.logger.debug(`📊 Extracted ${result.items.length} items from mobile nav`);
    
    if (result.items.length > 0) {
      const sample = result.items.slice(0, 3).map(item => `"${item.name}"`).join(', ');
      this.logger.debug(`📱 Sample items: ${sample}`);
    }
    
    return result.items;
  }

  /**
   * Extract mobile menu content
   */
  async extractMobileMenu(page) {
    return await page.evaluate(() => {
      const items = [];
      
      // Look for mobile menu containers - enhanced for Macy's
      const containers = document.querySelectorAll([
        '.mobile-menu',
        '#mobile-nav',        // Macy's specific
        '.mobile-nav',
        '.mobile-navigation',
        '.off-canvas',
        '.sidebar-menu',
        '[class*="mobile"]',
        '[class*="drawer"]'
      ].join(','));
      
      for (const container of containers) {
        if (!container.offsetParent) continue; // Skip hidden
        
        const links = container.querySelectorAll('a');
        
        for (const link of links) {
          const text = link.textContent.trim();
          const url = link.href;
          
          if (text && url && url !== '#') {
            items.push({
              name: text,
              url: url,
              type: 'mobile_nav',
              level: 1,
              discovered_via: 'AdaptiveNavigationStrategy'
            });
          }
        }
      }
      
      return items;
    });
  }

  /**
   * Calculate confidence score
   */
  calculateConfidence(items, togglerCount) {
    if (items.length === 0) return 0;
    
    const factors = {
      hasItems: items.length > 0 ? 0.3 : 0,
      goodCoverage: items.length >= 8 ? 0.3 : items.length * 0.0375,
      togglerSuccess: togglerCount > 0 ? Math.min(items.length / togglerCount, 1) * 0.2 : 0,
      hasHierarchy: items.some(item => item.level > 1) ? 0.2 : 0
    };
    
    return Object.values(factors).reduce((sum, val) => sum + val, 0);
  }

  /**
   * Load cached hints for domain
   */
  async loadHints(domain) {
    if (!this.hintCache) return {};
    
    try {
      const cached = await this.hintCache.get(`nav_hints:${domain}`);
      return cached ? JSON.parse(cached) : {};
    } catch (error) {
      this.logger.debug(`Failed to load hints for ${domain}: ${error.message}`);
      return {};
    }
  }

  /**
   * Store hints for domain
   */
  async storeHints(domain, hints) {
    if (!this.hintCache || !hints) return;
    
    try {
      const ttl = 72 * 60 * 60; // 72 hours
      await this.hintCache.setex(`nav_hints:${domain}`, ttl, JSON.stringify(hints));
      this.logger.debug(`Stored navigation hints for ${domain}`);
    } catch (error) {
      this.logger.debug(`Failed to store hints for ${domain}: ${error.message}`);
    }
  }

  /**
   * Auto-debug when no header containers found
   */
  async autoDebugFailure(page, reason) {
    if (reason !== 'no_header_containers') {
      return { failure_reason: reason };
    }

    try {
      this.logger.debug('🔍 Auto-debugging: analyzing page structure...');
      
      // Wait for dynamic content to load
      await page.waitForTimeout(3000);
      
      const debugInfo = await page.evaluate(() => {
        const containers = [];
        const selectors = ['header', 'nav', 'div', 'section'];
        
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          for (let i = 0; i < Math.min(elements.length, 8); i++) {
            const element = elements[i];
            const rect = element.getBoundingClientRect();
            const links = element.querySelectorAll('a, button');
            
            // Only include elements in the top area with some links
            if (rect.top <= 400 && links.length >= 1 && rect.width > 0 && rect.height > 0) {
              containers.push({
                selector: `${selector}[${i}]`,
                bounds: { 
                  top: Math.round(rect.top), 
                  width: Math.round(rect.width), 
                  height: Math.round(rect.height) 
                },
                linkCount: links.length,
                id: element.id || '',
                className: element.className || '',
                tagName: element.tagName,
                sampleText: Array.from(links).slice(0, 3).map(link => 
                  link.textContent.trim().substring(0, 30)
                ).join(', ')
              });
            }
          }
        }
        
        return {
          url: window.location.href,
          title: document.title,
          containers: containers.sort((a, b) => a.bounds.top - b.bounds.top).slice(0, 10)
        };
      });

      // Generate suggested selectors based on debug info
      const suggestions = this.generateSelectorSuggestions(debugInfo);
      
      this.logger.debug(`🔍 Found ${debugInfo.containers.length} potential containers`);
      if (suggestions.length > 0) {
        this.logger.debug(`💡 Suggested selectors: ${suggestions.join(', ')}`);
      }

      return {
        failure_reason: reason,
        debug_info: debugInfo,
        suggested_selectors: suggestions
      };
      
    } catch (error) {
      this.logger.debug(`Debug failed: ${error.message}`);
      return { failure_reason: reason };
    }
  }

  /**
   * Generate selector suggestions from debug info
   */
  generateSelectorSuggestions(debugInfo) {
    const suggestions = [];
    
    for (const container of debugInfo.containers) {
      // Suggest by ID if present
      if (container.id && container.linkCount >= 5) {
        suggestions.push(`#${container.id}`);
      }
      
      // Suggest by class if it looks navigation-related
      if (container.className) {
        const classes = container.className.split(' ').filter(c => 
          c.includes('nav') || c.includes('header') || c.includes('menu')
        );
        if (classes.length > 0 && container.linkCount >= 5) {
          suggestions.push(`.${classes[0]}`);
        }
      }
      
      // Suggest generic patterns for high-link containers
      if (container.linkCount >= 10) {
        suggestions.push(`${container.tagName.toLowerCase()}[linkCount=${container.linkCount}]`);
      }
    }
    
    return suggestions.slice(0, 5); // Top 5 suggestions
  }

  /**
   * Return empty result with reason and auto-debug
   */
  async emptyResult(reason, page = null) {
    const metadata = {
      strategy: this.name,
      failure_reason: reason
    };

    // Auto-debug if page is available and it's a container issue
    if (page && reason === 'no_header_containers') {
      const debugResult = await this.autoDebugFailure(page, reason);
      Object.assign(metadata, debugResult);
    }

    return {
      items: [],
      confidence: 0,
      metadata
    };
  }
}

module.exports = AdaptiveNavigationStrategy;