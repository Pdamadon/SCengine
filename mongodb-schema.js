/**
 * MongoDB Schema - Optimized Multi-Category Design
 * Version 2.0 - Sub-100ms Query Performance
 * 
 * This schema implements a sophisticated 4-level category hierarchy:
 * - Level 1: Gender (mens, womens, unisex)
 * - Level 2: Product Type (clothing, shoes, accessories)
 * - Level 3: Brand
 * - Level 4: Promotion (sale, new arrivals)
 * 
 * Optimized for:
 * - Sub-100ms category queries
 * - Multi-category product relationships
 * - Fast navigation with pre-computed paths
 * - Efficient brand and gender filtering
 */

// Database name
const DATABASE_NAME = 'ai_shopping_scraper';

// =====================================================
// PRODUCTS COLLECTION - Enhanced with Multi-Category Support
// =====================================================
const productsSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["product_id", "title", "created_at"],
      properties: {
        product_id: {
          bsonType: "string",
          description: "Unique product identifier from source"
        },
        site_product_id: {
          bsonType: "string",
          description: "Original site product ID"
        },
        title: {
          bsonType: "string",
          description: "Product title"
        },
        description: {
          bsonType: "string",
          description: "Product description"
        },
        description_html: {
          bsonType: "string",
          description: "HTML formatted description"
        },
        price: {
          bsonType: "number",
          description: "Current price in cents"
        },
        original_price: {
          bsonType: "number",
          description: "Original price before discounts"
        },
        currency: {
          bsonType: "string",
          description: "Price currency (default: USD)"
        },
        availability: {
          bsonType: "string",
          enum: ["in_stock", "out_of_stock", "pre_order", "limited_stock", "backorder"],
          description: "Stock status"
        },
        
        // Enhanced Stock and Inventory Information
        stock_info: {
          bsonType: "object",
          description: "Detailed stock and inventory data",
          properties: {
            total_quantity: { bsonType: "number" },
            low_stock_threshold: { bsonType: "number" },
            is_low_stock: { bsonType: "bool" },
            stock_message: { bsonType: "string" },
            restock_date: { bsonType: "date" },
            max_order_quantity: { bsonType: "number" },
            min_order_quantity: { bsonType: "number" },
            stock_locations: {
              bsonType: "array",
              items: {
                bsonType: "object",
                properties: {
                  location: { bsonType: "string" },
                  quantity: { bsonType: "number" },
                  available_for_pickup: { bsonType: "bool" }
                }
              }
            }
          }
        },
        
        // Multi-category support
        categories: {
          bsonType: "array",
          description: "Array of category relationships",
          items: {
            bsonType: "object",
            properties: {
              category_id: { bsonType: "string" },
              category_type: {
                bsonType: "string",
                enum: ["gender", "product_type", "brand", "promotion"]
              },
              category_name: { bsonType: "string" },
              category_path: { bsonType: "string" },
              is_primary: { bsonType: "bool" },
              hierarchy_level: { bsonType: "number", minimum: 1, maximum: 4 },
              confidence_score: { bsonType: "number", minimum: 0, maximum: 1 },
              source_context: { bsonType: "string" }
            }
          }
        },
        primary_category: {
          bsonType: "string",
          description: "Primary category for fast queries"
        },
        category_ids: {
          bsonType: "array",
          items: { bsonType: "string" },
          description: "Array of all category IDs for fast filtering"
        },
        hierarchy_path: {
          bsonType: "string",
          description: "Slash-separated hierarchy path"
        },
        
        // Brand information
        brand: {
          bsonType: "object",
          properties: {
            name: { bsonType: "string" },
            canonical_id: { bsonType: "string" },
            tier: {
              bsonType: "string",
              enum: ["premium", "established", "emerging"]
            }
          }
        },
        
        // Demographics
        gender_target: {
          bsonType: "array",
          items: {
            bsonType: "string",
            enum: ["mens", "womens", "unisex"]
          }
        },
        
        // Product attributes (enhanced with measurements and features)
        attributes: {
          bsonType: "object",
          properties: {
            color: { bsonType: "array", items: { bsonType: "string" } },
            sizes: { bsonType: "array", items: { bsonType: "string" } },
            materials: { bsonType: "array", items: { bsonType: "string" } },
            style_tags: { bsonType: "array", items: { bsonType: "string" } },
            features: { 
              bsonType: "array", 
              items: { bsonType: "string" },
              description: "Product features and benefits"
            },
            measurements: {
              bsonType: "object",
              description: "Product dimensions and measurements",
              properties: {
                weight: { bsonType: "string" },
                dimensions: { bsonType: "string" },
                length: { bsonType: "number" },
                width: { bsonType: "number" },
                height: { bsonType: "number" },
                unit: { bsonType: "string", enum: ["cm", "inch", "mm"] }
              }
            },
            care_instructions: { bsonType: "array", items: { bsonType: "string" } },
            specifications: { bsonType: "object" }
          }
        },
        
        // Enhanced Variants Structure (sizes, colors with individual availability)
        variants: {
          bsonType: "array",
          description: "Product variants with individual pricing and availability",
          items: {
            bsonType: "object",
            properties: {
              variant_id: { bsonType: "string", description: "Unique variant identifier" },
              type: { 
                bsonType: "string",
                enum: ["size", "color", "material", "style", "configuration"],
                description: "Type of variant"
              },
              value: { bsonType: "string", description: "Variant value (e.g., 'Large', 'Red')" },
              display_value: { bsonType: "string", description: "Display-friendly value" },
              price: { bsonType: "number", description: "Variant-specific price in cents" },
              original_price: { bsonType: "number", description: "Original price before discount" },
              availability: { bsonType: "bool", description: "Is this variant available" },
              stock_quantity: { bsonType: "number", description: "Remaining stock count" },
              sku: { bsonType: "string", description: "Stock keeping unit" },
              barcode: { bsonType: "string", description: "Product barcode/UPC" },
              images: {
                bsonType: "array",
                items: { bsonType: "string" },
                description: "Variant-specific image URLs"
              },
              attributes: {
                bsonType: "object",
                description: "Additional variant-specific attributes"
              },
              selector: { bsonType: "string", description: "DOM selector for this variant" },
              last_checked: { bsonType: "date", description: "Last availability check" }
            }
          }
        },
        
        // Images
        images: {
          bsonType: "array",
          items: {
            bsonType: "object",
            properties: {
              url: { bsonType: "string" },
              alt_text: { bsonType: "string" },
              type: {
                bsonType: "string",
                enum: ["primary", "secondary", "detail"]
              }
            }
          }
        },
        
        // Extraction selectors
        selectors: {
          bsonType: "object",
          properties: {
            title: { bsonType: "string" },
            price: { bsonType: "string" },
            add_to_cart: { bsonType: "string" },
            variant_selector: { bsonType: "string" },
            quantity_input: { bsonType: "string" }
          }
        },
        
        // Extraction strategy for real-time updates
        extraction_strategy: {
          bsonType: "object",
          description: "Proven selectors and methods for quick updates",
          properties: {
            quick_check: {
              bsonType: "object",
              properties: {
                price: {
                  bsonType: "object",
                  properties: {
                    selector: { bsonType: "string" },
                    alternatives: { bsonType: "array", items: { bsonType: "string" } },
                    last_success: { bsonType: "date" },
                    success_rate: { bsonType: "number" }
                  }
                },
                availability: {
                  bsonType: "object",
                  properties: {
                    selector: { bsonType: "string" },
                    success_indicators: { bsonType: "array", items: { bsonType: "string" } },
                    failure_indicators: { bsonType: "array", items: { bsonType: "string" } },
                    last_success: { bsonType: "date" }
                  }
                },
                stock_count: {
                  bsonType: "object",
                  properties: {
                    selector: { bsonType: "string" },
                    regex: { bsonType: "string" },
                    transform: { bsonType: "string" }
                  }
                }
              }
            },
            full_extraction: {
              bsonType: "object",
              description: "Complete field extraction selectors",
              properties: {
                title: { bsonType: "object" },
                description: { bsonType: "object" },
                images: { bsonType: "object" },
                variants: { bsonType: "object" }
              }
            },
            interaction_requirements: {
              bsonType: "object",
              properties: {
                requires_js: { bsonType: "bool" },
                wait_for: { bsonType: "array", items: { bsonType: "string" } },
                timeouts: { bsonType: "object" }
              }
            },
            platform_hints: {
              bsonType: "object",
              properties: {
                detected_platform: { bsonType: "string" },
                api_patterns: { bsonType: "array", items: { bsonType: "string" } },
                special_handling: { bsonType: "string" }
              }
            }
          }
        },
        
        // Quick check configuration for real-time updates
        quick_check_config: {
          bsonType: "object",
          properties: {
            enabled: { bsonType: "bool" },
            check_interval_ms: { bsonType: "number" },
            last_check: { bsonType: "date" },
            next_check: { bsonType: "date" },
            priority: { bsonType: "number" }
          }
        },
        
        // Update history tracking
        update_history: {
          bsonType: "array",
          items: {
            bsonType: "object",
            properties: {
              timestamp: { bsonType: "date" },
              update_type: {
                bsonType: "string",
                enum: ["full", "quick", "price_only", "availability_only"]
              },
              changes: { bsonType: "object" },
              success: { bsonType: "bool" },
              extraction_time_ms: { bsonType: "number" }
            }
          }
        },
        
        // Workflow Actions Schema (for automation steps)
        workflow_actions: {
          bsonType: "object",
          description: "Automation steps for product interaction",
          properties: {
            add_to_cart: {
              bsonType: "object",
              properties: {
                button_selector: { bsonType: "string" },
                requires_variant_selection: { bsonType: "bool" },
                success_indicator: { bsonType: "string" },
                pre_actions: { bsonType: "array", items: { bsonType: "string" } }
              }
            },
            checkout: {
              bsonType: "object",
              properties: {
                checkout_url: { bsonType: "string" },
                checkout_selector: { bsonType: "string" },
                guest_checkout_available: { bsonType: "bool" }
              }
            },
            size_selection: {
              bsonType: "object",
              properties: {
                selector_type: { 
                  bsonType: "string",
                  enum: ["dropdown", "buttons", "radio", "custom"]
                },
                selector: { bsonType: "string" },
                options_selector: { bsonType: "string" }
              }
            },
            quantity_selection: {
              bsonType: "object",
              properties: {
                input_selector: { bsonType: "string" },
                increment_selector: { bsonType: "string" },
                decrement_selector: { bsonType: "string" },
                max_quantity: { bsonType: "number" }
              }
            }
          }
        },
        
        // Reviews and Ratings
        reviews: {
          bsonType: "object",
          description: "Product reviews and ratings",
          properties: {
            average_rating: { bsonType: "number", minimum: 0, maximum: 5 },
            total_reviews: { bsonType: "number" },
            rating_distribution: {
              bsonType: "object",
              properties: {
                five_star: { bsonType: "number" },
                four_star: { bsonType: "number" },
                three_star: { bsonType: "number" },
                two_star: { bsonType: "number" },
                one_star: { bsonType: "number" }
              }
            },
            review_highlights: {
              bsonType: "array",
              items: {
                bsonType: "object",
                properties: {
                  author: { bsonType: "string" },
                  rating: { bsonType: "number" },
                  title: { bsonType: "string" },
                  comment: { bsonType: "string" },
                  date: { bsonType: "date" },
                  verified_purchase: { bsonType: "bool" }
                }
              }
            },
            reviews_selector: { bsonType: "string" }
          }
        },
        
        // Shipping and Fulfillment
        shipping: {
          bsonType: "object",
          description: "Shipping and delivery information",
          properties: {
            free_shipping: { bsonType: "bool" },
            free_shipping_threshold: { bsonType: "number" },
            shipping_cost: { bsonType: "number" },
            estimated_delivery_days: {
              bsonType: "object",
              properties: {
                min: { bsonType: "number" },
                max: { bsonType: "number" }
              }
            },
            express_shipping_available: { bsonType: "bool" },
            ships_from: { bsonType: "string" },
            shipping_restrictions: {
              bsonType: "array",
              items: { bsonType: "string" }
            },
            return_policy: {
              bsonType: "object",
              properties: {
                days: { bsonType: "number" },
                conditions: { bsonType: "string" },
                free_returns: { bsonType: "bool" }
              }
            }
          }
        },
        
        // SEO and Meta Data
        seo_data: {
          bsonType: "object",
          description: "SEO and meta information",
          properties: {
            meta_title: { bsonType: "string" },
            meta_description: { bsonType: "string" },
            meta_keywords: {
              bsonType: "array",
              items: { bsonType: "string" }
            },
            og_title: { bsonType: "string" },
            og_description: { bsonType: "string" },
            og_image: { bsonType: "string" },
            canonical_url: { bsonType: "string" },
            structured_data: { bsonType: "object" }
          }
        },
        
        // Promotional Information
        promotions: {
          bsonType: "object",
          description: "Active promotions and discounts",
          properties: {
            discount_percentage: { bsonType: "number" },
            discount_amount: { bsonType: "number" },
            promo_code: { bsonType: "string" },
            promo_description: { bsonType: "string" },
            sale_ends_at: { bsonType: "date" },
            bulk_discount: {
              bsonType: "array",
              items: {
                bsonType: "object",
                properties: {
                  quantity: { bsonType: "number" },
                  discount: { bsonType: "number" }
                }
              }
            },
            bundle_offers: {
              bsonType: "array",
              items: { bsonType: "string" }
            }
          }
        },
        
        // Extraction Metadata (quality scores, timing)
        extraction_metadata: {
          bsonType: "object",
          description: "Metadata about the extraction process",
          properties: {
            extraction_version: { bsonType: "string" },
            extraction_method: { 
              bsonType: "string",
              enum: ["playwright", "puppeteer", "api", "hybrid"]
            },
            quality_score: { 
              bsonType: "number", 
              minimum: 0, 
              maximum: 100,
              description: "Overall extraction quality percentage"
            },
            field_completeness: {
              bsonType: "object",
              description: "Percentage of fields successfully extracted",
              properties: {
                core_fields: { bsonType: "number" },
                optional_fields: { bsonType: "number" },
                variant_fields: { bsonType: "number" },
                media_fields: { bsonType: "number" }
              }
            },
            extraction_duration_ms: { bsonType: "number" },
            retry_count: { bsonType: "number" },
            errors_encountered: {
              bsonType: "array",
              items: {
                bsonType: "object",
                properties: {
                  field: { bsonType: "string" },
                  error: { bsonType: "string" },
                  timestamp: { bsonType: "date" }
                }
              }
            },
            platform_detected: { bsonType: "string" },
            confidence_scores: {
              bsonType: "object",
              properties: {
                title: { bsonType: "number" },
                price: { bsonType: "number" },
                availability: { bsonType: "number" },
                images: { bsonType: "number" }
              }
            }
          }
        },
        
        // Metadata
        slug: {
          bsonType: "string",
          description: "URL-friendly identifier"
        },
        tags: {
          bsonType: "array",
          items: { bsonType: "string" },
          description: "Search tags"
        },
        source_url: {
          bsonType: "string",
          description: "Original product URL"
        },
        domain: {
          bsonType: "string",
          description: "Source domain"
        },
        
        // Scraping context
        scrape_context: {
          bsonType: "object",
          properties: {
            category_context: { bsonType: "string" },
            discovery_method: { bsonType: "string" },
            batch_id: { bsonType: "string" }
          }
        },
        
        // Timestamps
        scraped_at: { bsonType: "date" },
        created_at: { bsonType: "date" },
        updated_at: { bsonType: "date" }
      }
    }
  }
};

