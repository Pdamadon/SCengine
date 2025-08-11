#!/usr/bin/env node

const SiteIntelligence = require('../../src/intelligence/SiteIntelligence');

// Analysis logger
const logger = {
  info: (...args) => console.log('[ANALYSIS]', ...args),
  error: (...args) => console.error('[ANALYSIS-ERROR]', ...args),
  warn: (...args) => console.warn('[ANALYSIS-WARN]', ...args),
  debug: (...args) => {}
};

class CategoryDiscoveryAnalyzer {
  constructor() {
    this.siteIntelligence = new SiteIntelligence(logger);
  }

  async analyzeGlasswingCategories() {
    console.log('\n🧠 GLASSWING CATEGORY DISCOVERY ANALYSIS');
    console.log('=========================================');
    
    try {
      // Initialize intelligence system
      await this.siteIntelligence.initialize();
      
      // Build navigation intelligence
      const baseUrl = 'https://glasswingshop.com';
      const navigationIntel = await this.siteIntelligence.navigationMapper.mapSiteNavigation(baseUrl);
      
      console.log(`\n📊 OVERALL DISCOVERY STATS:`);
      console.log(`Total Navigation Sections: ${navigationIntel.main_sections.length}`);
      console.log(`Dropdown Menus: ${Object.keys(navigationIntel.dropdown_menus).length}`);
      console.log(`Clickable Elements: ${navigationIntel.clickable_elements.length}`);
      console.log(`Sidebar Navigation: ${navigationIntel.sidebar_navigation.length}`);
      console.log(`Breadcrumb Patterns: ${navigationIntel.breadcrumb_patterns.length}`);
      
      // Analyze main sections by category
      console.log(`\n📂 MAIN NAVIGATION SECTIONS (${navigationIntel.main_sections.length} total):`);
      console.log('=================================================');
      
      if (navigationIntel.main_sections.length === 0) {
        console.log('❌ No main sections discovered');
        return;
      }
      
      console.log('\n📋 FIRST 10 RAW SECTIONS:');
      navigationIntel.main_sections.slice(0, 10).forEach((section, index) => {
        console.log(`${index + 1}. Name: "${section.name}" | URL: "${section.url}" | Dropdown: ${section.has_dropdown}`);
      });
      
      const categoryGroups = this.categorizeNavSections(navigationIntel.main_sections);
      
      for (const [category, sections] of Object.entries(categoryGroups)) {
        if (sections.length === 0) continue;
        console.log(`\n🏷️  ${category.toUpperCase()} (${sections.length} sections):`);
        console.log(`${'='.repeat(category.length + 15)}`);
        
        sections.forEach((section, index) => {
          const hasDropdown = section.has_dropdown ? '📁' : '📄';
          const indexStr = (index + 1).toString().padStart(2, ' ');
          console.log(`${indexStr}. ${hasDropdown} ${section.name}`);
          console.log(`    URL: ${section.url}`);
          if (section.selector) {
            console.log(`    Selector: ${section.selector.substring(0, 60)}${section.selector.length > 60 ? '...' : ''}`);
          }
          console.log('');
        });
      }
      
      // Analyze dropdown menus for subcategories
      if (Object.keys(navigationIntel.dropdown_menus).length > 0) {
        console.log(`\n📁 DROPDOWN MENU ANALYSIS (${Object.keys(navigationIntel.dropdown_menus).length} menus):`);
        console.log('============================================');
        
        for (const [menuKey, menuData] of Object.entries(navigationIntel.dropdown_menus)) {
          console.log(`\n🔽 ${menuKey}:`);
          console.log(`   Items: ${menuData.items.length}`);
          console.log(`   Columns: ${menuData.columns.length}`);
          
          if (menuData.items.length > 0) {
            console.log('   📋 Menu Items:');
            menuData.items.slice(0, 10).forEach((item, index) => {
              const itemType = item.is_category ? '📂' : item.is_brand ? '🏷️' : '📄';
              console.log(`      ${index + 1}. ${itemType} ${item.name}`);
            });
            if (menuData.items.length > 10) {
              console.log(`      ... and ${menuData.items.length - 10} more items`);
            }
          }
          
          if (menuData.columns.length > 0) {
            console.log('   📊 Column Structure:');
            menuData.columns.forEach((column, index) => {
              console.log(`      Column ${index + 1} (${column.type}): ${column.items.length} items`);
            });
          }
        }
      }
      
      // Analyze clickable elements for insights
      if (navigationIntel.clickable_elements.length > 0) {
        console.log(`\n🔗 CLICKABLE ELEMENTS ANALYSIS (${navigationIntel.clickable_elements.length} total):`);
        console.log('================================================');
        
        const elementsByPurpose = this.groupElementsByPurpose(navigationIntel.clickable_elements);
        
        for (const [purpose, elements] of Object.entries(elementsByPurpose)) {
          console.log(`\n🎯 ${purpose.toUpperCase().replace('_', ' ')} (${elements.length} elements):`);
          elements.slice(0, 5).forEach((element, index) => {
            console.log(`   ${index + 1}. ${element.text.substring(0, 50)}${element.text.length > 50 ? '...' : ''}`);
            if (element.url) {
              console.log(`      → ${element.url.substring(0, 70)}${element.url.length > 70 ? '...' : ''}`);
            }
          });
          if (elements.length > 5) {
            console.log(`   ... and ${elements.length - 5} more ${purpose} elements`);
          }
        }
      }
      
      // Generate category insights
      console.log(`\n📈 CATEGORY INSIGHTS & RECOMMENDATIONS:`);
      console.log('=====================================');
      
      const insights = this.generateCategoryInsights(navigationIntel);
      insights.forEach(insight => {
        console.log(`${insight.emoji} ${insight.category}: ${insight.message}`);
      });
      
      await this.siteIntelligence.close();
      
    } catch (error) {
      console.error('❌ Analysis failed:', error.message);
      await this.siteIntelligence.close();
    }
  }

