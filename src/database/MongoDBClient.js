/**
 * MongoDB Client Singleton
 * Manages MongoDB connection with retry logic and connection pooling
 */

const { MongoClient } = require('mongodb');
const { mongoConfig, collections } = require('../config/mongodb');
const { setupDatabase } = require('../../config/database/mongodb_schema');

class MongoDBClient {
  constructor() {
    this.client = null;
    this.db = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.healthCheckInterval = null;
    
    // Collections references for quick access
    this.collections = {};
    
    // Connection promise to prevent multiple connection attempts
    this.connectionPromise = null;
  }

  /**
   * Connect to MongoDB with retry logic
   */
  async connect() {
    // If already connecting, return the existing promise
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    
    // If already connected, return the database
    if (this.isConnected && this.db) {
      return this.db;
    }
    
    // Start new connection attempt
    this.connectionPromise = this._attemptConnection();
    
    try {
      await this.connectionPromise;
      return this.db;
    } finally {
      this.connectionPromise = null;
    }
  }

  /**
   * Internal connection method with retry logic
   */
  async _attemptConnection() {
    const { retry } = mongoConfig;
    let lastError;
    
    while (this.connectionAttempts < retry.maxAttempts) {
      try {
        this.connectionAttempts++;
        
        console.log(`MongoDB connection attempt ${this.connectionAttempts}/${retry.maxAttempts}...`);
        
        // Create MongoDB client
        this.client = new MongoClient(mongoConfig.uri, mongoConfig.options);
        
        // Connect to MongoDB
        await this.client.connect();
        
        // Get database reference
        this.db = this.client.db(mongoConfig.database);
        
        // Test the connection
        await this.db.admin().ping();
        
        // Initialize collections references
        await this._initializeCollections();
        
        // Set up event handlers
        this._setupEventHandlers();
        
        // Start health monitoring if enabled
        if (mongoConfig.healthCheck.enabled) {
          this._startHealthMonitoring();
        }
        
        this.isConnected = true;
        this.connectionAttempts = 0; // Reset for future reconnection attempts
        
        console.log(`✅ MongoDB connected successfully to database: ${mongoConfig.database}`);
        
        // Check if collections exist, create if needed
        await this._ensureCollectionsExist();
        
        return this.db;
        
      } catch (error) {
        lastError = error;
        console.error(`MongoDB connection attempt ${this.connectionAttempts} failed:`, error.message);
        
        // Close any partial connection
        if (this.client) {
          try {
            await this.client.close();
          } catch (closeError) {
            // Ignore close errors
          }
          this.client = null;
        }
        
        // Wait before retrying (exponential backoff)
        if (this.connectionAttempts < retry.maxAttempts) {
          const delay = Math.min(
            retry.initialDelayMs * Math.pow(retry.factor, this.connectionAttempts - 1),
            retry.maxDelayMs
          );
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // All attempts failed
    throw new Error(`Failed to connect to MongoDB after ${retry.maxAttempts} attempts: ${lastError.message}`);
  }

  /**
   * Initialize collection references for quick access
   */
  async _initializeCollections() {
    for (const [key, name] of Object.entries(collections)) {
      this.collections[key] = this.db.collection(name);
    }
  }

  /**
   * Ensure all required collections exist
   */
  async _ensureCollectionsExist() {
    try {
      const existingCollections = await this.db.listCollections().toArray();
      const existingNames = new Set(existingCollections.map(c => c.name));
      
      const requiredCollections = Object.values(collections);
      const missingCollections = requiredCollections.filter(name => !existingNames.has(name));
      
      if (missingCollections.length > 0) {
        console.log(`Creating ${missingCollections.length} missing collections...`);
        
        // Use the schema setup function to create collections with proper validation
        await setupDatabase(this.db);
        
        console.log('✅ All collections created with indexes');
      } else {
        console.log('✅ All required collections already exist');
      }
    } catch (error) {
      console.error('Error ensuring collections exist:', error);
      // Non-fatal error - collections might already exist
    }
  }

  /**
   * Set up MongoDB event handlers
   */
  _setupEventHandlers() {
    this.client.on('serverOpening', () => {
      console.log('MongoDB server connection opened');
    });
    
    this.client.on('serverClosed', () => {
      console.log('MongoDB server connection closed');
    });
    
    this.client.on('error', (error) => {
      console.error('MongoDB client error:', error);
      this.isConnected = false;
    });
    
    this.client.on('timeout', () => {
      console.error('MongoDB client timeout');
    });
    
    this.client.on('close', () => {
      console.log('MongoDB client closed');
      this.isConnected = false;
    });
  }

  /**
   * Start health monitoring
   */
  _startHealthMonitoring() {
    const { healthCheck } = mongoConfig;
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        const start = Date.now();
        await this.db.admin().ping();
        const duration = Date.now() - start;
        
        if (duration > healthCheck.timeoutMs) {
          console.warn(`MongoDB health check slow: ${duration}ms`);
        }
      } catch (error) {
        console.error('MongoDB health check failed:', error.message);
        this.isConnected = false;
        
        // Attempt reconnection
        this.reconnect().catch(console.error);
      }
    }, healthCheck.intervalMs);
  }

  /**
   * Reconnect to MongoDB
   */
  async reconnect() {
    console.log('Attempting to reconnect to MongoDB...');
    
    // Reset connection state
    this.isConnected = false;
    this.connectionAttempts = 0;
    
    // Close existing connection if any
    await this.disconnect();
    
    // Reconnect
    return this.connect();
  }

  /**
   * Get database instance
   */
  getDatabase() {
    if (!this.isConnected || !this.db) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }
    return this.db;
  }

  /**
   * Get collection by name
   */
  getCollection(name) {
    if (!this.isConnected) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }
    
    // Check if it's a known collection
    const collectionKey = Object.keys(collections).find(key => collections[key] === name);
    if (collectionKey && this.collections[collectionKey]) {
      return this.collections[collectionKey];
    }
    
    // Return collection even if not in predefined list
    return this.db.collection(name);
  }

  /**
   * Get multiple collections
   */
  getCollections() {
    if (!this.isConnected) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }
    return this.collections;
  }

  /**
   * Execute a transaction
   */
  async withTransaction(callback) {
    if (!this.isConnected) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }
    
    const session = this.client.startSession();
    
    try {
      const result = await session.withTransaction(callback);
      return result;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Gracefully disconnect from MongoDB
   */
  async disconnect() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.client) {
      try {
        await this.client.close();
        console.log('MongoDB disconnected successfully');
      } catch (error) {
        console.error('Error disconnecting from MongoDB:', error);
      }
      
      this.client = null;
      this.db = null;
      this.isConnected = false;
      this.collections = {};
    }
  }

  /**
   * Check if connected
   */
  isConnectedToDatabase() {
    return this.isConnected && this.client && this.db;
  }

  /**
   * Get connection statistics
   */
  async getStats() {
    if (!this.isConnected) {
      return { connected: false };
    }
    
    try {
      const stats = await this.db.stats();
      const serverStatus = await this.db.admin().serverStatus();
      
      return {
        connected: true,
        database: mongoConfig.database,
        collections: stats.collections,
        dataSize: stats.dataSize,
        indexSize: stats.indexSize,
        connections: serverStatus.connections,
        uptime: serverStatus.uptime,
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }
}

// Create singleton instance
const mongoDBClient = new MongoDBClient();

// Export singleton
module.exports = mongoDBClient;