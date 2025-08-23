const BrowserManagerBrowserless = require('../../../src/common/BrowserManagerBrowserless');

async function debugGlasswingPage() {
  const browserManager = new BrowserManagerBrowserless();
  let page, closeBrowser;
  
  try {
    console.log('🔍 Debugging Glasswing page structure...\n');
    
    // Initialize browser
    const browserSession = await browserManager.createBrowser('stealth');
    page = browserSession.page;
    closeBrowser = browserSession.close;
    
    // Navigate to Glasswing main page first to find working products
    const baseUrl = 'https://glasswingshop.com';
    console.log(`🔗 Navigating to: ${baseUrl}`);
    
    await page.goto(testUrl, { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    // Debug: Check page content
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        hasSelects: document.querySelectorAll('select').length,
        hasButtons: document.querySelectorAll('button').length,
        hasInputs: document.querySelectorAll('input').length,
        hasForms: document.querySelectorAll('form').length,
        bodyText: document.body.textContent.substring(0, 200)
      };
    });
    
    console.log('📄 Page Info:', pageInfo);
    
    // Find all selects
    const selects = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('select')).map(select => ({
        tagName: select.tagName,
        name: select.name,
        id: select.id,
        className: select.className,
        optionsCount: select.options.length,
        options: Array.from(select.options).map(opt => ({
          value: opt.value,
          text: opt.textContent.trim()
        }))
      }));
    });
    
    console.log('\n🎯 SELECT elements found:', selects);
    
    // Find all buttons
    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).map(btn => ({
        tagName: btn.tagName,
        text: btn.textContent?.trim(),
        className: btn.className,
        disabled: btn.disabled,
        type: btn.type
      }));
    });
    
    console.log('\n🔘 BUTTON elements found:', buttons);
    
    // Find potential cart buttons
    const cartCandidates = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, input[type="submit"]'))
        .filter(btn => {
          const text = btn.textContent?.toLowerCase() || btn.value?.toLowerCase() || '';
          return text.includes('add') || text.includes('cart') || text.includes('buy');
        })
        .map(btn => ({
          text: btn.textContent?.trim() || btn.value,
          className: btn.className,
          disabled: btn.disabled
        }));
    });
    
    console.log('\n🛒 Cart button candidates:', cartCandidates);
    
    // Find all images
    const images = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.src.substring(0, 60) + '...',
        alt: img.alt,
        width: img.naturalWidth,
        height: img.naturalHeight,
        className: img.className
      }));
    });
    
    console.log('\n🖼️  IMAGE elements found:', images.length);
    
    // Check for product context elements
    const productContext = await page.evaluate(() => {
      return {
        hasDataProduct: !!document.querySelector('[data-product]'),
        hasProductClass: !!document.querySelector('.product, #product, [class*="product"]'),
        productElements: Array.from(document.querySelectorAll('[data-product], .product, #product, [class*="product"]')).map(el => ({
          tagName: el.tagName,
          className: el.className,
          id: el.id
        }))
      };
    });
    
    console.log('\n🏷️  Product context:', productContext);
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  } finally {
    if (closeBrowser) {
      await closeBrowser();
    }
  }
}

debugGlasswingPage();