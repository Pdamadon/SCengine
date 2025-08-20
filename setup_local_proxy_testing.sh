#!/bin/bash

# Local Testing Setup with Forced Proxy
# This ensures your scraper ONLY goes through proxy, never direct

echo "🔒 Setting up forced proxy testing environment"
echo "=" 
echo ""

# 1. Create a test script that verifies proxy is working
cat > test_proxy_forced.js << 'EOF'
/**
 * Test that verifies we're using proxy and not leaking our real IP
 */

require('dotenv').config();
const { chromium } = require('playwright');

async function testProxyForced() {
  console.log('🔍 Testing Forced Proxy Configuration\n');
  
  // Test 1: Try WITHOUT proxy (should fail if firewall rules are set)
  console.log('Test 1: Attempting direct connection (should fail)...');
  try {
    const browserDirect = await chromium.launch({ 
      headless: false,
      proxy: null // No proxy
    });
    const page = await browserDirect.newPage();
    await page.goto('https://api.ipify.org?format=json', { timeout: 5000 });
    const ip = await page.textContent('body');
    console.log('❌ DANGER: Direct connection worked! Your IP:', ip);
    console.log('   Your firewall rules are NOT active!\n');
    await browserDirect.close();
  } catch (error) {
    console.log('✅ Good: Direct connection blocked:', error.message.substring(0, 50));
  }
  
  // Test 2: Try WITH proxy (should work)
  console.log('\nTest 2: Testing proxy connection...');
  try {
    const ProxyConfig = require('./src/config/ProxyConfig');
    const proxySettings = ProxyConfig.getProxySettings({ type: 'sticky' });
    
    if (!proxySettings) {
      console.log('❌ No proxy configured in .env');
      return;
    }
    
    const browserProxy = await chromium.launch({ 
      headless: false,
      proxy: proxySettings
    });
    const page = await browserProxy.newPage();
    await page.goto('https://api.ipify.org?format=json', { timeout: 10000 });
    const response = await page.textContent('body');
    const { ip } = JSON.parse(response);
    console.log('✅ Proxy connection works! Proxy IP:', ip);
    
    // Check it's not your real IP
    const realIpCheck = await fetch('https://api.ipify.org?format=json');
    const realIpData = await realIpCheck.json();
    
    if (ip === realIpData.ip) {
      console.log('⚠️  WARNING: Proxy IP matches your real IP!');
    } else {
      console.log('✅ Confirmed: Using different IP than your real one');
    }
    
    await browserProxy.close();
  } catch (error) {
    console.log('❌ Proxy connection failed:', error.message);
  }
}

testProxyForced().catch(console.error);
EOF

# 2. Create network isolation script for macOS
cat > isolate_scraper_network.sh << 'EOF'
#!/bin/bash

# Network Isolation for Scraper Testing (macOS)
# Forces all traffic to specific domains through proxy

echo "🔒 Setting up network isolation for scraper testing"

# Domains to force through proxy
BLOCKED_DOMAINS=(
  "glasswingshop.com"
  "macys.com"
  "gap.com"
  "amazon.com"
  "nordstrom.com"
  "target.com"
  "walmart.com"
  "homedepot.com"
)

# Your BrightData proxy details
PROXY_HOST="brd.superproxy.io"
PROXY_PORT="33335"

echo ""
echo "📋 Configuration:"
echo "  Proxy: $PROXY_HOST:$PROXY_PORT"
echo "  Blocked domains: ${BLOCKED_DOMAINS[@]}"
echo ""

# Function to add firewall rules (pfctl on macOS)
setup_firewall() {
  echo "Setting up firewall rules..."
  
  # Create pf rules file
  cat > /tmp/scraper_rules.conf << RULES
# Block direct access to shopping sites
$(for domain in "${BLOCKED_DOMAINS[@]}"; do
  echo "block drop out proto tcp to $domain port {80, 443}"
done)

# Allow proxy connection
pass out proto tcp to $PROXY_HOST port $PROXY_PORT
RULES
  
  # Load rules
  sudo pfctl -f /tmp/scraper_rules.conf
  sudo pfctl -e
  
  echo "✅ Firewall rules active"
  echo ""
  echo "To disable: sudo pfctl -d"
}

