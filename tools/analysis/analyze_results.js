const fs = require('fs');
const data = JSON.parse(fs.readFileSync('glasswing_full_site_2025-08-11T06-07-32.json', 'utf8'));

console.log('=== GLASSWING FULL SITE SCRAPING ANALYSIS ===\n');

// Performance Analysis
console.log('📊 PERFORMANCE METRICS:');
console.log(`Total Runtime: ${data.scrapeInfo.totalTime} seconds (${data.performance.timeInHours} hours)`);
console.log(`Products Found: ${data.discovery.totalProductsFound}`);
console.log(`Products Scraped: ${data.results.totalProductsScraped}`);
console.log(`Success Rate: ${data.results.successRate}%`);
console.log(`Scraping Rate: ${data.performance.productsPerSecond} products/second`);
console.log(`Speedup vs Sequential: ${data.performance.speedupVsSequential}x`);
console.log(`Concurrent Processes: ${data.scrapeInfo.concurrentProcesses}`);

// Batch Analysis
console.log(`\nBatches: ${data.results.totalBatches} total`);
console.log(`Successful Batches: ${data.results.successfulBatches}`);
console.log(`Failed Batches: ${data.results.failedBatches}`);

// Product Analysis
const products = data.products;
console.log(`\n🛍️ PRODUCT DATA ANALYSIS:`);
console.log(`Total Products in Dataset: ${products.length}`);

// Price Analysis
const prices = products
  .map(p => p.productData?.price)
  .filter(p => p && p.includes('$'))
  .map(p => parseFloat(p.replace(/[$,]/g, '')))
  .filter(p => !Number.isNaN(p));

if (prices.length > 0) {
  prices.sort((a, b) => a - b);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const min = prices[0];
  const max = prices[prices.length - 1];
  const median = prices[Math.floor(prices.length / 2)];
  
  console.log(`Products with Prices: ${prices.length}`);
  console.log(`Price Range: $${min} - $${max}`);
  console.log(`Average Price: $${avg.toFixed(2)}`);
  console.log(`Median Price: $${median}`);
}

// Brand Analysis
const brands = {};
products.forEach(p => {
  const title = p.productData?.title || '';
  const firstWord = title.split(' ')[0];
  if (firstWord) {
    brands[firstWord] = (brands[firstWord] || 0) + 1;
  }
});

const topBrands = Object.entries(brands)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

console.log(`\n🏷️ TOP BRANDS/CATEGORIES:`);
topBrands.forEach(([brand, count]) => {
  console.log(`${brand}: ${count} products`);
});

// Data Quality Analysis
const dataQuality = {
  hasTitle: products.filter(p => p.productData?.title).length,
  hasPrice: products.filter(p => p.productData?.price).length,
  hasVariants: products.filter(p => p.variants?.length > 0).length,
  hasImages: products.filter(p => p.images?.length > 0).length,
  hasWorkflow: products.filter(p => p.workflowActions?.length > 0).length
};

console.log(`\n✅ DATA QUALITY METRICS:`);
console.log(`Products with Titles: ${dataQuality.hasTitle} (${(dataQuality.hasTitle/products.length*100).toFixed(1)}%)`);
console.log(`Products with Prices: ${dataQuality.hasPrice} (${(dataQuality.hasPrice/products.length*100).toFixed(1)}%)`);
console.log(`Products with Variants: ${dataQuality.hasVariants} (${(dataQuality.hasVariants/products.length*100).toFixed(1)}%)`);
console.log(`Products with Images: ${dataQuality.hasImages} (${(dataQuality.hasImages/products.length*100).toFixed(1)}%)`);
console.log(`Products with Workflows: ${dataQuality.hasWorkflow} (${(dataQuality.hasWorkflow/products.length*100).toFixed(1)}%)`);

console.log(`\n💾 FILE METRICS:`);
console.log(`JSON File Size: 2.9MB`);
console.log(`Total Lines: 109,370`);
console.log(`Data Density: ${(2.9/products.length*1000).toFixed(2)}KB per product`);

console.log(`\n⚡ PERFORMANCE COMPARISON:`);
console.log(`Previous Best: ~67 products in 3.3 minutes`);
console.log(`This Run: 1,000 products in 52 minutes`);
console.log(`Improvement: ${Math.round(1000/67)}x more products in ${Math.round(52/3.3)}x more time`);
console.log(`Efficiency: ${((67/3.3) / (1000/52)).toFixed(2)}x more efficient per minute`);

// Sample some products
console.log(`\n🔍 SAMPLE PRODUCTS:`);
const sampleProducts = products.slice(0, 5);
sampleProducts.forEach((product, i) => {
  console.log(`${i+1}. ${product.productData?.title} - ${product.productData?.price}`);
});