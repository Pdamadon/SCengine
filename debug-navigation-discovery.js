#!/usr/bin/env node

/**
 * Debug Navigation Discovery
 * 
 * Investigates what navigation elements are being found and why main_sections is empty
 */

const NavigationDiscoveryPipeline = require('./src/intelligence/navigation/NavigationDiscoveryPipeline');
const MainNavigationStrategy = require('./src/intelligence/navigation/strategies/MainNavigationStrategy');
const AriaNavigationStrategy = require('./src/intelligence/navigation/strategies/AriaNavigationStrategy');
const DataAttributeStrategy = require('./src/intelligence/navigation/strategies/DataAttributeStrategy');
const VisibleNavigationStrategy = require('./src/intelligence/navigation/strategies/VisibleNavigationStrategy');
const { chromium } = require('playwright');

class NavigationDebugger {
  constructor() {
    this.logger = {
      info: (...args) => console.log('ℹ️ ', ...args),
      warn: (...args) => console.warn('⚠️ ', ...args),
      error: (...args) => console.error('❌', ...args),
      debug: (...args) => console.log('🔍', ...args)
    };
  }

  async debugNavigation(testUrl) {
    console.log('🔍 NAVIGATION DISCOVERY DEBUG');
    console.log('='.repeat(50));
    console.log(`🎯 URL: ${testUrl}\n`);

    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });
      
      const page = await context.newPage();
      
      console.log('🌐 Loading page...');
      await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      console.log('✅ Page loaded\n');

      // Run navigation discovery
      const pipeline = new NavigationDiscoveryPipeline(this.logger);
      pipeline.addStrategies([
        new MainNavigationStrategy(this.logger),
        new AriaNavigationStrategy(this.logger),
        new DataAttributeStrategy(this.logger),
        new VisibleNavigationStrategy(this.logger)
      ]);

      const result = await pipeline.discover(page, {
        maxStrategies: 10,
        minConfidence: 0.1,
        parallel: false
      });

      console.log('📊 DISCOVERY RESULTS');
      console.log('='.repeat(50));
      console.log(`Navigation map:`, JSON.stringify(result.navigation_map, null, 2));
      console.log();

      // Look specifically at what VisibleNavigationStrategy found
      console.log('🔍 DETAILED ANALYSIS');
      console.log('='.repeat(50));
      
      if (result.navigation_map) {
        console.log(`Main sections: ${result.navigation_map.main_sections?.length || 0}`);
        console.log(`Clickable elements: ${result.navigation_map.clickable_elements?.length || 0}`);
        console.log(`Dropdown menus: ${Object.keys(result.navigation_map.dropdown_menus || {}).length}`);
        
        if (result.navigation_map.clickable_elements?.length > 0) {
          console.log('\n📋 Sample clickable elements:');
          result.navigation_map.clickable_elements.slice(0, 10).forEach((el, i) => {
            console.log(`   ${i + 1}. "${el.text}" → ${el.url}`);
            console.log(`      Purpose: ${el.page_purpose}, Selector: ${el.selector}`);
          });
        }
      }

      // Let's also check what's actually in the page navigation
      console.log('\n🌐 RAW PAGE NAVIGATION ANALYSIS');
      console.log('='.repeat(50));
      
      const pageNavInfo = await page.evaluate(() => {
        const navElements = {
          nav_tags: [],
          header_links: [],
          menu_items: [],
          navigation_classes: []
        };

        // Look for nav tags
        document.querySelectorAll('nav').forEach((nav, i) => {
          const links = nav.querySelectorAll('a');
          navElements.nav_tags.push({
            index: i,
            class: nav.className,
            links: Array.from(links).slice(0, 5).map(a => ({ text: a.textContent.trim(), href: a.href }))
          });
        });

        // Look for header links
        document.querySelectorAll('header a').forEach((link, i) => {
          if (i < 10) {
            navElements.header_links.push({
              text: link.textContent.trim(),
              href: link.href,
              class: link.className
            });
          }
        });

        // Look for common navigation classes
        const commonNavClasses = [
          '.navigation', '.nav', '.menu', '.main-nav', '.header-nav',
          '.site-nav', '.primary-nav', '.top-nav', '.main-menu'
        ];
        
        commonNavClasses.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              navElements.navigation_classes.push({
                selector,
                count: elements.length,
                sample: elements[0]?.textContent?.trim()?.substring(0, 100)
              });
            }
          } catch (e) {
            // Continue
          }
        });

        return navElements;
      });

      console.log('Nav tags found:', pageNavInfo.nav_tags.length);
      pageNavInfo.nav_tags.forEach((nav, i) => {
        console.log(`   Nav ${i + 1}: ${nav.class || 'no-class'} (${nav.links.length} links)`);
        nav.links.forEach(link => {
          console.log(`      → "${link.text}" (${link.href})`);
        });
      });

      console.log('\nHeader links found:', pageNavInfo.header_links.length);
      pageNavInfo.header_links.slice(0, 5).forEach(link => {
        console.log(`   → "${link.text}" (${link.href})`);
      });

      console.log('\nNavigation classes found:', pageNavInfo.navigation_classes.length);
      pageNavInfo.navigation_classes.forEach(nav => {
        console.log(`   ${nav.selector}: ${nav.count} elements`);
        if (nav.sample) {
          console.log(`      Sample: "${nav.sample.substring(0, 50)}..."`);
        }
      });

    } catch (error) {
      console.error('❌ Debug failed:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}

// Run debug
if (require.main === module) {
  const testUrl = process.argv[2] || 'https://glasswingshop.com/';
  
  const debugger = new NavigationDebugger();
  
  debugger.debugNavigation(testUrl)
    .then(() => {
      console.log('\n✅ Navigation debug completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Debug failed:', error);
      process.exit(1);
    });
}

module.exports = NavigationDebugger;