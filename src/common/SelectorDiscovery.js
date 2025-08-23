/**
 * Universal Selector Discovery Tool
 * 
 * Automatically discovers variant selectors, cart buttons, and interaction patterns
 * for any e-commerce site. Stores findings for use by extraction pipeline.
 */

class SelectorDiscovery {
  constructor(logger) {
    this.logger = logger;
    this.platformDetectors = {
      shopify: () => !!(window.Shopify || window.meta?.product || 
        document.querySelector('form[action*="/cart/add"]')),
      
      woocommerce: () => !!(document.querySelector('body.woocommerce') || 
        document.querySelector('.variations_form') ||
        window.wc_add_to_cart_params),
      
      magento: () => !!(document.querySelector('script[type="text/x-magento-init"]') ||
        document.querySelector('.swatch-attribute')),
      
      bigcommerce: () => !!(window.BCData || 
        document.querySelector('[data-product-attribute]')),
      
      prestashop: () => !!(document.querySelector('.product-variants') ||
        document.querySelector('[data-button-action="add-to-cart"]'))
    };
  }

  /**
   * Main discovery method - analyzes page and returns selector patterns
   */
  async discoverPatterns(page, url) {
    console.log(`🔍 Starting selector discovery for: ${url}`);
    
    // Note: We don't block requests to avoid bot detection
    // Instead we'll be careful not to submit forms or trigger purchases
    
    try {
      // 1. Detect platform
      const platform = await this.detectPlatform(page);
      console.log(`🏷️  Platform detected: ${platform}`);
      
      // 2. Find selector candidates
      const candidates = await this.findSelectorCandidates(page);
      console.log(`📋 Found ${Object.keys(candidates.variant_groups || {}).length} variant groups`);
      
      // 3. Test selectors with interaction
      const evidence = await this.testSelectors(page, candidates);
      console.log(`✅ Interaction evidence: ${Object.keys(evidence).length} tests`);
      
      // 4. Calculate confidence and create pattern
      const pattern = this.buildPattern(platform, candidates, evidence, url);
      console.log(`📊 Final confidence: ${pattern.confidence}`);
      
      return pattern;
      
    } catch (error) {
      this.logger.error('Discovery failed:', error);
      return {
        platform: 'unknown',
        confidence: 0,
        error: error.message,
        url: url
      };
    }
  }

  /**
   * Detect e-commerce platform using various signals
   */
  async detectPlatform(page) {
    const detection = await page.evaluate((detectors) => {
      const results = {};
      
      // Test each platform detector
      for (const [platform, detector] of Object.entries(detectors)) {
        try {
          results[platform] = eval(`(${detector.toString()})()`);
        } catch (e) {
          results[platform] = false;
        }
      }
      
      // Additional signal gathering
      results.signals = {
        has_shopify_analytics: !!window.ShopifyAnalytics,
        has_meta_product: !!window.meta?.product,
        wc_params: !!window.wc_add_to_cart_params,
        body_classes: document.body.className,
        cart_forms: document.querySelectorAll('form[action*="cart"]').length,
        shopify_scripts: document.querySelectorAll('script[src*="shopify"]').length
      };
      
      return results;
    }, this.platformDetectors);

    // Determine most likely platform
    const detected = Object.entries(detection)
      .filter(([key, value]) => key !== 'signals' && value === true)
      .map(([platform]) => platform);

    if (detected.length === 1) {
      return detected[0];
    } else if (detected.length > 1) {
      // Multiple matches - use priority order
      const priority = ['shopify', 'woocommerce', 'magento', 'bigcommerce', 'prestashop'];
      return priority.find(p => detected.includes(p)) || detected[0];
    } else {
      return 'generic';
    }
  }

