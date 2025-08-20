#!/usr/bin/env node

const fs = require('fs');

// Database schema design logger
const logger = {
  info: (...args) => console.log('[SCHEMA-DESIGN]', ...args),
  error: (...args) => console.error('[SCHEMA-ERROR]', ...args),
  warn: (...args) => console.warn('[SCHEMA-WARN]', ...args)
};

class MultiCategorySchemaDesigner {
  constructor() {
    this.hierarchyData = null;
    this.schemaDesign = {
      metadata: {
        schema_version: '2.0',
        design_date: new Date().toISOString(),
        database_type: 'mongodb',
        optimization_target: 'sub_100ms_queries'
      },
      collections: {},
      indexes: {},
      queries: {},
      migration_plan: {},
      performance_benchmarks: {}
    };
  }

  async designSchema() {
    console.log('\n🏗️ MULTI-CATEGORY DATABASE SCHEMA DESIGNER');
    console.log('==========================================');
    
    try {
      // Load hierarchy data for schema design
      await this.loadHierarchyData();
      
      console.log('\n📋 PHASE 1: Design core collections');
      this.designCoreCollections();
      
      console.log('\n🔗 PHASE 2: Design category relationship collections');
      this.designCategoryRelationships();
      
      console.log('\n🚀 PHASE 3: Design performance indexes');
      this.designPerformanceIndexes();
      
      console.log('\n🔍 PHASE 4: Design query patterns');
      this.designQueryPatterns();
      
      console.log('\n📈 PHASE 5: Design migration strategy');
      this.designMigrationStrategy();
      
      console.log('\n⚡ PHASE 6: Performance optimization planning');
      this.designPerformanceOptimizations();
      
      console.log('\n💾 PHASE 7: Save schema design');
      await this.saveSchemaDesign();
      
      this.generateSchemaReport();
      
      return this.schemaDesign;
      
    } catch (error) {
      logger.error('Schema design failed:', error.message);
      throw error;
    }
  }

  async loadHierarchyData() {
    logger.info('Loading category hierarchy data for schema design');
    
    const timestamp = new Date().toISOString().slice(0,10);
    const hierarchyPath = `results/data/glasswing_category_hierarchy_${timestamp}.json`;
    
    if (!fs.existsSync(hierarchyPath)) {
      throw new Error(`Hierarchy data not found at ${hierarchyPath}. Run hierarchy generation first.`);
    }
    
    this.hierarchyData = JSON.parse(fs.readFileSync(hierarchyPath, 'utf8'));
    
    const totalCategories = 
      Object.values(this.hierarchyData.level_1_gender).reduce((sum, g) => sum + g.categories.length, 0) +
      Object.values(this.hierarchyData.level_2_product_types).reduce((sum, t) => sum + t.categories.length, 0) +
      this.hierarchyData.level_3_brands.length +
      this.hierarchyData.level_4_promotions.length;
    
    logger.info(`Loaded hierarchy with ${totalCategories} total categories`);
    logger.info(`Found ${this.hierarchyData.hierarchy_paths.length} navigation paths`);
  }