// =====================================================
// CATEGORIES COLLECTION - Canonical Category Definitions
// =====================================================
const categoriesSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["domain", "canonical_id", "name", "hierarchy_level", "created_at"],
      properties: {
        domain: {
          bsonType: "string",
          description: "Domain that owns this category (e.g., gap.com)"
        },
        canonical_id: {
          bsonType: "string",
          description: "Domain-specific category identifier"
        },
        name: {
          bsonType: "string",
          description: "Category display name"
        },
        slug: {
          bsonType: "string",
          description: "URL-friendly name"
        },
        description: {
          bsonType: "string",
          description: "Category description"
        },
        hierarchy_level: {
          bsonType: "number",
          minimum: 1,
          maximum: 4,
          description: "Level in hierarchy (1-4)"
        },
        category_type: {
          bsonType: "string",
          enum: ["gender", "product_type", "brand", "promotion"],
          description: "Category classification"
        },
        parent_categories: {
          bsonType: "array",
          items: { bsonType: "string" },
          description: "Parent category canonical_ids"
        },
        child_categories: {
          bsonType: "array",
          items: { bsonType: "string" },
          description: "Child category canonical_ids"
        },
        url_path: {
          bsonType: "string",
          description: "Category URL path"
        },
        navigation_order: {
          bsonType: "number",
          description: "Display order in navigation"
        },
        gender_focus: {
          bsonType: "string",
          enum: ["mens", "womens", "unisex"],
          description: "Gender targeting"
        },
        product_focus: {
          bsonType: "string",
          enum: ["clothing", "shoes", "accessories", "jewelry", "lifestyle", "mixed"]
        },
        brand_tier: {
          bsonType: "string",
          enum: ["premium", "established", "emerging"],
          description: "For brand categories"
        },
        promotion_type: {
          bsonType: "string",
          enum: ["sale", "new_arrivals", "gift_guide", "limited_edition", "featured"]
        },
        estimated_products: {
          bsonType: "number",
          description: "Expected product count"
        },
        actual_product_count: {
          bsonType: "number",
          description: "Current product count"
        },
        status: {
          bsonType: "string",
          enum: ["active", "inactive", "archived"],
          description: "Category status"
        },
        created_at: { bsonType: "date" },
        updated_at: { bsonType: "date" }
      }
    }
  }
};