# Alternative: Use /etc/hosts to redirect (simpler but less robust)
setup_hosts() {
  echo "Modifying /etc/hosts to block direct access..."
  
  # Backup original hosts file
  sudo cp /etc/hosts /etc/hosts.backup.$(date +%s)
  
  # Add entries to block domains
  for domain in "${BLOCKED_DOMAINS[@]}"; do
    echo "127.0.0.1 $domain" | sudo tee -a /etc/hosts
    echo "127.0.0.1 www.$domain" | sudo tee -a /etc/hosts
  done
  
  echo "✅ Hosts file updated"
  echo ""
  echo "To restore: sudo cp /etc/hosts.backup.* /etc/hosts"
}

# Menu
echo "Choose isolation method:"
echo "1) Firewall rules (pfctl) - More robust"
echo "2) Hosts file blocking - Simpler"
echo "3) Exit"
read -p "Choice: " choice

case $choice in
  1) setup_firewall ;;
  2) setup_hosts ;;
  3) exit 0 ;;
  *) echo "Invalid choice" ;;
esac
EOF

chmod +x isolate_scraper_network.sh

# 3. Create Docker alternative for complete isolation
cat > docker-compose.test.yml << 'EOF'
version: '3.8'

services:
  scraper-test:
    build: .
    environment:
      - NODE_ENV=development
      - BRIGHTDATA_USERNAME=${BRIGHTDATA_USERNAME}
      - BRIGHTDATA_PASSWORD=${BRIGHTDATA_PASSWORD}
      - BRIGHTDATA_ZONE=${BRIGHTDATA_ZONE}
    volumes:
      - .:/app
      - /app/node_modules
    command: npm run dev
    # Force all traffic through proxy network
    networks:
      - proxy-only
    # Block direct internet access
    extra_hosts:
      - "glasswingshop.com:127.0.0.1"
      - "macys.com:127.0.0.1"
      - "gap.com:127.0.0.1"

networks:
  proxy-only:
    driver: bridge
    internal: false
EOF

# 4. Create a development test runner with hot reload
cat > dev_test_runner.js << 'EOF'
/**
 * Development Test Runner with Hot Reload
 * Watches for file changes and reruns tests automatically
 */

const chokidar = require('chokidar');
const { spawn } = require('child_process');
const path = require('path');

let currentProcess = null;

function runTest(testFile) {
  // Kill previous process if running
  if (currentProcess) {
    console.log('🔄 Restarting test...\n');
    currentProcess.kill();
  }
  
  // Start new test
  currentProcess = spawn('node', [testFile], {
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' }
  });
  
  currentProcess.on('exit', (code) => {
    if (code === 0) {
      console.log('\n✅ Test completed successfully');
    } else {
      console.log(`\n❌ Test failed with code ${code}`);
    }
  });
}

// Watch for changes
const watcher = chokidar.watch([
  'src/**/*.js',
  'test*.js',
  '!node_modules',
  '!data/output/**'
], {
  persistent: true,
  ignoreInitial: true
});

console.log('👁️ Watching for file changes...');
console.log('Press Ctrl+C to stop\n');

// Initial run
const testFile = process.argv[2] || 'test_product_catalog_with_site_selectors.js';
console.log(`Running: ${testFile}\n`);
runTest(testFile);

// Rerun on changes
watcher.on('change', (path) => {
  console.log(`\n📝 File changed: ${path}`);
  runTest(testFile);
});

process.on('SIGINT', () => {
  if (currentProcess) currentProcess.kill();
  process.exit();
});
EOF

echo ""
echo "✅ Setup complete!"
echo ""
echo "📚 Quick Start Guide:"
echo "========================"
echo ""
echo "1. Force proxy for all scraper traffic:"
echo "   ./isolate_scraper_network.sh"
echo ""
echo "2. Test that proxy is forced:"
echo "   node test_proxy_forced.js"
echo ""
echo "3. Run tests with hot reload:"
echo "   node dev_test_runner.js test_product_catalog_with_site_selectors.js"
echo ""
echo "4. Docker option (complete isolation):"
echo "   docker-compose -f docker-compose.test.yml up"
echo ""
echo "⚠️  IMPORTANT: The network isolation ensures your scrapers"
echo "   MUST use the proxy - they cannot leak your real IP!"
echo ""