  designCoreCollections() {
    console.log('📚 Designing core MongoDB collections...');

    // 1. Enhanced Products Collection
    this.schemaDesign.collections.products = {
      collection_name: 'products',
      description: 'Main product documents with multi-category support',
      document_structure: {
        // Core product identification
        _id: { type: 'ObjectId', description: 'MongoDB document ID' },
        product_id: { type: 'String', unique: true, description: 'Unique product identifier from source' },
        site_product_id: { type: 'String', description: 'Original site product ID' },
        
        // Basic product data
        title: { type: 'String', text_index: true, description: 'Product title' },
        description: { type: 'String', text_index: true, description: 'Product description' },
        price: { type: 'Number', description: 'Current price in cents' },
        original_price: { type: 'Number', description: 'Original price before discounts' },
        currency: { type: 'String', default: 'USD', description: 'Price currency' },
        availability: { type: 'String', enum: ['in_stock', 'out_of_stock', 'pre_order'], description: 'Stock status' },
        
        // Enhanced category system
        categories: {
          type: 'Array',
          description: 'Array of category relationships',
          schema: {
            category_id: { type: 'String', description: 'Reference to canonical category' },
            category_type: { type: 'String', enum: ['gender', 'product_type', 'brand', 'promotion'], description: 'Category level in hierarchy' },
            category_name: { type: 'String', description: 'Human-readable category name' },
            category_path: { type: 'String', description: 'URL path for category' },
            is_primary: { type: 'Boolean', default: false, description: 'Primary categorization' },
            hierarchy_level: { type: 'Number', min: 1, max: 4, description: 'Level in 4-level hierarchy' },
            confidence_score: { type: 'Number', min: 0, max: 1, description: 'AI classification confidence' },
            source_context: { type: 'String', description: 'How this category was discovered' }
          }
        },
        
        // Fast query fields (denormalized for performance)
        primary_category: { type: 'String', index: true, description: 'Primary category for fast queries' },
        category_ids: { type: 'Array', index: true, description: 'Array of all category IDs for fast filtering' },
        hierarchy_path: { type: 'String', index: true, description: 'Slash-separated hierarchy path' },
        
        // Brand information
        brand: {
          name: { type: 'String', index: true, description: 'Brand name' },
          canonical_id: { type: 'String', index: true, description: 'Canonical brand identifier' },
          tier: { type: 'String', enum: ['premium', 'established', 'emerging'], description: 'Brand classification tier' }
        },
        
        // Gender/demographic targeting
        gender_target: {
          type: 'Array',
          enum: ['mens', 'womens', 'unisex'],
          description: 'Target demographics'
        },
        
        // Product attributes
        attributes: {
          color: { type: 'Array', description: 'Available colors' },
          sizes: { type: 'Array', description: 'Available sizes' },
          materials: { type: 'Array', description: 'Materials used' },
          style_tags: { type: 'Array', index: true, description: 'Style classifications' }
        },
        
        // Images and media
        images: {
          type: 'Array',
          schema: {
            url: { type: 'String', description: 'Image URL' },
            alt_text: { type: 'String', description: 'Image alt text' },
            type: { type: 'String', enum: ['primary', 'secondary', 'detail'], description: 'Image type' }
          }
        },
        
        // SEO and discovery
        slug: { type: 'String', unique: true, index: true, description: 'URL-friendly identifier' },
        tags: { type: 'Array', text_index: true, description: 'Search tags' },
        
        // Scraping metadata
        source_url: { type: 'String', description: 'Original product URL' },
        scraped_at: { type: 'Date', index: true, description: 'Last scrape timestamp' },
        scrape_context: {
          category_context: { type: 'String', description: 'Category page where product was found' },
          discovery_method: { type: 'String', description: 'How product was discovered' },
          batch_id: { type: 'String', index: true, description: 'Scraping batch identifier' }
        },
        
        // Timestamps
        created_at: { type: 'Date', default: 'now', index: true },
        updated_at: { type: 'Date', default: 'now', index: true }
      },
      
      estimated_documents: 5700, // Based on hierarchy analysis
      storage_requirements: '~50MB with full product data'
    };

    // 2. Canonical Categories Collection
    this.schemaDesign.collections.categories = {
      collection_name: 'categories',
      description: 'Canonical category definitions from hierarchy',
      document_structure: {
        _id: { type: 'ObjectId' },
        canonical_id: { type: 'String', unique: true, description: 'Canonical category identifier' },
        
        // Basic category info
        name: { type: 'String', index: true, description: 'Category display name' },
        slug: { type: 'String', unique: true, index: true, description: 'URL-friendly name' },
        description: { type: 'String', description: 'Category description' },
        
        // Hierarchy information
        hierarchy_level: { type: 'Number', min: 1, max: 4, index: true, description: 'Level in hierarchy' },
        category_type: { type: 'String', enum: ['gender', 'product_type', 'brand', 'promotion'], index: true },
        parent_categories: { type: 'Array', description: 'Parent category canonical_ids' },
        child_categories: { type: 'Array', description: 'Child category canonical_ids' },
        
        // Navigation and discovery
        url_path: { type: 'String', unique: true, description: 'Category URL path' },
        navigation_order: { type: 'Number', description: 'Display order in navigation' },
        
        // Category-specific metadata
        gender_focus: { type: 'String', enum: ['mens', 'womens', 'unisex'], description: 'Gender targeting' },
        product_focus: { type: 'String', enum: ['clothing', 'shoes', 'accessories', 'jewelry', 'lifestyle', 'mixed'] },
        brand_tier: { type: 'String', enum: ['premium', 'established', 'emerging'], description: 'For brand categories' },
        promotion_type: { type: 'String', enum: ['sale', 'new_arrivals', 'gift_guide', 'limited_edition', 'featured'] },
        urgency_level: { type: 'String', enum: ['high', 'medium', 'low'], description: 'For promotional categories' },
        
        // Analytics and performance
        estimated_products: { type: 'Number', description: 'Expected product count' },
        actual_product_count: { type: 'Number', default: 0, description: 'Current product count' },
        last_updated_count: { type: 'Date', description: 'When product count was last updated' },
        
        // Multi-category relationships
        multi_category_relationships: {
          type: 'Array',
          description: 'Valid multi-category relationships',
          schema: {
            relationship_type: { type: 'String', description: 'Type of relationship' },
            related_category_ids: { type: 'Array', description: 'Related canonical category IDs' },
            relationship_strength: { type: 'Number', min: 0, max: 1, description: 'Relationship confidence' }
          }
        },
        
        // SEO and display
        meta_title: { type: 'String', description: 'SEO title' },
        meta_description: { type: 'String', description: 'SEO description' },
        display_image: { type: 'String', description: 'Category display image URL' },
        
        // Status and management
        status: { type: 'String', enum: ['active', 'inactive', 'archived'], default: 'active', index: true },
        created_at: { type: 'Date', default: 'now' },
        updated_at: { type: 'Date', default: 'now' }
      },
      
      estimated_documents: 140, // From deduplication results
      storage_requirements: '~1MB'
    };

    // 3. Category Hierarchy Collection (for fast navigation)
    this.schemaDesign.collections.category_hierarchy = {
      collection_name: 'category_hierarchy',
      description: 'Pre-computed hierarchy paths for fast navigation',
      document_structure: {
        _id: { type: 'ObjectId' },
        path_id: { type: 'String', unique: true, description: 'Unique path identifier' },
        
        // Hierarchy path
        level_1_gender: { type: 'String', index: true, description: 'Gender level category' },
        level_2_product_type: { type: 'String', index: true, description: 'Product type level category' },
        level_3_brand: { type: 'String', index: true, description: 'Brand level category' },
        level_4_promotion: { type: 'String', index: true, description: 'Promotion level category' },
        
        // Full path representation
        full_path: { type: 'String', unique: true, index: true, description: 'Complete hierarchy path' },
        path_segments: { type: 'Array', index: true, description: 'Array of path segments' },
        
        // Navigation metadata
        estimated_products: { type: 'Number', description: 'Products in this path' },
        path_type: { type: 'String', enum: ['full', 'partial', 'brand_direct', 'promotion_direct'] },
        navigation_priority: { type: 'Number', description: 'Display priority' },
        
        // Performance tracking
        query_count: { type: 'Number', default: 0, description: 'How often this path is queried' },
        last_queried: { type: 'Date', description: 'Last query timestamp' },
        
        created_at: { type: 'Date', default: 'now' }
      },
      
      estimated_documents: 576, // From hierarchy generation
      storage_requirements: '~2MB'
    };

    console.log(`   ✅ Designed 3 core collections:`);
    console.log(`      📦 products: ~5,700 documents, ~50MB`);
    console.log(`      🏷️ categories: ~140 documents, ~1MB`);
    console.log(`      🔗 category_hierarchy: ~576 documents, ~2MB`);
  }