// =====================================================
// CATEGORY_HIERARCHY COLLECTION - Pre-computed Paths
// =====================================================
const categoryHierarchySchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["domain", "path_id", "full_path", "created_at"],
      properties: {
        domain: {
          bsonType: "string",
          description: "Domain that owns this hierarchy"
        },
        path_id: {
          bsonType: "string",
          description: "Domain-specific path identifier"
        },
        level_1_gender: {
          bsonType: "string",
          description: "Gender level category"
        },
        level_2_product_type: {
          bsonType: "string",
          description: "Product type level category"
        },
        level_3_brand: {
          bsonType: "string",
          description: "Brand level category"
        },
        level_4_promotion: {
          bsonType: "string",
          description: "Promotion level category"
        },
        full_path: {
          bsonType: "string",
          description: "Complete hierarchy path"
        },
        path_segments: {
          bsonType: "array",
          items: { bsonType: "string" },
          description: "Array of path segments"
        },
        estimated_products: {
          bsonType: "number",
          description: "Products in this path"
        },
        path_type: {
          bsonType: "string",
          enum: ["full", "partial", "brand_direct", "promotion_direct"]
        },
        navigation_priority: {
          bsonType: "number",
          description: "Display priority"
        },
        query_count: {
          bsonType: "number",
          description: "How often this path is queried"
        },
        last_queried: { bsonType: "date" },
        created_at: { bsonType: "date" }
      }
    }
  }
};

