# Quick commands for local testing with proxy protection

# Default test file
TEST_FILE ?= test_product_catalog_with_site_selectors.js

# Test with proxy (safe for your IP)
test:
	@echo "🔒 Running test with proxy..."
	@node run_with_proxy.js $(TEST_FILE)

# Test glasswing specifically
test-glasswing:
	@node run_with_proxy.js test_glasswing_product_structure.js

# Test resource blocking
test-blocking:
	@node run_with_proxy.js test_resource_blocking.js

# Verify proxy is working
test-proxy:
	@node test_proxy_forced.js

# Run with hot reload (watches for changes)
watch:
	@echo "👁️ Watching for changes..."
	@npx nodemon --exec "node run_with_proxy.js" $(TEST_FILE)

# Check what's in the output folder
check-output:
	@echo "📁 Recent output files:"
	@ls -lt data/output/data/ | head -10

# Clean output folder (keep last 5 files)
clean-output:
	@echo "🗑️ Cleaning old output files..."
	@cd data/output/data && ls -t | tail -n +6 | xargs rm -f
	@echo "✅ Kept last 5 files"

# Setup local testing environment
setup:
	@chmod +x setup_local_proxy_testing.sh
	@./setup_local_proxy_testing.sh

# Quick test of current changes
quick:
	@clear
	@echo "🚀 Quick test with proxy..."
	@node run_with_proxy.js $(TEST_FILE) | grep -E "^(✅|❌|📦|🛍️|📊)"

# Help
help:
	@echo "Available commands:"
	@echo "  make test              - Run test with proxy"
	@echo "  make test-glasswing    - Test Glasswing specifically"
	@echo "  make test-blocking     - Test resource blocking"
	@echo "  make test-proxy        - Verify proxy configuration"
	@echo "  make watch             - Run with hot reload"
	@echo "  make check-output      - See recent output files"
	@echo "  make clean-output      - Clean old output files"
	@echo "  make quick             - Quick test (summary only)"
	@echo ""
	@echo "Specify different test file:"
	@echo "  make test TEST_FILE=my_test.js"

.PHONY: test test-glasswing test-blocking test-proxy watch check-output clean-output setup quick help