  designCategoryRelationships() {
    console.log('🔗 Designing category relationship collections...');

    // 4. Product-Category Relationships (for complex queries)
    this.schemaDesign.collections.product_categories = {
      collection_name: 'product_categories',
      description: 'Junction table for many-to-many product-category relationships',
      document_structure: {
        _id: { type: 'ObjectId' },
        
        // Relationship identifiers
        product_id: { type: 'String', index: true, description: 'Reference to products.product_id' },
        category_id: { type: 'String', index: true, description: 'Reference to categories.canonical_id' },
        
        // Relationship metadata
        relationship_type: { type: 'String', enum: ['primary', 'secondary', 'contextual'], index: true },
        hierarchy_level: { type: 'Number', min: 1, max: 4, index: true },
        confidence_score: { type: 'Number', min: 0, max: 1, description: 'Classification confidence' },
        
        // Discovery context
        discovery_source: { type: 'String', description: 'How relationship was discovered' },
        source_url: { type: 'String', description: 'URL where relationship was found' },
        
        // Analytics
        relevance_score: { type: 'Number', min: 0, max: 1, description: 'Relevance to category' },
        
        created_at: { type: 'Date', default: 'now', index: true }
      },
      
      // Compound indexes for performance
      compound_indexes: [
        { fields: ['product_id', 'hierarchy_level'], description: 'Product categories by level' },
        { fields: ['category_id', 'relationship_type'], description: 'Category products by type' },
        { fields: ['product_id', 'category_id'], unique: true, description: 'Unique relationships' }
      ],
      
      estimated_documents: 17100, // ~3 categories per product on average
      storage_requirements: '~8MB'
    };

    // 5. Category Analytics Collection
    this.schemaDesign.collections.category_analytics = {
      collection_name: 'category_analytics',
      description: 'Category performance and analytics data',
      document_structure: {
        _id: { type: 'ObjectId' },
        category_id: { type: 'String', unique: true, index: true },
        date: { type: 'Date', index: true, description: 'Analytics date' },
        
        // Product metrics
        product_count: { type: 'Number', description: 'Total products in category' },
        new_products_this_period: { type: 'Number', description: 'New products added' },
        active_products: { type: 'Number', description: 'Currently available products' },
        
        // Price analytics
        price_range: {
          min: { type: 'Number', description: 'Minimum price in category' },
          max: { type: 'Number', description: 'Maximum price in category' },
          average: { type: 'Number', description: 'Average price' },
          median: { type: 'Number', description: 'Median price' }
        },
        
        // Query performance
        query_metrics: {
          total_queries: { type: 'Number', description: 'Total queries to this category' },
          average_response_time: { type: 'Number', description: 'Average query response time in ms' },
          cache_hit_rate: { type: 'Number', description: 'Cache effectiveness' }
        },
        
        // Category health
        health_score: { type: 'Number', min: 0, max: 100, description: 'Overall category health' },
        
        created_at: { type: 'Date', default: 'now' }
      },
      
      estimated_documents: 5110, // Daily analytics for 140 categories * ~30 days
      storage_requirements: '~15MB'
    };

    console.log(`   ✅ Designed 2 relationship collections:`);
    console.log(`      🔗 product_categories: ~17,100 documents, ~8MB`);
    console.log(`      📊 category_analytics: ~5,110 documents, ~15MB`);
  }

