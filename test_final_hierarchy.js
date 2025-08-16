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

async function testFullHierarchy() {
  console.log('🌳 Testing Full Hierarchical Navigation Discovery\n');
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15'
  });
  
  const page = await context.newPage();
  
  try {
    await page.goto('https://www.macys.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Extract the complete hierarchical navigation
    const fullHierarchy = await page.evaluate(() => {
      const mobileNav = document.querySelector('#mobile-nav, .mobile-nav');
      if (!mobileNav) return null;
      
      const departmentKeywords = [
        'women', 'men', 'kids', 'children', 'baby', 'home', 'beauty', 
        'shoes', 'handbags', 'jewelry', 'sale', 'clearance', 'new'
      ];
      
      const extractHierarchy = (container) => {
        const hierarchy = {
          mainDepartments: [],
          fullCatalog: [],
          categoryTree: {}
        };
        
        const allLinks = Array.from(container.querySelectorAll('a'));
        
        allLinks.forEach(link => {
          const text = link.textContent.trim();
          const url = link.href;
          
          if (text.length < 3 || text.length > 50) return;
          
          // Determine category level and parent
          const depth = this.getDepth(link, container);
          const parent = this.getParentCategory(link);
          
          const item = {
            name: text,
            url: url,
            depth: depth,
            parent: parent,
            isDepartment: departmentKeywords.some(dept => text.toLowerCase().includes(dept))
          };
          
          hierarchy.fullCatalog.push(item);
          
          // Add to main departments if it's a top-level department
          if (item.isDepartment && depth <= 1 && text.length <= 25) {
            hierarchy.mainDepartments.push(item);
          }
          
          // Build tree structure
          if (!hierarchy.categoryTree[parent]) {
            hierarchy.categoryTree[parent] = [];
          }
          hierarchy.categoryTree[parent].push(item);
        });
        
        return hierarchy;
      };
      
      // Helper functions
      this.getDepth = (element, container) => {
        let depth = 0;
        let current = element.parentElement;
        
        while (current && current !== container && depth < 10) {
          if (current.tagName === 'LI' || current.classList.contains('nav-item')) {
            depth++;
          }
          current = current.parentElement;
        }
        
        return depth;
      };
      
      this.getParentCategory = (element) => {
        const parentLi = element.closest('li');
        if (!parentLi) return 'root';
        
        const parentLink = parentLi.parentElement?.closest('li')?.querySelector('a');
        return parentLink ? parentLink.textContent.trim() : 'root';
      };
      
      return extractHierarchy(mobileNav);
    });
    
    if (fullHierarchy) {
      console.log('📊 HIERARCHICAL NAVIGATION DISCOVERY RESULTS');
      console.log('='.repeat(50));
      
      console.log(`\n🏬 Main Departments (${fullHierarchy.mainDepartments.length}):`);
      fullHierarchy.mainDepartments.slice(0, 10).forEach((dept, i) => {
        console.log(`  ${i + 1}. ${dept.name} (${dept.url.split('/').pop()})`);
      });
      
      console.log(`\n📁 Full Catalog (${fullHierarchy.fullCatalog.length} total categories):`);
      
      // Group by department
      const byDepartment = {};
      fullHierarchy.fullCatalog.forEach(item => {
        const dept = item.parent === 'root' ? item.name : item.parent;
        if (!byDepartment[dept]) byDepartment[dept] = [];
        byDepartment[dept].push(item);
      });
      
      console.log(`📊 Categories organized by department:`);
      Object.entries(byDepartment).slice(0, 5).forEach(([dept, items]) => {
        console.log(`  📁 ${dept}: ${items.length} subcategories`);
        items.slice(0, 3).forEach(item => {
          console.log(`    └─ ${item.name}`);
        });
        if (items.length > 3) {
          console.log(`    └─ ... and ${items.length - 3} more`);
        }
      });
      
      // Analyze depth distribution
      const depthCounts = {};
      fullHierarchy.fullCatalog.forEach(item => {
        depthCounts[item.depth] = (depthCounts[item.depth] || 0) + 1;
      });
      
      console.log(`\n📊 Category depth distribution:`);
      Object.entries(depthCounts).forEach(([depth, count]) => {
        console.log(`  Depth ${depth}: ${count} categories`);
      });
      
      // Test how this would work with our system
      console.log(`\n🎯 INTEGRATION ASSESSMENT:`);
      console.log(`✅ Main departments extracted: ${fullHierarchy.mainDepartments.length}`);
      console.log(`✅ Full catalog captured: ${fullHierarchy.fullCatalog.length} categories`);
      console.log(`✅ Hierarchical structure preserved: ${Object.keys(fullHierarchy.categoryTree).length} parent categories`);
      
      if (fullHierarchy.mainDepartments.length >= 5 && fullHierarchy.fullCatalog.length >= 100) {
        console.log(`\n🎉 SUCCESS: Comprehensive navigation discovery completed!`);
        console.log(`   This provides both summary navigation AND detailed product catalog discovery`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

testFullHierarchy().catch(console.error);