/**
 * MongoDB Atlas Connection Singleton
 * Follows MongoDB Atlas best practices for production deployments
 */

import { MongoClient, Db, ServerApiVersion } from 'mongodb';

interface MongoConfig {
  uri: string;
  database: string;
  maxPoolSize?: number;
  serverSelectionTimeoutMS?: number;
  socketTimeoutMS?: number;
}

class MongoService {
  private static instance: MongoService | null = null;
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private connecting: Promise<MongoClient> | null = null;
  private config: MongoConfig;

  private constructor(config: MongoConfig) {
    this.config = {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      ...config,
    };
  }

  /**
   * Get singleton instance of MongoService
   */
  static getInstance(config?: MongoConfig): MongoService {
    if (!MongoService.instance) {
      if (!config) {
        throw new Error('MongoService must be initialized with config on first use');
      }
      MongoService.instance = new MongoService(config);
    }
    return MongoService.instance;
  }

  /**
   * Get database connection with automatic reconnection
   */
  async getDb(): Promise<Db> {
    if (this.db && this.client && await this.isClientConnected()) {
      return this.db;
    }

    if (!this.connecting) {
      this.connecting = this.connect();
    }

    const client = await this.connecting;
    this.db = client.db(this.config.database);
    return this.db;
  }

  /**
   * Get MongoDB client with connection pooling
   */
  async getClient(): Promise<MongoClient> {
    if (this.client && await this.isClientConnected()) {
      return this.client;
    }

    if (!this.connecting) {
      this.connecting = this.connect();
    }

    return await this.connecting;
  }

  /**
   * Establish connection to MongoDB Atlas
   */
  private async connect(): Promise<MongoClient> {
    try {
      const client = new MongoClient(this.config.uri, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: false, // Disable strict mode to allow text indexes
          deprecationErrors: true,
        },
        maxPoolSize: this.config.maxPoolSize,
        serverSelectionTimeoutMS: this.config.serverSelectionTimeoutMS,
        socketTimeoutMS: this.config.socketTimeoutMS,
        retryWrites: true,
        w: 'majority',
      });

      await client.connect();
      
      // Verify connection with ping
      await client.db('admin').command({ ping: 1 });
      
      this.client = client;
      this.connecting = null; // Reset connecting promise after successful connection
      
      console.log(`✅ MongoDB Atlas connection established to database: ${this.config.database}`);
      
      return client;
    } catch (error) {
      this.connecting = null; // Reset on failure
      console.error('❌ MongoDB Atlas connection failed:', error);
      throw error;
    }
  }

  /**
   * Health check - ping MongoDB Atlas
   */
  async ping(): Promise<boolean> {
    try {
      const client = await this.getClient();
      await client.db('admin').command({ ping: 1 });
      return true;
    } catch (error) {
      console.error('MongoDB ping failed:', error);
      return false;
    }
  }

  /**
   * Check if client is connected (async helper method)
   */
  private async isClientConnected(): Promise<boolean> {
    if (!this.client) return false;
    
    try {
      // Use ping as a reliable connection test
      await this.client.db('admin').command({ ping: 1 });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get connection status (sync version for external use)
   */
  isConnected(): boolean {
    return !!(this.client);
  }

  /**
   * Close connection gracefully
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.connecting = null;
    }
  }

  /**
   * Get database name
   */
  getDatabaseName(): string {
    return this.config.database;
  }

  /**
   * Get connection statistics
   */
  getConnectionInfo() {
    return {
      database: this.config.database,
      connected: this.isConnected(),
      maxPoolSize: this.config.maxPoolSize,
      serverSelectionTimeoutMS: this.config.serverSelectionTimeoutMS,
      socketTimeoutMS: this.config.socketTimeoutMS,
    };
  }
}

// Convenience functions for common operations
let mongoService: MongoService | null = null;

/**
 * Initialize MongoDB service with configuration
 */
export function initializeMongoService(config: MongoConfig): MongoService {
  mongoService = MongoService.getInstance(config);
  return mongoService;
}

/**
 * Get database instance
 */
export async function getDb(): Promise<Db> {
  if (!mongoService) {
    throw new Error('MongoService not initialized. Call initializeMongoService() first.');
  }
  return await mongoService.getDb();
}

/**
 * Get MongoDB client
 */
export async function getClient(): Promise<MongoClient> {
  if (!mongoService) {
    throw new Error('MongoService not initialized. Call initializeMongoService() first.');
  }
  return await mongoService.getClient();
}

/**
 * Health check
 */
export async function ping(): Promise<boolean> {
  if (!mongoService) {
    return false;
  }
  return await mongoService.ping();
}

/**
 * Check connection status
 */
export function isConnected(): boolean {
  return mongoService ? mongoService.isConnected() : false;
}

/**
 * Get connection information
 */
export function getConnectionInfo() {
  return mongoService ? mongoService.getConnectionInfo() : null;
}

export default MongoService;