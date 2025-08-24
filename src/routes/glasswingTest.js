/**
 * Glasswing extraction test endpoint for Railway deployment
 * Tests extraction from cloud environment
 */

const express = require('express');
const router = express.Router();
const BrowserManagerBrowserless = require('../common/browser/managers/BrowserManagerBrowserless');
const ProductCatalogStrategy = require('../core/collection/strategies/ProductCatalogStrategy');
const { logger } = require('../utils/logger');

/**
 * GET /api/test/glasswing
 * Test Glasswing extraction from Railway infrastructure
 */
router.get('/glasswing', async (req, res) => {
  logger.info('🚂 Starting Glasswing extraction test from Railway');
  
  // Test URL (can be passed as query param)
  const testUrl = req.query.url || "https://glasswingshop.com/collections/clothing-collection";
  
  const startTime = Date.now();
  let browserManager;
  let browserSession;
  
  try {
    // Create browser manager and product catalog strategy directly (no Redis deps)
    browserManager = new BrowserManagerBrowserless();
    const productCatalogStrategy = new ProductCatalogStrategy(logger);
    
    logger.info('Creating browser with stealth profile...');
    browserSession = await browserManager.createBrowser('stealth', {
      headless: true
    });
    
    const { page } = browserSession;
    
    try {
      logger.info(`Navigating to: ${testUrl}`);
      await page.goto(testUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      
      // Use ProductCatalogStrategy to collect products
      const result = await productCatalogStrategy.execute(page);
      
      const duration = Date.now() - startTime;
      
      // Prepare response
      const response = {
        success: true,
        duration: duration,
        url: testUrl,
        environment: {
          platform: process.platform,
          nodeVersion: process.version,
          isRailway: !!process.env.RAILWAY_ENVIRONMENT
        },
        result: {
          productsFound: result.items?.length || 0,
          confidence: result.confidence,
          platform: result.metadata?.platform,
          products: result.items?.slice(0, 5) // First 5 products for preview
        }
      };
      
      logger.info('✅ Glasswing test completed', {
        productsFound: response.result.productsFound,
        duration: `${duration}ms`
      });
      
      res.json(response);
      
    } finally {
      if (browserSession && browserSession.close) {
        await browserSession.close();
      }
    }
    
  } catch (error) {
    logger.error('❌ Glasswing test failed:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
      url: testUrl,
      environment: {
        platform: process.platform,
        nodeVersion: process.version,
        isRailway: !!process.env.RAILWAY_ENVIRONMENT
      }
    });
    
  } finally {
    if (browserManager) {
      await browserManager.closeAll();
    }
  }
});

module.exports = router;