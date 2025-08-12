/**
 * Transform Glasswing Data Script
 * Loads the Glasswing JSON file and transforms it into our enhanced database schema
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { glasswingTransformer, GlasswingScrapingResult } from '../src/services/GlasswingDataTransformer';
import { initializeMongoService, getDb } from '../src/database/mongo';
import { bootstrapIndexes } from '../src/database/bootstrap';

async function main() {
  console.log('🚀 Starting Glasswing data transformation...');
  
  try {
    // Initialize MongoDB connection
    console.log('📊 Connecting to MongoDB Atlas...');
    initializeMongoService({
      uri: process.env.MONGODB_URL || 'mongodb://localhost:27017',
      database: process.env.MONGODB_DB || 'ai_shopping_scraper',
    });
    
    // Ensure database is ready
    const db = await getDb();
    console.log('✅ MongoDB connection established');
    
    // Bootstrap indexes if needed
    try {
      await bootstrapIndexes();
      console.log('✅ Database indexes ready');
    } catch (error) {
      console.log('⚠️  Index creation skipped:', error);
    }
    
    // Load Glasswing JSON data
    const dataPath = resolve(__dirname, '../glasswing_full_site_2025-08-12T14-35-04.json');
    console.log(`📁 Loading data from: ${dataPath}`);
    
    const rawData = await readFile(dataPath, 'utf-8');
    const glasswingData: GlasswingScrapingResult = JSON.parse(rawData);
    
    console.log(`📦 Loaded scraping data:`, {
      site: glasswingData.scrapeInfo.site,
      totalProducts: glasswingData.products.length,
      scrapeDate: glasswingData.scrapeInfo.timestamp,
      successRate: glasswingData.results.successRate + '%'
    });
    
    // For initial testing, let's process a subset of products
    const BATCH_SIZE = 3; // Start with first 3 products for debugging
    const productsBatch = glasswingData.products.slice(0, BATCH_SIZE);
    
    console.log(`🔄 Processing first ${productsBatch.length} products as test batch...`);
    
    // Create a test batch with subset
    const testBatch: GlasswingScrapingResult = {
      ...glasswingData,
      products: productsBatch
    };
    
    // Transform data
    // For this test, we'll use a generic "all_products" category
    const result = await glasswingTransformer.transformScrapingResult(
      testBatch,
      'glasswing_all_products',
      'All Products'
    );
    
    console.log('✅ Transformation completed:', result);
    
    // Verify data was inserted
    const productCount = await db.collection('products').countDocuments({ domain: 'glasswingshop.com' });
    const relationshipCount = await db.collection('product_categories').countDocuments({ domain: 'glasswingshop.com' });
    
    console.log('📊 Database verification:', {
      products_in_db: productCount,
      category_relationships: relationshipCount
    });
    
    // Show sample product
    const sampleProduct = await db.collection('products').findOne(
      { domain: 'glasswingshop.com' },
      { 
        projection: { 
          title: 1, 
          url: 1, 
          'glasswing_variants.0': 1, 
          'automation_elements.addToCartButton': 1,
          scrape_quality_score: 1
        } 
      }
    );
    
    if (sampleProduct) {
      console.log('📋 Sample transformed product:');
      console.log(JSON.stringify(sampleProduct, null, 2));
    }
    
    console.log('🎉 Data transformation test completed successfully!');
    
  } catch (error) {
    console.error('❌ Transformation failed:', error);
    process.exit(1);
  }
}

// Handle environment variables
import dotenv from 'dotenv';
dotenv.config();

// Run the script
main().catch(console.error);