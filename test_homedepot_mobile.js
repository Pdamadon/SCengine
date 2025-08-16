#!/usr/bin/env node

const { chromium } = require('playwright');

async function testHomeDepotMobile() {
  console.log('📱 Testing Home Depot with mobile-first approach\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--disable-dev-shm-usage'
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
  
  // Block unnecessary resources for speed and stealth
  await page.route('**/*', (route) => {
    const resourceType = route.request().resourceType();
    if (['image', 'font', 'media'].includes(resourceType)) {
      route.abort();
    } else {
      route.continue();
    }
  });
  
  try {
    console.log('📍 Navigating to Home Depot...');
    
    const startTime = Date.now();
    await page.goto('https://www.homedepot.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 15000 
    });
    
    const loadTime = Date.now() - startTime;
    console.log(`✅ Page loaded in ${loadTime}ms`);
    
    // Wait for content to load and check for anti-bot detection
    await page.waitForTimeout(3000);
    
    console.log('🔍 Analyzing page structure...');
    
    const pageAnalysis = await page.evaluate(() => {
      return {
        title: document.title,
        hasContent: document.querySelectorAll('a').length > 10,
        headerCount: document.querySelectorAll('header').length,
        navCount: document.querySelectorAll('nav').length,
        mobileNavCount: document.querySelectorAll('#mobile-nav, .mobile-nav, .mobile-navigation, [class*="mobile-nav"]').length,
        totalLinks: document.querySelectorAll('a').length,
        bodyText: document.body.textContent.substring(0, 200),
        antiBot: {
          hasCloudflare: !!document.querySelector('[data-cf-beacon]') || document.title.includes('Cloudflare'),
          hasRecaptcha: !!document.querySelector('#recaptcha') || document.body.innerHTML.includes('recaptcha'),
          hasPerimeterX: document.body.innerHTML.includes('perimeterx'),
          accessDenied: document.title.includes('Access Denied') || document.body.textContent.includes('Access Denied'),
          blocked: document.body.textContent.includes('blocked') || document.body.textContent.includes('forbidden')
        }
      };
    });
    
    console.log('📊 Page analysis:');
    console.log(`  Title: "${pageAnalysis.title}"`);
    console.log(`  Has content: ${pageAnalysis.hasContent}`);
    console.log(`  Headers: ${pageAnalysis.headerCount}, Nav: ${pageAnalysis.navCount}`);
    console.log(`  Mobile nav containers: ${pageAnalysis.mobileNavCount}`);
    console.log(`  Total links: ${pageAnalysis.totalLinks}`);
    console.log(`  Body preview: "${pageAnalysis.bodyText}"`);
    console.log('🛡️ Anti-bot detection:', pageAnalysis.antiBot);
    
    if (pageAnalysis.antiBot.accessDenied || pageAnalysis.antiBot.blocked) {
      console.log('❌ Site appears to be blocking access');
      return;
    }
    
    if (!pageAnalysis.hasContent) {
      console.log('❌ Page appears to have minimal content - possible bot detection');
      return;
    }
    
    console.log('\n🧭 Looking for navigation structure...');
    
    // Look for hamburger menu first
    const hamburgerFound = await page.evaluate(() => {
      const hamburgerSelectors = [
        'button[aria-label*="menu"]',
        'button[aria-label*="Menu"]',
        '.hamburger',
        '.menu-toggle',
        'button[class*="menu"]',
        'button[class*="nav"]',
        '[data-testid*="menu"]',
        '[class*="mobile-menu"]'
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
      console.log(`   Position: ${hamburgerFound.position.top}px from top`);
      
      try {
        console.log('👆 Clicking hamburger menu...');
        await page.click(hamburgerFound.selector);
        await page.waitForTimeout(1000);
        
        // Check if menu opened
        const menuOpened = await page.evaluate(() => {
          // Look for opened mobile menu
          const mobileMenus = document.querySelectorAll([
            '.mobile-menu:not([style*="display: none"])',
            '.mobile-nav:not([style*="display: none"])',
            '[class*="mobile-menu"]:not([style*="display: none"])',
            '[class*="drawer"]:not([style*="display: none"])',
            '[class*="sidebar"]:not([style*="display: none"])'
          ].join(','));
          
          return {
            opened: mobileMenus.length > 0,
            menuCount: mobileMenus.length,
            menuTypes: Array.from(mobileMenus).map(menu => ({
              className: menu.className,
              linkCount: menu.querySelectorAll('a').length
            }))
          };
        });
        
        console.log('📱 Menu state after click:', menuOpened);
        
        if (menuOpened.opened) {
          console.log('✅ Mobile menu opened successfully!');
          
          // Extract navigation from opened menu
          const navigation = await page.evaluate(() => {
            const menus = document.querySelectorAll([
              '.mobile-menu:not([style*="display: none"])',
              '.mobile-nav:not([style*="display: none"])',
              '[class*="mobile-menu"]:not([style*="display: none"])',
              '[class*="drawer"]:not([style*="display: none"])',
              '[class*="sidebar"]:not([style*="display: none"])'
            ].join(','));
            
            const categories = [];
            const departmentKeywords = [
              'appliances', 'bath', 'building', 'electrical', 'flooring',
              'garden', 'hardware', 'heating', 'kitchen', 'lighting',
              'lumber', 'paint', 'plumbing', 'storage', 'tools', 'windows'
            ];
            
            menus.forEach(menu => {
              const links = menu.querySelectorAll('a');
              links.forEach(link => {
                const text = link.textContent.trim();
                const url = link.href;
                
                if (text.length >= 3 && text.length <= 30 && url) {
                  const lowerText = text.toLowerCase();
                  const isDepartment = departmentKeywords.some(dept => lowerText.includes(dept));
                  
                  categories.push({
                    name: text,
                    url: url,
                    isDepartment: isDepartment,
                    menuSource: menu.className
                  });
                }
              });
            });
            
            return categories.slice(0, 50); // Limit results
          });
          
          console.log(`🎯 Found ${navigation.length} navigation items:`);
          navigation.slice(0, 15).forEach((item, i) => {
            const icon = item.isDepartment ? '🏠' : '🔗';
            console.log(`  ${i + 1}. ${icon} ${item.name}`);
          });
          
          if (navigation.length >= 10) {
            console.log('\n✅ SUCCESS: Home Depot mobile navigation extracted!');
            
            const departments = navigation.filter(item => item.isDepartment);
            console.log(`🏠 Found ${departments.length} department categories`);
            
            return navigation;
          }
        }
      } catch (error) {
        console.log(`❌ Error clicking hamburger menu: ${error.message}`);
      }
    } else {
      console.log('🔍 No hamburger menu found, looking for visible navigation...');
      
      // Look for any visible navigation structure
      const visibleNav = await page.evaluate(() => {
        const navSelectors = [
          'nav', 'header', '.navigation', '.nav', '.menu',
          '[role="navigation"]', '[class*="nav"]'
        ];
        
        const results = [];
        
        navSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach((element, index) => {
            const rect = element.getBoundingClientRect();
            const links = element.querySelectorAll('a');
            
            if (rect.top <= 400 && links.length >= 3) {
              results.push({
                selector: `${selector}[${index}]`,
                linkCount: links.length,
                position: { top: rect.top, width: rect.width },
                sampleLinks: Array.from(links).slice(0, 5).map(link => ({
                  text: link.textContent.trim().substring(0, 30),
                  href: link.href
                }))
              });
            }
          });
        });
        
        return results;
      });
      
      if (visibleNav.length > 0) {
        console.log(`📱 Found ${visibleNav.length} visible navigation containers:`);
        visibleNav.forEach((nav, i) => {
          console.log(`  ${i + 1}. ${nav.selector}: ${nav.linkCount} links`);
          nav.sampleLinks.forEach(link => {
            console.log(`     └─ "${link.text}"`);
          });
        });
      } else {
        console.log('❌ No visible navigation found');
        
        // Let's examine all links to see what we're dealing with
        console.log('\n🔍 Examining all links on the page...');
        const allLinks = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a'));
          const linkAnalysis = {
            total: links.length,
            byPosition: { top: [], middle: [], bottom: [] },
            byContent: { departments: [], navigation: [], other: [] }
          };
          
          const departmentKeywords = [
            'appliances', 'bath', 'building', 'electrical', 'flooring',
            'garden', 'hardware', 'heating', 'kitchen', 'lighting',
            'lumber', 'paint', 'plumbing', 'storage', 'tools', 'windows',
            'outdoor', 'indoor', 'home', 'decor'
          ];
          
          links.forEach(link => {
            const rect = link.getBoundingClientRect();
            const text = link.textContent.trim();
            const url = link.href;
            
            if (!text || text.length < 2) return;
            
            const linkInfo = {
              text: text.substring(0, 40),
              url: url.substring(0, 80),
              position: { top: Math.round(rect.top), left: Math.round(rect.left) },
              size: { width: Math.round(rect.width), height: Math.round(rect.height) }
            };
            
            // Categorize by position
            if (rect.top <= 200) linkAnalysis.byPosition.top.push(linkInfo);
            else if (rect.top <= 600) linkAnalysis.byPosition.middle.push(linkInfo);
            else linkAnalysis.byPosition.bottom.push(linkInfo);
            
            // Categorize by content
            const lowerText = text.toLowerCase();
            if (departmentKeywords.some(dept => lowerText.includes(dept))) {
              linkAnalysis.byContent.departments.push(linkInfo);
            } else if (text.length >= 4 && text.length <= 25 && !lowerText.includes('sign') && !lowerText.includes('search')) {
              linkAnalysis.byContent.navigation.push(linkInfo);
            } else {
              linkAnalysis.byContent.other.push(linkInfo);
            }
          });
          
          return linkAnalysis;
        });
        
        console.log(`📊 Link analysis (${allLinks.total} total):`);
        console.log(`  Top area (0-200px): ${allLinks.byPosition.top.length} links`);
        console.log(`  Middle area (200-600px): ${allLinks.byPosition.middle.length} links`);
        console.log(`  Bottom area (600px+): ${allLinks.byPosition.bottom.length} links`);
        
        console.log(`\n🏠 Department-related links (${allLinks.byContent.departments.length}):`);
        allLinks.byContent.departments.slice(0, 10).forEach((link, i) => {
          console.log(`  ${i + 1}. "${link.text}" (top: ${link.position.top}px)`);
        });
        
        console.log(`\n🧭 Potential navigation links (${allLinks.byContent.navigation.length}):`);
        allLinks.byContent.navigation.slice(0, 15).forEach((link, i) => {
          console.log(`  ${i + 1}. "${link.text}" (top: ${link.position.top}px)`);
        });
        
        if (allLinks.byPosition.top.length > 0) {
          console.log(`\n🔝 Top area links (${allLinks.byPosition.top.length}):`);
          allLinks.byPosition.top.slice(0, 10).forEach((link, i) => {
            console.log(`  ${i + 1}. "${link.text}"`);
          });
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    console.log('\n📷 Taking screenshot for manual inspection...');
    await page.screenshot({ 
      path: 'homedepot_mobile_test.png',
      fullPage: false 
    });
    
    await browser.close();
  }
}

testHomeDepotMobile().catch(console.error);