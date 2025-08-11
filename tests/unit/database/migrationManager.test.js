/**
 * Migration Manager Tests
 * Tests for database schema migration and rollback functionality
 */

const { MigrationManager } = require('../../../src/database/migrationManager');
const { logger } = require('../../../src/utils/logger');

// Mock MongoDB
jest.mock('mongodb', () => ({
  MongoClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(true),
    close: jest.fn().mockResolvedValue(true),
    db: jest.fn(() => ({
      collection: jest.fn(() => ({
        findOne: jest.fn(),
        updateOne: jest.fn(),
        insertOne: jest.fn(),
        find: jest.fn(() => ({
          sort: jest.fn(() => ({
            toArray: jest.fn().mockResolvedValue([])
          }))
        })),
        createIndex: jest.fn().mockResolvedValue({ acknowledged: true }),
        drop: jest.fn().mockResolvedValue(true),
        deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 })
      })),
      admin: jest.fn(() => ({
        ping: jest.fn().mockResolvedValue({ ok: 1 })
      }))
    })),
    startSession: jest.fn(() => ({
      withTransaction: jest.fn((callback) => callback()),
      endSession: jest.fn()
    }))
  }))
}));

// Mock filesystem operations
jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
    readFile: jest.fn(),
    access: jest.fn()
  }
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    startTimer: jest.fn(),
    endTimer: jest.fn(),
    logTiming: jest.fn()
  }
}));

