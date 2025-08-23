const BrowserManagerBrowserless = require('../../../src/common/BrowserManagerBrowserless');
const SelectorDiscovery = require('../../../src/common/SelectorDiscovery');

async function testUniversalDiscoveryGlasswing() {
  const browserManager = new BrowserManagerBrowserless();
  let page, closeBrowser;
  
  try {
    console.log('🧪 Testing Universal Selector Discovery on Mure and Grand...\n');
    
    // Initialize browser
    const browserSession = await browserManager.createBrowser('stealth');
    page = browserSession.page;
    closeBrowser = browserSession.close;
    console.log('✅ Browser initialized');
    
    // Navigate to Mure and Grand product page
    const testUrl = 'https://mureandgrand.com/products/feeling-glazy-graphic-t-shirt';
    console.log(`🔗 Navigating to: ${testUrl}`);
    
    await page.goto(testUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });
    
    // Wait a bit more for dynamic content
    await page.waitForTimeout(3000);
    console.log('✅ Page loaded successfully\n');
    
    // Initialize SelectorDiscovery
    const discovery = new SelectorDiscovery();
    
    // Test universal discovery (no platform detection needed)
    console.log('🔍 Running universal selector discovery...');
    const candidates = await discovery.findSelectorCandidates(page);
    
    console.log('\n📋 DISCOVERY RESULTS:');
    console.log('='.repeat(50));
    
    // Variant Groups
    console.log(`\n🎯 VARIANT GROUPS (${candidates.variant_groups.length} found):`);
    candidates.variant_groups.forEach((group, i) => {
      console.log(`\n  ${i + 1}. ${group.name}`);
      console.log(`     Type: ${group.type}`);
      console.log(`     Selector: ${group.selector}`);
      console.log(`     Interaction: ${group.interaction_method}`);
      console.log(`     Current: ${group.current_value || 'none'}`);
      console.log(`     Options: ${group.options.map(opt => `"${opt.text}"`).join(', ')}`);
    });
    
    // Cart Button
    console.log(`\n🛒 CART BUTTON:`);
    if (candidates.cart_button) {
      console.log(`     Selector: ${candidates.cart_button.selector}`);
      console.log(`     Text: "${candidates.cart_button.text}"`);
      console.log(`     Disabled: ${candidates.cart_button.disabled}`);
      console.log(`     Interaction: ${candidates.cart_button.interaction_method}`);
    } else {
      console.log('     ❌ No cart button found');
    }
    
    // Price Elements
    console.log(`\n💰 PRICE ELEMENTS (${candidates.price_elements.length} found):`);
    candidates.price_elements.forEach((price, i) => {
      console.log(`     ${i + 1}. "${price.text}" (${price.value}) - ${price.selector}`);
    });
    
    // Images
    console.log(`\n🖼️  PRODUCT IMAGES (${candidates.image_elements.length} found):`);
    candidates.image_elements.forEach((img, i) => {
      console.log(`     ${i + 1}. ${img.selector} - ${img.src.substring(0, 60)}...`);
    });
    
    // Hidden Inputs
    console.log(`\n🔒 HIDDEN INPUTS (${candidates.hidden_inputs.length} found):`);
    candidates.hidden_inputs.forEach((input, i) => {
      console.log(`     ${i + 1}. ${input.name}: "${input.current_value}" - ${input.selector}`);
    });
    
    // Test interaction with first variant group if available
    if (candidates.variant_groups.length > 0) {
      console.log('\n🧪 TESTING VARIANT INTERACTION:');
      console.log('='.repeat(50));
      
      const firstGroup = candidates.variant_groups[0];
      const testOption = firstGroup.options.find(opt => !opt.disabled && opt.value !== firstGroup.current_value);
      
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
        }, candidates.cart_button.selector);
        
        console.log(`🛒 Cart button before: ${cartBefore?.disabled ? 'DISABLED' : 'ENABLED'} - "${cartBefore?.text}"`);
        
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
          await page.click(`${firstGroup.selector}[data-value="${testOption.value}"]`);
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
        }, candidates.cart_button.selector);
        
        console.log(`🛒 Cart button after:  ${cartAfter?.disabled ? 'DISABLED' : 'ENABLED'} - "${cartAfter?.text}"`);
        
        // Check if state changed
        const stateChanged = cartBefore?.disabled !== cartAfter?.disabled || 
                            cartBefore?.text !== cartAfter?.text;
        
        console.log(`\n✅ Result: ${stateChanged ? 'CART BUTTON STATE CHANGED' : 'No cart button change detected'}`);
        
        if (stateChanged) {
          console.log('   🎉 Variant interaction is working!');
        } else {
          console.log('   ⚠️  Either no change occurred or variant selection failed');
        }
      } else {
        console.log('   ⚠️  No testable options found for first variant group');
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('🧪 Universal Discovery Test Complete!');
    
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
testUniversalDiscoveryGlasswing();