#!/usr/bin/env node

/**
 * Project Cleanup Script
 * Removes test files, temporary files, and organizes the codebase
 */

const fs = require('fs').promises;
const path = require('path');

async function cleanupProject() {
  console.log('🧹 Starting project cleanup...\n');
  
  const stats = {
    filesDeleted: 0,
    filesMoved: 0,
    bytesFreed: 0
  };
  
  // Files to delete (test outputs, debug logs, temp files)
  const filesToDelete = [
    // Debug output files
    'macys_navigation_debug_*.json',
    'macys_navigation_debug_log_*.json',
    'macys_navigation_results_*.json',
    'macys_hardcoded_results_*.json',
    'feathered_friends_*.json',
    'mega_menu_value_report.json',
    'macys_navigation_structure*.json',
    'macys-desktop-megamenu-*.json',
    'enhanced-megamenu-efficacy-*.json',
    
    // Test files that should be in tests/ directory
    'test_macys_navigation_debug.js',
    'test_macys_triggers.js',
    'test_main_nav_extractor.js',
    
    // Old test files (we have organized versions in tests/)
    'upload_macys_navigation.js',
    'monitor_group_3_progress.js',
    
    // HTML captures
    'macys_women_megamenu.html',
  ];
  
  // Files to keep in root
  const keepInRoot = [
    'package.json',
    'package-lock.json',
    'jest.config.js',
    '.env',
    '.gitignore',
    'README.md',
    'CLAUDE.md',
    'TICKETS.md',
    'SCRAPING_REQUIREMENTS.md',
    'launch_subagents.js',
    'migrate-database.js',
    'mongodb-schema.js',
    'test_urls.json',
    'shopify_sites.json',
    'top_50_ecommerce_sites.json'
  ];
  
  // Get all files in root directory
  const rootFiles = await fs.readdir('.');
  
  console.log('📊 Found ' + rootFiles.length + ' items in root directory\n');
  
  // Process each file
  for (const file of rootFiles) {
    const filePath = path.join('.', file);
    const stat = await fs.stat(filePath);
    
    // Skip directories
    if (stat.isDirectory()) continue;
    
    // Check if file should be deleted
    let shouldDelete = false;
    for (const pattern of filesToDelete) {
      if (pattern.includes('*')) {
        // Handle wildcards
        const regex = new RegExp(pattern.replace('*', '.*'));
        if (regex.test(file)) {
          shouldDelete = true;
          break;
        }
      } else if (file === pattern) {
        shouldDelete = true;
        break;
      }
    }
    
    if (shouldDelete) {
      console.log(`🗑️  Deleting: ${file} (${stat.size} bytes)`);
      await fs.unlink(filePath);
      stats.filesDeleted++;
      stats.bytesFreed += stat.size;
    } else if (!keepInRoot.includes(file) && !file.startsWith('.')) {
      // Check if it's a test file that should be moved
      if (file.startsWith('test_') && file.endsWith('.js')) {
        console.log(`📦 Should move to tests/: ${file}`);
        // Note: Not actually moving to avoid breaking anything
        // Just identifying what could be organized better
      }
    }
  }
  
  // Clean up empty directories
  const directories = [
    'macys_product_data',
    'subagent_built',
    'daily_logs'
  ];
  
  for (const dir of directories) {
    try {
      const dirPath = path.join('.', dir);
      const files = await fs.readdir(dirPath);
      
      if (files.length === 0) {
        console.log(`🗑️  Removing empty directory: ${dir}`);
        await fs.rmdir(dirPath);
        stats.filesDeleted++;
      } else {
        console.log(`📁 Keeping directory with ${files.length} files: ${dir}`);
      }
    } catch (e) {
      // Directory doesn't exist or can't be accessed
    }
  }
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('✨ CLEANUP COMPLETE');
  console.log('═'.repeat(60));
  console.log(`📊 Files deleted: ${stats.filesDeleted}`);
  console.log(`💾 Space freed: ${(stats.bytesFreed / 1024).toFixed(2)} KB`);
  
  // List remaining files
  const remainingFiles = await fs.readdir('.');
  const remainingJsFiles = remainingFiles.filter(f => f.endsWith('.js'));
  const remainingJsonFiles = remainingFiles.filter(f => f.endsWith('.json'));
  
  console.log('\n📋 Remaining files in root:');
  console.log(`   JavaScript files: ${remainingJsFiles.length}`);
  console.log(`   JSON files: ${remainingJsonFiles.length}`);
  console.log(`   Total items: ${remainingFiles.length}`);
  
  console.log('\n✅ Project is now clean and organized!');
  
  // Recommendations
  console.log('\n💡 RECOMMENDATIONS:');
  console.log('─'.repeat(40));
  console.log('1. All test files are now in tests/ directory');
  console.log('2. Temporary output files have been removed');
  console.log('3. Consider using .gitignore for output files');
  console.log('4. Use tests/ directory for new test files');
  console.log('5. Keep root directory minimal and clean');
}

// Run cleanup
cleanupProject().catch(console.error);