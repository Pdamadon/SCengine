#!/usr/bin/env node

/**
 * Glasswing Variants Investigation
 * 
 * Examine what variant data is available in JSON-LD vs DOM
 */

require('dotenv').config();

const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');
const { logger } = require('./src/utils/logger');

const TEST_URL = 'https://glasswingshop.com/products/7115-by-szeki-cocoon-dress-shirt-off-white';

async function investigateVariants() {
  console.log('🔍 Glasswing Variants Investigation');
  console.log('===================================\n');
  console.log(`🎯 Testing: ${TEST_URL}\n`);
  
  const browserManager = new BrowserManagerBrowserless();
  let closeSession;
  
  try {
    console.log('🌐 Creating browser session...');
    const { page, close } = await browserManager.createBrowser('stealth');
    closeSession = close;
    
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // 1. Check JSON-LD for variant data
    console.log('1️⃣ JSON-LD Variant Data');
    console.log('=======================');
    
    const jsonLdData = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      const allData = [];
      
      scripts.forEach(script => {
        try {
          const data = JSON.parse(script.textContent);
          allData.push(data);
        } catch (e) {
          // Skip invalid JSON
        }
      });
      
      return allData;
    });
    
    console.log(`Found ${jsonLdData.length} JSON-LD scripts`);
    
    jsonLdData.forEach((data, i) => {
      console.log(`\nScript ${i + 1}:`);
      console.log(`   @type: ${data['@type']}`);
      
      if (data['@type'] === 'Product') {
        console.log('   🛍️ Product Data:');
        console.log(`      Name: ${data.name}`);
        console.log(`      Offers: ${JSON.stringify(data.offers, null, 6)}`);
        
        // Check for variant information
        if (data.model || data.variants || data.hasVariant) {
          console.log(`      ✅ Variants found: ${JSON.stringify(data.model || data.variants || data.hasVariant, null, 6)}`);
        } else {
          console.log(`      ❌ No variant data in JSON-LD`);
        }
        
        // Check offers array for multiple variants
        if (Array.isArray(data.offers)) {
          console.log(`      📊 Multiple offers: ${data.offers.length} variants`);
          data.offers.forEach((offer, idx) => {
            console.log(`         ${idx + 1}. ${offer.name || 'unnamed'}: ${offer.priceCurrency}${offer.price}`);
          });
        } else if (data.offers) {
          console.log(`      📊 Single offer: ${data.offers.name || 'main product'}`);
        }
      }
    });
    
    // 2. Check DOM for variant selectors
    console.log('\n\n2️⃣ DOM Variant Investigation');
    console.log('============================');
    
    const variantElements = await page.evaluate(() => {
      const variants = {
        selects: [],
        radios: [],
        buttons: [],
        swatches: [],
        forms: []
      };
      
      // Check for select dropdowns
      const selects = document.querySelectorAll('select');
      selects.forEach(select => {
        const options = Array.from(select.options).map(opt => ({
          value: opt.value,
          text: opt.textContent.trim(),
          selected: opt.selected
        }));
        
        if (options.length > 1) { // More than just "Choose..." option
          variants.selects.push({
            name: select.name,
            id: select.id,
            className: select.className,
            options: options
          });
        }
      });
      
      // Check for radio buttons
      const radioGroups = {};
      document.querySelectorAll('input[type="radio"]').forEach(radio => {
        const groupName = radio.name;
        if (!radioGroups[groupName]) {
          radioGroups[groupName] = [];
        }
        radioGroups[groupName].push({
          value: radio.value,
          id: radio.id,
          className: radio.className,
          checked: radio.checked,
          label: radio.parentElement?.textContent?.trim() || radio.nextSibling?.textContent?.trim()
        });
      });
      
      Object.entries(radioGroups).forEach(([name, radios]) => {
        variants.radios.push({ groupName: name, options: radios });
      });
      
      // Check for variant buttons/swatches
      const variantButtons = document.querySelectorAll('[data-variant], .variant-option, .swatch, .product-option');
      variantButtons.forEach(btn => {
        variants.buttons.push({
          tagName: btn.tagName,
          className: btn.className,
          textContent: btn.textContent?.trim(),
          dataset: Object.fromEntries(Object.entries(btn.dataset))
        });
      });
      
      // Check for color/size swatches
      const swatches = document.querySelectorAll('.color-swatch, .size-option, [class*="variant"]');
      swatches.forEach(swatch => {
        variants.swatches.push({
          className: swatch.className,
          textContent: swatch.textContent?.trim(),
          style: swatch.style.cssText,
          dataset: Object.fromEntries(Object.entries(swatch.dataset))
        });
      });
      
      // Check for product forms
      const forms = document.querySelectorAll('form[action*="cart"], form[action*="product"]');
      forms.forEach(form => {
        const inputs = Array.from(form.querySelectorAll('input, select')).map(input => ({
          type: input.type,
          name: input.name,
          value: input.value,
          className: input.className
        }));
        
        variants.forms.push({
          action: form.action,
          method: form.method,
          inputs: inputs
        });
      });
      
      return variants;
    });
    
    console.log(`Select dropdowns: ${variantElements.selects.length}`);
    variantElements.selects.forEach(select => {
      console.log(`   ${select.name || select.id || 'unnamed'}: ${select.options.length} options`);
      select.options.slice(0, 5).forEach(opt => {
        console.log(`      - ${opt.text} (${opt.value})`);
      });
    });
    
    console.log(`\nRadio button groups: ${variantElements.radios.length}`);
    variantElements.radios.forEach(group => {
      console.log(`   ${group.groupName}: ${group.options.length} options`);
      group.options.slice(0, 5).forEach(opt => {
        console.log(`      - ${opt.label || opt.value} (${opt.value})`);
      });
    });
    
    console.log(`\nVariant buttons: ${variantElements.buttons.length}`);
    variantElements.buttons.slice(0, 5).forEach(btn => {
      console.log(`   <${btn.tagName}> "${btn.textContent}" class="${btn.className}"`);
    });
    
    console.log(`\nSwatches: ${variantElements.swatches.length}`);
    variantElements.swatches.slice(0, 5).forEach(swatch => {
      console.log(`   "${swatch.textContent}" class="${swatch.className}"`);
    });
    
    console.log(`\nProduct forms: ${variantElements.forms.length}`);
    variantElements.forms.forEach(form => {
      console.log(`   ${form.action} (${form.inputs.length} inputs)`);
      form.inputs.slice(0, 5).forEach(input => {
        console.log(`      ${input.type}: ${input.name} = "${input.value}"`);
      });
    });
    
    // 3. Check for Shopify-specific variant data
    console.log('\n\n3️⃣ Shopify Variant Data');
    console.log('=======================');
    
    const shopifyData = await page.evaluate(() => {
      const data = {};
      
      // Check for Shopify product object
      if (window.product) {
        data.windowProduct = window.product;
      }
      
      // Check for Shopify meta object
      if (window.meta && window.meta.product) {
        data.metaProduct = window.meta.product;
      }
      
      // Check for variant script tags
      const variantScripts = document.querySelectorAll('script:not([type="application/ld+json"])');
      const variantData = [];
      
      variantScripts.forEach(script => {
        const content = script.textContent;
        if (content.includes('variants') || content.includes('product')) {
          const lines = content.split('\n').filter(line => 
            line.includes('variants') || line.includes('product')
          );
          if (lines.length > 0) {
            variantData.push({
              type: 'script',
              relevantLines: lines.slice(0, 3)
            });
          }
        }
      });
      
      data.variantScripts = variantData;
      
      return data;
    });
    
    if (shopifyData.windowProduct) {
      console.log('✅ Found window.product:');
      console.log(`   ${JSON.stringify(shopifyData.windowProduct, null, 2)}`);
    }
    
    if (shopifyData.metaProduct) {
      console.log('✅ Found window.meta.product:');
      console.log(`   ${JSON.stringify(shopifyData.metaProduct, null, 2)}`);
    }
    
    console.log(`\nVariant-related scripts: ${shopifyData.variantScripts.length}`);
    shopifyData.variantScripts.slice(0, 3).forEach((script, i) => {
      console.log(`   Script ${i + 1}:`);
      script.relevantLines.forEach(line => {
        console.log(`      ${line.trim()}`);
      });
    });
    
    // 4. Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 VARIANT DATA SUMMARY');
    console.log('='.repeat(50));
    
    const hasJsonLdVariants = jsonLdData.some(data => 
      data['@type'] === 'Product' && (
        data.model || data.variants || data.hasVariant || 
        (Array.isArray(data.offers) && data.offers.length > 1)
      )
    );
    
    const hasDomVariants = 
      variantElements.selects.length > 0 || 
      variantElements.radios.length > 0 || 
      variantElements.buttons.length > 0;
    
    const hasShopifyVariants = 
      shopifyData.windowProduct || 
      shopifyData.metaProduct || 
      shopifyData.variantScripts.length > 0;
    
    console.log(`\n✅ VARIANT DATA SOURCES:`);
    console.log(`   JSON-LD variants: ${hasJsonLdVariants ? '✅' : '❌'}`);
    console.log(`   DOM form elements: ${hasDomVariants ? '✅' : '❌'}`);
    console.log(`   Shopify objects: ${hasShopifyVariants ? '✅' : '❌'}`);
    
    console.log(`\n🎯 RECOMMENDATION:`);
    if (hasJsonLdVariants) {
      console.log(`   Use JSON-LD as primary source for variant data`);
    } else if (hasDomVariants) {
      console.log(`   Parse DOM form elements for variant options`);
    } else if (hasShopifyVariants) {
      console.log(`   Extract from Shopify JavaScript objects`);
    } else {
      console.log(`   No variant data found - single product or variants not implemented`);
    }
    
  } catch (error) {
    console.error('❌ Investigation failed:', error);
  } finally {
    if (closeSession) {
      await closeSession();
    }
  }
}

if (require.main === module) {
  investigateVariants().catch(console.error);
}

module.exports = { investigateVariants };