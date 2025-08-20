/**
 * Toast Tab Restaurant Menu Selectors
 * 
 * Based on Toast's consistent data-test attributes and fallback patterns
 * Works with most Toast-powered restaurant sites
 */

const ToastSelectors = {
  platform: 'ToastTab',
  
  selectors: {
    // Main menu container
    root: [
      "[data-test='menu-root']",
      "main [data-test*='menu']",
      "main"
    ],
    
    // Category sections
    categorySection: [
      "[data-test='menu-section']",
      "section:has([data-test='menu-section-title'])",
      "section:has(h2, h3)"
    ],
    
    categoryTitle: [
      "[data-test='menu-section-title']",
      "section h2[role='heading'], section h3[role='heading']",
      "section header :is(h2,h3)"
    ],
    
    // Menu items
    items: [
      "[data-test='menu-item']",
      "[role='listitem'][data-automation*='menu']",
      "div:has([data-test*='menu-item-name'])"
    ],
    
    itemName: [
      "[data-test='menu-item-name']",
      ":is(h3,h4,button)[role='heading']",
      "[class*='ItemName']"
    ],
    
    itemDescription: [
      "[data-test='menu-item-description']",
      "[class*='Description']",
      "p"
    ],
    
    itemPrice: [
      "[data-test='menu-item-price']",
      "[class*='Price']",
      "span:has-text('$'), div:has-text('$')"
    ],
    
    // Links and actions
    itemLink: [
      "[data-test='menu-item'] a[href*='/item-']",
      "a[href*='/item-']",
      "button[aria-label*='Customize']"
    ],
    
    // Availability
    notAcceptingOrders: [
      "[data-test='not-accepting-orders']",
      "main :text('Not accepting orders')",
      "[aria-live] :text('Not accepting orders')"
    ],
    
    soldOut: [
      "[data-test='sold-out']",
      "[aria-disabled='true']",
      ":text('Sold Out')"
    ],
    
    // Order type selection
    pickupButton: [
      "[data-test='order-type-pickup']",
      "button:has-text('Pickup')",
      "[aria-label*='Pickup']"
    ],
    
    deliveryButton: [
      "[data-test='order-type-delivery']", 
      "button:has-text('Delivery')",
      "[aria-label*='Delivery']"
    ]
  },
  
  // Wait conditions
  waitFor: {
    menuLoaded: "[data-test='menu-item'], [data-test='menu-section']",
    pricesVisible: "[data-test='menu-item-price'], [class*='Price']"
  },
  
  // Extraction helpers
  patterns: {
    price: /\$[\d\.,]+/,
    itemUrl: /\/item-[\w-]+/,
    restaurantId: /\/([^\/]+)\/order\//
  }
};

/**
 * Get the first working selector from a list
 */
async function findWorkingSelector(page, selectorList) {
  for (const selector of selectorList) {
    try {
      const element = await page.locator(selector).first();
      if (await element.isVisible({ timeout: 1000 })) {
        return selector;
      }
    } catch (e) {
      // Try next selector
    }
  }
  return selectorList[0]; // Fallback to first
}

/**
 * Extract menu data from a Toast restaurant page
 */
async function extractToastMenu(page, url) {
  console.log(`🍜 Extracting Toast menu from: ${url}`);
  
  // Navigate to page
  await page.goto(url, { 
    waitUntil: 'domcontentloaded',
    timeout: 30000 
  });
  
  // Wait for menu to load
  try {
    await page.waitForSelector(ToastSelectors.waitFor.menuLoaded, { 
      timeout: 10000 
    });
  } catch (e) {
    console.log('⚠️ Menu not loaded, checking if restaurant is closed...');
    
    // Check if not accepting orders
    const notAccepting = await page.locator(
      ToastSelectors.selectors.notAcceptingOrders.join(', ')
    ).first();
    
    if (await notAccepting.isVisible()) {
      return {
        status: 'closed',
        message: await notAccepting.textContent(),
        categories: []
      };
    }
  }
  
  // Scroll to load all items (Toast sometimes lazy-loads)
  await autoScroll(page);
  
  // Extract menu data
  const menuData = await page.evaluate((selectors) => {
    const results = {
      categories: [],
      totalItems: 0
    };
    
    // Helper to get text from element
    const getText = (el) => (el?.textContent || '').trim();
    
    // Helper to find first matching element
    const findFirst = (parent, selectorList) => {
      for (const sel of selectorList) {
        const el = parent.querySelector(sel);
        if (el && getText(el)) return el;
      }
      return null;
    };
    
    // Find all category sections
    const sections = document.querySelectorAll(
      selectors.categorySection.join(', ')
    );
    
    sections.forEach(section => {
      // Get category title
      const titleEl = findFirst(section, selectors.categoryTitle);
      const categoryName = getText(titleEl) || 'Uncategorized';
      
      // Get all items in this category
      const items = [];
      const itemElements = section.querySelectorAll(
        selectors.items.join(', ')
      );
      
      itemElements.forEach(itemEl => {
        // Extract item details
        const nameEl = findFirst(itemEl, selectors.itemName);
        const descEl = findFirst(itemEl, selectors.itemDescription);
        const priceEl = findFirst(itemEl, selectors.itemPrice);
        
        // Get price value
        const priceText = getText(priceEl);
        const priceMatch = priceText.match(/\$[\d\.,]+/);
        const price = priceMatch ? priceMatch[0] : priceText;
        
        // Check if sold out
        const soldOut = selectors.soldOut.some(sel => 
          itemEl.querySelector(sel) !== null
        );
        
        // Get item detail URL if available
        let detailUrl = null;
        for (const sel of selectors.itemLink) {
          const link = itemEl.querySelector(sel);
          if (link && link.href) {
            detailUrl = link.href;
            break;
          }
        }
        
        items.push({
          name: getText(nameEl),
          description: getText(descEl),
          price: price,
          soldOut: soldOut,
          detailUrl: detailUrl
        });
      });
      
      results.categories.push({
        name: categoryName,
        itemCount: items.length,
        items: items
      });
      
      results.totalItems += items.length;
    });
    
    return results;
  }, ToastSelectors.selectors);
  
  return {
    status: 'success',
    url: url,
    platform: 'ToastTab',
    scrapedAt: new Date().toISOString(),
    ...menuData
  };
}

/**
 * Auto-scroll to load lazy-loaded content
 */
async function autoScroll(page, maxScrolls = 10) {
  let previousHeight = 0;
  let scrollCount = 0;
  
  while (scrollCount < maxScrolls) {
    // Get current page height
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    
    // If height hasn't changed, we're done
    if (currentHeight === previousHeight) break;
    
    // Scroll down
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    
    // Wait for new content
    await page.waitForTimeout(1000);
    
    previousHeight = currentHeight;
    scrollCount++;
  }
  
  console.log(`📜 Scrolled ${scrollCount} times to load content`);
}

module.exports = {
  ToastSelectors,
  findWorkingSelector,
  extractToastMenu,
  autoScroll
};