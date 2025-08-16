#!/usr/bin/env node

const { chromium } = require('playwright');

async function debugGlasswingNavigation() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://glasswingshop.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    // Find header containers
    const headers = await page.evaluate(() => {
      const headerSelectors = ['header', '.header', '#header', 'nav', '.navigation'];
      const found = [];
      
      for (const selector of headerSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const rect = element.getBoundingClientRect();
          const links = element.querySelectorAll('a, button');
          
          found.push({
            selector: selector,
            bounds: { top: rect.top, width: rect.width, height: rect.height },
            linkCount: links.length,
            links: Array.from(links).slice(0, 5).map(link => ({
              text: link.textContent.trim(),
              href: link.href,
              tagName: link.tagName
            }))
          });
        }
      }
      
      return found;
    });
    
    console.log('Header containers found:');
    console.log(JSON.stringify(headers, null, 2));
    
    // Look specifically for navigation links
    const navLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links
        .filter(link => {
          const rect = link.getBoundingClientRect();
          return rect.top <= 220 && rect.width > 0 && rect.height > 0;
        })
        .slice(0, 20)
        .map(link => ({
          text: link.textContent.trim(),
          href: link.href,
          className: link.className,
          parentTag: link.parentElement?.tagName,
          parentClass: link.parentElement?.className
        }));
    });
    
    console.log('\nTop navigation links:');
    console.log(JSON.stringify(navLinks, null, 2));
    
  } finally {
    await browser.close();
  }
}

debugGlasswingNavigation().catch(console.error);