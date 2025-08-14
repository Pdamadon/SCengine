#!/usr/bin/env node

/**
 * Analyze the discovery results to understand what kinds of links we're getting
 */

const fs = require('fs').promises;
const path = require('path');

async function analyzeDiscoveryResults() {
  // Find the most recent results file
  const files = await fs.readdir(__dirname);
  const resultFiles = files.filter(f => f.startsWith('hierarchy-test-results-'));
  
  if (resultFiles.length === 0) {
    console.error('No results files found');
    return;
  }
  
  // Get the most recent file
  const latestFile = resultFiles.sort().pop();
  console.log(`\n📄 Analyzing: ${latestFile}\n`);
  
  const data = JSON.parse(await fs.readFile(path.join(__dirname, latestFile), 'utf8'));
  
  data.forEach(siteResult => {
    console.log('='.repeat(60));
    console.log(`🏪 ${siteResult.site}`);
    console.log('='.repeat(60));
    
    if (siteResult.error) {
      console.log(`❌ Error: ${siteResult.error}\n`);
      return;
    }
    
    // Analyze the raw discovery data
    const nav = siteResult.raw_discovery;
    
    console.log('\n📊 OVERALL STATS:');
    console.log(`  Total items: ${nav.total_items}`);
    console.log(`  Main sections: ${nav.main_sections?.length || 0}`);
    console.log(`  Dropdowns: ${Object.keys(nav.dropdown_menus || {}).length}`);
    console.log(`  Sidebar nav: ${nav.sidebar_navigation?.length || 0}`);
    console.log(`  Clickable elements: ${nav.clickable_elements?.length || 0}`);
    
    // Analyze main sections
    if (nav.main_sections && nav.main_sections.length > 0) {
      console.log('\n🔍 MAIN SECTIONS ANALYSIS:');
      
      // Categorize by URL patterns
      const urlPatterns = {
        departments: [],
        categories: [],
        sales: [],
        brands: [],
        deepLinks: [],
        other: []
      };
      
      nav.main_sections.forEach(section => {
        const text = (section.name || section.text || '').toLowerCase();
        const url = section.url || '';
        
        // Categorize by URL and text
        if (url.includes('/shop/') && (text.includes('women') || text.includes('men') || text.includes('kids') || text.includes('home'))) {
          urlPatterns.departments.push(section);
        } else if (url.includes('/shop/') && (text.includes('shoes') || text.includes('clothing') || text.includes('accessories'))) {
          urlPatterns.categories.push(section);
        } else if (text.includes('sale') || text.includes('clearance') || text.includes('deal')) {
          urlPatterns.sales.push(section);
        } else if (url.includes('/brands/') || text.includes('brand')) {
          urlPatterns.brands.push(section);
        } else if (url.includes('?id=') || url.includes('&id=')) {
          urlPatterns.deepLinks.push(section);
        } else {
          urlPatterns.other.push(section);
        }
      });
      
      console.log('\n  URL Pattern Breakdown:');
      console.log(`    • Departments: ${urlPatterns.departments.length}`);
      console.log(`    • Categories: ${urlPatterns.categories.length}`);
      console.log(`    • Sales/Deals: ${urlPatterns.sales.length}`);
      console.log(`    • Brands: ${urlPatterns.brands.length}`);
      console.log(`    • Deep Links (with IDs): ${urlPatterns.deepLinks.length}`);
      console.log(`    • Other: ${urlPatterns.other.length}`);
      
      // Show samples from each category
      console.log('\n  📌 Sample Links by Category:');
      
      if (urlPatterns.departments.length > 0) {
        console.log('\n    DEPARTMENTS:');
        urlPatterns.departments.slice(0, 3).forEach(item => {
          console.log(`      - ${item.name || item.text}`);
          console.log(`        ${item.url}`);
        });
      }
      
      if (urlPatterns.categories.length > 0) {
        console.log('\n    CATEGORIES:');
        urlPatterns.categories.slice(0, 3).forEach(item => {
          console.log(`      - ${item.name || item.text}`);
          console.log(`        ${item.url}`);
        });
      }
      
      if (urlPatterns.deepLinks.length > 0) {
        console.log('\n    DEEP LINKS (problematic):');
        urlPatterns.deepLinks.slice(0, 3).forEach(item => {
          console.log(`      - ${item.name || item.text}`);
          console.log(`        ${item.url}`);
        });
      }
      
      // Analyze discovered_via
      const discoveryMethods = {};
      nav.main_sections.forEach(section => {
        const method = section.discovered_via || 'unknown';
        discoveryMethods[method] = (discoveryMethods[method] || 0) + 1;
      });
      
      console.log('\n  🎯 Discovery Method Breakdown:');
      Object.entries(discoveryMethods).forEach(([method, count]) => {
        console.log(`    • ${method}: ${count} items`);
      });
      
      // Check for dropdown indicators
      const withDropdowns = nav.main_sections.filter(s => s.has_dropdown);
      console.log(`\n  📁 Items with dropdowns: ${withDropdowns.length}`);
      if (withDropdowns.length > 0) {
        console.log('    Examples:');
        withDropdowns.slice(0, 3).forEach(item => {
          console.log(`      - ${item.name || item.text}`);
        });
      }
    }
    
    // Analyze hierarchy levels
    if (siteResult.hierarchy) {
      console.log('\n🏗️ HIERARCHY STRUCTURE:');
      const hierarchy = siteResult.hierarchy;
      
      Object.entries(hierarchy.levels).forEach(([level, items]) => {
        if (items.length > 0) {
          console.log(`\n  Level ${level}: ${items.length} items`);
          // Show first few items
          items.slice(0, 3).forEach(item => {
            console.log(`    - ${item.name} ${item.parent ? `(parent: ${item.parent})` : ''}`);
          });
        }
      });
      
      // Analyze paths
      if (hierarchy.paths && hierarchy.paths.length > 0) {
        console.log(`\n  🛤️ Navigation Paths: ${hierarchy.paths.length} total`);
        const completePaths = hierarchy.paths.filter(p => p.complete);
        const incompletePaths = hierarchy.paths.filter(p => !p.complete);
        console.log(`    • Complete: ${completePaths.length}`);
        console.log(`    • Incomplete: ${incompletePaths.length}`);
        
        // Group paths by depth
        const pathsByDepth = {};
        hierarchy.paths.forEach(p => {
          const depth = (p.path.match(/→/g) || []).length;
          pathsByDepth[depth] = (pathsByDepth[depth] || 0) + 1;
        });
        
        console.log('\n    Paths by depth:');
        Object.entries(pathsByDepth).forEach(([depth, count]) => {
          console.log(`      Depth ${depth}: ${count} paths`);
        });
      }
    }
    
    // Check for mega-menu discovery
    console.log('\n🔎 MEGA-MENU DETECTION:');
    const hasDropdowns = Object.keys(nav.dropdown_menus || {}).length > 0;
    const hasInteractionItems = nav.main_sections?.some(s => s.discovered_via === 'interaction');
    
    console.log(`  • Dropdown menus found: ${hasDropdowns ? 'Yes' : 'No'}`);
    console.log(`  • Interaction-discovered items: ${hasInteractionItems ? 'Yes' : 'No'}`);
    
    if (nav._pipeline_metadata) {
      console.log('\n📈 PIPELINE METADATA:');
      const meta = nav._pipeline_metadata;
      console.log(`  • Strategies used: ${meta.strategies_used?.join(', ') || 'N/A'}`);
      console.log(`  • Confidence: ${((meta.confidence || 0) * 100).toFixed(1)}%`);
    }
    
    console.log('\n');
  });
  
  // Overall recommendations
  console.log('='.repeat(60));
  console.log('💡 ANALYSIS INSIGHTS');
  console.log('='.repeat(60));
  
  console.log('\n🚨 KEY ISSUES IDENTIFIED:\n');
  console.log('1. Getting mostly deep category links instead of main navigation');
  console.log('2. URLs contain product IDs (?id=) suggesting we\'re getting filtered views');
  console.log('3. No dropdown menus being discovered (hover interactions failing)');
  console.log('4. Mix of sale pages, subcategories, and specific product types');
  console.log('5. Discovery method showing as "unknown" - strategy attribution broken');
  
  console.log('\n✅ RECOMMENDATIONS:\n');
  console.log('1. Fix popup/overlay handling before hover interactions');
  console.log('2. Filter out deep links with query parameters in navigation discovery');
  console.log('3. Focus on finding main department links first (Women, Men, Kids, etc.)');
  console.log('4. Implement proper parent-child relationship tracking');
  console.log('5. Fix strategy attribution in discovery pipeline');
}

// Run analysis
analyzeDiscoveryResults().catch(console.error);