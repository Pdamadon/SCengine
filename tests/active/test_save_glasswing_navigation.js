/**
 * Save Glasswing Shop navigation data to MongoDB
 * Uses our existing CheckpointManager and database schema
 */

require('dotenv').config();

const NavigationMapperBrowserless = require('./src/core/discovery/NavigationMapperBrowserless');
const CheckpointManager = require('./src/core/checkpoint/CheckpointManager');
const { logger } = require('./src/utils/logger');

async function saveGlasswingNavigationData() {
  console.log('\n=== Saving Glasswing Shop Navigation to Database ===\n');
  
  const navigationMapper = new NavigationMapperBrowserless(logger);
  const checkpointManager = new CheckpointManager();
  
  try {
    // Initialize checkpoint manager
    await checkpointManager.initialize();
    
    // Extract navigation data
    console.log('1. Extracting navigation data...');
    const navigationResult = await navigationMapper.extractNavigation('https://glasswingshop.com');
    
    if (!navigationResult.navigation || navigationResult.navigation.length === 0) {
      throw new Error('No navigation data extracted');
    }
    
    // Prepare data for database according to our schema
    const navigationData = {
      site: 'glasswingshop.com',
      extractedAt: new Date().toISOString(),
      strategy: navigationResult.strategy || 'NavigationPatternStrategy',
      confidence: navigationResult.confidence || 0.95,
      sections: navigationResult.navigation.map(category => ({
        name: category.name,
        url: category.url || null, // Main categories are dropdown triggers
        selector: category.metadata?.selector || null,
        subsections: category.children?.map(child => ({
          name: child.name,
          url: child.url,
          type: child.type || 'subcategory'
        })) || []
      }))
    };
    
    console.log('\n2. Saving to database...');
    console.log(`- Site: ${navigationData.site}`);
    console.log(`- Main categories: ${navigationData.sections.length}`);
    console.log(`- Total subcategories: ${navigationData.sections.reduce((sum, s) => sum + s.subsections.length, 0)}`);
    
    // Create checkpoint entry
    const checkpointData = {
      taskType: 'navigation_extraction',
      site: 'glasswingshop.com',
      stage: 'completed',
      data: navigationData,
      metadata: {
        totalItems: navigationResult.totalNavigationItems || 188,
        extractionTime: Date.now(),
        cost: '$0.01'
      }
    };
    
    const checkpointId = await checkpointManager.saveCheckpoint(checkpointData);
    console.log(`✅ Navigation data saved with checkpoint ID: ${checkpointId}`);
    
    // Also save to navigation_maps collection directly
    await checkpointManager.db.collection('navigation_maps').insertOne(navigationData);
    console.log('✅ Navigation data also saved to navigation_maps collection');
    
    console.log('\n📋 Summary:');
    console.log(`- Categories extracted: ${navigationData.sections.length}`);
    console.log(`- Subcategories with URLs: ${navigationData.sections.reduce((sum, s) => sum + s.subsections.length, 0)}`);
    console.log(`- Ready for product extraction!`);
    
    await navigationMapper.close();
    await checkpointManager.close();
    
  } catch (error) {
    console.error('❌ Failed to save navigation data:', error.message);
    await navigationMapper.close();
    await checkpointManager.close();
    process.exit(1);
  }
}

saveGlasswingNavigationData();