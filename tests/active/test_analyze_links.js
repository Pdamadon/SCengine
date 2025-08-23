#!/usr/bin/env node

/**
 * Analyze all product links on Glasswing page
 */

require('dotenv').config();
const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');

async function analyzeLinks() {
  const browserManager = new BrowserManagerBrowserless();
  
  try {
    const { page, close } = await browserManager.createBrowser('stealth');
    
    const testUrl = 'https://glasswingshop.com/collections/mens-collection';
    console.log(`Navigating to ${testUrl}\n`);
    
    await page.goto(testUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Extract all product links
    const analysis = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('a[href]'));
      const productLinks = {};
      
      allLinks.forEach(link => {
        const href = link.href;
        if (href && href.includes('/products/')) {
          const text = link.textContent.trim();
          
          if (!productLinks[href]) {
            productLinks[href] = {
              url: href,
              texts: [],
              count: 0
            };
          }
          
          productLinks[href].texts.push(text);
          productLinks[href].count++;
        }
      });
      
      // Convert to array and sort by count
      const results = Object.values(productLinks).sort((a, b) => b.count - a.count);
      
      return {
        totalUniqueProducts: results.length,
        totalProductLinks: results.reduce((sum, p) => sum + p.count, 0),
        products: results
      };
    });
    
    // Output as JSON
    console.log(JSON.stringify(analysis, null, 2));
    
    await close();
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browserManager.closeAll();
  }
}

analyzeLinks().catch(console.error);