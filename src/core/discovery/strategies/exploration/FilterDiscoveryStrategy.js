/**
 * FilterDiscoveryStrategy - Discovers clickable filter elements on e-commerce pages
 * 
 * SIMPLIFIED APPROACH (following CLAUDE.md: "practical improvements that work TODAY"):
 * - Returns flat list of clickable filter candidates
 * - Works reliably across different sites (5-10 site target)
 * - Focuses on 40% → 70% extraction success, not perfect grouping
 * - Avoids overengineering complex group discovery
 * 
 * Phase 1 of two-phase filter approach:
 * 1. Find all clickable filter elements (checkboxes, buttons, links)
 * 2. Return FilterCandidate objects with selectors and metadata
 * 3. FilterBasedExplorationStrategy clicks through candidates
 */

const { logger } = require('../../../../utils/logger');
const FilterDiscoveryConfig = require('../../../../config/FilterDiscoveryConfig');

class FilterDiscoveryStrategy {
  constructor(options = {}) {
    this.logger = options.logger || logger;
    this.config = FilterDiscoveryConfig;
    this.options = {
      maxFilters: options.maxFilters || this.config.defaults.maxFiltersPerGroup,
      discoveryTimeout: options.discoveryTimeout || this.config.defaults.discoveryTimeout,
      includeHiddenFilters: options.includeHiddenFilters || false,
      scoreThreshold: options.scoreThreshold || 2,
      ...options
    };
  }

  /**
   * Discover all clickable filter candidates on the page
   * @param {Page} page - Puppeteer page object
   * @param {string} categoryUrl - URL of the category page for context
   * @returns {Promise<Object>} Flat list of filter candidates
   */
  async discoverFilterCandidates(page, categoryUrl) {
    this.logger.info('🔍 Starting flat filter discovery', {
      url: categoryUrl,
      maxFilters: this.options.maxFilters
    });

    try {
      // Step 1: Activate hidden filter menus (common pattern)
      await this.activateFilterMenus(page);
      
      // Step 2: Extract all potential filter elements from the page
      const rawCandidates = await this.extractFilterCandidates(page);
      
      // Step 3: Score and filter candidates (Node.js context)
      const scoredCandidates = this.scoreFilterCandidates(rawCandidates);
      
      // Step 4: Apply exclusions (remove size/variant filters)
      const filteredCandidates = this.applyFilterExclusions(scoredCandidates);
      
      // Step 5: Build final results
      return this.buildCandidateResults(categoryUrl, filteredCandidates, page);
      
    } catch (error) {
      this.logger.error('❌ Filter discovery failed', {
        url: categoryUrl,
        error: error.message,
        stack: error.stack
      });
      
      return {
        url: categoryUrl,
        discoveredAt: new Date().toISOString(),
        totalCandidates: 0,
        candidates: [],
        error: error.message
      };
    }
  }

  /**
   * Activate hidden filter menus by clicking filter toggle buttons
   */
  async activateFilterMenus(page) {
    this.logger.info('🎯 Activating filter menus...');
    
    // Common filter activation patterns
    const activationSelectors = [
      // Text-based filter buttons (Fig & Willow pattern)
      'button:has-text("Filter")',
      'button:has-text("Filters")', 
      'a:has-text("Filter")',
      
      // Class-based filter toggles
      '.filter-toggle',
      '.filters-toggle',
      '.filter-button',
      '.filters-button',
      
      // Icon-based filter buttons
      'button[class*="filter"]',
      'button[aria-label*="filter" i]',
      'button[aria-label*="refine" i]',
      
      // Mobile/responsive filter buttons
      '.mobile-filter-toggle',
      '[data-filter-toggle]',
      '[role="button"][aria-expanded="false"]'
    ];

    let activatedMenus = 0;
    
    for (const selector of activationSelectors) {
      try {
        const elements = await page.$$(selector);
        
        for (const element of elements) {
          // Check if element is visible and clickable
          const isVisible = await element.isVisible().catch(() => false);
          if (isVisible) {
            this.logger.info('🔘 Clicking filter activation button', { selector });
            await element.click();
            await page.waitForTimeout(1000); // Wait for menu to appear
            activatedMenus++;
            break; // Only click first matching button
          }
        }
        
        if (activatedMenus > 0) break; // Stop after first successful activation
        
      } catch (error) {
        // Continue to next selector if this one fails
      }
    }
    
    if (activatedMenus > 0) {
      this.logger.info('✅ Filter menu activated', { menusActivated: activatedMenus });
      // Wait a bit longer for animations to complete
      await page.waitForTimeout(1500);
    } else {
      this.logger.info('ℹ️  No filter activation buttons found (filters may already be visible)');
    }
  }

