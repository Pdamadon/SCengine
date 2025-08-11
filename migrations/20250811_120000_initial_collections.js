/**
 * Migration: Initial Collections Setup
 * Created: 2025-08-11T12:00:00.000Z
 * 
 * Creates the foundational collections and indexes for the AI Shopping Scraper
 */

module.exports = {
  description: 'Create initial collections with indexes for products, categories, and scraping requests',
  
  /**
   * Apply migration
   * @param {Db} db - MongoDB database instance
   * @param {ClientSession} session - MongoDB transaction session
   */
  async up(db, session) {
    // Create Products collection with indexes
    await db.createCollection('products', { session });
    
    await db.collection('products').createIndexes([
      // Primary product lookup
      { key: { product_id: 1 }, unique: true },
      
      // Category-based queries
      { key: { 'categories.category_id': 1, created_at: -1 } },
      { key: { 'categories.category_type': 1, 'categories.category_id': 1 } },
      
      // Price and availability filtering
      { key: { price: 1, availability: 1 } },
      { key: { availability: 1, created_at: -1 } },
      
      // Brand and gender filtering
      { key: { 'brand.canonical_id': 1, created_at: -1 } },
      { key: { gender_target: 1, 'brand.canonical_id': 1 } },
      
      // Search and text queries
      { key: { title: 'text', description: 'text' }, name: 'product_text_search' },
      
      // Scraping and data quality
      { key: { source_url: 1 } },
      { key: { scraped_at: -1 } },
      { key: { updated_at: -1 } },
      
      // Compound indexes for common queries
      { 
        key: { 
          'categories.category_type': 1, 
          availability: 1, 
          price: 1,
          created_at: -1 
        },
        name: 'category_availability_price_date'
      }
    ], { session });

    // Create Categories collection with indexes
    await db.createCollection('categories', { session });
    
    await db.collection('categories').createIndexes([
      // Primary category lookup
      { key: { canonical_id: 1 }, unique: true },
      
      // Hierarchy navigation
      { key: { hierarchy_level: 1, category_type: 1 } },
      { key: { parent_categories: 1 } },
      { key: { category_type: 1, status: 1 } },
      
      // URL and slug lookups
      { key: { slug: 1 } },
      { key: { url_path: 1 } },
      
      // Search
      { key: { name: 'text', description: 'text' }, name: 'category_text_search' }
    ], { session });

    // Create Scraping Requests collection with indexes
    await db.createCollection('scraping_requests', { session });
    
    await db.collection('scraping_requests').createIndexes([
      // Primary request lookup
      { key: { request_id: 1 }, unique: true },
      
      // Status and queue management
      { key: { status: 1, created_at: 1 } },
      { key: { priority: 1, status: 1, created_at: 1 } },
      { key: { stage: 1, updated_at: -1 } },
      
      // Query and requestor tracking
      { key: { requestor: 1, created_at: -1 } },
      { key: { query_intent: 1 } },
      { key: { product_type: 1, location: 1 } },
      
      // Completion and performance tracking
      { key: { completed_at: -1 } },
      { key: { estimated_completion: 1 } }
    ], { session });

    // Create Sites collection for discovered and tracked sites
    await db.createCollection('sites', { session });
    
    await db.collection('sites').createIndexes([
      // Primary site lookup
      { key: { domain: 1 }, unique: true },
      
      // Site quality and status
      { key: { status: 1, last_scraped: -1 } },
      { key: { quality_score: -1 } },
      { key: { success_rate: -1, last_scraped: -1 } },
      
      // Product categories supported by site
      { key: { supported_categories: 1 } },
      
      // Discovery and validation
      { key: { discovered_at: -1 } },
      { key: { last_validated: 1 } }
    ], { session });

    // Create Scraping Results collection for detailed operation tracking
    await db.createCollection('scraping_results', { session });
    
    await db.collection('scraping_results').createIndexes([
      // Link to scraping request
      { key: { request_id: 1, site_domain: 1 } },
      
      // Performance tracking
      { key: { started_at: -1 } },
      { key: { completed_at: -1 } },
      { key: { status: 1, site_domain: 1 } },
      
      // Results analysis
      { key: { products_found: -1 } },
      { key: { quality_score: -1 } }
    ], { session });

    // Create initial category hierarchy data
    const initialCategories = [
      // Level 1: Gender categories
      {
        canonical_id: 'gender_mens',
        name: 'Mens',
        slug: 'mens',
        hierarchy_level: 1,
        category_type: 'gender',
        parent_categories: [],
        child_categories: [],
        url_path: '/mens',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        canonical_id: 'gender_womens',
        name: 'Womens',
        slug: 'womens',
        hierarchy_level: 1,
        category_type: 'gender',
        parent_categories: [],
        child_categories: [],
        url_path: '/womens',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        canonical_id: 'gender_unisex',
        name: 'Unisex',
        slug: 'unisex',
        hierarchy_level: 1,
        category_type: 'gender',
        parent_categories: [],
        child_categories: [],
        url_path: '/unisex',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      },
      
      // Level 2: Product Type categories (examples)
      {
        canonical_id: 'product_type_clothing',
        name: 'Clothing',
        slug: 'clothing',
        hierarchy_level: 2,
        category_type: 'product_type',
        parent_categories: ['gender_mens', 'gender_womens'],
        child_categories: [],
        url_path: '/clothing',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        canonical_id: 'product_type_shoes',
        name: 'Shoes',
        slug: 'shoes',
        hierarchy_level: 2,
        category_type: 'product_type',
        parent_categories: ['gender_mens', 'gender_womens'],
        child_categories: [],
        url_path: '/shoes',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    await db.collection('categories').insertMany(initialCategories, { session });

    console.log('✅ Initial collections and indexes created successfully');
    console.log('✅ Basic category hierarchy initialized');
  },
  
  /**
   * Rollback migration
   * @param {Db} db - MongoDB database instance  
   * @param {ClientSession} session - MongoDB transaction session
   */
  async down(db, session) {
    // Drop collections in reverse order
    const collections = [
      'scraping_results',
      'sites', 
      'scraping_requests',
      'categories',
      'products'
    ];

    for (const collection of collections) {
      try {
        await db.collection(collection).drop({ session });
        console.log(`✅ Dropped collection: ${collection}`);
      } catch (error) {
        if (error.codeName !== 'NamespaceNotFound') {
          throw error;
        }
        console.log(`⚠️  Collection ${collection} not found, skipping`);
      }
    }

    console.log('✅ Initial collections rollback completed');
  }
};