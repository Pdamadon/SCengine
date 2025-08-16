#!/usr/bin/env node

const { chromium } = require('playwright');

async function debugMacysNavigation() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // Block images and fonts for speed
  await page.route('**/*', (route) => {
    const resourceType = route.request().resourceType();
    if (['image', 'font', 'media'].includes(resourceType)) {
      route.abort();
    } else {
      route.continue();
    }
  });
  
  try {
    await page.goto('https://www.macys.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 10000 
    });
    await page.waitForTimeout(2000);
    
    // Find all potential containers
    const containers = await page.evaluate(() => {
      const selectors = ['header', 'nav', 'div', 'section'];
      const found = [];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (let i = 0; i < Math.min(elements.length, 10); i++) {
          const element = elements[i];
          const rect = element.getBoundingClientRect();
          const links = element.querySelectorAll('a, button');
          
          // Only include elements in the top area with some links
          if (rect.top <= 400 && links.length >= 1 && rect.width > 0 && rect.height > 0) {
            found.push({
              selector: selector,
              index: i,
              bounds: { 
                top: Math.round(rect.top), 
                width: Math.round(rect.width), 
                height: Math.round(rect.height) 
              },
              linkCount: links.length,
              id: element.id || '',
              className: element.className || '',
              sampleLinks: Array.from(links).slice(0, 3).map(link => ({
                text: link.textContent.trim().substring(0, 50),
                href: link.href?.substring(0, 100)
              }))
            });
          }
        }
      }
      
      return found.sort((a, b) => a.bounds.top - b.bounds.top).slice(0, 15);
    });
    
    console.log('Potential header containers on Macy\'s:');
    console.log(JSON.stringify(containers, null, 2));
    
  } finally {
    await browser.close();
  }
}

debugMacysNavigation().catch(console.error);