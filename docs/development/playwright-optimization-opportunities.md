# Playwright Methods We Should Be Using for Better Scraping

## 🚀 Methods We're Missing That Would Help

### 1. **Locator API** (Auto-waiting & Retry)
We're barely using locators! They auto-wait and retry:
```javascript
// Instead of:
await page.waitForSelector('.product');
const products = await page.evaluate(() => document.querySelectorAll('.product'));

// Use:
const products = await page.locator('.product').all();
for (const product of products) {
  const title = await product.locator('.title').textContent();
  const price = await product.locator('.price').textContent();
}
```

### 2. **waitForResponse()** - Know when data loads
```javascript
// Wait for product API to return before scraping
const responsePromise = page.waitForResponse(response => 
  response.url().includes('/api/products') && response.status() === 200
);
await page.click('button.load-more');
await responsePromise; // Now products are loaded!
```

### 3. **route()** - Block unnecessary resources
```javascript
// Block images/analytics to speed up scraping
await page.route('**/*.{png,jpg,jpeg,gif,webp,svg}', route => route.abort());
await page.route('**/analytics/**', route => route.abort());
await page.route('**/facebook.**', route => route.abort());
```

### 4. **getByRole()** / **getByText()** - More reliable than CSS
```javascript
// Instead of brittle CSS selectors:
await page.click('.btn-primary.next-page');

// Use semantic queries:
await page.getByRole('button', { name: 'Next Page' }).click();
await page.getByText('Load More Products').click();
```

### 5. **scrollIntoViewIfNeeded()** - For lazy-loaded content
```javascript
// Trigger lazy loading
const lastProduct = page.locator('.product').last();
await lastProduct.scrollIntoViewIfNeeded();
```

### 6. **waitForLoadState('networkidle')** - For dynamic sites
```javascript
// After clicking filter, wait for network to settle
await page.click('[data-filter="brand"]');
await page.waitForLoadState('networkidle'); // All AJAX done
```

### 7. **page.request** - Direct API calls
```javascript
// Skip the UI, hit the API directly!
const apiResponse = await page.request.get('https://site.com/api/products?page=2');
const products = await apiResponse.json();
```

### 8. **exposeFunction()** - Complex data processing
```javascript
// Process data in Node.js context (faster!)
await page.exposeFunction('processProduct', (product) => {
  // Do heavy processing in Node, not browser
  return {
    ...product,
    normalized_price: parseFloat(product.price.replace(/[^0-9.]/g, ''))
  };
});

const products = await page.evaluate(async () => {
  const raw = document.querySelectorAll('.product');
  return Promise.all(
    Array.from(raw).map(el => window.processProduct({...}))
  );
});
```

### 9. **page.on('response')** - Monitor all network traffic
```javascript
// Capture product data from XHR/fetch calls
page.on('response', async response => {
  if (response.url().includes('/api/products')) {
    const products = await response.json();
    // Got products without even looking at DOM!
  }
});
```

### 10. **dragAndDrop()** - For sites with drag interactions
```javascript
// Some sites use drag to reveal more products
await page.dragAndDrop('.drag-handle', '.drop-zone');
```

## 🎯 Immediate Wins for Our Scraper

### 1. Replace evaluate() with Locator API
- **Current**: 97 uses of `page.evaluate()`
- **Better**: Use `locator()` for auto-waiting and cleaner code

### 2. Block Resources We Don't Need
```javascript
// Add to BrowserManager
async blockUnnecessaryResources(page) {
  await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2,ttf,otf}', 
    route => route.abort()
  );
  await page.route('**/google-analytics.com/**', route => route.abort());
  await page.route('**/doubleclick.net/**', route => route.abort());
  await page.route('**/facebook.com/**', route => route.abort());
}
```

### 3. Use Network Monitoring for Product Data
Instead of scraping DOM, intercept API responses!

### 4. Replace waitForTimeout() with Smart Waits
- **Current**: 85 uses of `waitForTimeout()`
- **Better**: Use `waitForResponse()`, `waitForLoadState()`, or locator auto-waiting

## 📊 Performance Impact

Using these methods could:
- **Speed**: 2-5x faster (blocking resources, API interception)
- **Reliability**: 90% fewer flaky tests (auto-waiting locators)
- **Simplicity**: 50% less code (Locator API vs evaluate)

## Next Steps

1. **Refactor ProductCatalogStrategy** to use Locator API
2. **Add resource blocking** to BrowserManager
3. **Implement API interception** for known e-commerce platforms
4. **Replace waitForTimeout** with event-based waiting