#!/usr/bin/env node

const { chromium } = require('playwright');

async function investigateMacysPatterns() {
  console.log('🔍 Investigating Macy\'s navigation patterns and bot detection...\n');
  
  // Try different approaches
  const approaches = [
    {
      name: 'Stealth with slow loading',
      config: {
        headless: false,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        slowMo: 100,
        waitStrategy: 'networkidle'
      }
    },
    {
      name: 'Mobile user agent',
      config: {
        headless: false,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15',
        viewport: { width: 375, height: 812 },
        waitStrategy: 'domcontentloaded'
      }
    },
    {
      name: 'Basic desktop',
      config: {
        headless: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        waitStrategy: 'load'
      }
    }
  ];
  
  for (const approach of approaches) {
    console.log(`\n🧪 Testing: ${approach.name}`);
    console.log('='.repeat(40));
    
    const browser = await chromium.launch({ 
      headless: approach.config.headless,
      slowMo: approach.config.slowMo || 0,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--disable-dev-shm-usage',
        '--disable-extensions'
      ]
    });
    
    const context = await browser.newContext({
      userAgent: approach.config.userAgent,
      viewport: approach.config.viewport || { width: 1366, height: 900 },
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });
    
    const page = await context.newPage();
    
    // Track navigation events
    let redirectCount = 0;
    page.on('response', response => {
      if (response.url().includes('macys.com') && [301, 302, 307, 308].includes(response.status())) {
        redirectCount++;
        console.log(`  Redirect ${redirectCount}: ${response.status()} -> ${response.headers()['location']}`);
      }
    });
    
    try {
      console.log('  📍 Navigating to macys.com...');
      
      const startTime = Date.now();
      await page.goto('https://www.macys.com', { 
        waitUntil: approach.config.waitStrategy,
        timeout: 15000 
      });
      
      const loadTime = Date.now() - startTime;
      console.log(`  ✅ Page loaded in ${loadTime}ms with ${redirectCount} redirects`);
      
      // Wait for dynamic content and let ads/tracking finish
      await page.waitForTimeout(3000);
      
      // Try to wait for navigation specifically
      try {
        await page.waitForSelector('nav, header, [role="navigation"]', { timeout: 5000 });
        console.log('  🧭 Navigation elements detected');
      } catch (e) {
        console.log('  ⚠️ No explicit navigation elements found');
      }
      
      // Check for anti-bot indicators
      const botIndicators = await page.evaluate(() => {
        const indicators = {
          hasCloudflare: !!document.querySelector('[data-cf-beacon]') || document.title.includes('Cloudflare'),
          hasRecaptcha: !!document.querySelector('#recaptcha') || document.body.innerHTML.includes('recaptcha'),
          hasPerimeterX: document.body.innerHTML.includes('perimeterx') || document.body.innerHTML.includes('px-'),
          hasDataDome: document.body.innerHTML.includes('datadome'),
          title: document.title,
          bodyClasses: document.body.className,
          metaRefresh: !!document.querySelector('meta[http-equiv="refresh"]'),
          jsRedirect: document.body.innerHTML.includes('window.location') || document.body.innerHTML.includes('location.href')
        };
        
        return indicators;
      });
      
      console.log('  🛡️ Anti-bot indicators:', JSON.stringify(botIndicators, null, 4));
      
      // Comprehensive navigation extraction using AdaptiveNavigationStrategy approach
      const navAnalysis = await page.evaluate(() => {
        const analysis = {
          headerCount: document.querySelectorAll('header').length,
          navCount: document.querySelectorAll('nav').length,
          totalLinks: document.querySelectorAll('a').length,
          visibleLinks: 0,
          topAreaLinks: [],
          headerContainers: [],
          mainNavCandidates: []
        };
        
        // Find all header containers like AdaptiveNavigationStrategy does
        const headerSelectors = [
          'header', '.header', '#header',
          'nav', '.nav', '.navigation',
          '[role="navigation"]', '[role="banner"]',
          '.site-header', '.main-header', '.top-nav'
        ];
        
        headerSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            const rect = element.getBoundingClientRect();
            const links = element.querySelectorAll('a, button');
            
            if (rect.top <= 400 && links.length >= 3) {
              analysis.headerContainers.push({
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
                sampleLinks: Array.from(links).slice(0, 5).map(link => ({
                  text: link.textContent.trim().substring(0, 40),
                  href: link.href?.substring(0, 80),
                  tagName: link.tagName,
                  hasDropdown: !!(link.getAttribute('aria-haspopup') || 
                                 link.getAttribute('aria-expanded') ||
                                 link.closest('li')?.querySelector('.dropdown, .submenu'))
                }))
              });
            }
          }
        });
        
        // Look for main department navigation patterns
        const departmentPatterns = [
          'women', 'men', 'kids', 'home', 'beauty', 'shoes', 'handbags', 'jewelry', 'sale'
        ];
        
        const links = Array.from(document.querySelectorAll('a'));
        links.forEach(link => {
          const rect = link.getBoundingClientRect();
          if (rect.top <= 300 && rect.width > 0 && rect.height > 0) {
            analysis.visibleLinks++;
            
            const text = link.textContent.trim().toLowerCase();
            const isDepartment = departmentPatterns.some(dept => text.includes(dept));
            
            if (analysis.topAreaLinks.length < 15) {
              analysis.topAreaLinks.push({
                text: link.textContent.trim().substring(0, 30),
                href: link.href?.substring(0, 60),
                classes: link.className,
                isDepartment: isDepartment,
                position: { top: Math.round(rect.top), left: Math.round(rect.left) }
              });
            }
            
            if (isDepartment) {
              analysis.mainNavCandidates.push({
                text: link.textContent.trim(),
                href: link.href,
                classes: link.className
              });
            }
          }
        });
        
        return analysis;
      });
      
      console.log('  🧭 Navigation analysis:', JSON.stringify(navAnalysis, null, 4));
      
      // Take screenshot for manual inspection
      await page.screenshot({ 
        path: `macys_${approach.name.replace(/\s+/g, '_').toLowerCase()}_screenshot.png`,
        fullPage: false 
      });
      console.log(`  📷 Screenshot saved as macys_${approach.name.replace(/\s+/g, '_').toLowerCase()}_screenshot.png`);
      
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message}`);
    } finally {
      await browser.close();
    }
    
    // Pause between approaches
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n🔬 Investigation completed. Check screenshots for visual confirmation.');
  console.log('\n💡 Based on your previous success, consider:');
  console.log('   - Different time of day (site behavior changes)');
  console.log('   - Specific cookies or session state');
  console.log('   - Gradual page interaction before navigation extraction');
  console.log('   - Using residential proxy IPs');
}

investigateMacysPatterns().catch(console.error);