/**
 * Simple test to get glasswingshop.com data working perfectly
 * Just test what we have and see what needs fixing
 */

require('dotenv').config();

const NavigationMapperBrowserless = require('./src/core/discovery/NavigationMapperBrowserless');
const { logger } = require('./src/utils/logger');

async function testGlasswingExtraction() {
  console.log('\n=== Testing Glasswing Shop Data Extraction ===\n');
  
  const navigationMapper = new NavigationMapperBrowserless(logger);
  
  try {
    console.log('1. Testing navigation extraction...');
    const navigationResult = await navigationMapper.extractNavigation('https://glasswingshop.com');
    
    console.log('\n📊 Navigation Results:');
    console.log(`- Categories found: ${navigationResult.navigation?.length || 0}`);
    
    // Debug: Show raw structure
    console.log('\n🔍 Raw navigation structure:');
    console.log(JSON.stringify(navigationResult.navigation?.slice(0, 2), null, 2));
    if (navigationResult.navigation) {
      navigationResult.navigation.forEach((cat, i) => {
        console.log(`  ${i + 1}. ${cat.name} - ${cat.children?.length || 0} subcategories`);
      });
    }
    
    console.log('\n✅ Navigation extraction completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`- Total main categories: ${navigationResult.navigation?.length || 0}`);
    const totalSubcategories = navigationResult.navigation?.reduce((sum, cat) => sum + (cat.children?.length || 0), 0) || 0;
    console.log(`- Total subcategories: ${totalSubcategories}`);
    
    console.log('\n🔗 Sample subcategory URLs ready for product extraction:');
    if (navigationResult.navigation && navigationResult.navigation[0] && navigationResult.navigation[0].children) {
      navigationResult.navigation[0].children.slice(0, 3).forEach((subcat, i) => {
        console.log(`  ${i + 1}. ${subcat.name}: ${subcat.url}`);
      });
      console.log(`  ... and ${navigationResult.navigation[0].children.length - 3} more in ${navigationResult.navigation[0].name} category`);
    }
    
    await navigationMapper.close();
    console.log('\n✅ Test completed successfully');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await navigationMapper.close();
  }
}

testGlasswingExtraction();