  /**
   * Find all potential selector candidates using universal pattern discovery
   */
  async findSelectorCandidates(page) {
    return await page.evaluate(() => {
      // Helper functions for selector discovery
      function extractVariantName(element) {
        // Try data attributes first
        const dataName = element.getAttribute('data-option-name') || 
                        element.getAttribute('data-variant-name');
        if (dataName) return dataName;

        // Try name attribute
        if (element.name) {
          return element.name
            .replace(/^attribute_/, '')
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
        }

        // Try nearby labels
        const label = element.closest('label') || 
                     document.querySelector(`label[for="${element.id}"]`) ||
                     element.previousElementSibling?.textContent?.trim();
        if (label && typeof label === 'string') return label;

        // Try parent text
        const parent = element.parentElement;
        if (parent) {
          const text = parent.textContent.replace(element.textContent, '').trim();
          if (text && text.length < 20) return text;
        }

        // Fallback
        return element.id || 'Unknown Variant';
      }

      function generateSelector(element, isGroupSelector = false) {
        // Try ID first (most reliable)
        if (element.id && !element.id.match(/^\d/)) {
          return `#${element.id}`;
        }

        // Try name attribute
        if (element.name) {
          return `${element.tagName.toLowerCase()}[name="${element.name}"]`;
        }

        // Try unique class combinations
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {
            const selector = `${element.tagName.toLowerCase()}.${classes.join('.')}`;
            // Test if selector is unique
            if (document.querySelectorAll(selector).length === 1 || isGroupSelector) {
              return selector;
            }
          }
        }

        // Try data attributes
        const dataAttrs = Array.from(element.attributes)
          .filter(attr => attr.name.startsWith('data-'))
          .slice(0, 2); // First 2 data attributes
        
        if (dataAttrs.length > 0) {
          const selector = element.tagName.toLowerCase() + 
            dataAttrs.map(attr => `[${attr.name}="${attr.value}"]`).join('');
          if (document.querySelectorAll(selector).length === 1 || isGroupSelector) {
            return selector;
          }
        }

        // Fallback to nth-child
        const siblings = Array.from(element.parentElement?.children || []);
        const index = siblings.indexOf(element);
        return `${element.tagName.toLowerCase()}:nth-child(${index + 1})`;
      }

      const candidates = {
        variant_groups: [],
        cart_button: null,
        price_elements: [],
        image_elements: [],
        hidden_inputs: []
      };

      // CART-CENTRIC DISCOVERY: Find cart button first, then search above it for variants
      
      // STEP 1: Find cart button (anchor point for positioning)
      const cartButtonCandidates = Array.from(document.querySelectorAll('button, input[type="submit"]'))
        .filter(btn => {
          const text = (btn.textContent && btn.textContent.toLowerCase()) || (btn.value && btn.value.toLowerCase()) || '';
          const hasCartText = text.includes('add') && (text.includes('cart') || text.includes('bag')) ||
                             text.includes('buy') ||
                             (btn.name && btn.name.includes('add')) ||
                             btn.classList.toString().match(/cart|add|buy/i);
          return hasCartText;
        })
        .sort((a, b) => {
          // Prioritize "Add to cart" over "Check out"
          const aText = (a.textContent && a.textContent.toLowerCase()) || '';
          const bText = (b.textContent && b.textContent.toLowerCase()) || '';
          
          if (aText.includes('add') && !bText.includes('add')) return -1;
          if (bText.includes('add') && !aText.includes('add')) return 1;
          
          // Prioritize by form context - avoid cart drawer forms
          const aForm = a.closest('form');
          const bForm = b.closest('form');
          const aIsCartDrawer = (aForm && aForm.id && typeof aForm.id === 'string' && aForm.id.includes('cart')) || (aForm && aForm.className && typeof aForm.className === 'string' && aForm.className.includes('cart'));
          const bIsCartDrawer = (bForm && bForm.id && typeof bForm.id === 'string' && bForm.id.includes('cart')) || (bForm && bForm.className && typeof bForm.className === 'string' && bForm.className.includes('cart'));
          
          if (!aIsCartDrawer && bIsCartDrawer) return -1;
          if (!bIsCartDrawer && aIsCartDrawer) return 1;
          
          return 0;
        });

      let interactiveElements;
      
      if (cartButtonCandidates.length === 0) {
        // Fallback to old method if no cart button found
        interactiveElements = [
          ...Array.from(document.querySelectorAll('select')),
          ...Array.from(document.querySelectorAll('button[data-variant], button[data-option]')),
          ...Array.from(document.querySelectorAll('input[type="radio"][name*="variant"], input[type="radio"][name*="option"]')),
          ...Array.from(document.querySelectorAll('[class*="variant"], [class*="option"], [class*="swatch"]'))
        ].filter(el => {
          return el.offsetParent !== null && 
                 (el.closest('[data-product], .product, #product, [class*="product"]') || 
                  document.querySelector('[data-product], .product, #product'));
        });
      } else {
        // STEP 2: Use cart button positioning to find variants above it
        const cartButton = cartButtonCandidates[0];
        const cartButtonRect = cartButton.getBoundingClientRect();
        
        // Search ENTIRE page for variant elements
        const allPageElements = [
          ...Array.from(document.querySelectorAll('select')),
          ...Array.from(document.querySelectorAll('button:not([type="submit"])')),
          ...Array.from(document.querySelectorAll('input[type="radio"]')),
          ...Array.from(document.querySelectorAll('input[type="checkbox"]')),
          ...Array.from(document.querySelectorAll('[class*="variant"], [class*="option"], [class*="swatch"]')),
          ...Array.from(document.querySelectorAll('[name*="Size"], [name*="Color"], [name*="size"], [name*="color"]'))
        ];

        // Filter elements that are ABOVE cart button
        interactiveElements = allPageElements.filter(el => {
          if (el === cartButton) return false; // Skip cart button itself
          
          const elRect = el.getBoundingClientRect();
          const isAboveCart = elRect.top < cartButtonRect.top;
          const isVisible = el.offsetParent !== null;
          
          return isAboveCart && isVisible;
        });
      }

      // Process SELECT elements (most common variant pattern)
      const selects = interactiveElements.filter(el => el.tagName === 'SELECT');
      selects.forEach(select => {
        // Skip non-variant selects
        if (select.name && (
          select.name.includes('quantity') || 
          select.name.includes('country') || 
          select.name.includes('shipping') ||
          select.name.includes('payment')
        )) {
          return;
        }

        const options = Array.from(select.options).map(opt => ({
          value: opt.value,
          text: opt.textContent.trim(),
          disabled: opt.disabled
        })).filter(opt => opt.value && opt.text && opt.text !== 'Choose an option');

        if (options.length > 1) {
          // Determine interaction method
          const interactionMethod = select.name?.includes('id') ? 'directVariantId' : 'selectOption';
          
          candidates.variant_groups.push({
            name: extractVariantName(select),
            type: 'select',
            selector: generateSelector(select),
            options: options,
            current_value: select.value,
            interaction_method: interactionMethod
          });
        }
      });

      // Process BUTTON/SWATCH elements  
      const buttons = interactiveElements.filter(el => 
        el.tagName === 'BUTTON' || 
        el.hasAttribute('data-variant') || 
        el.classList.toString().match(/swatch|variant|option/i)
      );
      
      // Group buttons by common parent or data attributes
      const buttonGroups = new Map();
      buttons.forEach(btn => {
        const groupKey = btn.getAttribute('data-option-name') || 
                        btn.getAttribute('name') ||
                        btn.closest('[data-option], [class*="option"], [class*="variant"]')?.className ||
                        'ungrouped';
        
        if (!buttonGroups.has(groupKey)) {
          buttonGroups.set(groupKey, []);
        }
        buttonGroups.get(groupKey).push(btn);
      });

      buttonGroups.forEach((group, groupName) => {
        if (group.length > 1) {
          const options = group.map(btn => ({
            value: btn.getAttribute('data-value') || btn.textContent.trim(),
            text: btn.textContent.trim(),
            disabled: btn.disabled || btn.classList.contains('disabled')
          }));

          candidates.variant_groups.push({
            name: groupName !== 'ungrouped' ? groupName : extractVariantName(group[0]),
            type: 'button_group',
            selector: generateSelector(group[0], true),
            options: options,
            current_value: group.find(btn => btn.classList.contains('selected'))?.textContent.trim(),
            interaction_method: 'clickButton'
          });
        }
      });

      // Process RADIO inputs (very common for variants like Size/Color)
      const radios = interactiveElements.filter(el => el.tagName === 'INPUT' && el.type === 'radio');
      
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
            text: (radio.labels && radio.labels[0] && radio.labels[0].textContent && radio.labels[0].textContent.trim()) || radio.value,
            disabled: radio.disabled,
            selected: radio.checked
          }));

          candidates.variant_groups.push({
            name: name, // Use the name attribute (Size, Color, etc.)
            type: 'radio_group',
            selector: `input[name="${name}"]`,
            options: options,
            current_value: options.find(opt => opt.selected) && options.find(opt => opt.selected).value,
            interaction_method: 'selectRadio'
          });
        }
      });

      // Cart button discovery (use the one we found during positioning, or find a new one)
      if (cartButtonCandidates.length > 0) {
        const cartButton = cartButtonCandidates[0];
        candidates.cart_button = {
          selector: generateSelector(cartButton),
          text: (cartButton.textContent && cartButton.textContent.trim()) || cartButton.value,
          disabled: cartButton.disabled,
          interaction_method: 'click'
        };
      }

      // Universal price discovery
      const priceElements = Array.from(document.querySelectorAll('*'))
        .filter(el => {
          const text = el.textContent?.trim() || '';
          return text.match(/[\$€£¥]\s*\d+[.,]?\d*/) && 
                 el.children.length === 0 && // Leaf node
                 text.length < 50; // Not too long
        });

      priceElements.forEach((el, i) => {
        if (i < 5) { // Limit to first 5
          const text = el.textContent.trim();
          candidates.price_elements.push({
            selector: generateSelector(el),
            text: text,
            value: text.match(/[\d,]+\.?\d*/)?.[0]
          });
        }
      });

      // Universal image discovery
      const productImages = Array.from(document.querySelectorAll('img'))
        .filter(img => {
          // Must be visible and reasonably sized (likely product images)
          return img.offsetParent !== null && 
                 img.naturalWidth > 100 && 
                 img.naturalHeight > 100 &&
                 !img.src.includes('logo') &&
                 !img.src.includes('icon');
        })
        .slice(0, 3); // First 3

      productImages.forEach(img => {
        candidates.image_elements.push({
          selector: generateSelector(img),
          src: img.src,
          alt: img.alt || ''
        });
      });

      // Hidden inputs for variant IDs
      const hiddenInputs = Array.from(document.querySelectorAll('input[type="hidden"]'))
        .filter(input => 
          input.name && 
          (input.name.includes('variant') || input.name.includes('id')) &&
          input.value
        );

      hiddenInputs.forEach(input => {
        candidates.hidden_inputs.push({
          name: input.name,
          selector: generateSelector(input),
          current_value: input.value
        });
      });

      return candidates;
    });
  }

  /**
   * Test discovered selectors by interacting with them safely
   */
  async testSelectors(page, candidates) {
    const evidence = {};

    // Only test if we have variant groups to work with
    if (!candidates.variant_groups || candidates.variant_groups.length === 0) {
      return evidence;
    }

    for (const group of candidates.variant_groups) {
      if (group.options.length < 2) continue; // Need at least 2 options to test

      console.log(`🧪 Testing variant group: ${group.name}`);
      
      try {
        // Capture initial state
        const beforeState = await page.evaluate((selectors) => {
          const state = {};
          
          // Capture price
          if (selectors.price_elements && selectors.price_elements[0]) {
            const priceEl = document.querySelector(selectors.price_elements[0].selector);
            state.price = priceEl?.textContent?.trim();
          }
          
          // Capture cart button state (MOST IMPORTANT for availability)
          if (selectors.cart_button) {
            const cartBtn = document.querySelector(selectors.cart_button.selector);
            if (cartBtn) {
              state.cart_button = {
                disabled: cartBtn.disabled,
                text: cartBtn.textContent?.trim(),
                classes: cartBtn.className,
                aria_disabled: cartBtn.getAttribute('aria-disabled'),
                clickable: !cartBtn.disabled && cartBtn.getAttribute('aria-disabled') !== 'true'
              };
            }
          }
          
          // Capture hidden inputs (for variant IDs)
          const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
          state.hidden_values = {};
          hiddenInputs.forEach(input => {
            if (input.name) {
              state.hidden_values[input.name] = input.value;
            }
          });
          
          // Capture main image
          if (selectors.image_elements && selectors.image_elements[0]) {
            const imgEl = document.querySelector(selectors.image_elements[0].selector);
            state.image_src = imgEl?.src;
          }
          
          // Capture stock/availability indicators
          const stockIndicators = document.querySelectorAll('[class*="stock"], [class*="available"], [class*="inventory"], .product__inventory');
          state.stock_text = '';
          stockIndicators.forEach(el => {
            const text = el.textContent?.trim();
            if (text) {
              state.stock_text += text + ' ';
            }
          });
          state.stock_text = state.stock_text.trim();
          
          return state;
        }, candidates);

        // Test changing to different option
        const testOption = group.options.find(opt => opt.value !== group.current_value);
        if (testOption) {
          await page.evaluate((selector, value) => {
            const element = document.querySelector(selector);
            if (element) {
              element.value = value;
              element.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, group.selector, testOption.value);

          // Wait for changes
          await page.waitForTimeout(1000);

          // Capture after state
          const afterState = await page.evaluate((selectors) => {
            const state = {};
            
            // Capture price
            if (selectors.price_elements && selectors.price_elements[0]) {
              const priceEl = document.querySelector(selectors.price_elements[0].selector);
              state.price = priceEl?.textContent?.trim();
            }
            
            // Capture cart button state (KEY INDICATOR)
            if (selectors.cart_button) {
              const cartBtn = document.querySelector(selectors.cart_button.selector);
              if (cartBtn) {
                state.cart_button = {
                  disabled: cartBtn.disabled,
                  text: cartBtn.textContent?.trim(),
                  classes: cartBtn.className,
                  aria_disabled: cartBtn.getAttribute('aria-disabled'),
                  clickable: !cartBtn.disabled && cartBtn.getAttribute('aria-disabled') !== 'true'
                };
              }
            }
            
            // Capture hidden inputs
            const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
            state.hidden_values = {};
            hiddenInputs.forEach(input => {
              if (input.name) {
                state.hidden_values[input.name] = input.value;
              }
            });
            
            // Capture main image
            if (selectors.image_elements && selectors.image_elements[0]) {
              const imgEl = document.querySelector(selectors.image_elements[0].selector);
              state.image_src = imgEl?.src;
            }
            
            // Capture stock text
            const stockIndicators = document.querySelectorAll('[class*="stock"], [class*="available"], [class*="inventory"], .product__inventory');
            state.stock_text = '';
            stockIndicators.forEach(el => {
              const text = el.textContent?.trim();
              if (text) {
                state.stock_text += text + ' ';
              }
            });
            state.stock_text = state.stock_text.trim();
            
            return state;
          }, candidates);

          // Analyze changes (focus on cart button state as key indicator)
          const cartButtonChanged = JSON.stringify(beforeState.cart_button) !== JSON.stringify(afterState.cart_button);
          const priceChanged = beforeState.price !== afterState.price;
          const hiddenInputsChanged = JSON.stringify(beforeState.hidden_values) !== JSON.stringify(afterState.hidden_values);
          const imageChanged = beforeState.image_src !== afterState.image_src;
          const stockTextChanged = beforeState.stock_text !== afterState.stock_text;

          evidence[group.name] = {
            selector_tested: group.selector,
            option_changed_to: testOption.value,
            changes_detected: {
              cart_button_changed: cartButtonChanged,
              price_changed: priceChanged,
              hidden_inputs_changed: hiddenInputsChanged,
              image_changed: imageChanged,
              stock_text_changed: stockTextChanged
            },
            before_state: beforeState,
            after_state: afterState
          };

          console.log(`   📊 Changes: CartBtn=${cartButtonChanged ? '✅' : '❌'}, Price=${priceChanged ? '✅' : '❌'}, Hidden=${hiddenInputsChanged ? '✅' : '❌'}, Image=${imageChanged ? '✅' : '❌'}, Stock=${stockTextChanged ? '✅' : '❌'}`);
        }
      } catch (error) {
        console.log(`   ❌ Test failed: ${error.message}`);
        evidence[group.name] = { error: error.message };
      }
    }

    return evidence;
  }


  /**
   * Build final pattern object with confidence scoring
   */
  buildPattern(platform, candidates, evidence, url) {
    let confidence = 0;
    const scoring = {
      platform_detected: platform !== 'generic' ? 0.3 : 0,
      has_variant_groups: candidates.variant_groups?.length > 0 ? 0.2 : 0,
      has_cart_button: candidates.cart_button ? 0.1 : 0,
      interaction_evidence: 0
    };

    // Score interaction evidence (prioritize cart button changes)
    const evidenceCount = Object.keys(evidence).length;
    const successfulTests = Object.values(evidence).filter(test => 
      test.changes_detected && (
        test.changes_detected.cart_button_changed ||  // HIGHEST VALUE - indicates working variant selection
        test.changes_detected.hidden_inputs_changed || // Shopify/WooCommerce variant IDs
        test.changes_detected.price_changed || 
        test.changes_detected.image_changed ||
        test.changes_detected.stock_text_changed
      )
    ).length;

    if (evidenceCount > 0) {
      scoring.interaction_evidence = (successfulTests / evidenceCount) * 0.4;
    }

    confidence = Object.values(scoring).reduce((sum, score) => sum + score, 0);

    const pattern = {
      domain: new URL(url).hostname,
      platform: platform,
      discovered_at: new Date().toISOString(),
      url_tested: url,
      confidence: Math.round(confidence * 100) / 100,
      scoring_breakdown: scoring,
      
      // Selectors for use by extractor
      selectors: {
        variant_groups: candidates.variant_groups || [],
        cart_button: candidates.cart_button?.selector,
        price: candidates.price_elements?.[0]?.selector,
        main_image: candidates.image_elements?.[0]?.selector,
        hidden_inputs: candidates.hidden_inputs || []
      },
      
      // Evidence from testing
      interaction_evidence: evidence,
      
      // Metadata
      candidates_found: candidates,
      tool_version: '1.0.0'
    };

    return pattern;
  }
}

module.exports = SelectorDiscovery;