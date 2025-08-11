const ShopifyScraper = require('./src/scraping/ShopifyScraper');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

async function debugSelectors() {
  const scraper = new ShopifyScraper(logger);
  await scraper.initialize();
  
  const context = await scraper.browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log('🔍 Debugging Glasswing Shop selectors...');
    await page.goto('https://glasswingshop.com/collections/shoes', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    const selectorDebug = await page.evaluate(() => {
      const debug = {
        productSelectors: {},
        foundElements: {},
        pageStructure: {}
      };
      
      // Test various product selectors
      const productSelectors = [
        '.product-item',
        '.product-card', 
        '.grid-product',
        '.product',
        '.grid__item',
        '.collection-product',
        '[data-product]',
        '.card',
        '.card-wrapper',
        '.grid-view-item'
      ];
      
      productSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        debug.productSelectors[selector] = elements.length;
        
        if (elements.length > 0) {
          debug.foundElements[selector] = Array.from(elements).slice(0, 3).map(el => ({
            tagName: el.tagName,
            className: el.className,
            textContent: el.textContent?.substring(0, 100)
          }));
        }
      });
      
      // Check for product links
      const productLinks = document.querySelectorAll('a[href*="/products/"]');
      debug.pageStructure.productLinks = productLinks.length;
      
      if (productLinks.length > 0) {
        debug.pageStructure.sampleProductLinks = Array.from(productLinks).slice(0, 5).map(link => ({
          href: link.href,
          text: link.textContent?.trim()
        }));
      }
      
      // Check general structure
      debug.pageStructure.totalLinks = document.querySelectorAll('a').length;
      debug.pageStructure.totalImages = document.querySelectorAll('img').length;
      debug.pageStructure.totalElements = document.querySelectorAll('*').length;
      
      // Look for common Shopify classes
      const shopifyClasses = [
        '.shopify-section',
        '.collection',
        '.grid',
        '.main-content',
        '.template-collection'
      ];
      
      shopifyClasses.forEach(cls => {
        const elements = document.querySelectorAll(cls);
        if (elements.length > 0) {
          debug.pageStructure[cls] = elements.length;
        }
      });
      
      return debug;
    });
    
    console.log('📊 Selector Analysis Results:');
    console.log('==========================');
    
    console.log('\n🎯 Product Selectors:');
    Object.entries(selectorDebug.productSelectors).forEach(([selector, count]) => {
      console.log(`  ${selector}: ${count} elements`);
    });
    
    console.log('\n📦 Found Elements (first 3):');
    Object.entries(selectorDebug.foundElements).forEach(([selector, elements]) => {
      console.log(`  ${selector}:`);
      elements.forEach((el, i) => {
        console.log(`    ${i+1}. ${el.tagName}.${el.className} - "${el.textContent}"`);
      });
    });
    
    console.log('\n🏗️  Page Structure:');
    Object.entries(selectorDebug.pageStructure).forEach(([key, value]) => {
      if (key === 'sampleProductLinks') {
        console.log(`  ${key}:`);
        value.forEach((link, i) => {
          console.log(`    ${i+1}. ${link.href} - "${link.text}"`);
        });
      } else {
        console.log(`  ${key}: ${value}`);
      }
    });
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await page.close();
    await context.close();
    await scraper.close();
  }
}

debugSelectors().catch(console.error);