/**
 * NavigationTestUtils.js - Utilities for navigation testing
 * 
 * Extracted from various test files for reusability
 */

const fs = require('fs');
const path = require('path');

class NavigationTestUtils {
  constructor() {
    this.resultsDir = './test-results/navigation';
    this.ensureResultsDir();
  }

  ensureResultsDir() {
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  /**
   * Create standardized test logger
   */
  createLogger(prefix = 'TEST') {
    return {
      info: (msg, data) => console.log(`ℹ️  [${prefix}] ${msg}`, data ? this.formatData(data) : ''),
      debug: (msg, data) => console.log(`🔍 [${prefix}] ${msg}`, data ? this.formatData(data) : ''),
      warn: (msg, data) => console.log(`⚠️  [${prefix}] ${msg}`, data ? this.formatData(data) : ''),
      error: (msg, data) => console.log(`❌ [${prefix}] ${msg}`, data ? this.formatData(data) : '')
    };
  }

  formatData(data) {
    return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
  }

  /**
   * Export navigation data in structured format
   */
  exportNavigationData(navigationData, siteName, siteUrl, testType = 'navigation') {
    const timestamp = Date.now();
    const filename = `${this.resultsDir}/${siteName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${testType}-results-${timestamp}.json`;
    
    const exportData = {
      site: new URL(siteUrl).hostname,
      testType,
      timestamp: new Date().toISOString(),
      summary: {
        totalMainSections: navigationData.main_sections?.length || 0,
        totalDropdowns: Object.keys(navigationData.dropdown_menus || {}).length,
        totalClickableElements: navigationData.clickable_elements?.length || 0,
        treeNodes: navigationData.tree_metadata?.total_nodes || 0,
        treeDepth: navigationData.tree_metadata?.max_depth || 0,
        pipelineConfidence: navigationData._pipeline_metadata?.confidence || 0,
        strategiesUsed: navigationData._pipeline_metadata?.strategies_used || []
      },
      mainSections: this.formatMainSections(navigationData.main_sections || []),
      dropdownMenus: this.formatDropdownMenus(navigationData.dropdown_menus || {}),
      hierarchicalTree: this.formatHierarchicalTree(navigationData.hierarchical_tree),
      pipelineMetadata: navigationData._pipeline_metadata || {},
      debugInfo: {
        clickableElements: (navigationData.clickable_elements || [])
          .slice(0, 20)
          .map(el => ({
            text: el.text,
            url: el.url,
            type: el.type,
            purpose: el.page_purpose
          }))
      }
    };
    
    fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
    console.log(`\n📄 Navigation data exported to: ${filename}`);
    
    return filename;
  }

  formatMainSections(sections) {
    return sections.map(section => ({
      name: section.name,
      url: section.url,
      selector: section.selector,
      hasDropdown: section.has_dropdown || false,
      elementType: section.element_type || 'unknown',
      discoveredBy: section.discovered_by || 'unknown'
    }));
  }

  formatDropdownMenus(dropdowns) {
    return Object.entries(dropdowns).map(([key, dropdown]) => ({
      id: key,
      selector: dropdown.selector,
      triggerSelector: dropdown.trigger_selector,
      itemCount: dropdown.items?.length || 0,
      items: (dropdown.items || []).slice(0, 10).map(item => ({
        name: item.name,
        url: item.url,
        isBrand: item.is_brand || false,
        isCategory: item.is_category || false
      })),
      discoveredBy: dropdown.discovered_by || 'unknown'
    }));
  }

  formatHierarchicalTree(tree) {
    if (!tree) return null;
    
    return {
      rootCategories: tree.children?.length || 0,
      sampleCategories: (tree.children || []).slice(0, 10).map(node => ({
        name: node.name,
        url: node.url,
        type: node.type,
        depth: node.depth,
        childrenCount: node.children?.length || 0,
        hasFilters: node.filters?.length > 0,
        hasSubcategories: node.subcategories?.length > 0,
        taxonomyData: {
          filters: node.filters?.length || 0,
          subcategories: node.subcategories?.length || 0,
          sampleFilters: (node.filters || []).slice(0, 5).map(f => f.name),
          sampleSubcategories: (node.subcategories || []).slice(0, 5).map(s => s.name)
        }
      }))
    };
  }

  /**
   * Analyze test results and provide success metrics
   */
  analyzeTestResults(navigationData, siteName, expectedMetrics = {}) {
    const mainSections = navigationData.main_sections || [];
    const dropdowns = Object.keys(navigationData.dropdown_menus || {});
    const treeNodes = navigationData.tree_metadata?.total_nodes || 0;
    
    // Calculate taxonomy data
    let totalFilters = 0;
    let totalSubcategories = 0;
    let nodesWithTaxonomy = 0;
    
    if (navigationData.hierarchical_tree && navigationData.hierarchical_tree.children) {
      this.analyzeTaxonomyNode(navigationData.hierarchical_tree.children, {
        totalFilters, totalSubcategories, nodesWithTaxonomy
      });
    }
    
    const analysis = {
      success: {
        hasNavigation: mainSections.length > 0,
        hasTree: treeNodes > 0,
        hasTaxonomy: totalFilters > 0 || totalSubcategories > 0,
        meetsExpectations: this.meetsExpectations(
          { mainSections: mainSections.length, treeNodes, taxonomyItems: totalFilters + totalSubcategories },
          expectedMetrics
        )
      },
      metrics: {
        mainSections: mainSections.length,
        dropdownMenus: dropdowns.length,
        treeNodes,
        taxonomyItems: totalFilters + totalSubcategories,
        confidence: navigationData._pipeline_metadata?.confidence || 0
      },
      quality: {
        pipelineConfidence: (navigationData._pipeline_metadata?.confidence || 0) * 100,
        strategiesUsed: navigationData._pipeline_metadata?.strategies_used || [],
        nodesWithTaxonomy,
        averageDepth: navigationData.tree_metadata?.max_depth || 0
      }
    };
    
    return analysis;
  }

  analyzeTaxonomyNode(nodes, counters) {
    nodes.forEach(node => {
      if (node.filters && node.filters.length > 0) {
        counters.totalFilters += node.filters.length;
        counters.nodesWithTaxonomy++;
      }
      if (node.subcategories && node.subcategories.length > 0) {
        counters.totalSubcategories += node.subcategories.length;
        counters.nodesWithTaxonomy++;
      }
      
      if (node.children) {
        this.analyzeTaxonomyNode(node.children, counters);
      }
    });
  }

  meetsExpectations(actual, expected) {
    if (!expected || Object.keys(expected).length === 0) return true;
    
    return Object.entries(expected).every(([key, expectedValue]) => {
      const actualValue = actual[key];
      return actualValue >= expectedValue * 0.8; // 80% threshold
    });
  }

  /**
   * Print detailed breakdown to console
   */
  printNavigationBreakdown(navigationData, siteName) {
    console.log(`\n📋 DETAILED NAVIGATION BREAKDOWN - ${siteName.toUpperCase()}`);
    console.log('=' .repeat(80));
    
    // Main Sections
    const mainSections = navigationData.main_sections || [];
    console.log(`\n🎯 MAIN SECTIONS (${mainSections.length} found):`);
    console.log('-'.repeat(60));
    
    mainSections.forEach((section, i) => {
      console.log(`${String(i + 1).padStart(3, ' ')}. ${section.name}`);
      console.log(`     URL: ${section.url}`);
      console.log(`     Selector: ${section.selector || 'N/A'}`);
      console.log(`     Discovered By: ${section.discovered_by || 'Unknown'}`);
      console.log('');
    });
    
    // Pipeline Performance
    if (navigationData._pipeline_metadata) {
      const meta = navigationData._pipeline_metadata;
      console.log(`\n🔧 PIPELINE PERFORMANCE:`);
      console.log('-'.repeat(60));
      console.log(`Overall Confidence: ${(meta.confidence * 100).toFixed(1)}%`);
      console.log(`Strategies Used: ${meta.strategies_used?.join(', ') || 'N/A'}`);
    }
  }
}

module.exports = NavigationTestUtils;