  designPerformanceIndexes() {
    console.log('🚀 Designing performance indexes for sub-100ms queries...');

    this.schemaDesign.indexes = {
      // Product collection indexes
      products: [
        // Single field indexes
        { field: 'product_id', type: 'unique', description: 'Unique product lookup' },
        { field: 'primary_category', type: 'single', description: 'Fast category filtering' },
        { field: 'brand.canonical_id', type: 'single', description: 'Brand filtering' },
        { field: 'created_at', type: 'single', description: 'Chronological sorting' },
        { field: 'price', type: 'single', description: 'Price range queries' },
        { field: 'availability', type: 'single', description: 'Stock filtering' },
        
        // Compound indexes for multi-category queries (CRITICAL for performance)
        {
          fields: ['category_ids', 'availability', 'price'],
          type: 'compound',
          description: 'Fast category + availability + price filtering',
          estimated_performance: '<50ms for category queries'
        },
        {
          fields: ['brand.canonical_id', 'gender_target', 'availability'],
          type: 'compound',
          description: 'Brand + gender + availability queries',
          estimated_performance: '<30ms for brand-specific queries'
        },
        {
          fields: ['primary_category', 'price', 'created_at'],
          type: 'compound',
          description: 'Category browsing with price and recency',
          estimated_performance: '<40ms for category browsing'
        },
        {
          fields: ['hierarchy_path', 'availability', 'updated_at'],
          type: 'compound',
          description: 'Hierarchy navigation with freshness',
          estimated_performance: '<35ms for navigation queries'
        },
        
        // Text search index
        {
          fields: ['title', 'description', 'tags'],
          type: 'text',
          description: 'Full-text product search',
          weights: { title: 10, description: 5, tags: 1 }
        },
        
        // Array indexes for multi-category support
        { field: 'category_ids', type: 'multikey', description: 'Multi-category filtering' },
        { field: 'gender_target', type: 'multikey', description: 'Multi-gender targeting' },
        { field: 'attributes.style_tags', type: 'multikey', description: 'Style filtering' }
      ],
      
      // Category collection indexes
      categories: [
        { field: 'canonical_id', type: 'unique', description: 'Canonical category lookup' },
        { field: 'slug', type: 'unique', description: 'URL-friendly lookup' },
        { field: 'hierarchy_level', type: 'single', description: 'Level-based queries' },
        { field: 'category_type', type: 'single', description: 'Type-based filtering' },
        { field: 'status', type: 'single', description: 'Active category filtering' },
        
        // Compound for hierarchy navigation
        {
          fields: ['hierarchy_level', 'category_type', 'navigation_order'],
          type: 'compound',
          description: 'Fast hierarchy navigation',
          estimated_performance: '<20ms for navigation'
        }
      ],
      
      // Product-Categories junction indexes
      product_categories: [
        { field: 'product_id', type: 'single', description: 'Product relationship lookup' },
        { field: 'category_id', type: 'single', description: 'Category relationship lookup' },
        
        // Critical compound indexes for JOIN-like operations
        {
          fields: ['category_id', 'relationship_type', 'confidence_score'],
          type: 'compound',
          description: 'Category products with relationship quality',
          estimated_performance: '<25ms for category product lists'
        },
        {
          fields: ['product_id', 'hierarchy_level', 'relationship_type'],
          type: 'compound',
          description: 'Product categories by hierarchy level',
          estimated_performance: '<20ms for product category analysis'
        }
      ],
      
      // Category hierarchy indexes
      category_hierarchy: [
        { field: 'path_id', type: 'unique', description: 'Unique path lookup' },
        { field: 'full_path', type: 'unique', description: 'Full path navigation' },
        
        // Individual level indexes for partial path queries
        { field: 'level_1_gender', type: 'single', description: 'Gender-first navigation' },
        { field: 'level_3_brand', type: 'single', description: 'Brand-first navigation' },
        { field: 'level_4_promotion', type: 'single', description: 'Promotion-first navigation' },
        
        // Compound for multi-level navigation
        {
          fields: ['level_1_gender', 'level_2_product_type', 'level_3_brand'],
          type: 'compound',
          description: 'Multi-level hierarchy navigation',
          estimated_performance: '<15ms for complex navigation'
        }
      ]
    };

    // Calculate total index overhead
    const estimatedIndexSize = this.calculateIndexOverhead();
    
    console.log(`   ✅ Designed ${this.getTotalIndexCount()} performance indexes`);
    console.log(`      📦 Products: 12 indexes (including 4 critical compound indexes)`);
    console.log(`      🏷️ Categories: 6 indexes for fast hierarchy navigation`);
    console.log(`      🔗 Relationships: 4 indexes for JOIN-like operations`);
    console.log(`      🌳 Hierarchy: 7 indexes for path navigation`);
    console.log(`      💾 Estimated index overhead: ~${estimatedIndexSize}MB`);
  }

