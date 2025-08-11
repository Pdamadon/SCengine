# Claude Development Guidelines

## 🎯 PRIMARY DIRECTIVE
**ALWAYS consult SCRAPING_REQUIREMENTS.md before making ANY code changes.**

This file contains industry standards and compliance requirements that must be followed to ensure system reliability, security, and legal compliance.

## 📋 Pre-Development Checklist

Before writing any code, verify:

1. **Requirements Compliance**: Have you read the relevant sections of SCRAPING_REQUIREMENTS.md?
2. **Architecture Alignment**: Does your approach follow the microservices and API-first patterns?
3. **Security & Ethics**: Does this respect robots.txt, rate limits, and privacy requirements?
4. **Performance Standards**: Will this meet the response time and throughput requirements?
5. **Testing Strategy**: How will you validate this works correctly?

## 🏗️ Current System Architecture

### Core Components (DO NOT BREAK)
- **CategoryAwareParallelScraper** - Enhanced parallel scraping with category intelligence
- **WorldModelPopulator** - Multi-category database population system
- **SiteIntelligence** - Automatic site discovery and selector learning
- **Multi-category world model** - 4-level hierarchy with relationship preservation

### Integration Points (PRESERVE COMPATIBILITY)
- **MongoDB collections**: products, categories, category_hierarchy, product_categories
- **Existing APIs**: All current scraping workflows must continue to work
- **Configuration**: Environment variables and config files must remain valid
- **Data formats**: Existing data structures must be preserved or gracefully migrated

## 🚀 Development Approach

### Building New Features
1. **Build alongside existing code** - Don't replace, extend
2. **Use feature flags** - Make new functionality toggleable
3. **Maintain backward compatibility** - Existing functionality must continue to work
4. **Plan rollback strategy** - Every change must be reversible
5. **Test thoroughly** - Unit, integration, and load testing required

### Code Quality Standards
- **Follow ESLint configuration**
- **Use TypeScript for new code**
- **Document all public APIs with JSDoc**
- **Require peer review for all changes**
- **Maintain 80% test coverage minimum**

## 📊 Current Project Status

### Recently Completed
- ✅ Multi-category database schema design
- ✅ Enhanced WorldModelPopulator with category hierarchy support
- ✅ Category deduplication and 4-level hierarchy generation
- ✅ Canonical category system with relationship preservation

### Current Phase: Foundation & Standards Setup
- 🔄 **In Progress**: Creating industry standards compliance framework
- 📋 **Next**: Development workflow setup and API specifications

### Upcoming Phases
1. **API Layer & Request Queue** (Weeks 2-3)
2. **Site Discovery Engine** (Weeks 4-6)  
3. **Dynamic Scraper Generation** (Weeks 7-9)
4. **Enhanced World Model Integration** (Weeks 10-11)
5. **AI Training Data Generation** (Week 12)
6. **Real-Time Orchestration** (Weeks 13-14)

## ⚠️ Critical Reminders

- **No breaking changes** to existing functionality
- **Always check robots.txt** and respect rate limits
- **Validate all inputs** to prevent injection attacks
- **Use structured logging** with correlation IDs
- **Plan for failure scenarios** with graceful degradation
- **Test performance** under expected load conditions

## 🎯 Success Metrics

- **System Reliability**: 99.9% uptime target
- **API Performance**: < 200ms response time
- **Scraping Efficiency**: < 5 minutes end-to-end
- **Data Quality**: Consistent, validated, and complete
- **Security Compliance**: No violations of ethical scraping practices

Remember: The goal is to build a robust, scalable, legally compliant scraping system that serves as the data backbone for AI agent integration.