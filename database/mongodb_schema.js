// AI Shopping Scraper - MongoDB Schema Definitions
// World model for site intelligence and domain knowledge

// =====================================================
// DOMAIN INTELLIGENCE COLLECTIONS
// =====================================================

// Core domain capabilities and intelligence
db.createCollection("domains", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["domain", "platform", "created_at"],
      properties: {
        domain: {
          bsonType: "string",
          description: "Domain name (e.g., glasswingshop.com)"
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
          properties: {
            navigation: {
              bsonType: "object",
              properties: {
                main_menu: { bsonType: "string" },
                categories: { bsonType: "string" },
                breadcrumbs: { bsonType: "string" },
                search_box: { bsonType: "string" },
                filters: { bsonType: "string" }
              }
            },
            products: {
              bsonType: "object",
              properties: {
                product_card: { bsonType: "string" },
                product_title: { bsonType: "string" },
                product_price: { bsonType: "string" },
                product_image: { bsonType: "string" },
                product_link: { bsonType: "string" },
                availability: { bsonType: "string" }
              }
            },
            cart: {
              bsonType: "object",
              properties: {
                add_to_cart_button: { bsonType: "string" },
                cart_icon: { bsonType: "string" },
                cart_count: { bsonType: "string" },
                cart_page: { bsonType: "string" },
                checkout_button: { bsonType: "string" }
              }
            },
            booking: {
              bsonType: "object",
              properties: {
                service_selector: { bsonType: "string" },
                calendar: { bsonType: "string" },
                time_slots: { bsonType: "string" },
                book_button: { bsonType: "string" }
              }
            }
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
        cart_flow: {
          bsonType: "object",
          properties: {
            steps: { bsonType: "array" },
            checkout_process: { bsonType: "object" },
            payment_methods: { bsonType: "array" },
            shipping_options: { bsonType: "array" },
            guest_checkout_available: { bsonType: "bool" }
          }
        },
        performance_metrics: {
          bsonType: "object",
          properties: {
            average_load_time: { bsonType: "number" },
            success_rate: { bsonType: "number" },
            last_successful_scrape: { bsonType: "date" },
            total_scrapes: { bsonType: "number" },
            error_count: { bsonType: "number" }
          }
        },
        created_at: { bsonType: "date" },
        updated_at: { bsonType: "date" }
      }
    }
  }
});

// Categories and collections within domains
db.createCollection("categories", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["domain", "category_path", "created_at"],
      properties: {
        domain: { bsonType: "string" },
        category_path: { bsonType: "string", description: "/collections/boots" },
        category_name: { bsonType: "string", description: "Boots" },
        parent_category: { bsonType: "string" },
        subcategories: { 
          bsonType: "array",
          items: { bsonType: "string" }
        },
        product_count: { bsonType: "number" },
        url_pattern: { bsonType: "string" },
        selectors: {
          bsonType: "object",
          properties: {
            category_link: { bsonType: "string" },
            product_grid: { bsonType: "string" },
            pagination: { bsonType: "string" },
            sort_options: { bsonType: "string" },
            filters: { bsonType: "object" }
          }
        },
        filters_available: {
          bsonType: "array",
          items: {
            bsonType: "object",
            properties: {
              name: { bsonType: "string" },
              type: { bsonType: "string", enum: ["price", "size", "color", "brand", "rating"] },
              options: { bsonType: "array" },
              selector: { bsonType: "string" }
            }
          }
        },
        last_scraped: { bsonType: "date" },
        created_at: { bsonType: "date" },
        updated_at: { bsonType: "date" }
      }
    }
  }
});