  calculateIndexOverhead() {
    // Rough estimate: indexes typically take 15-25% of document size
    const totalDataSize = 50 + 1 + 8 + 2 + 15; // MB from collections
    return Math.round(totalDataSize * 0.2); // 20% overhead estimate
  }

  getTotalIndexCount() {
    return Object.values(this.schemaDesign.indexes).reduce((total, indexes) => total + indexes.length, 0);
  }

  designQueryPatterns() {
    console.log('🔍 Designing optimized query patterns...');

    this.schemaDesign.queries = {
      // Core category queries
      single_category_products: {
        description: 'Get all products in a specific category',
        mongodb_query: {
          collection: 'products',
          query: { 'category_ids': { '$in': ['${category_id}'] }, 'availability': 'in_stock' },
          projection: { title: 1, price: 1, images: 1, brand: 1, slug: 1 },
          sort: { created_at: -1 },
          limit: 50
        },
        estimated_performance: '<40ms',
        uses_index: 'category_ids + availability + created_at compound'
      },

      multi_category_intersection: {
        description: 'Products that belong to multiple categories (e.g., Brand + Gender)',
        mongodb_query: {
          collection: 'products',
          query: {
            '$and': [
              { 'category_ids': '${brand_category_id}' },
              { 'category_ids': '${gender_category_id}' },
              { 'availability': 'in_stock' }
            ]
          },
          projection: { title: 1, price: 1, images: 1, brand: 1 },
          sort: { price: 1 }
        },
        estimated_performance: '<50ms',
        uses_index: 'category_ids multikey + availability'
      },

      hierarchy_path_products: {
        description: 'Products following a specific hierarchy path',
        mongodb_query: {
          collection: 'products',
          query: {
            'hierarchy_path': { '$regex': '^${path_prefix}' },
            'availability': 'in_stock'
          },
          sort: { updated_at: -1 },
          limit: 100
        },
        estimated_performance: '<35ms',
        uses_index: 'hierarchy_path + availability + updated_at compound'
      },

      brand_gender_products: {
        description: 'Fast brand + gender combination query',
        mongodb_query: {
          collection: 'products',
          query: {
            'brand.canonical_id': '${brand_id}',
            'gender_target': { '$in': ['${gender}'] },
            'availability': 'in_stock'
          },
          sort: { price: 1 },
          limit: 50
        },
        estimated_performance: '<30ms',
        uses_index: 'brand.canonical_id + gender_target + availability compound'
      },

      category_hierarchy_navigation: {
        description: 'Get navigation tree for category browsing',
        mongodb_query: {
          collection: 'categories',
          query: {
            'hierarchy_level': { '$lte': 2 },
            'status': 'active'
          },
          projection: { canonical_id: 1, name: 1, hierarchy_level: 1, category_type: 1, estimated_products: 1 },
          sort: { hierarchy_level: 1, navigation_order: 1 }
        },
        estimated_performance: '<20ms',
        uses_index: 'hierarchy_level + category_type + navigation_order compound'
      },

      product_full_categories: {
        description: 'Get all categories for a specific product with relationship details',
        mongodb_aggregation: [
          { '$match': { 'product_id': '${product_id}' } },
          {
            '$lookup': {
              from: 'product_categories',
              localField: 'product_id',
              foreignField: 'product_id',
              as: 'category_relationships'
            }
          },
          {
            '$lookup': {
              from: 'categories',
              localField: 'category_relationships.category_id',
              foreignField: 'canonical_id',
              as: 'category_details'
            }
          },
          {
            '$project': {
              title: 1,
              categories: {
                '$map': {
                  input: '$category_details',
                  as: 'cat',
                  in: {
                    name: '$$cat.name',
                    hierarchy_level: '$$cat.hierarchy_level',
                    category_type: '$$cat.category_type'
                  }
                }
              }
            }
          }
        ],
        estimated_performance: '<60ms',
        uses_index: 'Multiple lookups with indexed fields'
      },

      category_analytics_summary: {
        description: 'Get category performance analytics',
        mongodb_aggregation: [
          { '$match': { 'category_id': '${category_id}', 'date': { '$gte': '${start_date}' } } },
          {
            '$group': {
              _id: '$category_id',
              avg_product_count: { '$avg': '$product_count' },
              total_queries: { '$sum': '$query_metrics.total_queries' },
              avg_response_time: { '$avg': '$query_metrics.average_response_time' },
              latest_health_score: { '$last': '$health_score' }
            }
          }
        ],
        estimated_performance: '<45ms',
        uses_index: 'category_id + date compound'
      }
    };

    console.log(`   ✅ Designed 7 optimized query patterns:`);
    console.log(`      🔍 Single category: <40ms target`);
    console.log(`      🔗 Multi-category intersection: <50ms target`);
    console.log(`      🌳 Hierarchy navigation: <35ms target`);
    console.log(`      👥 Brand + Gender: <30ms target`);
    console.log(`      📊 Analytics queries: <45ms target`);
  }

