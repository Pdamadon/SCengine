/**
 * Toast Tab extraction test endpoint for Railway deployment
 * Tests extraction from cloud environment to bypass local detection
 */

const express = require('express');
const router = express.Router();
const ProxyBrowserManagerResidential = require('../common/browser/managers/proxy/ResidentialProxyBrowserManager');
const ToastExtractor = require('../extractors/ToastExtractor');
const { logger } = require('../utils/logger');

/**
 * GET /api/test/toast
 * Test Toast extraction from Railway infrastructure
 */
router.get('/toast', async (req, res) => {
  logger.info('🚂 Starting Toast extraction test from Railway');
  
  // Test URL (can be passed as query param)
  const testUrl = req.query.url || "https://www.toasttab.com/local/order/biang-biang-noodles-601-e-pike-st";
  
  const startTime = Date.now();
  let manager;
  
  try {
    // Create browser with residential proxy
    manager = new ProxyBrowserManagerResidential({
      retryOnBlock: true,
      maxRetries: 2
    });
    
    logger.info('Creating browser with residential proxy...');
    const browser = await manager.createBrowserWithRetry('stealth', {
      skipIPCheck: true,
      headless: true  // Use headless in production
    });
    
    // Extract menu
    const extractor = new ToastExtractor();
    logger.info(`Extracting from: ${testUrl}`);
    
    const menuData = await extractor.extract(browser.page, testUrl);
    
    const duration = Date.now() - startTime;
    
    // Prepare response
    const response = {
      success: menuData.status === 'success',
      duration: duration,
      url: testUrl,
      environment: {
        platform: process.platform,
        nodeVersion: process.version,
        isRailway: !!process.env.RAILWAY_ENVIRONMENT,
        region: process.env.RAILWAY_REGION || 'unknown'
      },
      extraction: menuData
    };
    
    if (menuData.status === 'success') {
      logger.info(`✅ Successfully extracted ${menuData.itemCount} items in ${duration}ms`);
      
      // Add summary stats
      response.summary = {
        totalItems: menuData.itemCount,
        categories: [...new Set(menuData.items.map(i => i.category))].length,
        itemsWithModifiers: menuData.items.filter(i => i.modifiers && i.modifiers.length > 0).length,
        priceRange: calculatePriceRange(menuData.items)
      };
    } else {
      logger.warn(`⚠️ Extraction not successful: ${menuData.status}`);
    }
    
    res.json(response);
    
  } catch (error) {
    logger.error('Toast extraction failed:', error);
    
    const errorResponse = {
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
      url: testUrl,
      environment: {
        platform: process.platform,
        nodeVersion: process.version,
        isRailway: !!process.env.RAILWAY_ENVIRONMENT
      }
    };
    
    // Check for specific error types
    if (error.message.includes('challenge') || error.message.includes('403')) {
      errorResponse.blockedBy = 'Cloudflare';
      errorResponse.suggestion = 'Try different proxy or wait before retrying';
    }
    
    res.status(500).json(errorResponse);
    
  } finally {
    // Clean up
    if (manager) {
      await manager.closeAll();
    }
  }
});

/**
 * GET /api/test/toast/simple
 * Simple connectivity test without extraction
 */
router.get('/toast/simple', async (req, res) => {
  const testUrl = req.query.url || "https://www.toasttab.com";
  let manager;
  
  try {
    manager = new ProxyBrowserManagerResidential({
      retryOnBlock: false,
      maxRetries: 1
    });
    
    const browser = await manager.createBrowserWithRetry('stealth', {
      skipIPCheck: true,
      headless: true
    });
    
    const response = await browser.page.goto(testUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    const status = response.status();
    const headers = response.headers();
    
    res.json({
      success: status === 200,
      status: status,
      url: testUrl,
      cloudflareDetected: headers['cf-ray'] ? true : false,
      headers: {
        server: headers['server'],
        cfRay: headers['cf-ray'],
        cfMitigated: headers['cf-mitigated']
      },
      environment: {
        isRailway: !!process.env.RAILWAY_ENVIRONMENT,
        region: process.env.RAILWAY_REGION || 'unknown'
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      url: testUrl
    });
  } finally {
    if (manager) {
      await manager.closeAll();
    }
  }
});

function calculatePriceRange(items) {
  const prices = items
    .map(item => {
      const priceStr = item.basePrice?.replace('$', '').replace(',', '');
      return parseFloat(priceStr) || 0;
    })
    .filter(p => p > 0);
  
  if (prices.length === 0) return null;
  
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)
  };
}

module.exports = router;