// Individual products with comprehensive data
db.createCollection("products", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["domain", "product_id", "title", "created_at"],
      properties: {
        domain: { bsonType: "string" },
        product_id: { bsonType: "string", description: "Unique product identifier" },
        url: { bsonType: "string" },
        title: { bsonType: "string" },
        description: { bsonType: "string" },
        brand: { bsonType: "string" },
        category: { bsonType: "string" },
        images: {
          bsonType: "array",
          items: { bsonType: "string" }
        },
        pricing: {
          bsonType: "object",
          properties: {
            current_price: { bsonType: "number" },
            original_price: { bsonType: "number" },
            currency: { bsonType: "string", default: "USD" },
            discount_percentage: { bsonType: "number" },
            sale_reason: { bsonType: "string" },
            price_selector: { bsonType: "string" }
          }
        },
        variants: {
          bsonType: "array",
          items: {
            bsonType: "object",
            properties: {
              variant_id: { bsonType: "string" },
              name: { bsonType: "string" },
              value: { bsonType: "string" },
              price: { bsonType: "number" },
              sku: { bsonType: "string" },
              availability: { bsonType: "string" },
              selector: { bsonType: "string" }
            }
          }
        },
        availability: {
          bsonType: "object",
          properties: {
            in_stock: { bsonType: "bool" },
            stock_count: { bsonType: "number" },
            availability_text: { bsonType: "string" },
            restock_date: { bsonType: "date" }
          }
        },
        specifications: {
          bsonType: "object",
          description: "Product-specific attributes (size, color, material, etc.)"
        },
        reviews: {
          bsonType: "object",
          properties: {
            average_rating: { bsonType: "number" },
            review_count: { bsonType: "number" },
            reviews_selector: { bsonType: "string" }
          }
        },
        selectors: {
          bsonType: "object",
          properties: {
            add_to_cart: { bsonType: "string" },
            variant_selector: { bsonType: "string" },
            quantity_input: { bsonType: "string" },
            buy_now: { bsonType: "string" }
          }
        },
        last_scraped: { bsonType: "date" },
        scrape_frequency: { bsonType: "string", enum: ["hourly", "daily", "weekly"] },
        created_at: { bsonType: "date" },
        updated_at: { bsonType: "date" }
      }
    }
  }
});

// Price history tracking for products
db.createCollection("price_history", {
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
        sale_reason: { bsonType: "string" },
        availability: { bsonType: "string" },
        timestamp: { bsonType: "date" }
      }
    }
  }
});

// =====================================================
// BOOKING AND SERVICE COLLECTIONS
// =====================================================

// Service providers and booking sites
db.createCollection("service_providers", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["domain", "service_type", "created_at"],
      properties: {
        domain: { bsonType: "string" },
        provider_name: { bsonType: "string" },
        service_type: { 
          bsonType: "string",
          enum: ["massage", "dental", "medical", "beauty", "fitness", "repair", "cleaning"]
        },
        location: {
          bsonType: "object",
          properties: {
            address: { bsonType: "string" },
            city: { bsonType: "string" },
            state: { bsonType: "string" },
            zip_code: { bsonType: "string" },
            coordinates: {
              bsonType: "object",
              properties: {
                lat: { bsonType: "number" },
                lng: { bsonType: "number" }
              }
            }
          }
        },
        services: {
          bsonType: "array",
          items: {
            bsonType: "object",
            properties: {
              service_name: { bsonType: "string" },
              duration_minutes: { bsonType: "number" },
              price: { bsonType: "number" },
              currency: { bsonType: "string" },
              description: { bsonType: "string" }
            }
          }
        },
        booking_system: {
          bsonType: "object",
          properties: {
            platform: { bsonType: "string" },
            online_booking_available: { bsonType: "bool" },
            phone_booking_required: { bsonType: "bool" },
            advance_booking_days: { bsonType: "number" }
          }
        },
        availability_patterns: {
          bsonType: "object",
          properties: {
            business_hours: { bsonType: "object" },
            blocked_days: { bsonType: "array" },
            typical_availability: { bsonType: "string" }
          }
        },
        selectors: {
          bsonType: "object",
          properties: {
            service_selector: { bsonType: "string" },
            calendar: { bsonType: "string" },
            time_slots: { bsonType: "string" },
            booking_form: { bsonType: "string" },
            confirmation_button: { bsonType: "string" }
          }
        },
        rating: { bsonType: "number" },
        review_count: { bsonType: "number" },
        last_scraped: { bsonType: "date" },
        created_at: { bsonType: "date" },
        updated_at: { bsonType: "date" }
      }
    }
  }
});

// Available appointments and time slots
db.createCollection("available_appointments", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["provider_id", "domain", "service_type", "appointment_time"],
      properties: {
        provider_id: { bsonType: "string" },
        domain: { bsonType: "string" },
        service_type: { bsonType: "string" },
        service_name: { bsonType: "string" },
        appointment_time: { bsonType: "date" },
        duration_minutes: { bsonType: "number" },
        price: { bsonType: "number" },
        currency: { bsonType: "string" },
        available: { bsonType: "bool" },
        booking_url: { bsonType: "string" },
        requirements: { bsonType: "string" },
        scraped_at: { bsonType: "date" },
        expires_at: { bsonType: "date" }
      }
    }
  }
});

// =====================================================
// NAVIGATION AND SITE INTELLIGENCE
// =====================================================

// Site navigation structures
db.createCollection("navigation_maps", {
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
});