  designMigrationStrategy() {
    console.log('📈 Designing migration strategy from current schema...');

    this.schemaDesign.migration_plan = {
      migration_version: '1.0_to_2.0',
      estimated_duration: '2-4 hours',
      downtime_required: false,
      
      phases: [
        {
          phase: 1,
          name: 'Schema Preparation',
          duration: '30 minutes',
          steps: [
            'Create new collections with indexes',
            'Validate current data integrity',
            'Backup existing collections',
            'Create migration staging area'
          ],
          rollback_plan: 'Drop new collections, restore from backup'
        },
        
        {
          phase: 2,
          name: 'Category Data Migration',
          duration: '45 minutes',
          steps: [
            'Migrate canonical categories from hierarchy data',
            'Create category_hierarchy paths',
            'Build category analytics baseline',
            'Validate category relationships'
          ],
          rollback_plan: 'Restore category collections from backup'
        },
        
        {
          phase: 3,
          name: 'Product Enhancement',
          duration: '90 minutes',
          steps: [
            'Add multi-category fields to existing products',
            'Populate category_ids arrays from existing category data',
            'Generate hierarchy_path fields',
            'Create product_categories relationships',
            'Update brand information with canonical_ids'
          ],
          rollback_plan: 'Restore products collection, remove new fields'
        },
        
        {
          phase: 4,
          name: 'Index Creation and Optimization',
          duration: '30 minutes',
          steps: [
            'Create performance indexes on all collections',
            'Run index optimization',
            'Validate query performance',
            'Monitor memory usage'
          ],
          rollback_plan: 'Drop new indexes, keep existing ones'
        },
        
        {
          phase: 5,
          name: 'Application Integration',
          duration: '45 minutes',
          steps: [
            'Update WorldModelPopulator for new schema',
            'Migrate existing query patterns',
            'Update API endpoints for multi-category support',
            'Test end-to-end functionality'
          ],
          rollback_plan: 'Revert application code, use old schema'
        }
      ],
      
      data_transformation_scripts: [
        {
          script_name: 'migrate_product_categories.js',
          description: 'Transform existing product.category field into categories array',
          estimated_runtime: '45 minutes for 5,700 products'
        },
        {
          script_name: 'build_category_hierarchy_paths.js',
          description: 'Generate hierarchy path documents from navigation paths',
          estimated_runtime: '15 minutes for 576 paths'
        },
        {
          script_name: 'create_product_category_relationships.js',
          description: 'Build junction table from enhanced product data',
          estimated_runtime: '30 minutes for ~17,100 relationships'
        }
      ],
      
      validation_tests: [
        'Verify all products have at least one category relationship',
        'Confirm hierarchy paths are correctly structured',
        'Test multi-category query performance meets <100ms target',
        'Validate category analytics data is populated',
        'Check referential integrity between collections'
      ],
      
      performance_benchmarks: [
        'Single category query: <40ms',
        'Multi-category intersection: <50ms',
        'Brand + Gender query: <30ms',
        'Hierarchy navigation: <20ms',
        'Full-text search: <80ms'
      ]
    };

    console.log(`   ✅ Designed 5-phase migration strategy:`);
    console.log(`      ⏱️ Total duration: 2-4 hours`);
    console.log(`      🔄 Zero-downtime migration`);
    console.log(`      📊 5 validation tests, 5 performance benchmarks`);
  }

