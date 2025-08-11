# Railway Deployment Setup Guide

## 🚀 Railway Dashboard Setup

### 1. Create New Project
1. Go to [Railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose `Pdamadon/codesight-scraping-ai-generation`

### 2. Add Required Services

#### PostgreSQL Service
1. Click "Add Service" → "Database" → "PostgreSQL"
2. Railway will automatically provision and set `DATABASE_URL` environment variable
3. The connection string format: `postgresql://username:password@host:port/database`

#### MongoDB Service  
1. Click "Add Service" → "Database" → "MongoDB"
2. Railway will automatically provision and set `MONGODB_URL` environment variable
3. The connection string format: `mongodb://username:password@host:port/database`

#### Redis Service
1. Click "Add Service" → "Database" → "Redis"
2. Railway will automatically provision and set `REDIS_URL` environment variable
3. The connection string format: `redis://username:password@host:port`

### 3. Configure Environment Variables

Navigate to your service → "Variables" tab and add:

```env
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Scraping Configuration
MAX_CONCURRENT_SCRAPES=5
MAX_BROWSER_INSTANCES=3
DEFAULT_TIMEOUT_MS=30000

# Rate Limiting
SCRAPING_RATE_LIMIT=10
API_RATE_LIMIT=1000

# Cache Settings
CACHE_TTL_DOMAIN=86400
CACHE_TTL_PRODUCT=14400
CACHE_TTL_PRICE=1800

# Job Queue
MAX_QUEUE_SIZE=1000
JOB_TIMEOUT_MS=300000
MAX_RETRIES=3

# Training Data
MAX_TRAINING_RECORDS_PER_SESSION=100
TRAINING_DATA_RETENTION_DAYS=30

# Monitoring
ENABLE_METRICS=true
ENABLE_HEALTH_CHECKS=true
```

### 4. Database Initialization

After deployment, initialize your databases:

#### PostgreSQL Schema Setup
```bash
# Railway will automatically run this via the migration script
npm run db:migrate
```

#### MongoDB Collections Setup
```bash
# Collections will be created automatically when first accessed
# But you can run seed data if needed
npm run db:seed
```

### 5. Custom Domain (Optional)
1. Go to "Settings" → "Domains"
2. Add your custom domain
3. Update CORS_ORIGINS environment variable

## 🔧 Service Configuration

### Resource Allocation
- **CPU**: 2 vCPU (for multiple browser instances)
- **Memory**: 2GB RAM (Playwright browsers need memory)
- **Storage**: 10GB (for screenshots, logs, cached data)

### Scaling Settings
- **Horizontal Scaling**: Enable for high traffic
- **Auto-scaling**: Based on CPU/Memory usage
- **Health Checks**: `/health` endpoint every 30 seconds

### Networking
- **Port**: 3000 (configured in railway.toml)
- **Health Check**: `/health` endpoint
- **Timeout**: 300 seconds (for long scraping operations)

## 📊 Monitoring Setup

### Built-in Railway Metrics
- CPU/Memory usage
- Response times
- Error rates
- Database connections

### Custom Metrics Endpoints
- `GET /metrics` - Prometheus-style metrics
- `GET /health` - Health check status
- `GET /stats` - Application statistics

## 🚨 Production Considerations

### Security
- All environment variables are encrypted
- Database connections use SSL/TLS
- API rate limiting enabled
- CORS properly configured

### Performance
- Redis caching reduces database load
- Job queues handle concurrent scraping
- Browser instances are properly managed
- Automatic cleanup of old data

### Reliability
- Health checks ensure uptime
- Auto-restart on failures
- Database backups included
- Graceful shutdown handling

## 🎯 Deployment Commands

### Initial Deployment
```bash
# Railway automatically deploys on git push
git add .
git commit -m "feat: add Railway deployment configuration"
git push origin main
```

### Manual Deployment Trigger
```bash
# Force redeploy from Railway CLI
railway up
```

### Database Migrations
```bash
# Run migrations after deployment
railway run npm run db:migrate
```

### View Logs
```bash
# View live application logs
railway logs
```

## 🔍 Troubleshooting

### Common Issues

1. **Build Failures**
   - Check Node.js version in `package.json` engines
   - Verify all dependencies are listed
   - Check for missing environment variables

2. **Database Connection Errors**
   - Ensure DATABASE_URL is set by Railway
   - Check firewall/network restrictions
   - Verify database service is running

3. **Playwright Issues**
   - Increase memory allocation to 2GB+
   - Ensure browsers are installed in Dockerfile
   - Check system dependencies

4. **Redis Connection Issues**
   - Verify REDIS_URL is set correctly
   - Check Redis service status
   - Review connection timeout settings

### Debug Commands
```bash
# Check service status
railway status

# View environment variables
railway variables

# Connect to database
railway connect postgres
railway connect mongodb
railway connect redis

# View service logs
railway logs --tail
```

## 📈 Scaling Guidelines

### Traffic Thresholds
- **Low Traffic**: 1 instance, 1GB RAM
- **Medium Traffic**: 2-3 instances, 2GB RAM each  
- **High Traffic**: 5+ instances, 4GB RAM each

### Database Scaling
- **PostgreSQL**: Enable read replicas for high read loads
- **MongoDB**: Consider sharding for large datasets
- **Redis**: Use Redis Cluster for high availability

### Cost Optimization
- Monitor resource usage in Railway dashboard
- Adjust instance sizes based on actual usage
- Use Railway's usage-based pricing efficiently
- Set up alerts for unexpected usage spikes

## ✅ Post-Deployment Checklist

- [ ] All services are running and healthy
- [ ] Database schemas are properly created
- [ ] Environment variables are set correctly
- [ ] Health check endpoint responds successfully
- [ ] API endpoints are accessible
- [ ] Scraping functionality works end-to-end
- [ ] Job queues are processing correctly
- [ ] Monitoring and logging are operational
- [ ] Custom domain is configured (if applicable)
- [ ] Backup strategies are in place