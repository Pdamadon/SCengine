/**
 * Database Migration Manager
 * Handles schema versioning, migrations, and rollback capabilities
 * Ensures zero-downtime deployments and data integrity
 */

const { MongoClient } = require('mongodb');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');
const { metrics } = require('../utils/metrics');

class MigrationManager {
  constructor(connectionUri, dbName) {
    this.connectionUri = connectionUri;
    this.dbName = dbName;
    this.client = null;
    this.db = null;
    this.migrationsCollection = 'schema_migrations';
    this.migrationsDir = path.join(__dirname, '..', '..', 'migrations');
    this.lockTimeout = 300000; // 5 minutes
  }

  /**
   * Initialize migration system
   */
  async initialize() {
    try {
      logger.info('MIGRATION_SYSTEM_INIT', {
        database: this.dbName,
        migrations_dir: this.migrationsDir,
      });

      await this.connect();
      await this.ensureMigrationsCollection();
      await this.ensureMigrationsDirectory();
      
      // Initialize migration metrics
      this.initializeMetrics();

      logger.info('MIGRATION_SYSTEM_READY', {
        database: this.dbName,
        current_version: await this.getCurrentVersion(),
      });

    } catch (error) {
      logger.error('MIGRATION_SYSTEM_INIT_FAILED', {
        error: error,
        database: this.dbName,
      });
      throw error;
    }
  }

  /**
   * Initialize migration metrics
   */
  initializeMetrics() {
    try {
      // Create migration-related metrics
      metrics.createCounter('database_migrations_applied', 'Number of database migrations applied', ['version']);
      metrics.createCounter('database_migrations_rolled_back', 'Number of database migrations rolled back', ['version']);
      metrics.createGauge('database_migration_lock_active', 'Whether database migration lock is active', []);
      
      logger.debug('Migration metrics initialized');
    } catch (error) {
      logger.warn('Failed to initialize migration metrics', { error: error.message });
    }
  }

