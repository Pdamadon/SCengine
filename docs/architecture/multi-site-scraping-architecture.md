# Multi-Site Scraping Architecture

## Overview
Expand the AI Shopping Scraper from single-site (glasswingshop.com) to a universal e-commerce scraping platform supporting major platforms with intelligent adaptation and anti-bot resilience.

**Current State**: Redis queue system + real-time monitoring + security validation  
**Goal**: Site-agnostic scraping intelligence across 5+ major e-commerce platforms

## Site-Agnostic Intelligence System

### Universal Product Detection Framework
```javascript
// Core abstraction layer
{
  productIdentifiers: {
    title: ['h1.product-title', '.product-name', '[data-testid="product-title"]'],
    price: ['.price', '.product-price', '[data-testid="price"]'],
    availability: ['.stock-status', '.availability', '[data-testid="stock"]'],
    images: ['.product-images img', '.gallery img', '[data-testid="product-image"]'],
    description: ['.product-description', '.product-details', '[data-testid="description"]'],
    reviews: ['.reviews', '.product-reviews', '[data-testid="reviews"]']
  },
  categoryPatterns: {
    breadcrumbs: ['.breadcrumb', '.nav-breadcrumb', '[data-testid="breadcrumb"]'],
    navigation: ['.category-nav', '.product-categories', '.main-nav'],
    filters: ['.facets', '.filters', '.product-filters']
  },
  paginationSelectors: ['.pagination', '.page-nav', '[data-testid="pagination"]']
}
```

### Site Configuration System
```javascript
// Platform-specific configurations
const siteConfigs = {
  'amazon.com': {
    productSelectors: { /* Amazon-specific selectors */ },
    antiBot: { userAgent: 'rotation', delays: [2000, 5000] },
    rateLimit: { requestsPerMinute: 10 }
  },
  'shopify': {
    productSelectors: { /* Shopify universal selectors */ },
    apiEndpoints: ['/products.json', '/collections.json'],
    antiBot: { userAgent: 'standard', delays: [1000, 3000] }
  }
}
```

## Anti-Bot Mitigation Framework

### Detection Patterns
- **Request Frequency Analysis**: Adaptive rate limiting based on site responses
- **Behavioral Mimicry**: Human-like browsing patterns and timing
- **Fingerprint Rotation**: User agents, headers, viewport sizes
- **Proxy Management**: IP rotation and geographic distribution

### Mitigation Strategies
```javascript
const antiBot = {
  userAgentPool: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    // 50+ realistic user agents
  ],
  requestDelays: {
    min: 1000, max: 5000,
    adaptive: true, // Increase delays if detection suspected
    human: true    // Random jitter to mimic human behavior
  },
  sessionManagement: {
    cookieJars: 'per-domain',
    sessionRotation: '100-requests',
    referrerHandling: 'intelligent'
  }
}
```

## Platform Support Matrix

| Platform | Complexity | Anti-Bot Level | Implementation Priority |
|----------|------------|----------------|------------------------|
| **Shopify Stores** | Low | Medium | 1 (Standardized structure) |
| **WooCommerce** | Medium | Low | 2 (WordPress-based, predictable) |
| **BigCommerce** | Medium | Medium | 3 (Similar to Shopify) |
| **Amazon** | High | Very High | 4 (Complex, heavy protection) |
| **Custom Sites** | Variable | Variable | 5 (Site-by-site basis) |

### Platform Characteristics
- **Shopify**: JSON APIs available, standardized theme structure
- **WooCommerce**: WordPress REST API, plugin variations
- **BigCommerce**: Store APIs, consistent product structure  
- **Amazon**: No APIs, sophisticated bot detection, dynamic content
- **Custom**: Manual configuration, selector learning required

## Dynamic Learning System

### Automatic Selector Discovery
```javascript
const selectorLearning = {
  // DOM analysis for product identification
  productDetection: {
    pricePatterns: /\$[\d,]+\.?\d*/,
    titleHeuristics: ['h1', 'h2', '.title', '[role="heading"]'],
    imageDetection: 'largest-image-in-product-context',
    structureAnalysis: 'semantic-html-analysis'
  },
  
  // Fallback selector chains
  fallbackStrategy: {
    primary: 'configured-selectors',
    secondary: 'learned-selectors', 
    tertiary: 'heuristic-detection',
    ultimate: 'ai-powered-extraction'
  }
}
```