// =====================================================
// PRODUCT_CATEGORIES COLLECTION - Junction Table
// =====================================================
const productCategoriesSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["domain", "product_id", "category_id", "created_at"],
      properties: {
        domain: {
          bsonType: "string",
          description: "Domain that owns this relationship"
        },
        product_id: {
          bsonType: "string",
          description: "Reference to products.product_id"
        },
        category_id: {
          bsonType: "string",
          description: "Reference to categories.canonical_id"
        },
        relationship_type: {
          bsonType: "string",
          enum: ["primary", "secondary", "contextual"],
          description: "Type of relationship"
        },
        hierarchy_level: {
          bsonType: "number",
          minimum: 1,
          maximum: 4,
          description: "Category hierarchy level"
        },
        confidence_score: {
          bsonType: "number",
          minimum: 0,
          maximum: 1,
          description: "Classification confidence"
        },
        discovery_source: {
          bsonType: "string",
          description: "How relationship was discovered"
        },
        source_url: {
          bsonType: "string",
          description: "URL where relationship was found"
        },
        relevance_score: {
          bsonType: "number",
          minimum: 0,
          maximum: 1,
          description: "Relevance to category"
        },
        created_at: { bsonType: "date" }
      }
    }
  }
};

// =====================================================
// CATEGORY_ANALYTICS COLLECTION - Performance Tracking
// =====================================================
const categoryAnalyticsSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["domain", "category_id", "date"],
      properties: {
        domain: {
          bsonType: "string",
          description: "Domain that owns these analytics"
        },
        category_id: {
          bsonType: "string",
          description: "Reference to categories.canonical_id"
        },
        date: {
          bsonType: "date",
          description: "Analytics date"
        },
        product_count: {
          bsonType: "number",
          description: "Total products in category"
        },
        new_products_this_period: {
          bsonType: "number",
          description: "New products added"
        },
        active_products: {
          bsonType: "number",
          description: "Currently available products"
        },
        price_range: {
          bsonType: "object",
          properties: {
            min: { bsonType: "number" },
            max: { bsonType: "number" },
            average: { bsonType: "number" },
            median: { bsonType: "number" }
          }
        },
        query_metrics: {
          bsonType: "object",
          properties: {
            total_queries: { bsonType: "number" },
            average_response_time: { bsonType: "number" },
            cache_hit_rate: { bsonType: "number" }
          }
        },
        health_score: {
          bsonType: "number",
          minimum: 0,
          maximum: 100,
          description: "Overall category health"
        },
        created_at: { bsonType: "date" }
      }
    }
  }
};

