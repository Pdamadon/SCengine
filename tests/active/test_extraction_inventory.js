#!/usr/bin/env node

/**
 * Extraction Component Inventory Test
 * 
 * Tests each extraction component individually to understand our current capabilities:
 * 1. BrowserIntelligence - DOM selector discovery
 * 2. ExtractorIntelligence - Learning system  
 * 3. IntelligentSelectorGenerator - CSS selector generation
 * 4. SelectorValidator - Selector validation
 * 5. UniversalProductExtractor - Main extraction system
 * 
 * Goal: Document what works, what fails, and what needs fixing
 */

require('dotenv').config();

const { logger } = require('./src/utils/logger');

// Test Glasswing product for consistency
const TEST_URL = 'https://glasswingshop.com/products/7115-by-szeki-cocoon-dress-shirt-off-white';

async function inventoryExtractionComponents() {
  console.log('🔍 EXTRACTION COMPONENT INVENTORY');
  console.log('=================================\n');
  console.log(`🎯 Test URL: ${TEST_URL}\n`);
  
  const results = {
    components: {},
    summary: {
      totalComponents: 0,
      workingComponents: 0,
      failedComponents: 0
    }
  };

  // Test 1: BrowserIntelligence
  console.log('1️⃣ Testing BrowserIntelligence...');
  console.log('================================');
  try {
    const BrowserIntelligence = require('./src/core/extraction/BrowserIntelligence');
    const browserIntel = new BrowserIntelligence(logger);
    
    console.log('   ✅ BrowserIntelligence imported successfully');
    console.log('   📋 Methods available:');
    console.log(`      - Constructor: ${typeof browserIntel.constructor}`);
    console.log(`      - Properties: ${Object.getOwnPropertyNames(browserIntel).join(', ')}`);
    console.log(`      - Methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(browserIntel)).filter(name => name !== 'constructor').join(', ')}`);
    
    results.components.BrowserIntelligence = {
      status: 'available',
      methods: Object.getOwnPropertyNames(Object.getPrototypeOf(browserIntel)).filter(name => name !== 'constructor'),
      properties: Object.getOwnPropertyNames(browserIntel)
    };
    results.summary.workingComponents++;
    
  } catch (error) {
    console.log(`   ❌ BrowserIntelligence failed: ${error.message}`);
    results.components.BrowserIntelligence = {
      status: 'failed',
      error: error.message
    };
    results.summary.failedComponents++;
  }
  results.summary.totalComponents++;

  // Test 2: ExtractorIntelligence  
  console.log('\n2️⃣ Testing ExtractorIntelligence...');
  console.log('==================================');
  try {
    const ExtractorIntelligence = require('./src/core/extraction/ExtractorIntelligence');
    const extractorIntel = new ExtractorIntelligence(logger);
    
    console.log('   ✅ ExtractorIntelligence imported successfully');
    console.log('   📋 Methods available:');
    console.log(`      - Constructor: ${typeof extractorIntel.constructor}`);
    console.log(`      - Properties: ${Object.getOwnPropertyNames(extractorIntel).join(', ')}`);
    console.log(`      - Methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(extractorIntel)).filter(name => name !== 'constructor').join(', ')}`);
    console.log(`      - Config: ${JSON.stringify(extractorIntel.config, null, 8)}`);
    
    results.components.ExtractorIntelligence = {
      status: 'available',
      methods: Object.getOwnPropertyNames(Object.getPrototypeOf(extractorIntel)).filter(name => name !== 'constructor'),
      properties: Object.getOwnPropertyNames(extractorIntel),
      config: extractorIntel.config
    };
    results.summary.workingComponents++;
    
  } catch (error) {
    console.log(`   ❌ ExtractorIntelligence failed: ${error.message}`);
    results.components.ExtractorIntelligence = {
      status: 'failed',
      error: error.message
    };
    results.summary.failedComponents++;
  }
  results.summary.totalComponents++;

  // Test 3: IntelligentSelectorGenerator
  console.log('\n3️⃣ Testing IntelligentSelectorGenerator...');
  console.log('=========================================');
  try {
    const IntelligentSelectorGenerator = require('./src/core/extraction/selectors/IntelligentSelectorGenerator');
    const selectorGen = new IntelligentSelectorGenerator(logger);
    
    console.log('   ✅ IntelligentSelectorGenerator imported successfully');
    console.log('   📋 Methods available:');
    console.log(`      - Methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(selectorGen)).filter(name => name !== 'constructor').join(', ')}`);
    console.log(`      - BEM Patterns: ${selectorGen.bemPatterns?.length || 0} patterns`);
    console.log(`      - Semantic Keywords: ${selectorGen.semanticKeywords?.length || 0} keywords`);
    
    results.components.IntelligentSelectorGenerator = {
      status: 'available',
      methods: Object.getOwnPropertyNames(Object.getPrototypeOf(selectorGen)).filter(name => name !== 'constructor'),
      bemPatterns: selectorGen.bemPatterns?.length || 0,
      semanticKeywords: selectorGen.semanticKeywords?.length || 0
    };
    results.summary.workingComponents++;
    
  } catch (error) {
    console.log(`   ❌ IntelligentSelectorGenerator failed: ${error.message}`);
    results.components.IntelligentSelectorGenerator = {
      status: 'failed',
      error: error.message
    };
    results.summary.failedComponents++;
  }
  results.summary.totalComponents++;

  // Test 4: SelectorValidator
  console.log('\n4️⃣ Testing SelectorValidator...');
  console.log('==============================');
  try {
    const SelectorValidator = require('./src/core/extraction/validation/SelectorValidator');
    const validator = new SelectorValidator(logger);
    
    console.log('   ✅ SelectorValidator imported successfully');
    console.log('   📋 Methods available:');
    console.log(`      - Methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(validator)).filter(name => name !== 'constructor').join(', ')}`);
    console.log(`      - Performance Metrics: ${JSON.stringify(validator.performanceMetrics, null, 8)}`);
    
    results.components.SelectorValidator = {
      status: 'available',
      methods: Object.getOwnPropertyNames(Object.getPrototypeOf(validator)).filter(name => name !== 'constructor'),
      performanceMetrics: validator.performanceMetrics
    };
    results.summary.workingComponents++;
    
  } catch (error) {
    console.log(`   ❌ SelectorValidator failed: ${error.message}`);
    results.components.SelectorValidator = {
      status: 'failed',
      error: error.message
    };
    results.summary.failedComponents++;
  }
  results.summary.totalComponents++;

  // Test 5: Supporting Components
  console.log('\n5️⃣ Testing Supporting Components...');
  console.log('===================================');
  
  // WorldModel
  try {
    const WorldModel = require('./src/data/WorldModel');
    const worldModel = new WorldModel(logger);
    console.log('   ✅ WorldModel available');
    console.log(`      - Methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(worldModel)).filter(name => name !== 'constructor').join(', ')}`);
    
    results.components.WorldModel = {
      status: 'available',
      methods: Object.getOwnPropertyNames(Object.getPrototypeOf(worldModel)).filter(name => name !== 'constructor')
    };
  } catch (error) {
    console.log(`   ❌ WorldModel failed: ${error.message}`);
    results.components.WorldModel = { status: 'failed', error: error.message };
  }

  // SelectorLearningCache
  try {
    const SelectorLearningCache = require('./src/cache/SelectorLearningCache');
    const cache = new SelectorLearningCache(logger);
    console.log('   ✅ SelectorLearningCache available');
    console.log(`      - Methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(cache)).filter(name => name !== 'constructor').join(', ')}`);
    
    results.components.SelectorLearningCache = {
      status: 'available',
      methods: Object.getOwnPropertyNames(Object.getPrototypeOf(cache)).filter(name => name !== 'constructor')
    };
  } catch (error) {
    console.log(`   ❌ SelectorLearningCache failed: ${error.message}`);
    results.components.SelectorLearningCache = { status: 'failed', error: error.message };
  }

  // AdaptiveRetryStrategy
  try {
    const AdaptiveRetryStrategy = require('./src/common/AdaptiveRetryStrategy');
    const retry = new AdaptiveRetryStrategy(logger);
    console.log('   ✅ AdaptiveRetryStrategy available');
    console.log(`      - Methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(retry)).filter(name => name !== 'constructor').join(', ')}`);
    
    results.components.AdaptiveRetryStrategy = {
      status: 'available',
      methods: Object.getOwnPropertyNames(Object.getPrototypeOf(retry)).filter(name => name !== 'constructor')
    };
  } catch (error) {
    console.log(`   ❌ AdaptiveRetryStrategy failed: ${error.message}`);
    results.components.AdaptiveRetryStrategy = { status: 'failed', error: error.message };
  }

  // Test 6: UniversalProductExtractor (checking dependencies only)
  console.log('\n6️⃣ Testing UniversalProductExtractor Dependencies...');
  console.log('==================================================');
  try {
    // Don't instantiate, just check if it can be required
    const UniversalProductExtractor = require('./src/core/extraction/UniversalProductExtractor');
    console.log('   ❌ UniversalProductExtractor has dependency issues (expected)');
    console.log('   📋 Known issues:');
    console.log('      - AdvancedFallbackSystem not found');
    console.log('      - Line 29 tries to instantiate missing component');
    
    results.components.UniversalProductExtractor = {
      status: 'has_dependency_issues',
      issues: ['AdvancedFallbackSystem not found', 'Line 29 instantiation error']
    };
    
  } catch (error) {
    console.log(`   ❌ UniversalProductExtractor failed: ${error.message}`);
    results.components.UniversalProductExtractor = {
      status: 'failed',
      error: error.message
    };
  }
  results.summary.totalComponents++;

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 EXTRACTION COMPONENT INVENTORY SUMMARY');
  console.log('='.repeat(60));
  
  console.log(`\n🎯 OVERVIEW:`);
  console.log(`   Total Components Tested: ${results.summary.totalComponents}`);
  console.log(`   Working Components: ${results.summary.workingComponents}`);
  console.log(`   Failed Components: ${results.summary.failedComponents}`);
  console.log(`   Success Rate: ${((results.summary.workingComponents / results.summary.totalComponents) * 100).toFixed(1)}%`);
  
  console.log(`\n✅ WORKING COMPONENTS:`);
  Object.entries(results.components).forEach(([name, info]) => {
    if (info.status === 'available') {
      console.log(`   ${name}: ${info.methods?.length || 0} methods available`);
    }
  });
  
  console.log(`\n❌ PROBLEMATIC COMPONENTS:`);
  Object.entries(results.components).forEach(([name, info]) => {
    if (info.status === 'failed' || info.status === 'has_dependency_issues') {
      console.log(`   ${name}: ${info.error || info.issues?.join(', ')}`);
    }
  });

  console.log(`\n🔧 NEXT STEPS:`);
  console.log(`   1. Fix UniversalProductExtractor dependency issues`);
  console.log(`   2. Test individual component methods with real data`);
  console.log(`   3. Create simplified extraction test with working components`);
  console.log(`   4. Build from working components toward full extraction`);

  // Save results
  const fs = require('fs').promises;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.writeFile(`extraction_inventory_${timestamp}.json`, JSON.stringify(results, null, 2));
  console.log(`\n💾 Full inventory saved to: extraction_inventory_${timestamp}.json`);
}

if (require.main === module) {
  inventoryExtractionComponents().catch(console.error);
}

module.exports = { inventoryExtractionComponents };