### Site Evolution Adaptation
- **Structure Change Detection**: Monitor for layout modifications
- **Selector Validation**: Test selector effectiveness over time
- **Automatic Updates**: Self-healing when selectors break
- **Version Control**: Track selector changes and performance

## Implementation Phases

### Phase 3.1: Foundation (Weeks 1-2)
- Site-agnostic scraper architecture
- Universal product detection framework
- Basic anti-bot mitigation
- Shopify store support (easiest target)

### Phase 3.2: Platform Expansion (Weeks 3-4) 
- WooCommerce site support
- BigCommerce integration
- Enhanced anti-bot strategies
- Dynamic selector learning

### Phase 3.3: Advanced Features (Weeks 5-6)
- Amazon scraping (challenging target)
- AI-powered content extraction
- Real-time selector adaptation
- Performance optimization

## Technical Implementation

### Scraper Factory Pattern
```javascript
class ScraperFactory {
  static createScraper(url) {
    const domain = extractDomain(url);
    const platform = detectPlatform(domain);
    
    switch(platform) {
      case 'shopify': return new ShopifyScraper(url);
      case 'woocommerce': return new WooCommerceScraper(url);
      case 'amazon': return new AmazonScraper(url);
      default: return new GenericScraper(url);
    }
  }
}
```

### Universal Data Model
```javascript
const UniversalProduct = {
  id: 'unique-identifier',
  title: 'Product Name',
  price: { amount: 29.99, currency: 'USD' },
  availability: 'in-stock|out-of-stock|limited',
  images: ['url1', 'url2'],
  description: 'Product description',
  reviews: { count: 150, rating: 4.5 },
  category: { path: 'Electronics > Phones', breadcrumbs: [...] },
  metadata: { source: 'domain.com', scraped_at: '2024-01-01T00:00:00Z' }
}
```

## Testing and Validation Strategy

### Load Testing Framework
- **Multi-Site Concurrent Scraping**: Test 5+ sites simultaneously  
- **Rate Limit Handling**: Verify adaptive delays work
- **Error Recovery**: Test resilience to blocked requests
- **Data Quality**: Validate extraction accuracy across platforms

### Success Metrics
- **Platform Coverage**: 5+ major platforms supported
- **Success Rate**: >90% successful data extraction
- **Bot Detection Rate**: <5% of requests blocked
- **Response Time**: <30 seconds average per product
- **Data Accuracy**: >95% correct product information

### Monitoring and Alerting
- **Per-Platform Success Rates**: Track effectiveness by site
- **Anti-Bot Detection Events**: Monitor blocking patterns
- **Selector Health**: Track when selectors start failing
- **Performance Metrics**: Response times and error rates

## Integration Points

### Queue System Integration
```javascript
// Enhanced job types for multi-site support
const jobTypes = {
  'shopify-products': ShopifyScraper,
  'woocommerce-products': WooCommerceScraper,
  'amazon-products': AmazonScraper,
  'generic-products': GenericScraper
}
```

### Real-Time Updates
- Platform-specific progress reporting
- Anti-bot mitigation status updates  
- Selector learning notifications
- Site health monitoring

## Risk Mitigation

### Technical Risks
- **IP Blocking**: Proxy rotation, request distribution
- **Selector Breakage**: Fallback chains, automatic learning
- **Rate Limiting**: Adaptive delays, distributed scraping  
- **Legal Issues**: Robots.txt compliance, terms of service

### Operational Risks
- **Performance Degradation**: Caching, optimization
- **Data Quality Issues**: Validation layers, human review
- **Site Compatibility**: Comprehensive testing, graceful failures
- **Maintenance Overhead**: Automated monitoring, self-healing

This architecture enables scalable, intelligent scraping across diverse e-commerce platforms while maintaining reliability and legal compliance.