// =====================================================
// DOMAINS COLLECTION - Site Intelligence and Capabilities
// =====================================================
const domainsSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["domain", "platform", "created_at"],
      properties: {
        domain: {
          bsonType: "string",
          description: "Domain name (e.g., gap.com)"
        },
        platform: {
          bsonType: "string",
          enum: ["shopify", "woocommerce", "magento", "custom", "booking", "directory"],
          description: "E-commerce platform or site type"
        },
        site_type: {
          bsonType: "string",
          enum: ["ecommerce", "booking", "directory", "comparison"],
          description: "Primary site function"
        },
        intelligence_score: {
          bsonType: "number",
          minimum: 0,
          maximum: 100,
          description: "Overall site intelligence score (0-100)"
        },
        capabilities: {
          bsonType: "object",
          properties: {
            can_extract_products: { bsonType: "bool" },
            can_extract_pricing: { bsonType: "bool" },
            can_extract_variants: { bsonType: "bool" },
            can_navigate_categories: { bsonType: "bool" },
            can_add_to_cart: { bsonType: "bool" },
            can_checkout: { bsonType: "bool" },
            can_search: { bsonType: "bool" },
            can_filter: { bsonType: "bool" },
            can_book_appointments: { bsonType: "bool" },
            can_check_availability: { bsonType: "bool" }
          }
        },
        selectors: {
          bsonType: "object",
          description: "Core selectors for this domain",
          properties: {
            navigation: { bsonType: "object" },
            products: { bsonType: "object" },
            cart: { bsonType: "object" },
            booking: { bsonType: "object" }
          }
        },
        navigation_map: {
          bsonType: "object",
          properties: {
            main_sections: { bsonType: "array" },
            dropdown_menus: { bsonType: "object" },
            footer_links: { bsonType: "array" },
            breadcrumb_pattern: { bsonType: "string" }
          }
        },
        created_at: { bsonType: "date" },
        updated_at: { bsonType: "date" },
        last_scraped: { bsonType: "date" }
      }
    }
  }
};

// =====================================================
// NAVIGATION MAPS COLLECTION - Site Structure Intelligence
// =====================================================
const navigationMapsSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["domain", "navigation_type", "created_at"],
      properties: {
        domain: { bsonType: "string" },
        navigation_type: { 
          bsonType: "string",
          enum: ["main_menu", "footer", "breadcrumbs", "sidebar", "dropdown"]
        },
        structure: {
          bsonType: "object",
          properties: {
            sections: {
              bsonType: "array",
              items: {
                bsonType: "object",
                properties: {
                  name: { bsonType: "string" },
                  url: { bsonType: "string" },
                  selector: { bsonType: "string" },
                  subsections: { bsonType: "array" }
                }
              }
            }
          }
        },
        clickable_elements: {
          bsonType: "array",
          items: {
            bsonType: "object",
            properties: {
              text: { bsonType: "string" },
              selector: { bsonType: "string" },
              url: { bsonType: "string" },
              element_type: { bsonType: "string" }
            }
          }
        },
        reliability_score: { bsonType: "number" },
        last_verified: { bsonType: "date" },
        created_at: { bsonType: "date" },
        updated_at: { bsonType: "date" }
      }
    }
  }
};