// CSS selector libraries with reliability scores
db.createCollection("selector_libraries", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["domain", "selector", "element_type", "created_at"],
      properties: {
        domain: { bsonType: "string" },
        selector: { bsonType: "string" },
        element_type: { 
          bsonType: "string",
          enum: ["product", "price", "cart", "navigation", "search", "filter", "booking"]
        },
        purpose: { bsonType: "string" },
        reliability_score: { 
          bsonType: "number",
          minimum: 0,
          maximum: 1
        },
        usage_count: { bsonType: "number" },
        success_count: { bsonType: "number" },
        last_successful_use: { bsonType: "date" },
        last_failed_use: { bsonType: "date" },
        alternative_selectors: {
          bsonType: "array",
          items: { bsonType: "string" }
        },
        created_at: { bsonType: "date" },
        updated_at: { bsonType: "date" }
      }
    }
  }
});

// =====================================================
// INDEXES FOR PERFORMANCE
// =====================================================

// Domain indexes
db.domains.createIndex({ "domain": 1 }, { unique: true });
db.domains.createIndex({ "platform": 1 });
db.domains.createIndex({ "site_type": 1 });
db.domains.createIndex({ "intelligence_score": -1 });
db.domains.createIndex({ "updated_at": -1 });

// Category indexes
db.categories.createIndex({ "domain": 1, "category_path": 1 }, { unique: true });
db.categories.createIndex({ "domain": 1 });
db.categories.createIndex({ "product_count": -1 });
db.categories.createIndex({ "last_scraped": -1 });

// Product indexes
db.products.createIndex({ "domain": 1, "product_id": 1 }, { unique: true });
db.products.createIndex({ "domain": 1 });
db.products.createIndex({ "category": 1 });
db.products.createIndex({ "pricing.current_price": 1 });
db.products.createIndex({ "availability.in_stock": 1 });
db.products.createIndex({ "last_scraped": -1 });
db.products.createIndex({ "title": "text", "description": "text" }); // Text search

// Price history indexes
db.price_history.createIndex({ "product_id": 1, "timestamp": -1 });
db.price_history.createIndex({ "domain": 1, "timestamp": -1 });
db.price_history.createIndex({ "timestamp": -1 });

// Service provider indexes
db.service_providers.createIndex({ "domain": 1 }, { unique: true });
db.service_providers.createIndex({ "service_type": 1 });
db.service_providers.createIndex({ "location.city": 1, "location.state": 1 });
db.service_providers.createIndex({ "rating": -1 });

// Appointment indexes
db.available_appointments.createIndex({ "provider_id": 1, "appointment_time": 1 });
db.available_appointments.createIndex({ "service_type": 1, "appointment_time": 1 });
db.available_appointments.createIndex({ "appointment_time": 1 });
db.available_appointments.createIndex({ "available": 1 });
db.available_appointments.createIndex({ "expires_at": 1 }); // For cleanup

// Navigation indexes
db.navigation_maps.createIndex({ "domain": 1, "navigation_type": 1 });
db.navigation_maps.createIndex({ "reliability_score": -1 });

// Selector library indexes
db.selector_libraries.createIndex({ "domain": 1, "element_type": 1 });
db.selector_libraries.createIndex({ "selector": 1 });
db.selector_libraries.createIndex({ "reliability_score": -1 });
db.selector_libraries.createIndex({ "usage_count": -1 });

// =====================================================
// SAMPLE DATA INSERTION HELPERS
// =====================================================

// Sample domain document
const sampleDomain = {
  domain: "glasswingshop.com",
  platform: "shopify",
  site_type: "ecommerce",
  intelligence_score: 85,
  capabilities: {
    can_extract_products: true,
    can_extract_pricing: true,
    can_extract_variants: true,
    can_navigate_categories: true,
    can_add_to_cart: true,
    can_checkout: false,
    can_search: true,
    can_filter: true,
    can_book_appointments: false,
    can_check_availability: true
  },
  selectors: {
    navigation: {
      main_menu: ".site-nav",
      categories: ".site-nav__item",
      search_box: "#search-input"
    },
    products: {
      product_card: ".product-card",
      product_title: ".product-card__title",
      product_price: ".money",
      product_image: ".product-card__image img"
    },
    cart: {
      add_to_cart_button: ".btn--add-to-cart",
      cart_icon: ".cart-link",
      cart_count: ".cart-link__bubble"
    }
  },
  performance_metrics: {
    average_load_time: 2.5,
    success_rate: 0.92,
    total_scrapes: 145,
    error_count: 12
  },
  created_at: new Date(),
  updated_at: new Date()
};

// Insert sample data (uncomment to use)
// db.domains.insertOne(sampleDomain);