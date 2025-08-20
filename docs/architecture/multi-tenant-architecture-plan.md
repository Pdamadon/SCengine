# Multi-Tenant Architecture Implementation Plan

## Overview
This document outlines the implementation plan for converting the AI Shopping Scraper into a multi-tenant SaaS platform that supports multiple users, organizations, and usage tiers through the agent application.

## Architecture Goals

### User Flow
```
End User -> Agent App -> API Key -> Scraping API -> Tenant Attribution -> Quota Check -> Job Processing
```

### Tenant Hierarchy
```
Organization/Tenant
├── Subscription Tier (Free, Pro, Enterprise)
├── Users (with roles: Owner, Admin, Member)
├── Projects/Workspaces (Event management, Delivery coordination, etc.)
├── API Keys (per project or organization)
└── Resource Quotas (concurrent queries, daily limits, etc.)
```

## Phase 1: Core Multi-Tenant Infrastructure

### 1.1 Database Schema Design
**Tables to Create:**
- `tenants` - Organization/tenant information
- `users` - Individual user accounts  
- `subscriptions` - Subscription tiers and billing info
- `api_keys` - API key management with tenant attribution
- `projects` - Project/workspace organization
- `usage_tracking` - Real-time usage metrics
- `quotas` - Tenant-specific resource limits

**Key Relationships:**
```sql
tenants (1) -> (N) users
tenants (1) -> (1) subscriptions  
tenants (1) -> (N) api_keys
tenants (1) -> (N) projects
tenants (1) -> (1) quotas
api_keys (1) -> (N) scraping_jobs (attribution)
```

### 1.2 API Key Management System
**Features:**
- Generate secure API keys with tenant/project attribution
- Support multiple key types: Development, Staging, Production
- Key rotation and revocation capabilities
- Usage tracking per API key
- Rate limiting enforcement per key

**Implementation:**
```javascript
// API Key Structure
{
  id: "ak_1234567890abcdef",
  tenant_id: "tenant_uuid",  
  project_id: "project_uuid",
  key_hash: "bcrypt_hash",
  permissions: ["scraping:read", "scraping:write"],
  rate_limits: {
    concurrent_jobs: 20,
    daily_requests: 1000,
    burst_rate: 10
  },
  created_at: "2024-01-01T00:00:00Z",
  expires_at: "2024-12-31T23:59:59Z",
  last_used_at: "2024-01-01T12:00:00Z"
}
```

### 1.3 Quota and Rate Limiting System
**Subscription Tiers:**

| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| Concurrent Jobs | 5 | 20 | Unlimited |
| Daily Requests | 100 | 1,000 | Custom |
| Projects | 1 | 10 | Unlimited |
| API Keys | 2 | 10 | Unlimited |
| Support | Community | Email | Priority |
| Analytics Retention | 7 days | 30 days | 1 year |

**Enforcement Points:**
- Job submission validation
- Real-time quota checking
- Rate limiting middleware
- Queue priority assignment

## Phase 2: Authentication and Authorization

### 2.1 Service-to-Service Authentication
**Components:**
- API Key validation middleware
- JWT token support for service accounts
- Request attribution and logging
- Security headers and CORS policies

**Implementation:**
```javascript
// Authentication Middleware Flow
1. Extract API key from request header
2. Validate key format and existence  
3. Check key expiration and status
4. Load tenant/project context
5. Validate permissions for endpoint
6. Check quota limits
7. Proceed with attributed request
```

### 2.2 Role-Based Access Control (RBAC)
**Roles:**
- **Tenant Owner**: Full tenant management, billing
- **Admin**: User management, API key generation
- **Member**: Project access, job submission
- **ReadOnly**: View-only access to jobs and results

**Permissions:**
```json
{
  "scraping:create": ["owner", "admin", "member"],
  "scraping:read": ["owner", "admin", "member", "readonly"],
  "scraping:cancel": ["owner", "admin", "member"],
  "tenant:manage": ["owner"],
  "users:manage": ["owner", "admin"],
  "api_keys:manage": ["owner", "admin"]
}
```

## Phase 3: Usage Tracking and Billing Integration

### 3.1 Real-Time Usage Tracking
**Metrics to Track:**
- Job submissions per tenant/project
- Compute time and resource usage
- Data volume processed and stored
- API requests and bandwidth usage
- Feature usage (WebSocket connections, exports)

**Implementation:**
```javascript
// Usage Event Structure
{
  tenant_id: "tenant_uuid",
  project_id: "project_uuid", 
  api_key_id: "key_id",
  event_type: "job_submitted",
  resource_usage: {
    compute_seconds: 45.2,
    data_kb: 1250,
    requests: 1
  },
  timestamp: "2024-01-01T12:00:00Z",
  job_id: "job_uuid"
}
```

