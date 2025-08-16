#!/usr/bin/env node

const AdaptiveNavigationStrategy = require('./src/intelligence/navigation/strategies/AdaptiveNavigationStrategy');
const { chromium } = require('playwright');

const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args)
};

const mockCache = {
  data: new Map(),
  async get(key) {
    return this.data.get(key) || null;
  },
  async setex(key, ttl, value) {
    this.data.set(key, value);
  }
};

async function testMacysMobile() {
  console.log('📱 Testing Macy\'s with mobile-first approach\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    locale: 'en-US',
    timezoneId: 'America/New_York'
  });
  
  const page = await context.newPage();
  
  try {
    console.log('📍 Navigating to Macy\'s...');
    await page.goto('https://www.macys.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 15000 
    });
    
    // Wait for content to load
    await page.waitForTimeout(3000);
    
    console.log('🧭 Looking for mobile navigation...');
    
    // Examine page structure first
    const pageAnalysis = await page.evaluate(() => {
      return {
        title: document.title,
        headerCount: document.querySelectorAll('header').length,
        navCount: document.querySelectorAll('nav').length,
        mobileNavCount: document.querySelectorAll('#mobile-nav, .mobile-nav').length,
        totalLinks: document.querySelectorAll('a').length,
        visibleMobileNav: !!document.querySelector('#mobile-nav:not([style*="display: none"])')
      };
    });
    
    console.log('📊 Page analysis:', pageAnalysis);
    
    if (pageAnalysis.mobileNavCount > 0) {
      console.log('✅ Found mobile navigation containers');
      
      // Extract navigation directly
      const mobileNavigation = await page.evaluate(() => {
        const navContainer = document.querySelector('#mobile-nav, .mobile-nav');
        if (!navContainer) return [];
        
        const links = Array.from(navContainer.querySelectorAll('a'));
        const departmentPatterns = [
          'women', 'men', 'kids', 'children', 'baby', 'home', 'beauty', 
          'shoes', 'handbags', 'jewelry', 'sale', 'clearance', 'new'
        ];
        
        return links
          .filter(link => {
            const text = link.textContent.trim();
            const lowerText = text.toLowerCase();
            return text.length >= 3 && text.length <= 30 && 
                   (departmentPatterns.some(dept => lowerText.includes(dept)) || 
                    lowerText.includes('sale') || lowerText.includes('new'));
          })
          .slice(0, 15)
          .map(link => ({
            name: link.textContent.trim(),
            url: link.href,
            classes: link.className
          }));
      });
      
      console.log(`🎯 Found ${mobileNavigation.length} navigation items:`);
      mobileNavigation.forEach((item, i) => {
        console.log(`  ${i + 1}. ${item.name}`);
      });
      
      if (mobileNavigation.length >= 5) {
        console.log('\n✅ SUCCESS: Macy\'s mobile navigation extracted successfully!');
        
        // Now test with AdaptiveNavigationStrategy
        console.log('\n🧪 Testing with AdaptiveNavigationStrategy...');
        const strategy = new AdaptiveNavigationStrategy(logger, {
          hintCache: mockCache,
          maxSiteTime: 6000,
          maxTogglersToSample: 2
        });
        
        const result = await strategy.execute(page);
        console.log(`📊 AdaptiveNavigationStrategy result: ${result.items.length} items, confidence: ${(result.confidence * 100).toFixed(1)}%`);
        
        if (result.items.length > 0) {
          console.log('\n🔍 First 20 items found by AdaptiveNavigationStrategy:');
          result.items.slice(0, 20).forEach((item, i) => {
            console.log(`  ${i + 1}. "${item.name}" (${item.selector || 'unknown selector'})`);
          });
          
          // Analyze the structure
          console.log('\n📊 Item analysis:');
          const bySelector = {};
          result.items.forEach(item => {
            const selector = item.selector || 'unknown';
            bySelector[selector] = (bySelector[selector] || 0) + 1;
          });
          
          Object.entries(bySelector).forEach(([selector, count]) => {
            console.log(`  ${selector}: ${count} items`);
          });
          
          // Look for department-level items specifically
          const departmentKeywords = ['women', 'men', 'kids', 'home', 'beauty', 'shoes', 'sale'];
          const mainDepartments = result.items.filter(item => 
            departmentKeywords.some(dept => item.name.toLowerCase().includes(dept)) &&
            item.name.length <= 25
          );
          
          console.log(`\n🎯 Main department items (${mainDepartments.length}):`);
          mainDepartments.slice(0, 15).forEach((item, i) => {
            console.log(`  ${i + 1}. "${item.name}"`);
          });
          
          // Let's examine the actual hierarchy structure
          console.log('\n🌳 Analyzing navigation hierarchy...');
          const hierarchyAnalysis = await page.evaluate(() => {
            const mobileNav = document.querySelector('#mobile-nav, .mobile-nav');
            if (!mobileNav) return null;
            
            const buildHierarchy = (element, depth = 0) => {
              const result = [];
              const children = Array.from(element.children);
              
              for (const child of children) {
                if (child.tagName === 'A') {
                  const text = child.textContent.trim();
                  if (text.length >= 3 && text.length <= 30) {
                    result.push({
                      type: 'link',
                      text: text,
                      url: child.href,
                      depth: depth,
                      hasChildren: false
                    });
                  }
                } else if (child.tagName === 'LI' || child.classList.contains('nav-item') || child.classList.contains('category')) {
                  // Look for the main link and any subcategories
                  const mainLink = child.querySelector(':scope > a');
                  const subItems = buildHierarchy(child, depth + 1);
                  
                  if (mainLink) {
                    const text = mainLink.textContent.trim();
                    if (text.length >= 3 && text.length <= 30) {
                      result.push({
                        type: 'category',
                        text: text,
                        url: mainLink.href,
                        depth: depth,
                        hasChildren: subItems.length > 0,
                        children: subItems
                      });
                    }
                  } else {
                    result.push(...subItems);
                  }
                } else {
                  result.push(...buildHierarchy(child, depth));
                }
              }
              
              return result;
            };
            
            return buildHierarchy(mobileNav);
          });
          
          if (hierarchyAnalysis) {
            console.log(`📊 Found ${hierarchyAnalysis.length} top-level categories`);
            
            // Show the hierarchy structure
            const showHierarchy = (items, indent = '') => {
              items.slice(0, 10).forEach(item => {
                console.log(`${indent}${item.type === 'category' ? '📁' : '🔗'} "${item.text}" (depth: ${item.depth})`);
                if (item.children && item.children.length > 0) {
                  console.log(`${indent}  └─ ${item.children.length} subcategories`);
                  if (item.children.length <= 5) {
                    showHierarchy(item.children, indent + '    ');
                  }
                }
              });
            };
            
            showHierarchy(hierarchyAnalysis);
            
            // Count by depth
            const depthCounts = {};
            const countByDepth = (items) => {
              items.forEach(item => {
                depthCounts[item.depth] = (depthCounts[item.depth] || 0) + 1;
                if (item.children) {
                  countByDepth(item.children);
                }
              });
            };
            
            countByDepth(hierarchyAnalysis);
            console.log('\n📊 Items by depth level:');
            Object.entries(depthCounts).forEach(([depth, count]) => {
              console.log(`  Depth ${depth}: ${count} items`);
            });
          }
        }
      } else {
        console.log('❌ Not enough navigation items found');
      }
      
    } else {
      console.log('❌ No mobile navigation found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

testMacysMobile().catch(console.error);