describe('MigrationManager', () => {
  let migrationManager;
  let mockClient;
  let mockDb;
  let mockCollection;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock database objects
    mockCollection = {
      findOne: jest.fn(),
      updateOne: jest.fn(),
      insertOne: jest.fn(),
      find: jest.fn(() => ({
        sort: jest.fn(() => ({
          toArray: jest.fn().mockResolvedValue([])
        }))
      })),
      createIndex: jest.fn().mockResolvedValue({ acknowledged: true }),
      drop: jest.fn().mockResolvedValue(true),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 })
    };
    
    mockDb = {
      collection: jest.fn(() => mockCollection),
      admin: jest.fn(() => ({
        ping: jest.fn().mockResolvedValue({ ok: 1 })
      }))
    };
    
    mockClient = {
      connect: jest.fn().mockResolvedValue(true),
      close: jest.fn().mockResolvedValue(true),
      db: jest.fn(() => mockDb),
      startSession: jest.fn(() => ({
        withTransaction: jest.fn((callback) => callback()),
        endSession: jest.fn()
      }))
    };
    
    const { MongoClient } = require('mongodb');
    MongoClient.mockReturnValue(mockClient);
    
    migrationManager = new MigrationManager('mongodb://localhost:27017', 'test_db');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('initialization', () => {
    test('should initialize connection and create metadata collection', async () => {
      await migrationManager.initialize();
      
      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockDb.collection).toHaveBeenCalledWith('migration_metadata');
      expect(mockCollection.createIndex).toHaveBeenCalledWith({ version: 1 }, { unique: true });
    });

    test('should handle initialization errors gracefully', async () => {
      mockClient.connect.mockRejectedValueOnce(new Error('Connection failed'));
      
      await expect(migrationManager.initialize()).rejects.toThrow('Connection failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Migration manager initialization failed',
        expect.objectContaining({ error: 'Connection failed' })
      );
    });
  });

  describe('status checking', () => {
    beforeEach(() => {
      migrationManager.client = mockClient;
      migrationManager.db = mockDb;
    });

    test('should return current migration status', async () => {
      // Mock latest applied migration
      mockCollection.findOne.mockResolvedValueOnce({
        version: '20250811_120000',
        description: 'Test migration',
        applied_at: new Date(),
        checksum: 'abc123'
      });

      // Mock migration count
      mockCollection.find.mockReturnValueOnce({
        sort: jest.fn(() => ({
          toArray: jest.fn().mockResolvedValue([
            { version: '20250811_120000', applied_at: new Date() },
            { version: '20250811_130000', applied_at: null }
          ])
        }))
      });

      const status = await migrationManager.getStatus();

      expect(status).toEqual({
        current_version: '20250811_120000',
        applied_migrations: 1,
        pending_migrations: 1,
        is_locked: false,
        lock_info: null,
        last_applied: expect.objectContaining({
          version: '20250811_120000'
        }),
        pending_list: expect.arrayContaining([
          expect.objectContaining({ version: '20250811_130000' })
        ])
      });
    });

    test('should detect migration lock', async () => {
      const lockExpiry = new Date(Date.now() + 10000); // Future date
      
      mockCollection.findOne
        .mockResolvedValueOnce(null) // No applied migrations
        .mockResolvedValueOnce({ // Lock info
          _id: 'migration_lock',
          acquired_by: 'test-process',
          acquired_at: new Date(),
          expires_at: lockExpiry
        });

      const status = await migrationManager.getStatus();

      expect(status.is_locked).toBe(true);
      expect(status.lock_info).toEqual(expect.objectContaining({
        acquired_by: 'test-process'
      }));
    });
  });

  describe('migration execution', () => {
    beforeEach(() => {
      migrationManager.client = mockClient;
      migrationManager.db = mockDb;
      
      // Mock file system to return test migration files
      const fs = require('fs');
      fs.promises.readdir.mockResolvedValue(['20250811_120000_test.js']);
      fs.promises.readFile.mockResolvedValue(`
        module.exports = {
          description: 'Test migration',
          async up(db, client) {
            await db.createCollection('test_collection');
          },
          async down(db, client) {
            await db.collection('test_collection').drop();
          }
        };
      `);
    });

    test('should apply pending migrations successfully', async () => {
      // Mock no applied migrations
      mockCollection.findOne.mockResolvedValue(null);
      mockCollection.find.mockReturnValue({
        sort: jest.fn(() => ({
          toArray: jest.fn().mockResolvedValue([])
        }))
      });

      const result = await migrationManager.migrate();

      expect(result.success).toBe(true);
      expect(result.applied_migrations).toHaveLength(1);
      expect(result.applied_migrations[0].version).toBe('20250811_120000_test');
      expect(mockCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '20250811_120000_test',
          description: 'Test migration',
          checksum: expect.any(String),
          applied_at: expect.any(Date)
        })
      );
    });

    test('should handle migration errors gracefully', async () => {
      // Mock no applied migrations
      mockCollection.findOne.mockResolvedValue(null);
      mockCollection.find.mockReturnValue({
        sort: jest.fn(() => ({
          toArray: jest.fn().mockResolvedValue([])
        }))
      });

      // Mock migration file that throws error
      const fs = require('fs');
      fs.promises.readFile.mockResolvedValueOnce(`
        module.exports = {
          description: 'Failing migration',
          async up(db, client) {
            throw new Error('Migration failed');
          },
          async down(db, client) {}
        };
      `);

      const result = await migrationManager.migrate();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Migration failed');
      expect(result.failed_migration).toEqual(
        expect.objectContaining({ version: '20250811_120000_test' })
      );
    });

    test('should respect migration locks', async () => {
      const lockExpiry = new Date(Date.now() + 10000);
      
      mockCollection.findOne
        .mockResolvedValueOnce(null) // No current version
        .mockResolvedValueOnce({ // Active lock
          _id: 'migration_lock',
          acquired_by: 'other-process',
          expires_at: lockExpiry
        });

      const result = await migrationManager.migrate();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Migration is locked by another process');
    });
  });

  describe('rollback execution', () => {
    beforeEach(() => {
      migrationManager.client = mockClient;
      migrationManager.db = mockDb;

      // Mock file system
      const fs = require('fs');
      fs.promises.readdir.mockResolvedValue([
        '20250811_120000_first.js',
        '20250811_130000_second.js'
      ]);
      fs.promises.readFile.mockImplementation((filename) => {
        if (filename.includes('first')) {
          return Promise.resolve(`
            module.exports = {
              description: 'First migration',
              async up(db) { await db.createCollection('first'); },
              async down(db) { await db.collection('first').drop(); }
            };
          `);
        } else {
          return Promise.resolve(`
            module.exports = {
              description: 'Second migration',
              async up(db) { await db.createCollection('second'); },
              async down(db) { await db.collection('second').drop(); }
            };
          `);
        }
      });
    });

    test('should rollback migrations successfully', async () => {
      // Mock applied migrations
      mockCollection.find.mockReturnValue({
        sort: jest.fn(() => ({
          toArray: jest.fn().mockResolvedValue([
            {
              version: '20250811_120000_first',
              description: 'First migration',
              applied_at: new Date('2025-01-01')
            },
            {
              version: '20250811_130000_second', 
              description: 'Second migration',
              applied_at: new Date('2025-01-02')
            }
          ])
        }))
      });

      const result = await migrationManager.rollback('20250811_120000_first');

      expect(result.success).toBe(true);
      expect(result.rolled_back_migrations).toHaveLength(1);
      expect(result.rolled_back_migrations[0].version).toBe('20250811_130000_second');
      expect(mockCollection.deleteOne).toHaveBeenCalledWith({
        version: '20250811_130000_second'
      });
    });

    test('should handle rollback to non-existent version', async () => {
      mockCollection.find.mockReturnValue({
        sort: jest.fn(() => ({
          toArray: jest.fn().mockResolvedValue([])
        }))
      });

      const result = await migrationManager.rollback('20250811_999999_nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found in migration history');
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      migrationManager.client = mockClient;
      migrationManager.db = mockDb;
    });

    test('should force unlock migrations', async () => {
      await migrationManager.forceUnlock();
      
      expect(mockCollection.deleteOne).toHaveBeenCalledWith({
        _id: 'migration_lock'
      });
      expect(logger.info).toHaveBeenCalledWith('Migration lock forcefully removed');
    });

    test('should list all migrations with status', async () => {
      // Mock filesystem
      const fs = require('fs');
      fs.promises.readdir.mockResolvedValue([
        '20250811_120000_first.js',
        '20250811_130000_second.js'
      ]);

      // Mock applied migrations from database
      mockCollection.find.mockReturnValue({
        sort: jest.fn(() => ({
          toArray: jest.fn().mockResolvedValue([
            {
              version: '20250811_120000_first',
              description: 'First migration',
              applied_at: new Date(),
              duration_ms: 150
            }
          ])
        }))
      });

      const migrations = await migrationManager.listMigrations();

      expect(migrations).toHaveLength(2);
      expect(migrations[0]).toEqual(expect.objectContaining({
        version: '20250811_120000_first',
        applied_at: expect.any(Date),
        duration_ms: 150
      }));
      expect(migrations[1]).toEqual(expect.objectContaining({
        version: '20250811_130000_second',
        applied_at: null
      }));
    });

    test('should close connection properly', async () => {
      await migrationManager.close();
      expect(mockClient.close).toHaveBeenCalled();
    });
  });

  describe('checksum validation', () => {
    test('should generate consistent checksums', () => {
      const content1 = 'test migration content';
      const content2 = 'test migration content';
      const content3 = 'different content';

      const checksum1 = migrationManager.generateChecksum(content1);
      const checksum2 = migrationManager.generateChecksum(content2);
      const checksum3 = migrationManager.generateChecksum(content3);

      expect(checksum1).toBe(checksum2);
      expect(checksum1).not.toBe(checksum3);
      expect(typeof checksum1).toBe('string');
      expect(checksum1.length).toBeGreaterThan(0);
    });
  });
});