### 3.2 Billing Integration Points
**Features:**
- Usage aggregation for billing periods
- Overage tracking and notifications
- Invoice generation data export
- Payment failure handling
- Usage-based tier upgrades

## Phase 4: Multi-Project Organization

### 4.1 Project/Workspace Isolation
**Features:**
- Logical separation of scraping jobs by project
- Team collaboration within projects
- Project-specific API keys and quotas
- Resource allocation per project

**Use Cases:**
- **Event Management**: Separate projects for different events
- **Delivery Coordination**: One project per vendor/supplier
- **Market Research**: Projects by product category or region

### 4.2 Data Isolation and Security
**Implementation:**
- Row-level security in database
- Project-scoped job queries
- Isolated result storage
- Cross-project access controls

## Phase 5: Admin and Management Interface

### 5.1 Tenant Management API
**Endpoints:**
```
POST /admin/tenants          - Create new tenant
GET  /admin/tenants          - List tenants with usage
PUT  /admin/tenants/:id      - Update tenant settings
DELETE /admin/tenants/:id    - Deactivate tenant

POST /admin/tenants/:id/quota - Set custom quotas
GET  /admin/usage            - System-wide usage analytics
POST /admin/api-keys/revoke  - Emergency key revocation
```

### 5.2 Self-Service Tenant Portal
**Features for Agent App Integration:**
- API key generation and management
- Usage dashboard and analytics
- Billing and subscription management
- Team member invitations
- Project creation and settings

## Phase 6: Monitoring and Observability

### 6.1 Multi-Tenant Metrics
**Enhanced Metrics:**
- Usage by tenant, project, and user
- Performance by subscription tier
- Quota utilization and overage alerts  
- API key usage patterns
- Tenant lifecycle analytics

### 6.2 Alerting and Notifications
**Alert Types:**
- Quota approaching limits
- Unusual usage patterns
- API key security events
- System performance by tenant
- Billing and payment issues

## Implementation Timeline

### Phase 1 (Weeks 1-2): Core Infrastructure
- Database schema design and migration
- Basic API key management
- Tenant and project models
- Usage tracking foundation

### Phase 2 (Weeks 3-4): Authentication
- API key validation middleware
- Request attribution system
- Basic RBAC implementation
- Security and rate limiting

### Phase 3 (Weeks 5-6): Usage and Billing
- Real-time usage tracking
- Quota enforcement system
- Billing integration points
- Usage analytics API

### Phase 4 (Weeks 7-8): Multi-Project Features
- Project isolation implementation
- Team collaboration features
- Project-scoped resources
- Cross-project security

### Phase 5 (Weeks 9-10): Management Interface
- Admin API endpoints
- Self-service portal integration
- Tenant lifecycle management
- Bulk operations support

### Phase 6 (Weeks 11-12): Monitoring
- Multi-tenant observability
- Enhanced analytics dashboard
- Alerting and notification system
- Performance optimization

## Technical Considerations

### Database Design
- Use UUID primary keys for tenant isolation
- Implement row-level security (RLS)
- Consider database sharding for scale
- Plan for data retention and archival

### Caching Strategy
- Redis-based tenant context caching
- API key validation caching
- Quota status caching with TTL
- Usage aggregation caching

### Security Best Practices
- API key hashing and secure storage
- Request rate limiting and DDoS protection
- Audit logging for all tenant operations
- Data encryption at rest and in transit

### Scalability Planning
- Horizontal scaling with tenant affinity
- Queue partitioning by tenant
- Load balancing with tenant awareness
- Background job processing optimization

## Success Metrics

### Technical Metrics
- API response times < 200ms
- 99.9% uptime SLA compliance
- Zero data leakage between tenants
- Sub-second quota checking

### Business Metrics
- Tenant onboarding time < 5 minutes
- API key setup success rate > 95%
- Usage tracking accuracy > 99.5%
- Customer support ticket reduction

## Risk Mitigation

### Technical Risks
- **Data Isolation Failure**: Comprehensive testing, row-level security
- **Performance Degradation**: Caching, database optimization
- **API Key Compromise**: Automatic rotation, anomaly detection
- **Quota Bypass**: Multiple enforcement layers, monitoring

### Business Risks
- **Over-provisioning**: Real-time usage tracking, alerts
- **Under-provisioning**: Automatic scaling, capacity planning
- **Billing Disputes**: Detailed usage logs, transparent reporting
- **Churn Risk**: Usage analytics, proactive support

## Future Enhancements

### Advanced Features
- **White-label Solutions**: Custom branding per tenant
- **Compliance**: SOC2, GDPR, HIPAA compliance frameworks
- **Advanced Analytics**: ML-powered usage insights
- **Integration Platform**: Webhooks, API connectors
- **Geographic Distribution**: Multi-region deployment

This implementation plan provides a comprehensive roadmap for converting the scraping system into a production-ready multi-tenant SaaS platform while maintaining the flexibility to iterate based on user feedback and business requirements.