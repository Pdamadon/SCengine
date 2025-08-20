/**
 * RedundantNavigationExtractor - 95% accuracy navigation extraction without AI
 * 
 * Uses redundant pattern fallbacks: Try multiple patterns until one works
 * Based on successful Test 4 approach from glasswingshop.com
 */

const { extractUsingPattern } = require('./NavigationPatternExtractor');
const { getPatternsForSite } = require('./NavigationPatterns');
const { logger } = require('../../utils/logger');

/**
 * Extract navigation using redundant pattern fallbacks
 * Tries multiple patterns until one succeeds - 95% accuracy target
 * 
 * @param {Object} page - Playwright page instance
 * @param {string} url - Target site URL
 * @param {Object} options - Configuration options
 * @returns {Object} Extraction results with pattern used
 */
async function extractNavigationWithFallbacks(page, url, options = {}) {
  const startTime = Date.now();
  logger.info(`🎯 Starting redundant navigation extraction for: ${url}`);
  
  const {
    maxPatterns = 5,           // Maximum patterns to try
    minSuccessRate = 0.7,      // Minimum success rate to accept
    minNavigationItems = 3     // Minimum nav items to consider success
  } = options;

  try {
    // Get patterns to try for this site (ordered by likelihood)
    const patterns = getPatternsForSite(url).slice(0, maxPatterns);
    logger.info(`📋 Will try ${patterns.length} patterns: ${patterns.map(p => p.name).join(', ')}`);

    let bestResult = null;
    let bestPattern = null;
    let attemptCount = 0;

    // Try each pattern until we get good results
    for (const pattern of patterns) {
      attemptCount++;
      logger.info(`🎯 Attempt ${attemptCount}/${patterns.length}: Trying pattern "${pattern.name}"`);

      try {
        const result = await extractUsingPattern(page, pattern);
        
        if (result.success) {
          const navItems = result.summary.totalNavigationItems;
          const successRate = result.dropdownExtraction.successRate;
          
          logger.info(`✅ Pattern "${pattern.name}" results: ${navItems} items, ${Math.round(successRate * 100)}% success rate`);

          // Check if this result meets our criteria
          if (navItems >= minNavigationItems && successRate >= minSuccessRate) {
            logger.info(`🎯 SUCCESS: Pattern "${pattern.name}" meets criteria (${navItems} items, ${Math.round(successRate * 100)}% success)`);
            
            return {
              success: true,
              patternUsed: pattern.name,
              attemptCount,
              executionTime: Date.now() - startTime,
              result: result,
              fallbacksNeeded: attemptCount - 1
            };
          }

          // Track best result in case none meet criteria
          if (!bestResult || result.summary.totalNavigationItems > bestResult.summary.totalNavigationItems) {
            bestResult = result;
            bestPattern = pattern.name;
          }
        } else {
          logger.warn(`❌ Pattern "${pattern.name}" failed: ${result.error}`);
        }

      } catch (error) {
        logger.error(`💥 Pattern "${pattern.name}" threw error: ${error.message}`);
        continue;
      }

      // Small delay between attempts to avoid overwhelming the site
      if (attemptCount < patterns.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // If no pattern met criteria, return best result found
    if (bestResult) {
      logger.info(`⚠️ No pattern met criteria, returning best result: ${bestPattern} (${bestResult.summary.totalNavigationItems} items)`);
      
      return {
        success: true,
        patternUsed: bestPattern,
        attemptCount,
        executionTime: Date.now() - startTime,
        result: bestResult,
        fallbacksNeeded: attemptCount - 1,
        warning: 'Results below preferred criteria but best available'
      };
    }

    // Complete failure - no pattern worked
    logger.error(`❌ All ${attemptCount} patterns failed for ${url}`);
    return {
      success: false,
      patternUsed: null,
      attemptCount,
      executionTime: Date.now() - startTime,
      error: `All ${attemptCount} navigation patterns failed`,
      fallbacksNeeded: attemptCount
    };

  } catch (error) {
    logger.error(`💥 Redundant extraction failed: ${error.message}`);
    return {
      success: false,
      patternUsed: null,
      attemptCount: 0,
      executionTime: Date.now() - startTime,
      error: error.message,
      fallbacksNeeded: 0
    };
  }
}

/**
 * Quick navigation discovery - try just the top 2 most likely patterns
 * For sites where we want fast results over exhaustive coverage
 */
async function quickNavigationExtract(page, url) {
  return await extractNavigationWithFallbacks(page, url, {
    maxPatterns: 2,
    minSuccessRate: 0.5,
    minNavigationItems: 1
  });
}

/**
 * Comprehensive navigation discovery - try all available patterns
 * For sites where we want maximum coverage and don't mind longer execution time
 */
async function comprehensiveNavigationExtract(page, url) {
  return await extractNavigationWithFallbacks(page, url, {
    maxPatterns: 8,
    minSuccessRate: 0.8,
    minNavigationItems: 5
  });
}

/**
 * Get extraction statistics for analysis/debugging
 */
function getExtractionStats(results) {
  if (!results.success) {
    return {
      success: false,
      stats: null
    };
  }

  const result = results.result;
  return {
    success: true,
    stats: {
      patternUsed: results.patternUsed,
      totalItems: result.summary.totalNavigationItems,
      mainNavItems: result.summary.mainNavItems,
      dropdownItems: result.summary.dropdownItems,
      successRate: Math.round(result.dropdownExtraction.successRate * 100),
      extractionMethods: result.summary.extractionMethods,
      executionTime: results.executionTime,
      fallbacksNeeded: results.fallbacksNeeded,
      efficiency: results.fallbacksNeeded === 0 ? 'Perfect (first pattern)' : 
                  results.fallbacksNeeded <= 2 ? 'Good (minimal fallbacks)' : 'Poor (many fallbacks needed)'
    }
  };
}

module.exports = {
  extractNavigationWithFallbacks,
  quickNavigationExtract,
  comprehensiveNavigationExtract,
  getExtractionStats
};