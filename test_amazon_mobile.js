#!/usr/bin/env node

const { chromium } = require('playwright');

async function testAmazonMobile() {
  console.log('📱 Testing Amazon with mobile-first approach\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--disable-dev-shm-usage',
      '--disable-features=VizDisplayCompositor',
      '--disable-web-security',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'DNT': '1',
      'Connection': 'keep-alive'
    }
  });
  
  const page = await context.newPage();
  
  // Block images and ads for speed
  await page.route('**/*', (route) => {
    const resourceType = route.request().resourceType();
    const url = route.request().url();
    if (['image', 'font', 'media'].includes(resourceType) || 
        url.includes('doubleclick') || url.includes('googlesyndication')) {
      route.abort();
    } else {
      route.continue();
    }
  });
  
  try {
    console.log('📍 Navigating to Amazon...');
    
    const startTime = Date.now();
    await page.goto('https://www.amazon.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 15000 
    });
    
    const loadTime = Date.now() - startTime;
    console.log(`✅ Page loaded in ${loadTime}ms`);
    
    // Wait for content to load
    await page.waitForTimeout(3000);
    
    console.log('🔍 Analyzing Amazon page structure...');
    
    const pageAnalysis = await page.evaluate(() => {
      return {
        title: document.title,
        hasContent: document.querySelectorAll('a').length > 10,
        headerCount: document.querySelectorAll('header').length,
        navCount: document.querySelectorAll('nav').length,
        totalLinks: document.querySelectorAll('a').length,
        bodyText: document.body.textContent.substring(0, 200),
        hasHamburgerMenu: !!document.querySelector('[data-csa-c-type="button"][aria-label*="menu"], .nav-hamburger-menu, #nav-hamburger-menu'),
        antiBot: {
          captcha: document.body.textContent.includes('robot') || document.body.textContent.includes('captcha'),
          blocked: document.title.includes('Sorry') || document.body.textContent.includes('Request blocked')
        }
      };
    });
    
    console.log('📊 Amazon page analysis:');
    console.log(`  Title: "${pageAnalysis.title}"`);
    console.log(`  Has content: ${pageAnalysis.hasContent}`);
    console.log(`  Headers: ${pageAnalysis.headerCount}, Nav: ${pageAnalysis.navCount}`);
    console.log(`  Total links: ${pageAnalysis.totalLinks}`);
    console.log(`  Has hamburger menu: ${pageAnalysis.hasHamburgerMenu}`);
    console.log(`  Body preview: "${pageAnalysis.bodyText}"`);
    console.log('🛡️ Anti-bot detection:', pageAnalysis.antiBot);
    
    if (pageAnalysis.antiBot.captcha || pageAnalysis.antiBot.blocked) {
      console.log('❌ Amazon is blocking access with captcha/robot detection');
      return;
    }
    
    if (!pageAnalysis.hasContent) {
      console.log('❌ Page appears to have minimal content');
      return;
    }
    
    console.log('\n🍔 Looking for hamburger menu...');
    
    // Try to find and click hamburger menu
    const hamburgerFound = await page.evaluate(() => {
      const hamburgerSelectors = [
        '[data-csa-c-type="button"][aria-label*="menu"]',
        '.nav-hamburger-menu',
        '#nav-hamburger-menu',
        'button[aria-label*="Menu"]',
        'button[aria-label*="menu"]',
        '.hamburger',
        '.menu-toggle',
        '[data-testid*="menu"]'
      ];
      
      for (const selector of hamburgerSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && rect.top < 200) {
            return {
              found: true,
              selector: selector,
              text: element.textContent.trim(),
              classes: element.className,
              ariaLabel: element.getAttribute('aria-label'),
              position: { top: rect.top, left: rect.left }
            };
          }
        }
      }
      
      return { found: false };
    });
    
    if (hamburgerFound.found) {
      console.log(`🍔 Found hamburger menu: ${hamburgerFound.selector}`);
      console.log(`   Text: "${hamburgerFound.text}"`);
      console.log(`   Classes: "${hamburgerFound.classes}"`);
      console.log(`   Aria-label: "${hamburgerFound.ariaLabel}"`);
      console.log(`   Position: ${hamburgerFound.position.top}px from top`);
      
      try {
        console.log('👆 Clicking hamburger menu...');
        await page.click(hamburgerFound.selector);
        await page.waitForTimeout(2000); // Amazon might be slow
        
        // Check if menu opened and extract navigation
        const menuContent = await page.evaluate(() => {
          // Look for opened menu containers
          const menuSelectors = [
            '#hmenu-content',
            '.hmenu-content', 
            '[data-menu-id="1"]',
            '.nav-flyout-content',
            '.nav-template',
            '[class*="menu"]:not([style*="display: none"])',
            '[class*="drawer"]:not([style*="display: none"])'
          ];
          
          const categories = [];
          const departmentKeywords = [
            'books', 'electronics', 'computers', 'home', 'garden', 'tools',
            'grocery', 'health', 'beauty', 'toys', 'games', 'clothing',
            'shoes', 'jewelry', 'sports', 'outdoors', 'automotive',
            'industrial', 'kindle', 'movies', 'music', 'baby', 'pets'
          ];
          
          for (const selector of menuSelectors) {
            const menuContainer = document.querySelector(selector);
            if (menuContainer) {
              const links = menuContainer.querySelectorAll('a');
              
              console.log(`Found menu container: ${selector} with ${links.length} links`);
              
              for (const link of links) {
                const text = link.textContent.trim();
                const url = link.href;
                
                if (text.length >= 3 && text.length <= 40 && url) {
                  const lowerText = text.toLowerCase();
                  const isDepartment = departmentKeywords.some(dept => lowerText.includes(dept)) ||
                                     text.includes('&') || // "Home & Kitchen"
                                     text.includes('Baby') ||
                                     text.includes('Electronics') ||
                                     text.includes('Books');
                  
                  categories.push({
                    name: text,
                    url: url,
                    isDepartment: isDepartment,
                    menuSource: selector
                  });
                }
              }
              
              break; // Use first found menu
            }
          }
          
          return {
            menuFound: categories.length > 0,
            totalCategories: categories.length,
            categories: categories.slice(0, 30), // Limit for display
            departments: categories.filter(cat => cat.isDepartment).slice(0, 20)
          };
        });
        
        console.log(`📱 Menu extraction results:`);
        console.log(`  Menu found: ${menuContent.menuFound}`);
        console.log(`  Total categories: ${menuContent.totalCategories}`);
        console.log(`  Department categories: ${menuContent.departments.length}`);
        
        if (menuContent.departments.length > 0) {
          console.log(`\n🏪 Amazon departments found:`);
          menuContent.departments.forEach((dept, i) => {
            console.log(`  ${i + 1}. ${dept.name} (${dept.menuSource})`);
          });
        }
        
        if (menuContent.categories.length > 0) {
          console.log(`\n📂 All categories (first 15):`);
          menuContent.categories.slice(0, 15).forEach((cat, i) => {
            const icon = cat.isDepartment ? '🏪' : '📂';
            console.log(`  ${i + 1}. ${icon} ${cat.name}`);
          });
        }
        
        if (menuContent.totalCategories >= 10) {
          console.log('\n✅ SUCCESS: Amazon mobile navigation extracted!');
          return menuContent;
        } else {
          console.log('❌ Not enough categories found in menu');
        }
        
      } catch (error) {
        console.log(`❌ Error clicking hamburger menu: ${error.message}`);
      }
    } else {
      console.log('❌ No hamburger menu found');
      
      // Try to find any visible navigation
      console.log('\n🔍 Looking for visible navigation...');
      const visibleNav = await page.evaluate(() => {
        const departmentKeywords = [
          'books', 'electronics', 'computers', 'home', 'garden', 'tools',
          'grocery', 'health', 'beauty', 'toys', 'games', 'clothing'
        ];
        
        const links = Array.from(document.querySelectorAll('a'));
        const departments = [];
        
        for (const link of links) {
          const rect = link.getBoundingClientRect();
          const text = link.textContent.trim();
          const url = link.href;
          
          if (rect.top <= 400 && rect.width > 0 && text.length >= 3 && url) {
            const lowerText = text.toLowerCase();
            const isDepartment = departmentKeywords.some(dept => lowerText.includes(dept));
            
            if (isDepartment) {
              departments.push({
                name: text,
                url: url,
                position: { top: Math.round(rect.top), left: Math.round(rect.left) }
              });
            }
          }
        }
        
        return departments.slice(0, 20);
      });
      
      if (visibleNav.length > 0) {
        console.log(`📱 Found ${visibleNav.length} visible department links:`);
        visibleNav.forEach((dept, i) => {
          console.log(`  ${i + 1}. ${dept.name} (top: ${dept.position.top}px)`);
        });
      } else {
        console.log('❌ No visible department navigation found');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    console.log('\n📷 Taking screenshot for manual inspection...');
    await page.screenshot({ 
      path: 'amazon_mobile_test.png',
      fullPage: false 
    });
    
    await browser.close();
  }
}

testAmazonMobile().catch(console.error);