/**
 * Database Bootstrap and Index Management
 * Sets up indexes for optimal MongoDB Atlas performance
 */

import { getDb } from './mongo';

/**
 * Bootstrap database indexes for optimal performance
 */
export async function bootstrapIndexes(): Promise<void> {
  try {
    const db = await getDb();
    
    console.log('📊 Setting up database indexes...');

    // Sites collection indexes
    await db.collection('sites').createIndex(
      { domain: 1 }, 
      { unique: true, background: true }
    );
    
    await db.collection('sites').createIndex(
      { status: 1, updated_at: -1 }, 
      { background: true }
    );

    // Categories collection indexes
    await db.collection('categories').createIndex(
      { site_id: 1, url: 1 }, 
      { unique: true, background: true }
    );
    
    await db.collection('categories').createIndex(
      { site_id: 1, level: 1 }, 
      { background: true }
    );
    
    await db.collection('categories').createIndex(
      { parent_id: 1 }, 
      { background: true, sparse: true }
    );

    // Products collection indexes
    await db.collection('products').createIndex(
      { url: 1 }, 
      { unique: true, background: true }
    );
    
    await db.collection('products').createIndex(
      { site_id: 1, category_id: 1 }, 
      { background: true }
    );
    
    await db.collection('products').createIndex(
      { site_id: 1, updated_at: -1 }, 
      { background: true }
    );
    
    await db.collection('products').createIndex(
      { price_cents: 1 }, 
      { background: true, sparse: true }
    );
    
    await db.collection('products').createIndex(
      { brand: 1 }, 
      { background: true, sparse: true }
    );

    // Product-Categories relationship indexes
    await db.collection('product_categories').createIndex(
      { product_id: 1, category_id: 1 }, 
      { unique: true, background: true }
    );
    
    await db.collection('product_categories').createIndex(
      { category_id: 1 }, 
      { background: true }
    );

    // Category hierarchy indexes
    await db.collection('category_hierarchy').createIndex(
      { site_id: 1, level: 1 }, 
      { background: true }
    );
    
    await db.collection('category_hierarchy').createIndex(
      { parent_id: 1 }, 
      { background: true }
    );
    
    await db.collection('category_hierarchy').createIndex(
      { canonical_name: 1 }, 
      { background: true }
    );

    // Scraping jobs indexes (for queue management)
    await db.collection('scraping_jobs').createIndex(
      { status: 1, created_at: -1 }, 
      { background: true }
    );
    
    await db.collection('scraping_jobs').createIndex(
      { site_id: 1, status: 1 }, 
      { background: true }
    );
    
    await db.collection('scraping_jobs').createIndex(
      { scheduled_at: 1 }, 
      { background: true, sparse: true }
    );

    // Performance monitoring indexes
    await db.collection('performance_logs').createIndex(
      { timestamp: -1 }, 
      { background: true, expireAfterSeconds: 2592000 } // 30 days TTL
    );
    
    await db.collection('error_logs').createIndex(
      { timestamp: -1 }, 
      { background: true, expireAfterSeconds: 7776000 } // 90 days TTL
    );

    // Text search indexes for product discovery
    await db.collection('products').createIndex(
      { 
        title: 'text', 
        description: 'text', 
        brand: 'text' 
      },
      { 
        background: true,
        weights: { title: 10, brand: 5, description: 1 }
      }
    );

    console.log('✅ Database indexes created successfully');
    
  } catch (error) {
    console.error('❌ Failed to create database indexes:', error);
    throw error;
  }
}

/**
 * Validate database schema and constraints
 */
export async function validateSchema(): Promise<boolean> {
  try {
    const db = await getDb();
    
    // Check required collections exist
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    const requiredCollections = [
      'sites', 'categories', 'products', 
      'product_categories', 'category_hierarchy',
      'scraping_jobs'
    ];
    
    for (const collection of requiredCollections) {
      if (!collectionNames.includes(collection)) {
        console.warn(`⚠️  Collection '${collection}' does not exist`);
        return false;
      }
    }
    
    console.log('✅ Database schema validation passed');
    return true;
    
  } catch (error) {
    console.error('❌ Schema validation failed:', error);
    return false;
  }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
  try {
    const db = await getDb();
    
    const stats = await db.stats();
    
    const collections = await Promise.all([
      db.collection('sites').estimatedDocumentCount(),
      db.collection('categories').estimatedDocumentCount(),
      db.collection('products').estimatedDocumentCount(),
      db.collection('product_categories').estimatedDocumentCount(),
      db.collection('category_hierarchy').estimatedDocumentCount(),
      db.collection('scraping_jobs').estimatedDocumentCount(),
    ]);
    
    return {
      database: db.databaseName,
      size: stats.dataSize,
      collections: {
        sites: collections[0],
        categories: collections[1],
        products: collections[2],
        product_categories: collections[3],
        category_hierarchy: collections[4],
        scraping_jobs: collections[5],
      },
      indexes: stats.indexes,
      avgObjSize: stats.avgObjSize,
    };
    
  } catch (error) {
    console.error('Failed to get database stats:', error);
    return null;
  }
}

/**
 * Clean up old data based on retention policies
 */
export async function cleanupOldData(): Promise<void> {
  try {
    const db = await getDb();
    
    // Clean up old performance logs (older than 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db.collection('performance_logs').deleteMany({
      timestamp: { $lt: thirtyDaysAgo }
    });
    
    // Clean up old error logs (older than 90 days) 
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    await db.collection('error_logs').deleteMany({
      timestamp: { $lt: ninetyDaysAgo }
    });
    
    // Clean up completed scraping jobs (older than 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await db.collection('scraping_jobs').deleteMany({
      status: 'completed',
      completed_at: { $lt: sevenDaysAgo }
    });
    
    console.log('✅ Old data cleanup completed');
    
  } catch (error) {
    console.error('❌ Data cleanup failed:', error);
    throw error;
  }
}