// =====================================================
// SELECTORS COLLECTION - Reusable Selectors with Reliability
// =====================================================
const selectorsSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["domain", "selector", "element_type", "created_at"],
      properties: {
        domain: { bsonType: "string" },
        page_type: { 
          bsonType: "string",
          enum: ["product", "category", "search", "home", "checkout", "booking"]
        },
        selector_type: { bsonType: "string" },
        selector: { bsonType: "string" },
        element_type: { 
          bsonType: "string",
          enum: ["product", "price", "cart", "navigation", "search", "filter", "booking", "availability", "title", "image", "variant", "text", "description", "button", "link", "input", "select"]
        },
        confidence_score: { 
          bsonType: "number",
          minimum: 0,
          maximum: 1
        },
        success_rate: { 
          bsonType: "number",
          minimum: 0,
          maximum: 1
        },
        usage_count: { bsonType: "number" },
        last_validated: { bsonType: "date" },
        last_used: { bsonType: "date" },
        created_at: { bsonType: "date" },
        alternative_selectors: {
          bsonType: "array",
          items: { bsonType: "string" }
        },
        context: { bsonType: "object" },
        active: { bsonType: "bool" }
      }
    }
  }
};

// =====================================================
// PRICE HISTORY COLLECTION - Track Price Changes Over Time
// =====================================================
const priceHistorySchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["product_id", "domain", "price", "timestamp"],
      properties: {
        product_id: { bsonType: "string" },
        domain: { bsonType: "string" },
        price: { bsonType: "number" },
        original_price: { bsonType: "number" },
        currency: { bsonType: "string" },
        discount_percentage: { bsonType: "number" },
        availability: { bsonType: "bool" },
        timestamp: { bsonType: "date" }
      }
    }
  }
};

// =====================================================
// SERVICE PROVIDERS COLLECTION - For Booking Sites
// =====================================================
const serviceProvidersSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["domain", "provider_id", "name", "created_at"],
      properties: {
        domain: { bsonType: "string" },
        provider_id: { bsonType: "string" },
        name: { bsonType: "string" },
        service_type: { 
          bsonType: "string",
          enum: ["medical", "wellness", "automotive", "home_services", "professional", "personal_care", "fitness"]
        },
        services_offered: {
          bsonType: "array",
          items: {
            bsonType: "object",
            properties: {
              service_name: { bsonType: "string" },
              duration_minutes: { bsonType: "number" },
              price: { bsonType: "number" },
              currency: { bsonType: "string" },
              booking_url: { bsonType: "string" }
            }
          }
        },
        location: {
          bsonType: "object",
          properties: {
            address: { bsonType: "string" },
            city: { bsonType: "string" },
            state: { bsonType: "string" },
            zip: { bsonType: "string" },
            coordinates: {
              bsonType: "object",
              properties: {
                lat: { bsonType: "number" },
                lng: { bsonType: "number" }
              }
            }
          }
        },
        availability_calendar: { bsonType: "object" },
        rating: { bsonType: "number" },
        review_count: { bsonType: "number" },
        created_at: { bsonType: "date" },
        updated_at: { bsonType: "date" }
      }
    }
  }
};

// =====================================================
// AVAILABLE APPOINTMENTS COLLECTION - Real-time Availability
// =====================================================
const availableAppointmentsSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["provider_id", "service_id", "date", "time_slot"],
      properties: {
        provider_id: { bsonType: "string" },
        service_id: { bsonType: "string" },
        domain: { bsonType: "string" },
        date: { bsonType: "date" },
        time_slot: {
          bsonType: "object",
          properties: {
            start_time: { bsonType: "string" },
            end_time: { bsonType: "string" },
            duration_minutes: { bsonType: "number" }
          }
        },
        available: { bsonType: "bool" },
        booking_url: { bsonType: "string" },
        price: { bsonType: "number" },
        last_checked: { bsonType: "date" },
        created_at: { bsonType: "date" }
      }
    }
  }
};

// =====================================================
// COLLECTION CREATION AND INDEX SETUP
// =====================================================

// Collection creation functions
async function createCollections(db) {
  // Core product and category collections
  await db.createCollection("products", productsSchema);
  await db.createCollection("categories", categoriesSchema);
  await db.createCollection("category_hierarchy", categoryHierarchySchema);
  await db.createCollection("product_categories", productCategoriesSchema);
  await db.createCollection("category_analytics", categoryAnalyticsSchema);
  
  // Domain intelligence collections
  await db.createCollection("domains", domainsSchema);
  await db.createCollection("navigation_maps", navigationMapsSchema);
  await db.createCollection("selectors", selectorsSchema);
  
  // Price tracking
  await db.createCollection("price_history", priceHistorySchema);
  
  // Service provider collections (for booking sites)
  await db.createCollection("service_providers", serviceProvidersSchema);
  await db.createCollection("available_appointments", availableAppointmentsSchema);
  
  console.log("All collections created successfully");
}

