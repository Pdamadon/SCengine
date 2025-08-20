# Redis Connection Migration Examples

This document shows how to update components to use the new RedisCacheFactory for shared connections.

## Before & After Examples

### 1. SelectorLearningCache.js Migration

**Before (line 16):**
```javascript
this.cache = new RedisCache(logger);
```

**After:**
```javascript
const RedisCacheFactory = require('./RedisCacheFactory');

// In constructor
this.cache = RedisCacheFactory.getInstance(logger, 'SelectorLearningCache');
```

### 2. NavigationLearningCache.js Migration

**Before (line 13):**
```javascript
this.cache = new RedisCache(logger);
```

**After:**
```javascript
const RedisCacheFactory = require('./RedisCacheFactory');

// In constructor
this.cache = RedisCacheFactory.getInstance(logger, 'NavigationLearningCache');
```

### 3. WorldModel.js Migration

**Before:**
```javascript
this.cache = new RedisCache(logger);
```

**After:**
```javascript
const RedisCacheFactory = require('./RedisCacheFactory');

// In constructor
this.cache = RedisCacheFactory.getInstance(logger, 'WorldModel');
```

### 4. StateManager.js Migration (if exists)

**Before:**
```javascript
this.cache = new RedisCache(logger);
```

**After:**
```javascript
const RedisCacheFactory = require('./RedisCacheFactory');

// In constructor  
this.cache = RedisCacheFactory.getInstance(logger, 'StateManager');
```

## Key Benefits

- **4 Redis connections → 1 shared connection**
- **Preserved component-specific logging** via proxy pattern
- **Feature flag control** via `REDIS_SHARED_CONNECTION=true`
- **Zero API changes** - all existing methods work unchanged
- **Backward compatibility** - defaults to individual connections

## Environment Variable Control

```bash
# Enable shared connections (production ready)
REDIS_SHARED_CONNECTION=true

# Use individual connections (current behavior)
REDIS_SHARED_CONNECTION=false  # or omit variable
```

## Implementation Notes

1. **Import RedisCacheFactory** instead of RedisCache directly
2. **Use getInstance()** with component name for debugging  
3. **Logger is preserved** - each component keeps its specific logger
4. **All existing methods work** - no API changes required
5. **Feature flag defaults to OFF** for safety during rollout

## Monitoring

Check connection stats with:
```javascript
console.log(RedisCacheFactory.getStats());
// Output: { sharedConnection: true, componentCount: 4, connected: true }
```

## Rollback Plan

If issues occur:
1. Set `REDIS_SHARED_CONNECTION=false`
2. Restart services
3. Each component gets individual Redis connection (original behavior)