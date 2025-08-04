const AIShoppingScraper = require('./src/index');

async function testBasicFunctionality() {
  console.log('🧪 Testing AI Shopping Scraper basic functionality...\n');
  
  try {
    const scraper = new AIShoppingScraper();
    
    console.log('✅ Application initialized successfully');
    
    const testUrl = 'https://demo.vercel.store/';
    const testIntent = 'Find black shoes under $100';
    
    console.log(`🔍 Testing scenario generation for: "${testIntent}"`);
    console.log(`🌐 Target site: ${testUrl}\n`);
    
    const result = await scraper.generateTrainingScenario(testUrl, testIntent);
    
    console.log('📊 Scenario Generation Results:');
    console.log(`- Scenario ID: ${result.id}`);
    console.log(`- Site Platform: ${result.site.platform}`);
    console.log(`- Shopping Flow Steps: ${result.shopping_flow.length}`);
    console.log(`- Complexity Score: ${result.training_metadata.complexity_score}`);
    console.log(`- Success Probability: ${Math.round(result.training_metadata.success_probability * 100)}%`);
    
    console.log('\n📋 Generated Shopping Flow:');
    result.shopping_flow.forEach((step, index) => {
      console.log(`  ${index + 1}. ${step.action}: ${step.human_reasoning}`);
    });
    
    console.log('\n🎯 AI Learning Objectives:');
    result.training_metadata.learning_objectives.forEach(objective => {
      console.log(`  - ${objective}`);
    });
    
    await scraper.shutdown();
    
    console.log('\n✅ Test completed successfully!');
    console.log(`\n📈 Daily Progress: 1/${process.env.SCENARIOS_PER_DAY_TARGET} scenarios generated`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  testBasicFunctionality();
}