  categorizeNavSections(sections) {
    const categories = {
      'Product Categories': [],
      'Gender/Demographics': [],
      'Brands': [],
      'Featured/Collections': [],
      'Account/Service': [],
      'Company/Info': [],
      'Other': []
    };
    
    sections.forEach(section => {
      const name = section.name.toLowerCase();
      const url = section.url.toLowerCase();
      
      if (this.isProductCategory(name, url)) {
        categories['Product Categories'].push(section);
      } else if (this.isGenderDemographic(name, url)) {
        categories['Gender/Demographics'].push(section);
      } else if (this.isBrand(name, url, section.name)) {
        categories['Brands'].push(section);
      } else if (this.isFeaturedCollection(name, url)) {
        categories['Featured/Collections'].push(section);
      } else if (this.isAccountService(name, url)) {
        categories['Account/Service'].push(section);
      } else if (this.isCompanyInfo(name, url)) {
        categories['Company/Info'].push(section);
      } else {
        categories['Other'].push(section);
      }
    });
    
    return categories;
  }

  isProductCategory(name, url) {
    const categoryKeywords = [
      'clothing', 'shoes', 'accessories', 'bags', 'jewelry', 'watches',
      'shirts', 'pants', 'jeans', 'dresses', 'jackets', 'sweaters', 'coats',
      'sneakers', 'boots', 'sandals', 'heels', 'flats',
      'belts', 'hats', 'scarves', 'sunglasses', 'gloves'
    ];
    
    return categoryKeywords.some(keyword => name.includes(keyword) || url.includes(keyword));
  }

  isGenderDemographic(name, url) {
    const genderKeywords = ['men', 'women', 'mens', 'womens', 'unisex', 'kids', 'children'];
    return genderKeywords.some(keyword => name.includes(keyword) || url.includes(keyword));
  }

  isBrand(name, url, sectionName) {
    const brandKeywords = ['brand', 'designer', 'label'];
    // Also check if it looks like a brand name (capitalized words)
    const isBrandName = /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(sectionName || '') && 
                        !name.includes('shop') && !name.includes('new') && !name.includes('sale');
    return brandKeywords.some(keyword => name.includes(keyword) || url.includes(keyword)) || isBrandName;
  }