// Index creation for products collection
async function createProductIndexes(db) {
  const products = db.collection('products');
  
  // Unique compound index for domain-specific products
  await products.createIndex({ "domain": 1, "product_id": 1 }, { unique: true });
  await products.createIndex({ "domain": 1, "slug": 1 }, { unique: true, sparse: true });
  
  // Domain-scoped indexes for efficient queries
  await products.createIndex({ "domain": 1, "primary_category": 1 });
  await products.createIndex({ "domain": 1, "brand.canonical_id": 1 });
  await products.createIndex({ "domain": 1, "created_at": -1 });
  await products.createIndex({ "domain": 1, "price": 1 });
  await products.createIndex({ "domain": 1, "availability": 1 });
  
  // Compound indexes for common query patterns within domains
  await products.createIndex({ 
    "domain": 1,
    "category_ids": 1, 
    "availability": 1, 
    "price": 1 
  }, { name: "domain_category_availability_price" });
  
  await products.createIndex({ 
    "domain": 1,
    "brand.canonical_id": 1, 
    "gender_target": 1, 
    "availability": 1 
  }, { name: "domain_brand_gender_availability" });
  
  await products.createIndex({ 
    "domain": 1,
    "primary_category": 1, 
    "price": 1, 
    "created_at": -1 
  }, { name: "domain_category_price_recency" });
  
  await products.createIndex({ 
    "domain": 1,
    "hierarchy_path": 1, 
    "availability": 1, 
    "updated_at": -1 
  }, { name: "domain_hierarchy_availability_freshness" });
  
  // Text search index
  await products.createIndex(
    { "title": "text", "description": "text", "tags": "text" },
    { 
      weights: { title: 10, description: 5, tags: 1 },
      name: "product_text_search"
    }
  );
  
  // Multikey indexes for arrays
  await products.createIndex({ "category_ids": 1 });
  await products.createIndex({ "gender_target": 1 });
  await products.createIndex({ "attributes.style_tags": 1 });
  
  console.log("Product indexes created");
}

// Index creation for categories collection
async function createCategoryIndexes(db) {
  const categories = db.collection('categories');
  
  // Domain-scoped unique indexes
  await categories.createIndex({ "domain": 1, "canonical_id": 1 }, { unique: true });
  await categories.createIndex({ "domain": 1, "slug": 1 }, { unique: true, sparse: true });
  
  // Domain-scoped query indexes
  await categories.createIndex({ "domain": 1, "hierarchy_level": 1 });
  await categories.createIndex({ "domain": 1, "category_type": 1 });
  await categories.createIndex({ "domain": 1, "status": 1 });
  
  await categories.createIndex({ 
    "domain": 1,
    "hierarchy_level": 1, 
    "category_type": 1, 
    "navigation_order": 1 
  }, { name: "domain_hierarchy_navigation" });
  
  console.log("Category indexes created");
}

// Index creation for category_hierarchy collection
async function createHierarchyIndexes(db) {
  const hierarchy = db.collection('category_hierarchy');
  
  // Domain-scoped unique indexes
  await hierarchy.createIndex({ "domain": 1, "path_id": 1 }, { unique: true });
  await hierarchy.createIndex({ "domain": 1, "full_path": 1 }, { unique: true });
  
  // Domain-scoped hierarchy level indexes
  await hierarchy.createIndex({ "domain": 1, "level_1_gender": 1 });
  await hierarchy.createIndex({ "domain": 1, "level_3_brand": 1 });
  await hierarchy.createIndex({ "domain": 1, "level_4_promotion": 1 });
  
  await hierarchy.createIndex({ 
    "level_1_gender": 1, 
    "level_2_product_type": 1, 
    "level_3_brand": 1 
  }, { name: "multi_level_navigation" });
  
  console.log("Hierarchy indexes created");
}

// Index creation for product_categories junction table
async function createJunctionIndexes(db) {
  const junction = db.collection('product_categories');
  
  await junction.createIndex({ "product_id": 1 });
  await junction.createIndex({ "category_id": 1 });
  
  await junction.createIndex({ 
    "product_id": 1, 
    "category_id": 1 
  }, { unique: true });
  
  await junction.createIndex({ 
    "category_id": 1, 
    "relationship_type": 1, 
    "confidence_score": -1 
  }, { name: "category_relationships" });
  
  await junction.createIndex({ 
    "product_id": 1, 
    "hierarchy_level": 1, 
    "relationship_type": 1 
  }, { name: "product_hierarchy" });
  
  console.log("Junction table indexes created");
}