  /**
   * Extract all potential filter elements (browser context)
   */
  async extractFilterCandidates(page) {
    return await page.evaluate(() => {
      const candidates = [];
      
      // Define filter container patterns (scope the search)
      const containerSelectors = [
        // Common filter containers
        '[role="region"][aria-label*="filter" i]',
        '[role="region"][aria-label*="refine" i]',
        '[role="complementary"]',
        '.filter', '.filters', '.facets', '.facet',
        '.sidebar', '.left-column', '.refinements',
        // Shopify/Glasswing specific
        '.filter-group-display', '.collection-filters',
        // Generic filter areas
        'aside', '.aside', '[data-filter]', '[data-facet]'
      ];

      // Find filter containers
      const containers = [];
      for (const selector of containerSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            if (el.offsetParent !== null) { // Only visible containers
              containers.push(el);
            }
          });
        } catch (e) {
          // Skip invalid selectors
        }
      }

      // If no containers found, search the whole page (with stricter rules)
      if (containers.length === 0) {
        containers.push(document.body);
      }

      // Extract candidates from each container
      containers.forEach((container, containerIndex) => {
        // Get container hint (nearby heading)
        const containerHint = getContainerHint(container);
        
        // Find checkbox/radio inputs
        const inputs = container.querySelectorAll('input[type="checkbox"], input[type="radio"]');
        inputs.forEach((input, inputIndex) => {
          if (shouldSkipElement(input)) return;
          
          const candidate = {
            elementType: input.type,
            action: 'click',
            selector: buildInputSelector(input, containerIndex, inputIndex),
            label: getInputLabel(input),
            value: input.value,
            checked: input.checked,
            name: input.name,
            visibility: input.offsetParent !== null ? 'visible' : 'hidden',
            containerHint: containerHint,
            score: 0 // Will be calculated later
          };
          
          if (candidate.label && candidate.label.trim()) {
            candidates.push(candidate);
          }
        });

        // Find buttons (within filter containers)
        const buttons = container.querySelectorAll('button, [role="button"]');
        buttons.forEach((button, buttonIndex) => {
          if (shouldSkipElement(button)) return;
          
          const text = button.textContent.trim();
          if (!text || isSkipText(text)) return;
          
          const candidate = {
            elementType: 'button',
            action: 'click',
            selector: buildButtonSelector(button, containerIndex, buttonIndex),
            label: text,
            active: button.classList.contains('active') || button.classList.contains('selected') || 
                   button.getAttribute('aria-pressed') === 'true',
            visibility: button.offsetParent !== null ? 'visible' : 'hidden',
            containerHint: containerHint,
            score: 0
          };
          
          candidates.push(candidate);
        });

        // Find links (only if they look like filters)
        const links = container.querySelectorAll('a[href]');
        links.forEach((link, linkIndex) => {
          if (shouldSkipElement(link)) return;
          
          const text = link.textContent.trim();
          const href = link.href;
          
          if (!text || isSkipText(text) || href.includes('#') || href.includes('javascript:')) return;
          
          // Only include links that look like filters (have facet params or are in filter containers)
          const hasFilterParams = /[?&](filter|facet|brand|category|tag|type|sort)=/i.test(href);
          const isInFilterContainer = container !== document.body;
          
          if (!hasFilterParams && !isInFilterContainer) return;
          
          const candidate = {
            elementType: 'link',
            action: 'click',
            selector: buildLinkSelector(link, containerIndex, linkIndex),
            label: text,
            href: href,
            active: link.classList.contains('active') || link.classList.contains('selected'),
            visibility: link.offsetParent !== null ? 'visible' : 'hidden',
            containerHint: containerHint,
            urlEffectHint: hasFilterParams ? 'facet_params' : null,
            score: 0
          };
          
          candidates.push(candidate);
        });
      });

      return candidates;

      // Helper functions (must be defined in browser context)
      function getContainerHint(container) {
        // Look for nearby headings
        const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="heading"]');
        if (headings.length > 0) {
          return headings[0].textContent.trim();
        }
        
        // Look for aria-label
        if (container.getAttribute('aria-label')) {
          return container.getAttribute('aria-label');
        }
        