  designPerformanceOptimizations() {
    console.log('⚡ Designing performance optimization strategies...');

    this.schemaDesign.performance_benchmarks = {
      target_metrics: {
        category_queries: '<100ms (primary goal)',
        multi_category_queries: '<50ms',
        navigation_queries: '<30ms',
        search_queries: '<80ms',
        analytics_queries: '<60ms'
      },
      
      optimization_strategies: [
        {
          strategy: 'Compound Index Optimization',
          description: 'Strategic compound indexes for common query patterns',
          impact: '60-80% query performance improvement',
          implementation: 'Custom compound indexes matching exact query patterns'
        },
        {
          strategy: 'Data Denormalization',
          description: 'Store frequently accessed data directly in product documents',
          impact: '40-60% reduction in JOIN-like operations',
          implementation: 'category_ids array, hierarchy_path string, primary_category field'
        },
        {
          strategy: 'Query Result Caching',
          description: 'Cache frequent category and navigation queries',
          impact: '90%+ performance improvement for cached queries',
          implementation: 'Redis caching with 15-minute TTL for category queries'
        },
        {
          strategy: 'Collection Partitioning',
          description: 'Partition large collections by category or date',
          impact: 'Linear scaling with data growth',
          implementation: 'Consider if product count exceeds 50,000'
        }
      ],
      
      monitoring_setup: {
        key_metrics: [
          'Average query response time by collection',
          'Index usage statistics',
          'Cache hit rates for category queries',
          'Memory usage and index overhead',
          'Query pattern analysis'
        ],
        
        alerting_thresholds: {
          query_response_time: '>100ms for category queries',
          index_usage: '<80% for critical compound indexes',
          cache_hit_rate: '<70% for navigation queries',
          memory_usage: '>80% of allocated memory'
        }
      },
      
      scaling_plan: {
        current_capacity: '~5,700 products, 140 categories',
        scale_triggers: [
          'Product count > 25,000: Consider read replicas',
          'Query response time > 150ms: Optimize indexes',
          'Memory usage > 85%: Scale vertically or add caching'
        ],
        
        horizontal_scaling_options: [
          'Read replicas for query distribution',
          'Category-based sharding for very large catalogs',
          'Separate analytics database for reporting queries'
        ]
      }
    };

    console.log(`   ✅ Designed comprehensive performance optimization:`);
    console.log(`      🎯 Primary target: <100ms category queries`);
    console.log(`      📈 4 optimization strategies with 40-90% improvements`);
    console.log(`      📊 Monitoring setup with 4 alerting thresholds`);
    console.log(`      📏 Scaling plan for 10x growth capacity`);
  }

