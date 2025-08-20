/**
 * Analyze the actual product structure on Glasswing
 * to understand what selectors we need
 */

require('dotenv').config();
const BrowserManager = require('./src/common/BrowserManager');
const { logger } = require('./src/utils/logger');

async function analyzeGlaswingStructure() {
  console.log('🔍 Analyzing Glasswing Product Structure');
  console.log('=' .repeat(60));
  
  const browserManager = new BrowserManager();
  
  try {
    const browser = await browserManager.createBrowser('stealth', {
      skipResourceBlocking: false
    });
    
    const testUrl = 'https://glasswingshop.com/collections/mens-collection';
    console.log(`\nNavigating to ${testUrl}`);
    
    await browser.page.goto(testUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });
    
    await browser.page.waitForTimeout(2000);
    
    // Analyze the actual structure
    const structure = await browser.page.evaluate(() => {
      const analysis = {
        actualProducts: [],
        navigationLinks: [],
        selectors: {
          working: [],
          notWorking: []
        }
      };
      
      // Test 1: Find actual product links (they should have /products/ in URL)
      const allLinks = Array.from(document.querySelectorAll('a[href]'));
      
      allLinks.forEach(link => {
        const href = link.href;
        if (href.includes('/products/')) {
          // This is an actual product
          const container = link.closest('div, li, article');
          analysis.actualProducts.push({
            url: href,
            text: link.textContent.trim(),
            containerClass: container?.className || 'no-container',
            linkClass: link.className || 'no-class',
            parentClasses: [
              link.parentElement?.className || '',
              link.parentElement?.parentElement?.className || '',
              link.parentElement?.parentElement?.parentElement?.className || ''
            ].filter(Boolean)
          });
        } else if (href.includes('/collections/')) {
          // This is a navigation/category link
          analysis.navigationLinks.push({
            url: href,
            text: link.textContent.trim()
          });
        }
      });
      
      // Test 2: Check specific selectors
      const selectorsToTest = [
        // Glasswing-specific attempts
        '.open-product',
        '.open-product-item',
        '.product-item',
        '.grid-item',
        '.collection-product',
        'a[href*="/products/"]',
        '[data-product-id]',
        '.product-card',
        
        // Common Shopify patterns
        '.product-form',
        '.product-grid-item', 
        '.grid__item',
        '.card-wrapper',
        
        // Generic patterns that might work
        '.item',
        'article',
        '.card'
      ];
      
      selectorsToTest.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          // Check if these actually contain product links
          let productCount = 0;
          elements.forEach(el => {
            if (el.querySelector('a[href*="/products/"]')) {
              productCount++;
            }
          });
          
          if (productCount > 0) {
            analysis.selectors.working.push({
              selector,
              totalFound: elements.length,
              withProducts: productCount
            });
          } else {
            analysis.selectors.notWorking.push({
              selector,
              found: elements.length,
              reason: 'No product links inside'
            });
          }
        }
      });
      
      // Test 3: Find the actual product grid
      const grids = document.querySelectorAll('[class*="grid"], [class*="collection"], [class*="products"]');
      const productGrid = Array.from(grids).find(grid => {
        const productLinks = grid.querySelectorAll('a[href*="/products/"]');
        return productLinks.length > 5; // Has multiple product links
      });
      
      if (productGrid) {
        analysis.productGridClass = productGrid.className;
        analysis.productGridChildren = productGrid.children.length;
      }
      
      return analysis;
    });
    
    // Display results
    console.log('\n📊 STRUCTURE ANALYSIS');
    console.log('=' .repeat(60));
    
    console.log(`\n✅ Actual Products Found: ${structure.actualProducts.length}`);
    if (structure.actualProducts.length > 0) {
      console.log('\nFirst 3 products:');
      structure.actualProducts.slice(0, 3).forEach((product, i) => {
        console.log(`\n${i + 1}. ${product.text}`);
        console.log(`   URL: ${product.url}`);
        console.log(`   Container class: ${product.containerClass}`);
        console.log(`   Link class: ${product.linkClass}`);
        console.log(`   Parent classes:`, product.parentClasses);
      });
    }
    
    console.log(`\n❌ Navigation Links Found: ${structure.navigationLinks.length}`);
    console.log('Sample navigation links:');
    structure.navigationLinks.slice(0, 3).forEach(link => {
      console.log(`  - ${link.text}: ${link.url}`);
    });
    
    console.log('\n🎯 Working Selectors:');
    if (structure.selectors.working.length > 0) {
      structure.selectors.working.forEach(s => {
        console.log(`  ✅ "${s.selector}" - Found ${s.totalFound}, ${s.withProducts} have products`);
      });
    } else {
      console.log('  None found!');
    }
    
    console.log('\n❌ Non-Working Selectors:');
    structure.selectors.notWorking.slice(0, 5).forEach(s => {
      console.log(`  - "${s.selector}" - ${s.reason}`);
    });
    
    if (structure.productGridClass) {
      console.log('\n📦 Product Grid:');
      console.log(`  Class: ${structure.productGridClass}`);
      console.log(`  Children: ${structure.productGridChildren}`);
    }
    
    // Save for analysis
    const fs = require('fs').promises;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `data/output/data/glasswing_structure_${timestamp}.json`;
    
    await fs.writeFile(filename, JSON.stringify(structure, null, 2));
    console.log(`\n💾 Full analysis saved to: ${filename}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    logger.error('Structure analysis failed', error);
  } finally {
    await browserManager.closeAll();
    console.log('\n✅ Analysis complete!');
  }
}

// Run the analysis
analyzeGlaswingStructure().catch(console.error);