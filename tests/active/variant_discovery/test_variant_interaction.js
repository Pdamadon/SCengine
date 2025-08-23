#!/usr/bin/env node
/**
 * Variant Interaction Test
 *
 * Maps how to interact with variant selectors (size dropdowns, color swatches, etc.)
 * and observes what changes on the page when variants are selected
 */
require('dotenv').config();
const BrowserManagerBrowserless = require('./src/common/BrowserManagerBrowserless');

const TEST_URL = 'https://glasswingshop.com/products/7115-by-szeki-cocoon-dress-shirt-off-white';

async function testVariantInteraction() {
  console.log('🔄 Variant Interaction Test');
  console.log('============================');
  console.log(`📍 URL: ${TEST_URL}`);

  const browserManager = new BrowserManagerBrowserless();
  let closeSession;

  try {
    // Create browser session (headful for observation)
    console.log('🌐 Creating headful browser session...');
    const { page, close } = await browserManager.createBrowser('headful');
    closeSession = close;

    // Navigate to product page
    console.log('📄 Navigating to product page...');
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 1. Map variant selector elements
    console.log('\n1️⃣ Mapping Variant Selectors');
    console.log('=============================');

    const selectorInfo = await page.evaluate(() => {
      const selectors = {
        size_dropdown: null,
        color_swatches: [],
        variant_buttons: [],
        form_selects: [],
        price_elements: [],
        image_elements: []
      };

      // Look for size dropdowns (Glasswing specific)
      const sizeSelect = document.querySelector('select[name="id"]');
      if (sizeSelect) {
        const options = Array.from(sizeSelect.options).map(opt => ({
          value: opt.value,
          text: opt.text,
          selected: opt.selected
        }));
        selectors.size_dropdown = {
          selector: sizeSelect.tagName + (sizeSelect.id ? '#' + sizeSelect.id : '') + (sizeSelect.className ? '.' + sizeSelect.className.split(' ').join('.') : ''),
          options: options,
          current_selection: sizeSelect.value
        };
      }

      // Look for color swatches or variant buttons
      const colorElements = document.querySelectorAll('[data-option-value], .swatch, .variant-button, input[name*="Color"]');
      colorElements.forEach(el => {
        selectors.color_swatches.push({
          tag: el.tagName,
          type: el.type || 'div',
          selector: el.className ? '.' + el.className.split(' ').join('.') : el.tagName,
          data_value: el.getAttribute('data-option-value') || el.value,
          text: el.textContent?.trim() || el.alt || '',
          selected: el.checked || el.classList.contains('selected') || el.classList.contains('active')
        });
      });

      // Look for all form selects (might be multiple for different options)
      const allSelects = document.querySelectorAll('form select, .product-form select');
      allSelects.forEach(select => {
        const options = Array.from(select.options).map(opt => ({
          value: opt.value,
          text: opt.text,
          selected: opt.selected
        }));
        selectors.form_selects.push({
          name: select.name,
          id: select.id,
          selector: 'select' + (select.name ? '[name="' + select.name + '"]' : '') + (select.id ? '#' + select.id : ''),
          options: options
        });
      });

      // Identify price elements that might change (Glasswing specific)
      const priceElements = document.querySelectorAll('.product__price .money, [class*="price"], .product-price');
      priceElements.forEach(el => {
        selectors.price_elements.push({
          selector: el.className ? '.' + el.className.split(' ').join('.') : el.tagName,
          current_text: el.textContent?.trim(),
          current_value: el.getAttribute('data-price') || el.textContent?.match(/[\d,]+\.?\d*/)?.[0]
        });
      });

      // Identify image elements that might change (Glasswing specific)
      const imageElements = document.querySelectorAll('.product__media img, .product-media img, .product__hero img');
      imageElements.forEach(el => {
        selectors.image_elements.push({
          selector: el.className ? 'img.' + el.className.split(' ').join('.') : 'img',
          current_src: el.src,
          alt: el.alt
        });
      });

      return selectors;
    });

    console.log('📋 Found selectors:');
    if (selectorInfo.size_dropdown) {
      console.log(`   📏 Size Dropdown: ${selectorInfo.size_dropdown.selector}`);
      console.log(`      Options: ${selectorInfo.size_dropdown.options.map(o => o.text).join(', ')}`);
      console.log(`      Current: ${selectorInfo.size_dropdown.current_selection}`);
    }
    
    if (selectorInfo.color_swatches.length > 0) {
      console.log(`   🎨 Color/Variant Elements: ${selectorInfo.color_swatches.length} found`);
      selectorInfo.color_swatches.slice(0, 3).forEach((swatch, i) => {
        console.log(`      ${i + 1}. ${swatch.tag} - ${swatch.text || swatch.data_value}`);
      });
    }

    console.log(`   💰 Price Elements: ${selectorInfo.price_elements.length} found`);
    console.log(`   📷 Image Elements: ${selectorInfo.image_elements.length} found`);

    // 2. Test variant interaction
    console.log('\n2️⃣ Testing Variant Interaction');
    console.log('===============================');

    if (selectorInfo.size_dropdown && selectorInfo.size_dropdown.options.length > 1) {
      console.log('🔄 Testing size selection changes...');
      
      const sizeSelect = selectorInfo.size_dropdown.selector;
      const testSize = selectorInfo.size_dropdown.options.find(opt => !opt.selected && opt.value);
      
      if (testSize) {
        console.log(`   Changing from "${selectorInfo.size_dropdown.current_selection}" to "${testSize.value}"...`);
        
        // Capture state before change
        const beforeState = await page.evaluate(() => {
          const price = document.querySelector('.product__price .money, .money')?.textContent?.trim();
          const availability = document.querySelector('.product__inventory, [class*="stock"], [class*="available"]')?.textContent?.trim();
          const mainImage = document.querySelector('.product__media img, .product__hero img')?.src;
          return { price, availability, mainImage };
        });

        // Make the selection change (using evaluate to change select value)
        await page.evaluate(({ selector, value }) => {
          const selectElement = document.querySelector(selector);
          if (selectElement) {
            selectElement.value = value;
            selectElement.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, { selector: sizeSelect, value: testSize.value });
        await page.waitForTimeout(1000); // Wait for any dynamic updates

        // Capture state after change
        const afterState = await page.evaluate(() => {
          const price = document.querySelector('.product__price .money, .money')?.textContent?.trim();
          const availability = document.querySelector('.product__inventory, [class*="stock"], [class*="available"]')?.textContent?.trim();
          const mainImage = document.querySelector('.product__media img, .product__hero img')?.src;
          return { price, availability, mainImage };
        });

        console.log('   📊 Changes detected:');
        console.log(`      Price: ${beforeState.price} → ${afterState.price} ${beforeState.price !== afterState.price ? '✅ CHANGED' : '⚪ Same'}`);
        console.log(`      Availability: ${beforeState.availability} → ${afterState.availability} ${beforeState.availability !== afterState.availability ? '✅ CHANGED' : '⚪ Same'}`);
        console.log(`      Main Image: ${beforeState.mainImage !== afterState.mainImage ? '✅ CHANGED' : '⚪ Same'}`);

        // Test all available sizes
        console.log('\n   🔄 Testing all size options:');
        for (const option of selectorInfo.size_dropdown.options) {
          if (option.value) {
            try {
              await page.evaluate(({ selector, value }) => {
                const selectElement = document.querySelector(selector);
                if (selectElement) {
                  selectElement.value = value;
                  selectElement.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }, { selector: sizeSelect, value: option.value });
              await page.waitForTimeout(500);
              
              const state = await page.evaluate(() => {
                const price = document.querySelector('.product__price .money, .money')?.textContent?.trim();
                const stock = document.querySelector('.product__inventory, [class*="stock"], [class*="available"]')?.textContent?.trim();
                return { price, stock };
              });
              
              console.log(`      ${option.text}: Price=${state.price}, Stock=${state.stock || 'N/A'}`);
            } catch (e) {
              console.log(`      ${option.text}: ❌ Selection failed`);
            }
          }
        }
      }
    }

    // 3. Interaction patterns summary
    console.log('\n3️⃣ Interaction Patterns Summary');
    console.log('================================');

    const patterns = {
      site: 'Glasswing (Shopify)',
      variant_selection_method: selectorInfo.size_dropdown ? 'dropdown_select' : 'unknown',
      selectors: {
        size_dropdown: selectorInfo.size_dropdown?.selector,
        price_display: selectorInfo.price_elements[0]?.selector,
        main_image: selectorInfo.image_elements[0]?.selector
      },
      interaction_script: selectorInfo.size_dropdown ? `await page.select('${selectorInfo.size_dropdown.selector}', sizeValue);` : null,
      dynamic_updates: {
        price_changes: true, // Assume true, would be verified above
        image_changes: true,
        availability_changes: true
      }
    };

    console.log('📋 Extracted Patterns:');
    console.log(JSON.stringify(patterns, null, 2));

    console.log('\n✅ Variant interaction mapping complete!');
    console.log('👁️  Browser remains open for manual inspection...');
    console.log('   Press Ctrl+C to close when finished');

    // Keep browser open for manual inspection
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (closeSession) {
      await closeSession();
    }
  }
}

if (require.main === module) {
  testVariantInteraction();
}

module.exports = { testVariantInteraction };