# HTTP-First Strategy + Browser Multiplexing - 2025-08-23

## 🚀 STRATEGIC PIVOT: HTTP Enhancement First (HIGHEST IMPACT)
**Goal:** Improve HTTP extraction from 50% → 80%+ success rate with minimal changes
**Why First:** Biggest impact, lowest risk, works TODAY

## PHASE 0: HTTP Enhancement (START HERE)
**Current**: 2/4 URLs successful (50%) - "ProductCatalogBot" headers scream bot
**Target**: 80%+ success with realistic browser headers + cookie persistence

### Task 0.1: Upgrade HTTPJsonLdExtractor Headers (PRIORITY 1)
- [ ] Replace bot-like User-Agent with realistic Chrome profile
- [ ] Add realistic Accept, Accept-Language, Cache-Control headers
- [ ] Add Sec-Fetch-* headers for authenticity
- [ ] File: `src/core/extraction/http/HTTPJsonLdExtractor.js` lines 75-81
- [ ] Test immediately with Glasswing URLs

### Task 0.2: Add Cookie Persistence
- [ ] Install tough-cookie: `npm install tough-cookie`
- [ ] Add cookie jar to HTTPJsonLdExtractor class
- [ ] Persist cookies across requests per domain
- [ ] Test session-dependent products

### Task 0.3: Add Robots.txt Respect  
- [ ] Check robots.txt before making requests
- [ ] Add configurable robots.txt compliance
- [ ] Skip or delay based on crawl-delay directive

### Task 0.4: Enhanced Rate Limiting with Jitter
- [ ] Add random jitter to request timing
- [ ] Implement exponential backoff on 429/503 errors  
- [ ] Make rate limiting more human-like

### Task 0.5: Validation & Measurement
- [ ] Test enhanced HTTP on original 4 Glasswing URLs
- [ ] Measure success rate improvement (target: 50% → 80%+)
- [ ] Document which URLs now work vs still fail
- [ ] Identify remaining failure patterns for browser fallback

---

## PHASE 1: Browser Foundation Fixes (AFTER HTTP Enhancement)
**Goal:** Fix BrowserManagerBrowserless architectural issues for remaining 20% fallback cases

### Task 1.1: Fix WebSocket Endpoint
- [ ] Update `src/common/BrowserManagerBrowserless.js` line 31
- [ ] Change: `'wss://production-sfo.browserless.io'` to `'wss://production-sfo.browserless.io/playwright'`
- [ ] Test connection works with existing test

### Task 1.2: Replace CDP Connection with Playwright
- [ ] Line 257: Replace `chromium.connectOverCDP(bqlSession.wsURL)` with `chromium.connect()`
- [ ] Line 280: Replace `chromium.connectOverCDP(wsUrl)` with `chromium.connect()` 
- [ ] Remove CDP-specific session handling where needed
- [ ] Validate full Playwright features work

### Task 1.3: Fix Session Lifecycle (CRITICAL)
- [ ] Update close() function (lines 450-453) to close context/page only
- [ ] Update closeSession() (lines 692-694) to avoid browser.close()
- [ ] Add browser reference counting for proper cleanup
- [ ] Test: Ensure no resource leaks, browsers stay alive for reuse

### Task 1.4: Move Proxy Configuration to WS Query String
- [ ] Update buildBrowserlessUrl() to include proxy params in URL
- [ ] Remove proxy from context options (lines 300-312)
- [ ] Format: `ws://endpoint?token=X&proxy=http://user:pass@host:port`
- [ ] Test proxy functionality still works

### Task 1.5: Add Feature Detection for BQL Commands  
- [ ] Wrap Browserless.liveURL calls in try/catch
- [ ] Wrap Browserless.solveCaptcha calls in try/catch
- [ ] Add graceful fallbacks when commands not available

### Task 1.6: Fix Node.js Compatibility
- [ ] Replace `require('node-fetch')` with built-in fetch (Node 18+)
- [ ] Test import compatibility

## VALIDATION STRATEGY
After each task, run:
```bash
node tests/active/test_http_extraction_glasswing.js
```

**Expected Results:**
- HTTP extraction maintains ~50% success rate
- Browser fallback stops crashing with null errors  
- No "TypeError: browser is not a constructor" errors
- Sessions clean up properly

## PHASE 2: Browser Pooling (Future)
- [ ] Design BrowserPool component
- [ ] Implement ContextManager with domain affinity
- [ ] Create configuration via environment variables

## PHASE 3: Queue Enhancement (Future) 
- [ ] Implement smart scheduling HTTP vs browser
- [ ] Add fair distribution across domains
- [ ] Performance optimization with micro-batching

---

## Session Notes

### Current Status
- HTTP-first extraction working: 2/4 URLs successful (50% rate)
- Browser fallback failing with "Cannot read properties of null" errors
- BrowserManagerBrowserless has known architectural issues

### Key Insights  
- Browserless.io limits: 3 concurrent browsers total
- HTTP extraction: 300-400ms when successful
- Browser fallback: 5-15s when working properly  
- Need foundation fixes before multiplexing possible

### Next Immediate Action
**START WITH TASK 0.1** - Upgrade HTTPJsonLdExtractor headers (could jump success rate from 50% → 80% immediately)

### Strategic Rationale
- **HTTP enhancement**: Low risk, high impact, works TODAY
- **Browser fixes**: Still needed for remaining 20% fallback cases
- **Multiplexing**: Build on stable foundation after both HTTP + browser work

### Expected Impact Timeline
- **Phase 0 completion**: 40% → 60-70% overall success rate
- **Phase 1 completion**: 60-70% → 70-80% overall success rate  
- **Phase 2/3 completion**: 70-80% → 80%+ with full multiplexing