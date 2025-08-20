#!/usr/bin/env node

/**
 * Database Migration CLI Tool
 * Handles database schema migrations and rollbacks using the MigrationManager
 */

const { MigrationManager } = require('../src/database/migrationManager');
const { logger } = require('../src/utils/logger');
require('dotenv').config();

class MigrationCLI {
  constructor() {
    this.connectionUri = process.env.MONGO_URL || process.env.MONGODB_URL || 'mongodb://localhost:27017';
    this.dbName = process.env.DB_NAME || 'ai_shopping_scraper';
    this.migrationManager = new MigrationManager(this.connectionUri, this.dbName);
  }

  async run() {
    const command = process.argv[2];
    const args = process.argv.slice(3);

    try {
      await this.migrationManager.initialize();

      switch (command) {
        case 'status':
          await this.showStatus();
          break;
          
        case 'migrate':
          await this.migrate(args[0]);
          break;
          
        case 'rollback':
          await this.rollback(args[0]);
          break;
          
        case 'create':
          await this.createMigration(args.join(' '));
          break;
          
        case 'list':
          await this.listMigrations();
          break;
          
        case 'force-unlock':
          await this.forceUnlock();
          break;
          
        default:
          this.showHelp();
      }

    } catch (error) {
      console.error('❌ Migration command failed:', error.message);
      logger.error('Migration CLI error', { error: error.message, stack: error.stack });
      process.exit(1);
    } finally {
      await this.migrationManager.close();
    }
  }

  async showStatus() {
    console.log('📊 MIGRATION STATUS');
    console.log('==================');

    const status = await this.migrationManager.getStatus();

    console.log(`Current Version: ${status.current_version}`);
    console.log(`Applied Migrations: ${status.applied_migrations}`);
    console.log(`Pending Migrations: ${status.pending_migrations}`);
    console.log(`Migration Lock: ${status.is_locked ? '🔒 LOCKED' : '🔓 Unlocked'}`);

    if (status.lock_info) {
      console.log(`  - Acquired by: ${status.lock_info.acquired_by}`);
      console.log(`  - Acquired at: ${status.lock_info.acquired_at}`);
      console.log(`  - Expires at: ${status.lock_info.expires_at}`);
    }

    if (status.last_applied) {
      console.log(`\nLast Applied Migration:`);
      console.log(`  - Version: ${status.last_applied.version}`);
      console.log(`  - Description: ${status.last_applied.description}`);
      console.log(`  - Applied at: ${status.last_applied.applied_at}`);
      console.log(`  - Duration: ${status.last_applied.duration_ms}ms`);
    }

    if (status.pending_list.length > 0) {
      console.log('\nPending Migrations:');
      status.pending_list.forEach(migration => {
        console.log(`  📄 ${migration.version}: ${migration.description}`);
      });
    } else {
      console.log('\n✅ No pending migrations');
    }
  }

  async migrate(targetVersion) {
    console.log('🚀 Starting migration...');
    
    const result = await this.migrationManager.migrate(targetVersion);
    
    if (result.success) {
      console.log(`✅ Migration completed successfully`);
      console.log(`Applied ${result.applied_migrations.length} migrations`);
      
      result.applied_migrations.forEach(migration => {
        console.log(`  ✨ ${migration.version}: ${migration.description} (${migration.duration_ms}ms)`);
      });
    } else {
      console.error(`❌ Migration failed: ${result.error}`);
      if (result.failed_migration) {
        console.error(`Failed on: ${result.failed_migration.version}`);
      }
      process.exit(1);
    }
  }

  async rollback(targetVersion) {
    console.log('⏪ Starting rollback...');
    
    if (!targetVersion) {
      console.error('❌ Target version required for rollback');
      process.exit(1);
    }
    
    const result = await this.migrationManager.rollback(targetVersion);
    
    if (result.success) {
      console.log(`✅ Rollback completed successfully`);
      console.log(`Rolled back ${result.rolled_back_migrations.length} migrations`);
      
      result.rolled_back_migrations.forEach(migration => {
        console.log(`  ⏪ ${migration.version}: ${migration.description} (${migration.duration_ms}ms)`);
      });
    } else {
      console.error(`❌ Rollback failed: ${result.error}`);
      process.exit(1);
    }
  }

  async createMigration(description) {
    if (!description) {
      console.error('❌ Migration description required');
      this.showHelp();
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const name = description.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const version = `${timestamp}_${name}`;
    const fileName = `migrations/${version}.js`;

    const template = `/**
 * Migration: ${description}
 * Created: ${new Date().toISOString()}
 */

module.exports = {
  description: '${description}',
  
  async up(db, client) {
    // TODO: Implement migration logic
    console.log('Applying migration: ${description}');
    
    // Example:
    // await db.createCollection('new_collection');
    // await db.collection('existing').createIndex({ field: 1 });
  },
  
  async down(db, client) {
    // TODO: Implement rollback logic
    console.log('Rolling back migration: ${description}');
    
    // Example:
    // await db.collection('new_collection').drop();
    // await db.collection('existing').dropIndex({ field: 1 });
  }
};
`;

    await require('fs').promises.writeFile(fileName, template);
    console.log(`✨ Created migration file: ${fileName}`);
  }

  async listMigrations() {
    console.log('📋 MIGRATION LIST');
    console.log('=================');

    const migrations = await this.migrationManager.listMigrations();
    
    migrations.forEach(migration => {
      const status = migration.applied_at ? '✅ Applied' : '⏳ Pending';
      const date = migration.applied_at ? new Date(migration.applied_at).toLocaleString() : '';
      
      console.log(`${status} ${migration.version}`);
      console.log(`    ${migration.description}`);
      if (date) {
        console.log(`    Applied: ${date} (${migration.duration_ms}ms)`);
      }
      console.log();
    });
  }

  async forceUnlock() {
    console.log('🔓 Force unlocking migrations...');
    
    await this.migrationManager.forceUnlock();
    console.log('✅ Migration lock removed');
  }

  showHelp() {
    console.log(`
🗂️  Database Migration CLI

USAGE:
  node scripts/migrate.js <command> [options]

COMMANDS:
  status                    Show current migration status
  migrate [version]         Apply migrations up to version (or all)
  rollback <version>        Roll back to specific version
  create <description>      Create a new migration file
  list                      List all migrations and their status
  force-unlock              Remove migration lock (use with caution)

EXAMPLES:
  node scripts/migrate.js status
  node scripts/migrate.js migrate
  node scripts/migrate.js migrate 20250811_120000
  node scripts/migrate.js rollback 20250811_110000
  node scripts/migrate.js create "Add user authentication"
  node scripts/migrate.js list
  node scripts/migrate.js force-unlock

ENVIRONMENT VARIABLES:
  MONGO_URL / MONGODB_URL   MongoDB connection string
  DB_NAME                   Database name (default: ai_shopping_scraper)
`);
  }
}

// Run the CLI
if (require.main === module) {
  const cli = new MigrationCLI();
  cli.run().catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { MigrationCLI };