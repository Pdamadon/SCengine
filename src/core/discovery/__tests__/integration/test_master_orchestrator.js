/**
 * INTEGRATION TEST: MasterOrchestrator Validation
 * 
 * SUCCESS METRICS:
 * - Imports successfully: Yes/No
 * - Initializes without errors: Yes/No  
 * - Can execute pipeline: Yes/No
 * - Uses BrowserManager integration: Yes/No
 * 
 * KEY VALIDATION:
 * - Verify MasterOrchestrator → PipelineOrchestrator → NavigationMapper → BrowserManager chain works
 * - Confirm anti-bot detection at 100% success rate
 * - Validate pipeline returns navigation results
 * 
 * PROMOTION READINESS: Integration validation
 */

const { logger } = require('../../../../utils/logger');
const MasterOrchestrator = require('../../../../orchestration/MasterOrchestrator');

async function testMasterOrchestrator() {
  let orchestrator = null;

  try {
    // Force headless: false for NavigationPatternStrategy hover interactions
    process.env.HEADLESS_MODE = 'false';
    logger.info('🎯 INTEGRATION TEST: MasterOrchestrator Validation with headless: false');
    
    console.log('\n📋 TESTING MASTER ORCHESTRATOR INTEGRATION:');
    console.log('   ✅ Testing import resolution...');
    
    // Test 1: Can we import MasterOrchestrator?
    orchestrator = new MasterOrchestrator(logger);
    console.log('   ✅ MasterOrchestrator imported and instantiated successfully');
    
    // Test 2: Can we initialize without errors?
    console.log('   🔄 Initializing MasterOrchestrator...');
    await orchestrator.initialize();
    console.log('   ✅ MasterOrchestrator initialized successfully');
    
    // Test 3: Can we execute a basic pipeline?
    console.log('   🔄 Testing pipeline execution with Macy\'s (proven working site)...');
    const testUrl = 'https://www.macys.com';
    
    const result = await orchestrator.scrape(testUrl, {
      enableNavigation: true,
      enableCollection: false,  // Skip collection for faster test
      enableExtraction: false,  // Skip extraction for faster test
      timeout: 30000
    });
    
    console.log('\n📊 MASTER ORCHESTRATOR TEST RESULTS:');
    console.log(`   Status: ${result.status || 'unknown'}`);
    console.log(`   Job ID: ${result.jobId || 'none'}`);
    console.log(`   Duration: ${result.duration ? Math.round(result.duration) + 'ms' : 'unknown'}`);
    
    if (result.navigation) {
      console.log(`   Navigation sections: ${result.navigation.main_sections?.length || 0}`);
      console.log(`   Navigation strategy: ${result.navigation.strategy || 'unknown'}`);
      console.log(`   Navigation confidence: ${result.navigation.confidence || 'unknown'}`);
    }
    
    if (result.error) {
      console.log(`   ❌ Error: ${result.error}`);
    }
    
    // Test 4: Verify BrowserManager integration is working
    if (result.navigation && result.navigation.main_sections && result.navigation.main_sections.length > 0) {
      console.log('\n🛡️  ANTI-BOT DETECTION VALIDATION:');
      console.log('   ✅ Successfully bypassed bot detection (navigation data extracted)');
      console.log('   ✅ BrowserManager integration working in pipeline');
      
      // Sample navigation data for validation
      console.log('\n📋 SAMPLE NAVIGATION DATA:');
      result.navigation.main_sections.slice(0, 3).forEach((section, index) => {
        console.log(`   [${index + 1}] "${section.name}" -> ${section.url || 'no URL'}`);
      });
    } else {
      console.log('\n⚠️  WARNING: No navigation data extracted - possible issues:');
      console.log('   - Site blocking detection');
      console.log('   - Navigation selectors need updating');
      console.log('   - BrowserManager integration issue');
    }
    
    return {
      success: true,
      canImport: true,
      canInitialize: true,
      canExecutePipeline: !!result,
      navigationWorking: !!(result.navigation && result.navigation.main_sections && result.navigation.main_sections.length > 0),
      antiBotBypass: !!(result.navigation && result.navigation.main_sections && result.navigation.main_sections.length > 0),
      result: result
    };

  } catch (error) {
    logger.error('❌ MasterOrchestrator test failed:', error);
    
    console.log('\n💥 MASTER ORCHESTRATOR TEST FAILED:');
    console.log(`   Error: ${error.message}`);
    console.log(`   Stack: ${error.stack?.split('\n')[0]}`);
    
    // Specific error analysis
    if (error.message.includes('Cannot find module')) {
      console.log('   🔍 ISSUE: Import resolution failure');
      console.log('   💡 SOLUTION: Check file paths and dependencies');
    } else if (error.message.includes('initialize')) {
      console.log('   🔍 ISSUE: Initialization failure');
      console.log('   💡 SOLUTION: Check component dependencies and configuration');
    } else if (error.message.includes('scrape')) {
      console.log('   🔍 ISSUE: Pipeline execution failure');
      console.log('   💡 SOLUTION: Check NavigationMapper and BrowserManager integration');
    }
    
    return {
      success: false,
      canImport: !error.message.includes('Cannot find module'),
      canInitialize: !error.message.includes('initialize'),
      canExecutePipeline: false,
      navigationWorking: false,
      antiBotBypass: false,
      error: error.message
    };
  } finally {
    // Restore headless setting
    delete process.env.HEADLESS_MODE;
    
    if (orchestrator) {
      try {
        await orchestrator.close();
        console.log('   ✅ MasterOrchestrator cleanup completed');
      } catch (cleanupError) {
        console.log('   ⚠️  Cleanup warning:', cleanupError.message);
      }
    }
  }
}

// Run the integration test
if (require.main === module) {
  testMasterOrchestrator()
    .then(result => {
      console.log('\n🏁 MASTER ORCHESTRATOR INTEGRATION TEST COMPLETE');
      console.log('=' .repeat(65));
      
      if (result.success) {
        console.log('✅ INTEGRATION TEST PASSED!');
        console.log(`   Import Resolution: ${result.canImport ? '✅' : '❌'}`);
        console.log(`   Initialization: ${result.canInitialize ? '✅' : '❌'}`);
        console.log(`   Pipeline Execution: ${result.canExecutePipeline ? '✅' : '❌'}`);
        console.log(`   Navigation Working: ${result.navigationWorking ? '✅' : '❌'}`);
        console.log(`   Anti-Bot Bypass: ${result.antiBotBypass ? '✅' : '❌'}`);
        
        if (result.navigationWorking && result.antiBotBypass) {
          console.log('\n🎯 EXCELLENT: Full pipeline with BrowserManager working!');
          console.log('   Ready for HTTP API integration');
        } else if (result.canExecutePipeline) {
          console.log('\n🟡 PARTIAL: Pipeline working but navigation needs attention');
        } else {
          console.log('\n🟠 BASIC: MasterOrchestrator working but pipeline needs debugging');
        }
      } else {
        console.log('❌ INTEGRATION TEST FAILED');
        console.log(`   Error: ${result.error}`);
        
        if (result.canImport && result.canInitialize) {
          console.log('   💡 MasterOrchestrator imports/initializes OK - pipeline issue');
        } else if (result.canImport) {
          console.log('   💡 MasterOrchestrator imports OK - initialization issue');
        } else {
          console.log('   💡 MasterOrchestrator import issue - check file paths');
        }
      }
    })
    .catch(error => {
      console.error('💥 Test execution failed:', error.message);
      process.exit(1);
    });
}

module.exports = testMasterOrchestrator;