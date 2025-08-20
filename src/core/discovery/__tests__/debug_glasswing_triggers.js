/**
 * Debug: What navigation triggers are we actually finding on glasswingshop.com?
 */

const { logger } = require('./src/utils/logger');
const { chromium } = require('playwright');

async function debugNavigationTriggers() {
  const targetUrl = 'https://glasswingshop.com';
  let browser = null;
  let page = null;

  try {
    logger.info('🔍 Debugging navigation trigger detection on glasswingshop.com');

    // Launch visible browser
    browser = await chromium.launch({ 
      headless: false,
      devtools: true 
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    logger.info('📊 Page loaded, analyzing navigation elements...');

    // Extract all potential navigation triggers using our selectors
    const navigationElements = await page.evaluate(() => {
      const selectors = [
        'nav a', 'nav button', 'nav li',
        '.navigation a', '.navigation li',
        '.menu a', '.menu li',
        '[role="navigation"] a', '[role="navigation"] li',
        '.nav-item', '.menu-item', '.nav-link',
        '[class*="nav"] > li', '[class*="menu"] > li',
        '.header-nav a', '.main-nav a'
      ];

      const results = [];
      
      selectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach((el, index) => {
            const text = el.textContent?.trim();
            const href = el.href || el.getAttribute('href');
            
            if (text && text.length > 0) {
              results.push({
                selector: selector,
                text: text,
                href: href,
                tag: el.tagName.toLowerCase(),
                classes: el.className,
                parentClasses: el.parentElement?.className,
                isVisible: el.offsetParent !== null,
                rect: el.getBoundingClientRect()
              });
            }
          });
        } catch (e) {
          console.warn(`Selector failed: ${selector}`, e.message);
        }
      });

      return results;
    });

    logger.info(`Found ${navigationElements.length} potential navigation elements`);

    // Group by text content to see duplicates
    const groupedByText = {};
    navigationElements.forEach(el => {
      if (!groupedByText[el.text]) {
        groupedByText[el.text] = [];
      }
      groupedByText[el.text].push(el);
    });

    console.log('\n📋 NAVIGATION ELEMENTS FOUND:');
    Object.keys(groupedByText).forEach(text => {
      const elements = groupedByText[text];
      const visibleCount = elements.filter(el => el.isVisible).length;
      
      console.log(`\n"${text}"`);
      console.log(`  Found: ${elements.length} elements, ${visibleCount} visible`);
      
      elements.forEach((el, i) => {
        console.log(`  [${i}] ${el.tag}.${el.classes} via "${el.selector}"`);
        console.log(`      href: ${el.href}`);
        console.log(`      visible: ${el.isVisible}, size: ${Math.round(el.rect.width)}x${Math.round(el.rect.height)}`);
      });
    });

    // Special check: look for the exact navigation we saw in screenshot
    console.log('\n🎯 CHECKING FOR EXPECTED NAVIGATION:');
    const expectedItems = ['CLOTHING', 'MAN', 'WOMAN', 'BATH & BODY', 'HOME', 'GREENHOUSE', 'SEATTLE'];
    
    expectedItems.forEach(item => {
      const found = Object.keys(groupedByText).find(text => 
        text.toUpperCase().includes(item.toUpperCase()) || item.toUpperCase().includes(text.toUpperCase())
      );
      
      console.log(`${found ? '✅' : '❌'} ${item}: ${found ? `found as "${found}"` : 'NOT FOUND'}`);
    });

    // Keep browser open for manual inspection
    console.log('\n🔍 Browser left open for manual inspection. Press Ctrl+C to close.');
    await new Promise(() => {}); // Keep alive

  } catch (error) {
    logger.error('❌ Debug failed:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the debug
debugNavigationTriggers();