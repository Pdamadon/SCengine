/**
 * Debug: Inspect actual HTML navigation structure on glasswingshop.com
 */

const { logger } = require('../../../utils/logger');
const { chromium } = require('playwright');

async function debugHtmlStructure() {
  const targetUrl = 'https://glasswingshop.com';
  let browser = null;

  try {
    logger.info('🔍 Debugging HTML navigation structure on glasswingshop.com');

    browser = await chromium.launch({ 
      headless: false,
      devtools: true
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    logger.info('📊 Extracting navigation HTML structure...');

    // Get the actual HTML structure of navigation areas
    const navStructure = await page.evaluate(() => {
      const results = {};
      
      // Find all nav elements
      const navElements = document.querySelectorAll('nav, [role="navigation"], .navigation, .nav, .menu');
      
      navElements.forEach((nav, index) => {
        const navInfo = {
          tag: nav.tagName.toLowerCase(),
          id: nav.id || 'no-id',
          classes: nav.className || 'no-classes',
          innerHTML: nav.innerHTML.substring(0, 2000), // First 2000 chars
          outerHTML: nav.outerHTML.substring(0, 1000), // First 1000 chars of outer
          children: Array.from(nav.children).map(child => ({
            tag: child.tagName.toLowerCase(),
            classes: child.className,
            text: child.textContent?.trim().substring(0, 100)
          }))
        };
        
        results[`nav_${index}`] = navInfo;
      });
      
      return results;
    });

    console.log('\n🏗️ NAVIGATION HTML STRUCTURE:');
    Object.entries(navStructure).forEach(([key, nav]) => {
      console.log(`\n=== ${key.toUpperCase()} ===`);
      console.log(`Tag: ${nav.tag}`);
      console.log(`ID: ${nav.id}`);
      console.log(`Classes: ${nav.classes}`);
      console.log(`Children count: ${nav.children.length}`);
      
      console.log('\nDirect children:');
      nav.children.forEach((child, i) => {
        console.log(`  [${i}] <${child.tag} class="${child.classes}"> "${child.text}"`);
      });
      
      console.log('\nOuter HTML structure:');
      console.log(nav.outerHTML);
      console.log('\n' + '='.repeat(50));
    });

    // Look specifically for elements containing our expected text
    console.log('\n🎯 SEARCHING FOR EXPECTED NAVIGATION TEXT:');
    const expectedItems = ['CLOTHING', 'MAN', 'WOMAN', 'BATH & BODY', 'HOME', 'GREENHOUSE', 'SEATTLE'];
    
    const textSearch = await page.evaluate((items) => {
      const findings = {};
      
      items.forEach(item => {
        // Find any element containing this text
        const elements = Array.from(document.querySelectorAll('*')).filter(el => {
          const text = el.textContent || '';
          return text.toUpperCase().includes(item.toUpperCase()) && 
                 text.length < 200; // Not too long
        });
        
        findings[item] = elements.map(el => ({
          tag: el.tagName.toLowerCase(),
          classes: el.className,
          id: el.id,
          text: el.textContent?.trim(),
          parent: {
            tag: el.parentElement?.tagName.toLowerCase(),
            classes: el.parentElement?.className,
            id: el.parentElement?.id
          },
          isVisible: el.offsetParent !== null
        }));
      });
      
      return findings;
    }, expectedItems);

    expectedItems.forEach(item => {
      const elements = textSearch[item] || [];
      console.log(`\n"${item}": Found ${elements.length} elements`);
      
      elements.forEach((el, i) => {
        console.log(`  [${i}] <${el.tag} class="${el.classes}" id="${el.id}">`);
        console.log(`      Text: "${el.text}"`);
        console.log(`      Parent: <${el.parent.tag} class="${el.parent.classes}">`);
        console.log(`      Visible: ${el.isVisible}`);
      });
    });

    console.log('\n✅ HTML structure analysis complete!');
    
    return {
      navElements: Object.keys(navStructure).length,
      expectedItemsFound: expectedItems.reduce((count, item) => 
        count + (textSearch[item]?.length > 0 ? 1 : 0), 0
      ),
      structure: navStructure,
      textSearch: textSearch
    };

  } catch (error) {
    logger.error('❌ Debug failed:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the debug
debugHtmlStructure();