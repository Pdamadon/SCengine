/**
 * MongoDB Configuration
 * Handles connection settings and database configuration
 */

require('dotenv').config();

const { DATABASE_NAME } = require('../../config/database/mongodb_schema');

// MongoDB connection configuration
const mongoConfig = {
  // Connection string from environment or default
  uri: process.env.MONGODB_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017',
  
  // Database name
  database: DATABASE_NAME || 'ai_shopping_scraper',
  
  // Connection options
  options: {
    // Connection pool settings
    minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE) || 5,
    maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE) || 50,
    
    // Timeouts
    serverSelectionTimeoutMS: parseInt(process.env.MONGODB_TIMEOUT) || 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    
    // Retry settings
    retryWrites: true,
    retryReads: true,
    
    // Write concern for data consistency
    w: 'majority',
    wtimeoutMS: 10000,
    journal: true,
    
    // Read preference for scaling
    readPreference: 'primaryPreferred',
    
    // Monitoring
    monitorCommands: process.env.NODE_ENV === 'development',
    
    // Application name for monitoring
    appName: 'ai-shopping-scraper',
  },
  
  // Retry configuration
  retry: {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    factor: 2, // Exponential backoff factor
  },
  
  // Health check configuration
  healthCheck: {
    enabled: true,
    intervalMs: 60000, // Check every minute
    timeoutMs: 5000,
  }
};

// Performance optimization settings
const performanceConfig = {
  // Query performance targets (in milliseconds)
  targets: {
    singleCategoryQuery: 40,
    multiCategoryQuery: 50,
    brandGenderQuery: 30,
    hierarchyNavigation: 20,
    fullTextSearch: 80,
  },
  
  // Cache settings for frequent queries
  cache: {
    enabled: true,
    ttl: {
      navigation: 900, // 15 minutes
      categories: 3600, // 1 hour
      products: 300, // 5 minutes
    }
  },
  
  // Batch operation settings
  batch: {
    insertSize: 1000,
    updateSize: 500,
    deleteSize: 100,
  }
};

// Collection names
const collections = {
  // Core collections
  products: 'products',
  categories: 'categories',
  categoryHierarchy: 'category_hierarchy',
  productCategories: 'product_categories',
  categoryAnalytics: 'category_analytics',
  
  // Intelligence collections
  domains: 'domains',
  navigationMaps: 'navigation_maps',
  selectorLibraries: 'selector_libraries',
  
  // Tracking collections
  priceHistory: 'price_history',
  
  // Service collections
  serviceProviders: 'service_providers',
  availableAppointments: 'available_appointments'
};

// Validation function to check connection string
function validateConnectionString(uri) {
  try {
    const url = new URL(uri);
    
    // Check protocol
    if (!['mongodb:', 'mongodb+srv:'].includes(url.protocol)) {
      throw new Error('Invalid MongoDB protocol. Must be mongodb:// or mongodb+srv://');
    }
    
    // Check for database name in connection string
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      // Override database name if specified in connection string
      mongoConfig.database = pathParts[0];
    }
    
    return true;
  } catch (error) {
    console.error('Invalid MongoDB connection string:', error.message);
    return false;
  }
}

// Initialize configuration
function initializeConfig() {
  // Validate connection string
  if (!validateConnectionString(mongoConfig.uri)) {
    throw new Error('Invalid MongoDB connection configuration');
  }
  
  // Log configuration (without sensitive data)
  console.log('MongoDB Configuration:');
  console.log(`- Database: ${mongoConfig.database}`);
  console.log(`- Pool Size: ${mongoConfig.options.minPoolSize}-${mongoConfig.options.maxPoolSize}`);
  console.log(`- Read Preference: ${mongoConfig.options.readPreference}`);
  console.log(`- Retry Writes: ${mongoConfig.options.retryWrites}`);
  
  return mongoConfig;
}

module.exports = {
  mongoConfig: initializeConfig(),
  performanceConfig,
  collections,
  DATABASE_NAME,
};