  isFeaturedCollection(name, url) {
    const featuredKeywords = [
      'new', 'arrivals', 'featured', 'trending', 'popular', 'sale', 'clearance',
      'limited', 'exclusive', 'collection', 'season', 'holiday', 'gift'
    ];
    return featuredKeywords.some(keyword => name.includes(keyword) || url.includes(keyword));
  }

  isAccountService(name, url) {
    const serviceKeywords = [
      'account', 'login', 'register', 'profile', 'wishlist', 'cart', 'checkout',
      'order', 'shipping', 'return', 'help', 'support', 'customer', 'service'
    ];
    return serviceKeywords.some(keyword => name.includes(keyword) || url.includes(keyword));
  }

  isCompanyInfo(name, url) {
    const companyKeywords = [
      'about', 'story', 'contact', 'store', 'location', 'careers', 'press',
      'blog', 'news', 'sustainability', 'privacy', 'terms', 'policy'
    ];
    return companyKeywords.some(keyword => name.includes(keyword) || url.includes(keyword));
  }

  groupElementsByPurpose(elements) {
    const grouped = {};
    
    elements.forEach(element => {
      const purpose = element.page_purpose || 'general';
      if (!grouped[purpose]) {
        grouped[purpose] = [];
      }
      grouped[purpose].push(element);
    });
    
    // Sort by count
    const sortedGroups = {};
    Object.keys(grouped)
      .sort((a, b) => grouped[b].length - grouped[a].length)
      .forEach(key => {
        sortedGroups[key] = grouped[key];
      });
    
    return sortedGroups;
  }

  generateCategoryInsights(navigationIntel) {
    const insights = [];
    const sectionCount = navigationIntel.main_sections.length;
    const dropdownCount = Object.keys(navigationIntel.dropdown_menus).length;
    const hasSearchElements = navigationIntel.clickable_elements.some(el => el.page_purpose === 'search');
    
    // Site complexity insight
    if (sectionCount > 100) {
      insights.push({
        emoji: '🏢',
        category: 'Site Complexity',
        message: `Large e-commerce site with ${sectionCount} navigation sections - excellent for comprehensive scraping`
      });
    } else if (sectionCount > 50) {
      insights.push({
        emoji: '🏪',
        category: 'Site Complexity', 
        message: `Medium-sized site with ${sectionCount} sections - good category diversity`
      });
    } else {
      insights.push({
        emoji: '🏬',
        category: 'Site Complexity',
        message: `Focused site with ${sectionCount} sections - targeted product range`
      });
    }
    
    // Navigation structure insight
    if (dropdownCount > 5) {
      insights.push({
        emoji: '📁',
        category: 'Navigation Structure',
        message: `Rich dropdown navigation with ${dropdownCount} menus - excellent for category hierarchy mapping`
      });
    }
    
    // Search capability insight
    if (hasSearchElements) {
      insights.push({
        emoji: '🔍',
        category: 'Search Capability',
        message: 'Site has search functionality - can supplement category-based queries'
      });
    }
    
    // Category-based scraping recommendation
    const categoryElements = navigationIntel.main_sections.filter(section => 
      this.isProductCategory(section.name.toLowerCase(), section.url.toLowerCase())
    );
    
    if (categoryElements.length > 10) {
      insights.push({
        emoji: '🎯',
        category: 'Scraping Strategy',
        message: `${categoryElements.length} product categories detected - ideal for category-aware parallel scraping`
      });
    }
    
    return insights;
  }
}

async function runCategoryAnalysis() {
  const analyzer = new CategoryDiscoveryAnalyzer();
  await analyzer.analyzeGlasswingCategories();
}

if (require.main === module) {
  runCategoryAnalysis()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Analysis crashed:', error);
      process.exit(1);
    });
}

module.exports = { CategoryDiscoveryAnalyzer };