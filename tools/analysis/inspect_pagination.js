#!/usr/bin/env node

const { chromium } = require('playwright');

async function inspectPagination() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    console.log('🔍 Inspecting Glasswing Pagination HTML Structure\n');
    
    // Go to a collection we know should have multiple pages
    const url = 'https://glasswingshop.com/collections/all-products-no-sale';
    console.log(`📁 Loading: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle' });
    
    // Scroll to bottom to ensure pagination is loaded
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    
    await page.waitForTimeout(2000);
    
    // Get pagination info
    const paginationInfo = await page.evaluate(() => {
      // Look for all pagination-related elements
      const paginationElements = [];
      
      // Check for various pagination patterns
      const selectors = [
        '.pagination',
        '.pagination-wrapper',
        '.paginate',
        '.page-links',
        '.page-navigation',
        '[class*="pagination"]',
        'a[href*="page="]',
        'nav[aria-label*="pagination"]',
        'nav[aria-label*="Pagination"]'
      ];
      
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          paginationElements.push({
            selector: selector,
            tagName: el.tagName,
            className: el.className,
            innerHTML: el.innerHTML.substring(0, 200) + (el.innerHTML.length > 200 ? '...' : ''),
            textContent: el.textContent.trim()
          });
        });
      });
      
      // Look for any links containing "page="
      const pageLinks = Array.from(document.querySelectorAll('a[href*="page="]')).map(link => ({
        href: link.href,
        text: link.textContent.trim(),
        className: link.className,
        rel: link.rel
      }));
      
      return {
        paginationElements: paginationElements,
        pageLinks: pageLinks,
        totalLinks: document.querySelectorAll('a').length,
        bodyClass: document.body.className
      };
    });
    
    console.log('📊 Pagination Analysis Results:');
    console.log('===============================');
    
    console.log(`\n🔗 Total links on page: ${paginationInfo.totalLinks}`);
    console.log(`📄 Page links found: ${paginationInfo.pageLinks.length}`);
    
    if (paginationInfo.pageLinks.length > 0) {
      console.log('\n📋 Page Links:');
      paginationInfo.pageLinks.forEach((link, i) => {
        console.log(`   ${i + 1}. ${link.href}`);
        console.log(`      Text: "${link.text}"`);
        console.log(`      Class: "${link.className}"`);
        console.log(`      Rel: "${link.rel}"`);
      });
    }
    
    console.log(`\n🧱 Pagination elements found: ${paginationInfo.paginationElements.length}`);
    
    if (paginationInfo.paginationElements.length > 0) {
      console.log('\n📋 Pagination Elements:');
      paginationInfo.paginationElements.forEach((el, i) => {
        console.log(`   ${i + 1}. ${el.tagName} with selector: ${el.selector}`);
        console.log(`      Class: "${el.className}"`);
        console.log(`      Text: "${el.textContent}"`);
        console.log(`      HTML: ${el.innerHTML}`);
        console.log('');
      });
    }
    
    // Try to find page 2 manually
    console.log('\n🔍 Manual Search for Page 2:');
    const page2Exists = await page.evaluate(() => {
      // Try different ways to construct page 2 URL
      const currentUrl = window.location.href;
      const baseUrl = currentUrl.split('?')[0];
      
      // Try different page 2 variations
      const page2Urls = [
        `${baseUrl}?page=2`,
        `${baseUrl}?page=2&sort_by=manual`,
        `${currentUrl}${currentUrl.includes('?') ? '&' : '?'}page=2`
      ];
      
      return page2Urls;
    });
    
    console.log('Possible page 2 URLs:');
    page2Urls.forEach((url, i) => {
      console.log(`   ${i + 1}. ${url}`);
    });
    
    // Test if page 2 actually exists by trying to navigate
    console.log('\n🧪 Testing page 2 existence...');
    const testUrl = page2Urls[0];
    
    try {
      await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 10000 });
      
      const page2Info = await page.evaluate(() => ({
        url: window.location.href,
        title: document.title,
        productCount: document.querySelectorAll('a[href*="/products/"]').length
      }));
      
      console.log('✅ Page 2 exists!');
      console.log(`   URL: ${page2Info.url}`);
      console.log(`   Products: ${page2Info.productCount}`);
      
      if (page2Info.productCount > 0) {
        console.log('\n🎉 CONCLUSION: Site has pagination, but pagination navigation is not visible!');
        console.log('💡 SOLUTION: Use manual URL construction for pagination instead of relying on navigation links.');
      }
      
    } catch (error) {
      console.log('❌ Page 2 does not exist or failed to load');
    }
    
  } catch (error) {
    console.error('❌ Inspection failed:', error);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  inspectPagination().catch(console.error);
}