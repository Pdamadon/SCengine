const BrowserManagerBrowserless = require('../../../src/common/BrowserManagerBrowserless');

/**
 * Cart-Centric Discovery Strategy Test
 * 
 * Strategy: Find cart button first (most reliable), then search nearby for variants
 * Based on e-commerce UX best practice: variants are always above cart button
 */

async function cartCentricDiscovery(page) {
  return await page.evaluate(() => {
    // Helper functions
    function generateSelector(element) {
      if (element.id && typeof element.id === 'string' && !element.id.match(/^\d/)) {
        return `#${element.id}`;
      }
      if (element.name) {
        return `${element.tagName.toLowerCase()}[name="${element.name}"]`;
      }
      if (element.className) {
        const classes = element.className.split(' ').filter(c => c.trim());
        if (classes.length > 0) {
          return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
        }
      }
      const siblings = Array.from(element.parentElement?.children || []);
      const index = siblings.indexOf(element);
      return `${element.tagName.toLowerCase()}:nth-child(${index + 1})`;
    }

    function extractVariantName(element) {
      // Try data attributes
      const dataName = element.getAttribute('data-option-name') || 
                      element.getAttribute('data-variant-name');
      if (dataName) return dataName;

      // Try nearby text/labels
      const parent = element.parentElement;
      if (parent) {
        // Look for preceding text nodes or labels
        const prevSibling = element.previousElementSibling;
        if (prevSibling && prevSibling.textContent.trim().length < 20) {
          return prevSibling.textContent.trim();
        }
        
        // Look for parent text
        const parentText = parent.textContent.replace(element.textContent, '').trim();
        if (parentText && parentText.length < 20) {
          return parentText;
        }
      }

      return element.name || element.id || 'Unknown Variant';
    }

    const results = {
      cart_button: null,
      variant_groups: [],
      price_elements: [],
      product_container: null,
      strategy: 'cart-centric',
      debug: {
        containerElements: 0,
        variantCandidates: 0,
        interactiveElements: [],
        elementsAboveCart: []
      }
    };

    // STEP 1: Find cart button (anchor point)
    console.log('🎯 Step 1: Finding cart button...');
    const cartButtonCandidates = Array.from(document.querySelectorAll('button, input[type="submit"]'))
      .filter(btn => {
        const text = btn.textContent?.toLowerCase() || btn.value?.toLowerCase() || '';
        const hasCartText = text.includes('add') && (text.includes('cart') || text.includes('bag')) ||
                           text.includes('buy') ||
                           btn.name?.includes('add') ||
                           btn.classList.toString().match(/cart|add|buy/i);
        return hasCartText;
      })
      .sort((a, b) => {
        // Prioritize "Add to cart" over "Check out"
        const aText = a.textContent?.toLowerCase() || '';
        const bText = b.textContent?.toLowerCase() || '';
        
        if (aText.includes('add') && !bText.includes('add')) return -1;
        if (bText.includes('add') && !aText.includes('add')) return 1;
        
        // Prioritize by form context - avoid cart drawer forms
        const aForm = a.closest('form');
        const bForm = b.closest('form');
        const aIsCartDrawer = aForm?.id?.includes('cart') || aForm?.className?.includes('cart');
        const bIsCartDrawer = bForm?.id?.includes('cart') || bForm?.className?.includes('cart');
        
        if (!aIsCartDrawer && bIsCartDrawer) return -1;
        if (!bIsCartDrawer && aIsCartDrawer) return 1;
        
        return 0;
      });

    if (cartButtonCandidates.length === 0) {
      console.log('❌ No cart button found');
      return results;
    }

    const cartButton = cartButtonCandidates[0];
    results.cart_button = {
      selector: generateSelector(cartButton),
      text: cartButton.textContent?.trim() || cartButton.value,
      disabled: cartButton.disabled,
      element: cartButton // Keep reference for proximity search
    };

    console.log(`✅ Cart button found: "${results.cart_button.text}"`);

    // STEP 2: Find product container (form or closest meaningful parent)
    console.log('🏠 Step 2: Finding product container...');
    const productContainer = cartButton.closest('form') || 
                            cartButton.closest('[data-product]') ||
                            cartButton.closest('.product') ||
                            cartButton.closest('[class*="product"]') ||
                            cartButton.parentElement;

    if (!productContainer) {
      console.log('❌ No product container found');
      return results;
    }

    results.product_container = {
      selector: generateSelector(productContainer),
      tagName: productContainer.tagName
    };

    console.log(`✅ Product container: ${productContainer.tagName}`);

    // STEP 3: Search for variants ABOVE cart button across entire page
    console.log('🔍 Step 3: Searching for variants above cart button across page...');
    
    // Get cart button position for reference
    const cartButtonRect = cartButton.getBoundingClientRect();
    
    // Search the ENTIRE page for variant elements (don't limit to containers)
    const allPageElements = [
      ...Array.from(document.querySelectorAll('select')),
      ...Array.from(document.querySelectorAll('button:not([type="submit"])')),
      ...Array.from(document.querySelectorAll('input[type="radio"]')),
      ...Array.from(document.querySelectorAll('input[type="checkbox"]')),
      ...Array.from(document.querySelectorAll('[class*="variant"], [class*="option"], [class*="swatch"]')),
      ...Array.from(document.querySelectorAll('[name*="Size"], [name*="Color"], [name*="size"], [name*="color"]'))
    ];

    // Filter elements that are ABOVE cart button
    const variantCandidates = allPageElements.filter(el => {
      if (el === cartButton) return false; // Skip cart button itself
      
      const elRect = el.getBoundingClientRect();
      const isAboveCart = elRect.top < cartButtonRect.top;
      const isVisible = el.offsetParent !== null;
      
      return isAboveCart && isVisible;
    });

    // Store debug info
    results.debug.containerElements = allPageElements.length;
    results.debug.variantCandidates = variantCandidates.length;
    
    // Debug: Show what we found
    results.debug.elementsAboveCart = variantCandidates.map(el => ({
      tagName: el.tagName,
      text: el.textContent?.trim().substring(0, 30),
      className: el.className,
      id: el.id,
      name: el.name
    }));
    
    // Debug: Show ALL interactive elements on page for comparison
    const allInteractiveElements = Array.from(document.querySelectorAll('select, button, input')).filter(el => el !== cartButton);
    
    results.debug.interactiveElements = allInteractiveElements.map(el => {
      const rect = el.getBoundingClientRect();
      const aboveCart = rect.top < cartButtonRect.top;
      return {
        tagName: el.tagName,
        text: el.textContent?.trim().substring(0, 20),
        className: el.className,
        aboveCart: aboveCart,
        type: el.type,
        name: el.name
      };
    });

    // Process SELECT elements
    const selects = variantCandidates.filter(el => el.tagName === 'SELECT');
    selects.forEach(select => {
      // Skip quantity selects
      if (select.name && select.name.toLowerCase().includes('quantity')) {
        return;
      }

      const options = Array.from(select.options).map(opt => ({
        value: opt.value,
        text: opt.textContent.trim(),
        disabled: opt.disabled
      })).filter(opt => opt.value && opt.text && opt.text !== 'Choose an option');

      if (options.length > 1) {
        results.variant_groups.push({
          name: extractVariantName(select),
          type: 'select',
          selector: generateSelector(select),
          options: options,
          current_value: select.value,
          interaction_method: 'selectOption'
        });
      }
    });

    // Process RADIO inputs (very common for variants)
    const radios = variantCandidates.filter(el => el.tagName === 'INPUT' && el.type === 'radio');
    
    // Group radio buttons by name attribute
    const radioGroups = new Map();
    radios.forEach(radio => {
      if (!radioGroups.has(radio.name)) {
        radioGroups.set(radio.name, []);
      }
      radioGroups.get(radio.name).push(radio);
    });

    radioGroups.forEach((group, name) => {
      if (group.length > 1) {
        const options = group.map(radio => ({
          value: radio.value,
          text: radio.labels?.[0]?.textContent?.trim() || radio.value,
          disabled: radio.disabled,
          selected: radio.checked
        }));

        results.variant_groups.push({
          name: name, // Use the name attribute (Size, Color, etc.)
          type: 'radio_group',
          selector: `input[name="${name}"]`,
          options: options,
          current_value: options.find(opt => opt.selected)?.value,
          interaction_method: 'selectRadio'
        });
      }
    });

    // Process BUTTON groups (size/color swatches)
    const buttons = variantCandidates.filter(el => 
      el.tagName === 'BUTTON' && 
      !el.type?.includes('submit') &&
      el.textContent.trim().length < 10 // Likely size/color, not description
    );

    // Group buttons by common parent
    const buttonGroups = new Map();
    buttons.forEach(btn => {
      const groupParent = btn.closest('[class*="variant"], [class*="option"], [class*="size"], [class*="color"]') ||
                         btn.parentElement;
      
      if (!buttonGroups.has(groupParent)) {
        buttonGroups.set(groupParent, []);
      }
      buttonGroups.get(groupParent).push(btn);
    });

    buttonGroups.forEach((group, parent) => {
      if (group.length > 1) {
        // Try to determine variant type from context
        const parentText = parent.textContent.toLowerCase();
        let variantType = 'Unknown';
        if (parentText.includes('size')) variantType = 'Size';
        else if (parentText.includes('color') || parentText.includes('colour')) variantType = 'Color';
        
        const options = group.map(btn => ({
          value: btn.getAttribute('data-value') || btn.textContent.trim(),
          text: btn.textContent.trim(),
          disabled: btn.disabled || btn.classList.contains('disabled'),
          selected: btn.classList.contains('selected') || btn.classList.contains('active')
        }));

        results.variant_groups.push({
          name: variantType,
          type: 'button_group',
          selector: generateSelector(group[0], true),
          options: options,
          current_value: options.find(opt => opt.selected)?.text,
          interaction_method: 'clickButton'
        });
      }
    });

    // STEP 4: Find price within container
    console.log('💰 Step 4: Finding price elements...');
    const priceElements = Array.from(productContainer.querySelectorAll('*'))
      .filter(el => {
        const text = el.textContent?.trim() || '';
        return text.match(/[\$€£¥]\s*\d+[.,]?\d*/) && 
               el.children.length === 0 && // Leaf node
               text.length < 50; // Not too long
      });

    priceElements.forEach((el, i) => {
      if (i < 3) { // Limit to first 3
        const text = el.textContent.trim();
        results.price_elements.push({
          selector: generateSelector(el),
          text: text,
          value: text.match(/[\d,]+\.?\d*/)?.[0]
        });
      }
    });

    console.log(`✅ Discovery complete: ${results.variant_groups.length} variant groups, ${results.price_elements.length} prices`);
    return results;
  });
}