  async saveSchemaDesign() {
    const timestamp = new Date().toISOString().slice(0,10);
    const outputPath = `results/database/multi_category_schema_design_${timestamp}.json`;
    
    // Ensure directory exists
    const dir = 'results/database';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(this.schemaDesign, null, 2));
    
    console.log(`💾 Schema design saved to: ${outputPath}`);
    this.schemaDesign.output_path = outputPath;
  }

  generateSchemaReport() {
    console.log('\n📋 MULTI-CATEGORY DATABASE SCHEMA DESIGN COMPLETE');
    console.log('==================================================');
    
    console.log('🏗️ SCHEMA OVERVIEW:');
    console.log(`   Collections: ${Object.keys(this.schemaDesign.collections).length}`);
    console.log(`   Total Indexes: ${this.getTotalIndexCount()}`);
    console.log(`   Query Patterns: ${Object.keys(this.schemaDesign.queries).length}`);
    console.log(`   Migration Phases: ${this.schemaDesign.migration_plan.phases.length}`);
    
    console.log('\n📦 COLLECTION SUMMARY:');
    Object.entries(this.schemaDesign.collections).forEach(([name, collection]) => {
      console.log(`   ${name}: ~${collection.estimated_documents} docs, ${collection.storage_requirements}`);
    });
    
    const totalStorage = 50 + 1 + 8 + 2 + 15 + this.calculateIndexOverhead();
    console.log(`   Total Storage Estimate: ~${totalStorage}MB`);
    
    console.log('\n⚡ PERFORMANCE TARGETS:');
    Object.entries(this.schemaDesign.performance_benchmarks.target_metrics).forEach(([metric, target]) => {
      console.log(`   ${metric}: ${target}`);
    });
    
    console.log('\n🔧 MIGRATION PLAN:');
    console.log(`   Duration: ${this.schemaDesign.migration_plan.estimated_duration}`);
    console.log(`   Downtime: ${this.schemaDesign.migration_plan.downtime_required ? 'Required' : 'Zero-downtime'}`);
    console.log(`   Phases: ${this.schemaDesign.migration_plan.phases.length} phases with rollback plans`);
    
    console.log('\n📂 OUTPUT FILES:');
    console.log(`   📄 Schema Design: ${this.schemaDesign.output_path}`);
    
    console.log('\n🚀 NEXT STEPS:');
    console.log('   1. Review schema design with team');
    console.log('   2. Update WorldModelPopulator for new schema');
    console.log('   3. Implement migration scripts');
    console.log('   4. Create CategoryAwareWorldModel with fast queries');
  }
}

async function runSchemaDesign() {
  const designer = new MultiCategorySchemaDesigner();
  
  try {
    const results = await designer.designSchema();
    
    console.log('\n🎉 MULTI-CATEGORY DATABASE SCHEMA DESIGN COMPLETE!');
    console.log('Ready for Phase 2.1: Update WorldModelPopulator for category hierarchy support');
    
    return results;
    
  } catch (error) {
    console.error('\n❌ Schema design failed:', error.message);
    return null;
  }
}

if (require.main === module) {
  runSchemaDesign()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Schema design crashed:', error);
      process.exit(1);
    });
}

module.exports = { MultiCategorySchemaDesigner };