const AIShoppingScraper = require('../../src/index');

async function testEnhancedFunctionality() {
  console.log('🧪 Enhanced AI Shopping Scraper Test\n');
  
  try {
    const scraper = new AIShoppingScraper();
    
    // Test scenarios with real e-commerce sites
    const testCases = [
      {
        url: 'https://glasswingshop.com/',
        intent: 'Find black leather boots under $200',
        description: 'Glasswing Shop - E-commerce store'
      },
      {
        url: 'https://glasswingshop.com/collections/shoes',
        intent: 'Browse all shoe options',
        description: 'Glasswing Shop - Shoes category'
      }
    ];
    
    for (const testCase of testCases) {
      console.log(`🎯 Testing: ${testCase.description}`);
      console.log(`🌐 URL: ${testCase.url}`);
      console.log(`💭 Intent: "${testCase.intent}"\n`);
      
      try {
        const result = await scraper.generateTrainingScenario(testCase.url, testCase.intent);
        
        console.log('📊 Scenario Analysis:');
        console.log(`- Scenario ID: ${result.id}`);
        console.log(`- Site Platform: ${result.site.platform}`);
        console.log(`- Products Found: ${result.site_context?.product_catalog_size || 0}`);
        console.log(`- E-commerce Maturity: ${result.site_context?.ecommerce_maturity || 'unknown'}`);
        console.log(`- Navigation Complexity: ${result.site_context?.navigation_complexity || 'unknown'}`);
        
        console.log('\n🔍 Intent Analysis:');
        console.log(`- Primary Intent: ${result.user_intent.analysis.primary_intent}`);
        console.log(`- Extracted Attributes: ${JSON.stringify(result.user_intent.analysis.extracted_attributes)}`);
        console.log(`- Shopping Goals: ${result.user_intent.analysis.shopping_goals.join(', ')}`);
        
        console.log('\n📋 Generated Shopping Flow:');
        if (result.shopping_flow.length === 0) {
          console.log('  ⚠️  No shopping flow generated - this indicates the site structure wasn\'t properly detected');
        } else {
          result.shopping_flow.forEach((step, index) => {
            console.log(`  ${index + 1}. ${step.action}`);
            console.log(`     💡 Reasoning: ${step.human_reasoning}`);
            console.log(`     🎯 Learning: ${step.ai_learning_objective}`);
            console.log(`     ⚙️  Method: ${step.technical_implementation.method}`);
            console.log(`     📝 Selector: ${step.technical_implementation.selector.primary}`);
          });
        }
        
        console.log('\n📈 Training Metadata:');
        console.log(`- Complexity Score: ${result.training_metadata.complexity_score}/10`);
        console.log(`- Success Probability: ${Math.round(result.training_metadata.success_probability * 100)}%`);
        console.log(`- Estimated Time: ${result.training_metadata.estimated_time.estimated_seconds}s`);
        console.log(`- Learning Objectives: ${result.training_metadata.learning_objectives.join(', ')}`);
        
        console.log('\n' + '='.repeat(80) + '\n');
        
      } catch (error) {
        console.error(`❌ Test case failed: ${error.message}\n`);
      }
    }
    
    console.log('📊 System Statistics:');
    const stats = await scraper.getSystemStats();
    console.log(`- Scenarios Generated: ${stats.scenariosGenerated}`);
    console.log(`- Sites Supported: ${stats.sitesSupported}`);
    console.log(`- Memory Usage: ${Math.round(stats.memory.heapUsed / 1024 / 1024)}MB`);
    console.log(`- Uptime: ${Math.round(stats.uptime)}s`);
    
    await scraper.shutdown();
    
    console.log('\n✅ Enhanced test completed successfully!');
    
  } catch (error) {
    console.error('❌ Enhanced test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  testEnhancedFunctionality();
}