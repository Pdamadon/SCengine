# HTTP Optimization Strategy - Enhanced "Less Botty" Approach

## KEY INSIGHTS FROM ANALYSIS

### When Raw HTTP is "Less Botty"
- **Static HTML + JSON-LD extraction** ✅ (What we're doing)
- **Public JSON endpoints** (Shopify `/products/<handle>.json`)
- **No JS/CAPTCHA required** ✅ (Glasswing case)  
- **Browser-like headers + rate limiting** (Need to improve)
- **Simple cookie state management** (Need to add)

### Current HTTP Success Analysis
- **Glasswing Results**: 2/4 URLs successful (50%)
- **Why it works**: JSON-LD in server-rendered HTML
- **Why some fail**: Potentially missing cookie state, sub-optimal headers

## ENHANCED HTTP STRATEGY

### Tier 0: Optimized HTTP-First (Upgrade Current Implementation)
**Target**: Improve from 50% to 80%+ success rate

#### Current HTTPJsonLdExtractor Issues:
```javascript
// Current headers (too basic):
'User-Agent': 'Mozilla/5.0 (compatible; ProductCatalogBot/1.0)'
'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
```

#### Enhanced Headers (More Browser-Like):
```javascript
const REALISTIC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Dest': 'document', 
  'Sec-Fetch-Site': 'none'
};
```

### Tier 1: Platform-Specific JSON Endpoints
**For Shopify sites**: Try `/products/<handle>.json` before HTML scraping

### Tier 2: Browser Fallback (When HTTP Fails)
**Current approach**: Immediate browser fallback
**Enhanced approach**: Smart escalation based on failure type

## IMPLEMENTATION PRIORITIES

### Priority 1: Enhance HTTPJsonLdExtractor (High Impact, Low Risk)
1. **Upgrade headers to realistic browser profile**
2. **Add cookie jar support** (tough-cookie library)  
3. **Add robots.txt checking**
4. **Improve rate limiting with jitter**
5. **Add ETag/If-Modified-Since support**

### Priority 2: Add Platform Detection
1. **Shopify endpoint detection** (`/products/<handle>.json`)
2. **Smart endpoint discovery** based on site patterns
3. **Fallback chain**: JSON endpoint → HTML+JSON-LD → Browser

### Priority 3: Smart Browser Escalation
1. **Detect bot challenges** (403/503 with cf-chl-bypass, px/captcha)
2. **Detect JS-required content** (blank HTML, XHR-populated)
3. **Immediate escalation triggers** vs retry with enhanced HTTP

## UPDATED TODO PRIORITIES

### PHASE 0: HTTP Enhancement (NEW - Highest Impact)
- [ ] Upgrade HTTPJsonLdExtractor headers to realistic browser profile
- [ ] Add tough-cookie jar for session persistence  
- [ ] Add robots.txt checking capability
- [ ] Implement jitter in rate limiting
- [ ] Test on Glasswing - target 80%+ success rate

### PHASE 1: Browser Foundation Fixes (Still Critical)
- [ ] Fix BrowserManagerBrowserless /playwright endpoint  
- [ ] Fix session lifecycle for multiplexing
- [ ] Replace CDP with proper Playwright connection
- [ ] Test browser fallback works reliably

## EXPECTED IMPACT

```
CURRENT STATE:
HTTP: 50% success (2/4 URLs)
Browser Fallback: Failing with errors

TARGET STATE:  
HTTP: 80%+ success (enhanced headers + cookies)
Browser Fallback: Reliable for remaining 20%
Overall: 40% → 70%+ extraction success
```

## COST/PERFORMANCE ANALYSIS

```
Enhanced HTTP Approach:
- Cost: Very low (no browser minutes)
- Speed: 300-400ms per extraction  
- Detection Risk: Lower with realistic headers
- Infrastructure: Minimal

Browser Fallback:  
- Cost: High (Browserless minutes)
- Speed: 5-15s per extraction
- Detection Risk: Higher but necessary for JS sites
- Infrastructure: 3 browser limit
```

## NEXT IMMEDIATE ACTIONS

1. **Start with Phase 0** - Enhance HTTPJsonLdExtractor (biggest bang for buck)
2. **Test on Glasswing URLs** - Measure improvement from 50% to target 80%+
3. **Then proceed to Browser fixes** - For the remaining 20% fallback cases

This approach follows CLAUDE.md principle: **"Practical improvements that work TODAY are worth more than perfect solutions for tomorrow"**