  /**
   * Connect to MongoDB
   */
  async connect() {
    if (!this.client) {
      this.client = new MongoClient(this.connectionUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      await this.client.connect();
      this.db = this.client.db(this.dbName);

      // Set global connection for health checks
      global.mongoConnection = this.client;

      logger.info('MIGRATION_DB_CONNECTED', {
        database: this.dbName,
      });
    }
  }

  /**
   * Ensure migrations collection exists
   */
  async ensureMigrationsCollection() {
    const collections = await this.db.listCollections({ name: this.migrationsCollection }).toArray();

    if (collections.length === 0) {
      await this.db.createCollection(this.migrationsCollection);

      // Create indexes for efficient querying
      await this.db.collection(this.migrationsCollection).createIndexes([
        { key: { version: 1 }, unique: true },
        { key: { applied_at: 1 } },
        { key: { checksum: 1 } },
      ]);

      logger.info('MIGRATIONS_COLLECTION_CREATED', {
        collection: this.migrationsCollection,
      });
    }
  }

  /**
   * Ensure migrations directory exists
   */
  async ensureMigrationsDirectory() {
    try {
      await fs.access(this.migrationsDir);
    } catch (error) {
      await fs.mkdir(this.migrationsDir, { recursive: true });
      logger.info('MIGRATIONS_DIRECTORY_CREATED', {
        directory: this.migrationsDir,
      });
    }
  }

  /**
   * Get current database schema version
   */
  async getCurrentVersion() {
    const latestMigration = await this.db.collection(this.migrationsCollection)
      .findOne({}, { sort: { version: -1 } });

    return latestMigration ? latestMigration.version : '0.0.0';
  }

  /**
   * Get all applied migrations
   */
  async getAppliedMigrations() {
    return await this.db.collection(this.migrationsCollection)
      .find({}, { sort: { version: 1 } })
      .toArray();
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations() {
    const appliedVersions = new Set(
      (await this.getAppliedMigrations()).map(m => m.version),
    );

    const allMigrations = await this.loadMigrationFiles();

    return allMigrations.filter(migration => !appliedVersions.has(migration.version));
  }

  /**
   * Load migration files from disk
   */
  async loadMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsDir);
      const migrationFiles = files.filter(file => file.endsWith('.js'));

      const migrations = [];

      for (const file of migrationFiles) {
        const filePath = path.join(this.migrationsDir, file);
        const migration = require(filePath);

        // Extract version from filename (format: YYYYMMDD_HHMMSS_description.js)
        const versionMatch = file.match(/^(\d{8}_\d{6})_/);
        if (!versionMatch) {
          logger.warn('INVALID_MIGRATION_FILENAME', { file });
          continue;
        }

        const content = await fs.readFile(filePath, 'utf8');

        migrations.push({
          version: versionMatch[1],
          filename: file,
          filepath: filePath,
          description: migration.description || 'No description',
          up: migration.up,
          down: migration.down,
          checksum: this.calculateChecksum(content),
        });
      }

      return migrations.sort((a, b) => a.version.localeCompare(b.version));

    } catch (error) {
      logger.error('MIGRATION_FILES_LOAD_ERROR', { error });
      return [];
    }
  }

  /**
   * Run pending migrations
   */
  async migrate(targetVersion = null) {
    const correlationId = `migrate_${Date.now()}`;
    logger.startTimer('database_migration', correlationId);

    try {
      logger.info('MIGRATION_STARTED', {
        target_version: targetVersion || 'latest',
        correlation_id: correlationId,
      });

      // Acquire migration lock
      await this.acquireMigrationLock(correlationId);

      const pendingMigrations = await this.getPendingMigrations();

      // Filter to target version if specified
      const migrationsToRun = targetVersion
        ? pendingMigrations.filter(m => m.version <= targetVersion)
        : pendingMigrations;

      if (migrationsToRun.length === 0) {
        logger.info('NO_PENDING_MIGRATIONS', {
          current_version: await this.getCurrentVersion(),
          correlation_id: correlationId,
        });
        return { applied: [], skipped: 0 };
      }

      const appliedMigrations = [];

      for (const migration of migrationsToRun) {
        await this.applyMigration(migration, correlationId);
        appliedMigrations.push(migration);

        metrics.incrementCounter('database_migrations_applied', {
          version: migration.version,
        });
      }

      const duration = logger.endTimer('database_migration', correlationId, {
        migrations_applied: appliedMigrations.length,
      });

      logger.info('MIGRATION_COMPLETED', {
        migrations_applied: appliedMigrations.length,
        new_version: await this.getCurrentVersion(),
        duration_ms: Math.round(duration),
        correlation_id: correlationId,
      });

      return {
        applied: appliedMigrations,
        skipped: 0,
        duration_ms: Math.round(duration),
      };

    } catch (error) {
      logger.error('MIGRATION_FAILED', {
        error: error,
        correlation_id: correlationId,
      });

      metrics.trackError('MigrationError', 'database');
      throw error;

    } finally {
      await this.releaseMigrationLock(correlationId);
    }
  }

  /**
   * Apply single migration
   */
  async applyMigration(migration, correlationId) {
    const startTime = Date.now();

    logger.info('MIGRATION_APPLYING', {
      version: migration.version,
      description: migration.description,
      correlation_id: correlationId,
    });

    // Start transaction for atomic migration
    const session = this.client.startSession();

    try {
      await session.withTransaction(async () => {
        // Validate migration hasn't changed
        await this.validateMigrationChecksum(migration);

        // Run the migration
        await migration.up(this.db, session);

        // Record successful migration
        await this.db.collection(this.migrationsCollection).insertOne({
          version: migration.version,
          filename: migration.filename,
          description: migration.description,
          checksum: migration.checksum,
          applied_at: new Date(),
          applied_by: process.env.USER || 'system',
          duration_ms: Date.now() - startTime,
          correlation_id: correlationId,
        }, { session });
      });

      const duration = Date.now() - startTime;

      logger.info('MIGRATION_APPLIED', {
        version: migration.version,
        description: migration.description,
        duration_ms: duration,
        correlation_id: correlationId,
      });

    } catch (error) {
      logger.error('MIGRATION_APPLICATION_FAILED', {
        version: migration.version,
        description: migration.description,
        error: error,
        correlation_id: correlationId,
      });

      throw new Error(`Migration ${migration.version} failed: ${error.message}`);

    } finally {
      await session.endSession();
    }
  }

  /**
   * Rollback to specific version
   */
  async rollback(targetVersion, correlationId = null) {
    if (!correlationId) {
      correlationId = `rollback_${Date.now()}`;
    }

    logger.startTimer('database_rollback', correlationId);

    try {
      logger.info('ROLLBACK_STARTED', {
        target_version: targetVersion,
        correlation_id: correlationId,
      });

      // Acquire migration lock
      await this.acquireMigrationLock(correlationId);

      const currentVersion = await this.getCurrentVersion();

      if (currentVersion <= targetVersion) {
        logger.info('ROLLBACK_NOT_NEEDED', {
          current_version: currentVersion,
          target_version: targetVersion,
          correlation_id: correlationId,
        });
        return { rolled_back: [], current_version: currentVersion };
      }

      // Get migrations to rollback (in reverse order)
      const appliedMigrations = await this.getAppliedMigrations();
      const migrationsToRollback = appliedMigrations
        .filter(m => m.version > targetVersion)
        .reverse();

      const rolledBackMigrations = [];

      for (const migrationRecord of migrationsToRollback) {
        // Load the migration file to get the down() function
        const migrationFile = await this.loadMigrationFile(migrationRecord.filename);
        if (migrationFile) {
          await this.rollbackMigration(migrationRecord, migrationFile, correlationId);
          rolledBackMigrations.push(migrationRecord);

          metrics.incrementCounter('database_migrations_rolled_back', {
            version: migrationRecord.version,
          });
        }
      }

      const duration = logger.endTimer('database_rollback', correlationId, {
        migrations_rolled_back: rolledBackMigrations.length,
      });

      logger.info('ROLLBACK_COMPLETED', {
        migrations_rolled_back: rolledBackMigrations.length,
        new_version: await this.getCurrentVersion(),
        duration_ms: Math.round(duration),
        correlation_id: correlationId,
      });

      return {
        rolled_back: rolledBackMigrations,
        current_version: await this.getCurrentVersion(),
        duration_ms: Math.round(duration),
      };

    } catch (error) {
      logger.error('ROLLBACK_FAILED', {
        error: error,
        target_version: targetVersion,
        correlation_id: correlationId,
      });

      metrics.trackError('RollbackError', 'database');
      throw error;

    } finally {
      await this.releaseMigrationLock(correlationId);
    }
  }

  /**
   * Rollback single migration
   */
  async rollbackMigration(migrationRecord, migrationFile, correlationId) {
    const startTime = Date.now();

    logger.info('MIGRATION_ROLLING_BACK', {
      version: migrationRecord.version,
      description: migrationRecord.description,
      correlation_id: correlationId,
    });

    const session = this.client.startSession();

    try {
      await session.withTransaction(async () => {
        // Run the rollback
        if (migrationFile.down) {
          await migrationFile.down(this.db, session);
        } else {
          throw new Error(`No rollback method defined for migration ${migrationRecord.version}`);
        }

        // Remove migration record
        await this.db.collection(this.migrationsCollection).deleteOne({
          version: migrationRecord.version,
        }, { session });
      });

      const duration = Date.now() - startTime;

      logger.info('MIGRATION_ROLLED_BACK', {
        version: migrationRecord.version,
        description: migrationRecord.description,
        duration_ms: duration,
        correlation_id: correlationId,
      });

    } catch (error) {
      logger.error('MIGRATION_ROLLBACK_FAILED', {
        version: migrationRecord.version,
        description: migrationRecord.description,
        error: error,
        correlation_id: correlationId,
      });

      throw new Error(`Rollback of migration ${migrationRecord.version} failed: ${error.message}`);

    } finally {
      await session.endSession();
    }
  }

  /**
   * Validate migration hasn't changed since being applied
   */
  async validateMigrationChecksum(migration) {
    const existing = await this.db.collection(this.migrationsCollection)
      .findOne({ version: migration.version });

    if (existing && existing.checksum !== migration.checksum) {
      throw new Error(
        `Migration ${migration.version} has been modified since it was applied. ` +
        `Current checksum: ${migration.checksum}, Applied checksum: ${existing.checksum}`,
      );
    }
  }

  /**
   * Load single migration file
   */
  async loadMigrationFile(filename) {
    try {
      const filePath = path.join(this.migrationsDir, filename);
      delete require.cache[require.resolve(filePath)]; // Clear cache
      return require(filePath);
    } catch (error) {
      logger.warn('MIGRATION_FILE_LOAD_FAILED', {
        filename,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Acquire migration lock to prevent concurrent migrations
   */
  async acquireMigrationLock(correlationId) {
    const lockCollection = this.db.collection('migration_locks');
    const lockId = 'migration_lock';
    const lockExpiry = new Date(Date.now() + this.lockTimeout);

    try {
      await lockCollection.insertOne({
        _id: lockId,
        acquired_at: new Date(),
        acquired_by: correlationId,
        expires_at: lockExpiry,
        process_id: process.pid,
        hostname: require('os').hostname(),
      });

      logger.debug('MIGRATION_LOCK_ACQUIRED', {
        correlation_id: correlationId,
        expires_at: lockExpiry,
      });

    } catch (error) {
      if (error.code === 11000) { // Duplicate key error
        // Check if lock has expired
        const existingLock = await lockCollection.findOne({ _id: lockId });

        if (existingLock && existingLock.expires_at < new Date()) {
          // Lock has expired, remove it and try again
          await lockCollection.deleteOne({ _id: lockId });
          return await this.acquireMigrationLock(correlationId);
        }

        throw new Error(
          'Migration is already in progress. ' +
          `Lock held by: ${existingLock?.acquired_by}, expires: ${existingLock?.expires_at}`,
        );
      }

      throw error;
    }
  }

  /**
   * Release migration lock
   */
  async releaseMigrationLock(correlationId) {
    try {
      const result = await this.db.collection('migration_locks').deleteOne({
        _id: 'migration_lock',
        acquired_by: correlationId,
      });

      if (result.deletedCount === 1) {
        logger.debug('MIGRATION_LOCK_RELEASED', {
          correlation_id: correlationId,
        });
      } else {
        logger.warn('MIGRATION_LOCK_NOT_FOUND', {
          correlation_id: correlationId,
        });
      }

    } catch (error) {
      logger.error('MIGRATION_LOCK_RELEASE_FAILED', {
        error: error,
        correlation_id: correlationId,
      });
    }
  }

  /**
   * Get migration status
   */
  async getStatus() {
    try {
      const currentVersion = await this.getCurrentVersion();
      const appliedMigrations = await this.getAppliedMigrations();
      const pendingMigrations = await this.getPendingMigrations();

      // Check for lock
      const lockCollection = this.db.collection('migration_locks');
      const activeLock = await lockCollection.findOne({ _id: 'migration_lock' });

      return {
        current_version: currentVersion,
        applied_migrations: appliedMigrations.length,
        pending_migrations: pendingMigrations.length,
        is_locked: !!activeLock,
        lock_info: activeLock ? {
          acquired_by: activeLock.acquired_by,
          acquired_at: activeLock.acquired_at,
          expires_at: activeLock.expires_at,
        } : null,
        pending_list: pendingMigrations.map(m => ({
          version: m.version,
          description: m.description,
          filename: m.filename,
        })),
        last_applied: appliedMigrations.length > 0
          ? appliedMigrations[appliedMigrations.length - 1]
          : null,
      };

    } catch (error) {
      logger.error('MIGRATION_STATUS_ERROR', { error });
      throw error;
    }
  }

  /**
   * Create new migration file
   */
  async createMigration(description) {
    const timestamp = new Date().toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+/, '')
      .replace('T', '_');

    const filename = `${timestamp}_${description.toLowerCase().replace(/\s+/g, '_')}.js`;
    const filepath = path.join(this.migrationsDir, filename);

    const template = `/**
 * Migration: ${description}
 * Created: ${new Date().toISOString()}
 */

module.exports = {
  description: '${description}',
  
  /**
   * Apply migration
   * @param {Db} db - MongoDB database instance
   * @param {ClientSession} session - MongoDB transaction session
   */
  async up(db, session) {
    // TODO: Implement migration logic
    // Example:
    // await db.collection('products').createIndex(
    //   { category_id: 1, created_at: -1 },
    //   { session }
    // );
    
    throw new Error('Migration not implemented');
  },
  
  /**
   * Rollback migration
   * @param {Db} db - MongoDB database instance  
   * @param {ClientSession} session - MongoDB transaction session
   */
  async down(db, session) {
    // TODO: Implement rollback logic
    // Example:
    // await db.collection('products').dropIndex(
    //   { category_id: 1, created_at: -1 },
    //   { session }
    // );
    
    throw new Error('Rollback not implemented');
  }
};
`;

    await fs.writeFile(filepath, template, 'utf8');

    logger.info('MIGRATION_CREATED', {
      filename,
      filepath,
      description,
    });

    return {
      filename,
      filepath,
      description,
      version: timestamp,
    };
  }

  /**
   * Calculate file checksum for integrity validation
   */
  calculateChecksum(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generate checksum (alias for calculateChecksum to match test expectations)
   */
  generateChecksum(content) {
    return this.calculateChecksum(content);
  }

  /**
   * Force unlock migrations (remove migration lock)
   */
  async forceUnlock() {
    const metadataCollection = this.db.collection('migration_metadata');

    await metadataCollection.deleteOne({
      _id: 'migration_lock',
    });

    logger.info('Migration lock forcefully removed');
  }

  /**
   * List all migrations with their status
   */
  async listMigrations() {
    // Get all migration files
    const migrationFiles = await this.getMigrationFiles();

    // Get applied migrations from database
    const metadataCollection = this.db.collection('migration_metadata');
    const appliedMigrations = await metadataCollection
      .find({ _id: { $ne: 'migration_lock' } })
      .sort({ version: 1 })
      .toArray();

    const appliedMap = new Map(
      appliedMigrations.map(m => [m.version, m]),
    );

    // Combine file info with database status
    const migrations = migrationFiles.map(file => {
      const applied = appliedMap.get(file.version);
      return {
        version: file.version,
        description: file.description,
        filename: file.filename,
        applied_at: applied?.applied_at || null,
        duration_ms: applied?.duration_ms || null,
        checksum: applied?.checksum || null,
      };
    });

    return migrations.sort((a, b) => a.version.localeCompare(b.version));
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      global.mongoConnection = null;

      logger.info('MIGRATION_DB_DISCONNECTED');
    }
  }
}

module.exports = { MigrationManager };