        // Look for data attributes
        if (container.getAttribute('data-title')) {
          return container.getAttribute('data-title');
        }
        
        return null;
      }

      function shouldSkipElement(element) {
        // Skip if not visible
        if (element.offsetParent === null) return true;
        
        // Skip if disabled
        if (element.disabled) return true;
        
        // Skip if inside hidden elements
        let parent = element.parentElement;
        while (parent) {
          if (parent.style.display === 'none' || parent.style.visibility === 'hidden') {
            return true;
          }
          parent = parent.parentElement;
        }
        
        return false;
      }

      function isSkipText(text) {
        const skipWords = ['apply', 'reset', 'clear', 'remove', 'sort', 'done', 'cancel', 'submit', 
                          'view', 'next', 'prev', 'previous', 'add to cart', 'buy now', 'checkout'];
        return skipWords.some(word => text.toLowerCase().includes(word));
      }

      function getInputLabel(input) {
        // Try associated label
        if (input.id) {
          const label = document.querySelector(`label[for="${input.id}"]`);
          if (label) return label.textContent.trim();
        }
        
        // Try parent label
        const parentLabel = input.closest('label');
        if (parentLabel) return parentLabel.textContent.trim();
        
        // Try nearby text
        const parent = input.parentElement;
        if (parent) {
          const text = parent.textContent.replace(input.value || '', '').trim();
          if (text) return text;
        }
        
        return input.value || input.name || '';
      }

      function buildInputSelector(input, containerIndex, inputIndex) {
        // Use CSS.escape() to handle special characters in IDs (like periods)
        if (input.id) return `input#${CSS.escape(input.id)}`;
        if (input.name) return `input[name="${input.name}"][value="${input.value}"]`;
        return `input[type="${input.type}"]:nth-of-type(${inputIndex + 1})`;
      }

      function buildButtonSelector(button, containerIndex, buttonIndex) {
        // Use CSS.escape() to handle special characters in IDs
        if (button.id) return `button#${CSS.escape(button.id)}`;
        if (button.className) {
          const firstClass = button.className.split(' ')[0];
          return `button.${CSS.escape(firstClass)}:nth-of-type(${buttonIndex + 1})`;
        }
        return `button:nth-of-type(${buttonIndex + 1})`;
      }

      function buildLinkSelector(link, containerIndex, linkIndex) {
        // Use CSS.escape() to handle special characters in IDs
        if (link.id) return `a#${CSS.escape(link.id)}`;
        if (link.className) {
          const firstClass = link.className.split(' ')[0];
          return `a.${CSS.escape(firstClass)}:nth-of-type(${linkIndex + 1})`;
        }
        return `a[href="${link.getAttribute('href')}"]`;
      }
    });
  }

  /**
   * Apply exclusions to remove unwanted filter types (size, variants, etc.)
   */
  applyFilterExclusions(candidates) {
    const excludedTypes = [
      // Size-related filters
      /\b(size|sizes|xs|sm|small|md|medium|lg|large|xl|xxl|xxxl)\b/i,
      /\b(\d+(?:\.\d+)?\s*(in|inch|cm|mm|ft|foot|feet))\b/i, // Measurements
      /\b(us|uk|eu)\s*\d+/i, // Shoe sizes
      
      // Variant filters that don't help discovery
      /\b(color|colour|colors|colours)\b/i, // Usually variants, not categories
      /\b(quantity|qty|stock|availability)\b/i,
      /\b(price|\$|cost|budget)\b/i,
      
      // UI/Sort filters
      /\b(sort|order|arrange|view|display|show|per\s*page)\b/i,
      /\b(ascending|descending|asc|desc|newest|oldest|popular|featured)\b/i,
      
      // Action buttons (not filters)
      /\b(apply|reset|clear|remove|done|cancel|submit|close)\b/i,
      /\b(add\s*to\s*cart|buy\s*now|checkout|wishlist)\b/i
    ];
    
    const filtered = candidates.filter(candidate => {
      const label = candidate.label?.toLowerCase() || '';
      const name = candidate.name?.toLowerCase() || '';
      const value = candidate.value?.toLowerCase() || '';
      
      // Check if any exclusion pattern matches
      const isExcluded = excludedTypes.some(pattern => 
        pattern.test(label) || pattern.test(name) || pattern.test(value)
      );
      
      if (isExcluded) {
        this.logger.debug('🚫 Excluding filter candidate', {
          label: candidate.label,
          reason: 'matches exclusion pattern'
        });
        return false;
      }
      
      return true;
    });
    
    this.logger.info('🔧 Filter exclusions applied', {
      original: candidates.length,
      filtered: filtered.length,
      excluded: candidates.length - filtered.length
    });
    
    return filtered;
  }

  /**
   * Score filter candidates based on confidence (Node.js context)
   */
  scoreFilterCandidates(rawCandidates) {
    return rawCandidates.map(candidate => {
      let score = 0;
      
      // Base scores by element type
      if (candidate.elementType === 'checkbox' || candidate.elementType === 'radio') {
        score += 2; // High confidence for form inputs
      } else if (candidate.elementType === 'button') {
        score += 1; // Medium confidence for buttons
      } else if (candidate.elementType === 'link') {
        score += candidate.urlEffectHint ? 2 : 0; // Only if has filter params
      }
      
      // Bonus for being in filter containers
      if (candidate.containerHint) {
        score += 1;
      }
      
      // Bonus for count patterns like "Brand (12)"
      if (/\(\d+\)/.test(candidate.label)) {
        score += 1;
      }
      
      // Bonus for selection state indicators
      if (candidate.checked || candidate.active) {
        score += 1;
      }
      
      // Bonus for filter-related names/values
      if (candidate.name && /filter|facet|tag|category|brand/i.test(candidate.name)) {
        score += 1;
      }
      
      candidate.score = score;
      return candidate;
    }).filter(candidate => 
      candidate.score >= this.options.scoreThreshold &&
      (this.options.includeHiddenFilters || candidate.visibility === 'visible')
    ).sort((a, b) => b.score - a.score) // Sort by score descending
     .slice(0, this.options.maxFilters); // Limit results
  }

  /**
   * Build final discovery results
   */
  async buildCandidateResults(categoryUrl, candidates, page) {
    this.logger.info('🎯 Filter discovery complete', {
      candidatesFound: candidates.length,
      types: [...new Set(candidates.map(c => c.elementType))],
      avgScore: candidates.length > 0 ? Math.round(candidates.reduce((sum, c) => sum + c.score, 0) / candidates.length) : 0
    });

    // Log sample candidates
    if (candidates.length > 0) {
      this.logger.info('📋 Sample filter candidates', {
        samples: candidates.slice(0, 5).map(c => ({
          type: c.elementType,
          label: c.label,
          score: c.score,
          container: c.containerHint
        }))
      });
    }

    return {
      url: categoryUrl,
      discoveredAt: new Date().toISOString(),
      totalCandidates: candidates.length,
      candidates: candidates,
      stats: {
        byType: this.groupByType(candidates),
        byContainer: this.groupByContainer(candidates),
        scoreDistribution: this.getScoreDistribution(candidates)
      },
      metadata: {
        discoveryOptions: this.options,
        userAgent: await page.evaluate(() => navigator.userAgent),
        pageTitle: await page.title(),
        pageUrl: page.url()
      }
    };
  }

  groupByType(candidates) {
    const grouped = {};
    candidates.forEach(c => {
      grouped[c.elementType] = (grouped[c.elementType] || 0) + 1;
    });
    return grouped;
  }

  groupByContainer(candidates) {
    const grouped = {};
    candidates.forEach(c => {
      const container = c.containerHint || 'unknown';
      grouped[container] = (grouped[container] || 0) + 1;
    });
    return grouped;
  }

  getScoreDistribution(candidates) {
    const scores = {};
    candidates.forEach(c => {
      scores[c.score] = (scores[c.score] || 0) + 1;
    });
    return scores;
  }

  /**
   * Validate discovered candidates for quality
   */
  validateCandidates(results) {
    const validation = {
      isValid: true,
      warnings: [],
      recommendations: []
    };

    if (results.totalCandidates === 0) {
      validation.isValid = false;
      validation.warnings.push('No filter candidates found');
      validation.recommendations.push('Check if page has filters or adjust discovery thresholds');
    } else if (results.totalCandidates < 3) {
      validation.warnings.push('Very few filter candidates found');
      validation.recommendations.push('Consider lowering score threshold or expanding container selectors');
    }

    const highScoreCandidates = results.candidates.filter(c => c.score >= 3).length;
    if (highScoreCandidates === 0 && results.totalCandidates > 0) {
      validation.warnings.push('No high-confidence candidates found');
      validation.recommendations.push('Candidates may be less reliable - proceed with caution');
    }

    return validation;
  }
}

module.exports = FilterDiscoveryStrategy;