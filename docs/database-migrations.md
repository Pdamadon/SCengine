# Database Migration System

## Overview

The AI Shopping Scraper includes a comprehensive database migration system that provides schema versioning, rollback capabilities, and zero-downtime deployments for MongoDB.

## Key Features

✅ **Schema Versioning** - Track database changes with version numbers
✅ **Atomic Migrations** - All-or-nothing migration execution 
✅ **Rollback Support** - Safe rollback to previous versions
✅ **Migration Locking** - Prevent concurrent migrations
✅ **Checksum Validation** - Ensure migration integrity
✅ **Zero-Downtime** - Deploy without service interruption

## Quick Start

### Check Migration Status
```bash
npm run db:status
```

### Apply All Pending Migrations  
```bash
npm run db:migrate
```

### Create a New Migration
```bash
npm run db:create-migration "Add user authentication"
```

### Rollback to Previous Version
```bash
npm run db:rollback 20250811_120000
```

### List All Migrations
```bash
npm run db:list
```

## Migration File Structure

Migrations are stored in `/migrations/` with this naming convention:
```
YYYYMMDD_HHMMSS_description.js
```

Example migration file:
```javascript
/**
 * Migration: Add user authentication
 * Created: 2025-08-11T12:00:00.000Z
 */

module.exports = {
  description: 'Add user authentication',
  
  async up(db, client) {
    console.log('Adding user authentication...');
    
    // Create users collection
    await db.createCollection('users', {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['email', 'password_hash', 'created_at'],
          properties: {
            email: { bsonType: 'string' },
            password_hash: { bsonType: 'string' },
            role: { enum: ['admin', 'user'] },
            created_at: { bsonType: 'date' }
          }
        }
      }
    });
    
    // Create indexes
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ created_at: 1 });
  },
  
  async down(db, client) {
    console.log('Removing user authentication...');
    
    // Drop users collection
    await db.collection('users').drop();
  }
};
```

## Available Commands

| Command | Description | Usage |
|---------|-------------|-------|
| `status` | Show migration status | `node scripts/migrate.js status` |
| `migrate` | Apply pending migrations | `node scripts/migrate.js migrate` |
| `rollback` | Rollback to version | `node scripts/migrate.js rollback 20250811_120000` |
| `create` | Create new migration | `node scripts/migrate.js create "Description"` |
| `list` | List all migrations | `node scripts/migrate.js list` |
| `force-unlock` | Remove migration lock | `node scripts/migrate.js force-unlock` |

## Migration Metadata

The system stores migration metadata in the `schema_migrations` collection:

```javascript
{
  _id: "migration_version",
  version: "20250811_120000_initial_setup",
  description: "Initial database setup", 
  applied_at: ISODate("2025-08-11T12:00:00.000Z"),
  duration_ms: 1250,
  checksum: "abc123...",
  operator: "deployment-system"
}
```

## Safety Features

### Migration Locking
- Prevents concurrent migrations
- Automatic lock expiration (5 minutes)
- Force unlock capability for emergencies

### Checksum Validation  
- Detects modified migration files
- Prevents applying corrupted migrations
- Ensures migration integrity

### Atomic Transactions
- All migrations run in MongoDB sessions
- Automatic rollback on failure
- Database consistency guaranteed

### Rollback Safety
- Validates rollback target exists
- Creates backup before rollback
- Confirmation prompts in production

## Integration with Monitoring

The migration system integrates with the monitoring infrastructure:

- **Structured Logging** - All operations logged with correlation IDs
- **Performance Metrics** - Migration timing and success/failure rates  
- **Error Tracking** - Failed migrations trigger alerts
- **Audit Trail** - Complete history of all database changes

## Production Deployment

### Pre-Deployment Checklist
1. Test migrations in staging environment
2. Verify rollback procedures work
3. Check disk space and backup storage
4. Confirm migration scripts are reviewed
5. Plan maintenance window if needed

### Deployment Process
```bash
# 1. Check current status
npm run db:status

# 2. Apply migrations
npm run db:migrate

# 3. Verify system health  
npm run health

# 4. If issues occur, rollback
npm run db:rollback <previous_version>
```

### Emergency Procedures

**If Migration Fails:**
1. Check logs: `tail -f logs/combined.log`
2. Identify failed migration
3. Fix migration file or rollback
4. Remove lock if needed: `npm run db:unlock`

**If Database Corrupted:**
1. Stop application immediately
2. Restore from backup
3. Identify problematic migration
4. Fix and re-apply carefully

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGO_URL` | MongoDB connection string | `mongodb://localhost:27017` |
| `DB_NAME` | Database name | `ai_shopping_scraper` |
| `NODE_ENV` | Environment (affects confirmations) | `development` |

## Best Practices

### Writing Migrations
- ✅ Make migrations idempotent
- ✅ Test both up and down directions
- ✅ Use descriptive migration names
- ✅ Add validation rules for new collections
- ✅ Create appropriate indexes
- ❌ Don't modify existing migration files
- ❌ Don't include application logic in migrations

### Schema Design
- Use MongoDB schema validation where appropriate
- Plan for data growth and indexing needs
- Consider shard key implications for large datasets
- Document breaking changes clearly

### Version Control
- Commit migration files with related code changes
- Include migration in deployment documentation
- Tag releases with migration version info
- Review migrations in pull requests

## Troubleshooting

### Common Issues

**Migration Timeout**
```
Error: Migration lock expired
Solution: Increase timeout or check for long-running operations
```

**Checksum Mismatch**
```
Error: Migration checksum validation failed  
Solution: Don't modify applied migration files
```

**Connection Issues**
```
Error: Failed to connect to MongoDB
Solution: Check connection string and network access
```

### Debug Mode

Enable debug logging:
```bash
DEBUG=migration:* npm run db:migrate
```

### Support

For migration system issues:
1. Check logs in `/logs/migration.log`
2. Review system monitoring dashboards  
3. Consult `SCRAPING_REQUIREMENTS.md` compliance guide
4. Contact development team with correlation ID

---

This migration system ensures safe, reliable database evolution while maintaining the high availability requirements specified in SCRAPING_REQUIREMENTS.md.