async function testCartCentricDiscovery() {
  const browserManager = new BrowserManagerBrowserless();
  let page, closeBrowser;
  
  const testSites = [
    {
      name: 'Dunn Lumber (Quantity Modal)',
      url: 'https://www.dunnlumber.com/spf-2-x-4-96-inches-premium-framing-stud-2-better-kiln-dried-spf2496.html'
    },
    {
      name: 'Glasswing (Size Dropdown)',
      url: 'https://glasswingshop.com/products/7115-by-szeki-cocoon-dress-shirt-off-white'
    },
    {
      name: 'Liana NYC (Size & Color Radio)',
      url: 'https://liana.nyc/collections/dresses/products/aster-dress-2'
    }
  ];
  
  try {
    console.log('🧪 Testing Cart-Centric Discovery Strategy...\n');
    
    // Initialize browser
    const browserSession = await browserManager.createBrowser('stealth');
    page = browserSession.page;
    closeBrowser = browserSession.close;
    console.log('✅ Browser initialized');
    
    for (const site of testSites) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🔗 Testing: ${site.name}`);
      console.log(`📍 URL: ${site.url}`);
      console.log(`${'='.repeat(80)}\n`);
      
      await page.goto(site.url, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      
      // Wait for dynamic content
      await page.waitForTimeout(3000);
      console.log('✅ Page loaded successfully\n');
      
      // Run cart-centric discovery
      console.log('🎯 Running cart-centric discovery...');
      const results = await cartCentricDiscovery(page);
    
      console.log('\n📋 CART-CENTRIC DISCOVERY RESULTS:');
      console.log('='.repeat(60));
    
      // Cart Button (anchor point)
      console.log(`\n🛒 CART BUTTON (anchor point):`);
      if (results.cart_button) {
        console.log(`       Selector: ${results.cart_button.selector}`);
        console.log(`       Text: "${results.cart_button.text}"`);
        console.log(`       Disabled: ${results.cart_button.disabled}`);
      } else {
        console.log('       ❌ No cart button found');
      }
    
      // Product Container
      console.log(`\n🏠 PRODUCT CONTAINER:`);
      if (results.product_container) {
        console.log(`       Element: ${results.product_container.tagName}`);
        console.log(`       Selector: ${results.product_container.selector}`);
      }
    
    // Variant Groups (found above cart button)
    console.log(`\n🎯 VARIANT GROUPS (${results.variant_groups.length} found above cart button):`);
    results.variant_groups.forEach((group, i) => {
      console.log(`\n  ${i + 1}. ${group.name}`);
      console.log(`     Type: ${group.type}`);
      console.log(`     Selector: ${group.selector}`);
      console.log(`     Interaction: ${group.interaction_method}`);
      console.log(`     Current: ${group.current_value || 'none'}`);
      console.log(`     Options: ${group.options.map(opt => `"${opt.text}"`).join(', ')}`);
    });
    
      // Price Elements
      console.log(`\n💰 PRICE ELEMENTS (${results.price_elements.length} found in product area):`);
      results.price_elements.forEach((price, i) => {
        console.log(`       ${i + 1}. "${price.text}" (${price.value}) - ${price.selector}`);
      });
    
      // Debug Information
      console.log(`\n🔍 DEBUG INFORMATION:`);
      console.log(`       Container elements searched: ${results.debug.containerElements}`);
      console.log(`       Elements above cart button: ${results.debug.variantCandidates}`);
      console.log(`       Interactive elements in form: ${results.debug.interactiveElements.length}`);
    
      if (results.debug.interactiveElements.length > 0) {
        console.log(`\n📋 All interactive elements in product form:`);
        results.debug.interactiveElements.forEach((el, i) => {
          console.log(`       ${i + 1}. ${el.tagName}${el.type ? `[${el.type}]` : ''} - "${el.text}" - Above cart: ${el.aboveCart} - ${el.className}`);
        });
      }
    
      if (results.debug.elementsAboveCart.length > 0) {
        console.log(`\n🎯 Elements found above cart button:`);
        results.debug.elementsAboveCart.forEach((el, i) => {
          console.log(`       ${i + 1}. ${el.tagName} - "${el.text}" - ${el.className}`);
        });
      }
    
      // Test interaction if variants found
      if (results.variant_groups.length > 0 && results.cart_button) {
        console.log('\n🧪 TESTING VARIANT INTERACTION:');
        console.log('='.repeat(60));
      
        const firstGroup = results.variant_groups[0];
        const testOption = firstGroup.options.find(opt => 
          !opt.disabled && 
          opt.value !== firstGroup.current_value &&
          opt.text.length < 5 // Likely size/color, not long text
        );
      
        if (testOption) {
          console.log(`\n🎯 Testing: ${firstGroup.name} = "${testOption.text}"`);
          
          // Record cart button state before
          const cartBefore = await page.evaluate((selector) => {
            const btn = document.querySelector(selector);
            return btn ? {
              disabled: btn.disabled,
              text: btn.textContent?.trim(),
              classes: btn.className
            } : null;
          }, results.cart_button.selector);
          
          console.log(`🛒 Cart button before: ${cartBefore?.disabled ? 'DISABLED' : 'ENABLED'} - "${cartBefore?.text}"`);
          
          try {
            // Perform interaction based on method
            if (firstGroup.interaction_method === 'selectOption') {
              await page.evaluate(({ selector, value }) => {
                const select = document.querySelector(selector);
                if (select) {
                  select.value = value;
                  select.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }, { selector: firstGroup.selector, value: testOption.value });
            } else if (firstGroup.interaction_method === 'clickButton') {
              // Find the specific button with this text/value
              await page.evaluate(({ text }) => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const targetButton = buttons.find(btn => 
                  btn.textContent.trim() === text || 
                  btn.getAttribute('data-value') === text
                );
                if (targetButton) {
                  targetButton.click();
                }
              }, { text: testOption.text });
            }
            
            // Wait for potential updates
            await page.waitForTimeout(1000);
            
            // Record cart button state after
            const cartAfter = await page.evaluate((selector) => {
              const btn = document.querySelector(selector);
              return btn ? {
                disabled: btn.disabled,
                text: btn.textContent?.trim(),
                classes: btn.className
              } : null;
            }, results.cart_button.selector);
            
            console.log(`🛒 Cart button after:  ${cartAfter?.disabled ? 'DISABLED' : 'ENABLED'} - "${cartAfter?.text}"`);
            
            // Check if state changed
            const stateChanged = cartBefore?.disabled !== cartAfter?.disabled || 
                                cartBefore?.text !== cartAfter?.text ||
                                cartBefore?.classes !== cartAfter?.classes;
            
            console.log(`\n✅ Result: ${stateChanged ? 'CART BUTTON STATE CHANGED' : 'No cart button change detected'}`);
            
            if (stateChanged) {
              console.log('     🎉 Variant interaction is working!');
            } else {
              console.log('     ⚠️  Either no change occurred or variant selection might work differently');
            }
            
          } catch (interactionError) {
            console.log(`     ❌ Interaction failed: ${interactionError.message}`);
          }
        } else {
          console.log('     ⚠️  No testable options found for first variant group');
        }
      }
    
      console.log('\n' + '='.repeat(60));
      console.log(`🧪 ${site.name} Test Complete!`);
      console.log(`📊 Strategy: Found ${results.variant_groups.length} variant groups using cart-button proximity`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('🏁 ALL SITES TESTED - Cart-Centric Discovery Complete!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    if (closeBrowser) {
      await closeBrowser();
    }
  }
}

// Run the test
testCartCentricDiscovery();