// Index creation for analytics collection
async function createAnalyticsIndexes(db) {
  const analytics = db.collection('category_analytics');
  
  await analytics.createIndex({ "category_id": 1, "date": -1 });
  await analytics.createIndex({ "date": -1 });
  
  console.log("Analytics indexes created");
}

// Index creation for domains collection
async function createDomainIndexes(db) {
  const domains = db.collection('domains');
  
  await domains.createIndex({ "domain": 1 }, { unique: true });
  await domains.createIndex({ "platform": 1 });
  await domains.createIndex({ "site_type": 1 });
  await domains.createIndex({ "intelligence_score": -1 });
  await domains.createIndex({ "updated_at": -1 });
  
  console.log("Domain indexes created");
}

// Index creation for navigation maps
async function createNavigationIndexes(db) {
  const navMaps = db.collection('navigation_maps');
  
  await navMaps.createIndex({ "domain": 1, "navigation_type": 1 });
  await navMaps.createIndex({ "domain": 1 });
  await navMaps.createIndex({ "last_verified": -1 });
  
  console.log("Navigation indexes created");
}

// Index creation for selectors (renamed from selector_libraries)
async function createSelectorIndexes(db) {
  const selectors = db.collection('selectors');
  
  await selectors.createIndex({ "domain": 1, "selector_type": 1, "selector": 1 }, { unique: true });
  await selectors.createIndex({ "domain": 1, "page_type": 1 });
  await selectors.createIndex({ "confidence_score": -1 });
  await selectors.createIndex({ "element_type": 1 });
  
  console.log("Selector indexes created");
}

// Index creation for price history
async function createPriceHistoryIndexes(db) {
  const priceHistory = db.collection('price_history');
  
  await priceHistory.createIndex({ "product_id": 1, "timestamp": -1 });
  await priceHistory.createIndex({ "domain": 1, "timestamp": -1 });
  await priceHistory.createIndex({ "timestamp": -1 });
  
  console.log("Price history indexes created");
}

// Index creation for service providers
async function createServiceProviderIndexes(db) {
  const providers = db.collection('service_providers');
  
  await providers.createIndex({ "domain": 1, "provider_id": 1 }, { unique: true });
  await providers.createIndex({ "service_type": 1 });
  await providers.createIndex({ "location.city": 1, "location.state": 1 });
  await providers.createIndex({ "rating": -1 });
  
  console.log("Service provider indexes created");
}

// Index creation for appointments
async function createAppointmentIndexes(db) {
  const appointments = db.collection('available_appointments');
  
  await appointments.createIndex({ "provider_id": 1, "date": 1 });
  await appointments.createIndex({ "service_id": 1, "date": 1 });
  await appointments.createIndex({ "date": 1, "available": 1 });
  await appointments.createIndex({ "last_checked": -1 });
  
  console.log("Appointment indexes created");
}

// Main setup function
async function setupDatabase(db) {
  try {
    console.log('🏗️ Creating collections with validation schemas...');
    // Create all collections
    await createCollections(db);
    
    console.log('📍 Creating performance indexes...');
    // Create all indexes for core collections
    await createProductIndexes(db);
    await createCategoryIndexes(db);
    await createHierarchyIndexes(db);
    await createJunctionIndexes(db);
    await createAnalyticsIndexes(db);
    
    // Create indexes for intelligence collections
    await createDomainIndexes(db);
    await createNavigationIndexes(db);
    await createSelectorIndexes(db);
    
    // Create indexes for tracking collections
    await createPriceHistoryIndexes(db);
    
    // Create indexes for service collections
    await createServiceProviderIndexes(db);
    await createAppointmentIndexes(db);
    
    console.log("MongoDB schema setup completed successfully!");
    
    // Print performance expectations
    console.log("\nExpected Query Performance:");
    console.log("- Single category query: <40ms");
    console.log("- Multi-category intersection: <50ms");
    console.log("- Brand + Gender query: <30ms");
    console.log("- Hierarchy navigation: <20ms");
    console.log("- Full-text search: <80ms");
    
  } catch (error) {
    console.error("Error setting up database:", error);
    throw error;
  }
}

// Export for use in other modules
module.exports = {
  DATABASE_NAME,
  // Core schemas
  productsSchema,
  categoriesSchema,
  categoryHierarchySchema,
  productCategoriesSchema,
  categoryAnalyticsSchema,
  // Intelligence schemas
  domainsSchema,
  navigationMapsSchema,
  selectorsSchema,
  // Tracking schemas
  priceHistorySchema,
  // Service schemas
  serviceProvidersSchema,
  availableAppointmentsSchema,
  // Setup functions
  setupDatabase,
  createCollections,
  // Index creation functions
  createProductIndexes,
  createCategoryIndexes,
  createHierarchyIndexes,
  createJunctionIndexes,
  createAnalyticsIndexes,
  createDomainIndexes,
  createNavigationIndexes,
  createSelectorIndexes,
  createPriceHistoryIndexes,
  createServiceProviderIndexes,
  createAppointmentIndexes
};