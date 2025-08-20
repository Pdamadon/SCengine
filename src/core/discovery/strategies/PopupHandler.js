/**
 * PopupHandler.js
 *
 * Handles popups, modals, and overlays that block navigation discovery
 * Closes common popup patterns to allow interaction with the main navigation
 */

class PopupHandler {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Detect and close popups/modals on the page
   */
  async closePopups(page) {
    try {
      this.logger.debug('Checking for popups/modals to close...');

      // Common popup close selectors
      const closeSelectors = [
        // Generic close buttons
        '[aria-label*="close"]',
        '[aria-label*="Close"]',
        '[aria-label*="dismiss"]',
        'button[class*="close"]',
        'button[class*="Close"]',
        'button[class*="dismiss"]',
        'button[class*="modal-close"]',
        '.close-button',
        '.modal-close',
        '.popup-close',

        // X buttons
        'button:has-text("×")',
        'button:has-text("X")',
        'button:has-text("✕")',
        '[role="button"]:has-text("×")',

        // Specific patterns
        '[data-testid*="close"]',
        '[data-testid*="dismiss"]',
        '[data-test*="close"]',
        '[data-automation*="close"]',

        // Modal overlays that can be clicked
        '.modal-overlay',
        '.popup-overlay',
        '[data-testid="isolationLayer"]',
        '.isolation-layer',

        // Common e-commerce popups
        '.email-signup-close',
        '.newsletter-close',
        '.promo-close',
        '#closeIconContainer',
        '.bx-close',
        '.fancybox-close',
      ];

      let popupsClosed = 0;

      // Try each selector
      for (const selector of closeSelectors) {
        try {
          // Check if element exists and is visible
          const element = await page.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              this.logger.debug(`Found popup close button: ${selector}`);

              // Try to click it
              try {
                await element.click({ timeout: 2000 });
                popupsClosed++;
                this.logger.info(`Closed popup using: ${selector}`);

                // Wait a bit for animation
                await page.waitForTimeout(500);

                // Check if we successfully closed it
                const stillVisible = await element.isVisible().catch(() => false);
                if (!stillVisible) {
                  this.logger.debug('Popup successfully closed');
                }
              } catch (clickError) {
                this.logger.debug(`Could not click ${selector}: ${clickError.message}`);
              }
            }
          }
        } catch (error) {
          // Element not found or error, continue
        }
      }

      // Also try pressing Escape key
      try {
        await page.keyboard.press('Escape');
        this.logger.debug('Pressed Escape key to close any popups');
        await page.waitForTimeout(300);
      } catch (error) {
        // Ignore escape key errors
      }

      // Check for and handle cookie banners
      await this.handleCookieBanners(page);

      // Check for iframe-based popups
      await this.handleIframePopups(page);

      if (popupsClosed > 0) {
        this.logger.info(`Closed ${popupsClosed} popup(s)`);
      } else {
        this.logger.debug('No popups found to close');
      }

      return popupsClosed;

    } catch (error) {
      this.logger.error(`Error handling popups: ${error.message}`);
      return 0;
    }
  }

  /**
   * Handle cookie consent banners
   */
  async handleCookieBanners(page) {
    try {
      const cookieSelectors = [
        '[id*="cookie"] button[class*="accept"]',
        '[class*="cookie"] button[class*="accept"]',
        'button:has-text("Accept")',
        'button:has-text("Accept all")',
        'button:has-text("Accept cookies")',
        '[aria-label*="accept cookies"]',
        '#onetrust-accept-btn-handler',
        '.cookie-accept',
        '.accept-cookies',
      ];

      for (const selector of cookieSelectors) {
        try {
          const element = await page.$(selector);
          if (element && await element.isVisible()) {
            await element.click({ timeout: 1000 });
            this.logger.debug('Accepted cookie banner');
            await page.waitForTimeout(300);
            break;
          }
        } catch (error) {
          // Continue trying other selectors
        }
      }
    } catch (error) {
      // Ignore cookie banner errors
    }
  }

  /**
   * Handle popups in iframes
   */
  async handleIframePopups(page) {
    try {
      const frames = page.frames();
      for (const frame of frames) {
        if (frame === page.mainFrame()) {continue;}

        try {
          // Look for close buttons in iframes
          const closeButton = await frame.$('[aria-label*="close"], .close-button, button.close');
          if (closeButton && await closeButton.isVisible()) {
            await closeButton.click({ timeout: 1000 });
            this.logger.debug('Closed popup in iframe');
            await page.waitForTimeout(300);
          }
        } catch (error) {
          // Continue with other frames
        }
      }
    } catch (error) {
      // Ignore iframe errors
    }
  }

  /**
   * Wait for page to be interactive (no blocking overlays)
   */
  async waitForPageReady(page) {
    try {
      // Wait for common loading indicators to disappear
      const loadingSelectors = [
        '.loading',
        '.spinner',
        '[class*="loading"]',
        '[class*="spinner"]',
        '.loader',
        '.preloader',
      ];

      for (const selector of loadingSelectors) {
        try {
          await page.waitForSelector(selector, { state: 'hidden', timeout: 5000 });
        } catch (error) {
          // Loading indicator not found or already hidden
        }
      }

      // Check if main navigation is accessible
      const navSelectors = ['nav', '[role="navigation"]', '.navigation', '.main-nav'];
      for (const selector of navSelectors) {
        try {
          const nav = await page.$(selector);
          if (nav) {
            await nav.waitForElementState('stable', { timeout: 2000 });
            break;
          }
        } catch (error) {
          // Continue with other selectors
        }
      }

      this.logger.debug('Page is ready for interaction');
      return true;

    } catch (error) {
      this.logger.error(`Error waiting for page ready: ${error.message}`);
      return false;
    }
  }
}

module.exports = PopupHandler;
