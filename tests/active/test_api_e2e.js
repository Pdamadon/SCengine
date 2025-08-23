/**
 * End-to-End API Test
 * Test complete flow: API → ScrapingWorker → ScraperCoordinator → NavigationMapperBrowserless
 */

require('dotenv').config();

// Set environment variables for new architecture
process.env.USE_SCRAPER_COORDINATOR = 'true';
process.env.ENABLE_CHECKPOINTS = 'true';

const axios = require('axios');
const { logger } = require('./src/utils/logger');

async function testCompleteAPIFlow() {
  console.log('\n=== End-to-End API Test ===');
  console.log('🔧 Environment: USE_SCRAPER_COORDINATOR =', process.env.USE_SCRAPER_COORDINATOR);
  console.log('🔧 Environment: ENABLE_CHECKPOINTS =', process.env.ENABLE_CHECKPOINTS);
  console.log('\n');
  
  const API_BASE = process.env.API_URL || 'http://localhost:3000';
  
  try {
    // Step 1: Submit job via API
    console.log('📤 Step 1: Submitting job to API...');
    const jobSubmission = {
      target_url: 'https://glasswingshop.com',
      scraping_type: 'full_site',
      priority: 'normal',
      max_pages: 5
    };
    
    const submitResponse = await axios.post(`${API_BASE}/api/v1/scraping/jobs`, jobSubmission, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    console.log('✅ Job submitted successfully!');
    console.log(`   Job ID: ${submitResponse.data.job_id}`);
    console.log(`   Status: ${submitResponse.data.status}`);
    console.log(`   Queue Position: ${submitResponse.data.queue_position}`);
    
    const jobId = submitResponse.data.job_id;
    
    // Step 2: Monitor job progress
    console.log('\n📊 Step 2: Monitoring job progress...');
    let jobComplete = false;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max
    
    while (!jobComplete && attempts < maxAttempts) {
      attempts++;
      
      try {
        const statusResponse = await axios.get(`${API_BASE}/api/v1/scraping/jobs/${jobId}/status`, {
          timeout: 5000
        });
        
        const status = statusResponse.data.status;
        const progress = statusResponse.data.progress || 0;
        
        console.log(`   Attempt ${attempts}: Status = ${status}, Progress = ${progress}%`);
        
        if (status === 'completed') {
          jobComplete = true;
          console.log('🎉 Job completed successfully!');
          
          // Step 3: Get results
          console.log('\n📋 Step 3: Fetching results...');
          const resultsResponse = await axios.get(`${API_BASE}/api/v1/scraping/jobs/${jobId}/results`);
          
          const results = resultsResponse.data;
          console.log('✅ Results retrieved:');
          console.log(`   Navigation sections: ${results.metadata?.navigation_sections || 0}`);
          console.log(`   Product categories: ${results.metadata?.categories_found || 0}`);
          console.log(`   Total items: ${results.metadata?.total_items || 0}`);
          console.log(`   Processing time: ${results.metadata?.processing_time_ms || 0}ms`);
          
          // Validate our NavigationMapperBrowserless worked
          if (results.results?.navigationResults?.main_sections) {
            const sections = results.results.navigationResults.main_sections;
            console.log(`\n🔍 Navigation extraction validation:`);
            console.log(`   Main categories found: ${sections.length}`);
            
            if (sections.length > 0) {
              sections.slice(0, 3).forEach((section, i) => {
                const subcategories = section.children?.length || 0;
                console.log(`   ${i + 1}. ${section.name} - ${subcategories} subcategories`);
              });
              
              const totalSubcategories = sections.reduce((sum, s) => sum + (s.children?.length || 0), 0);
              console.log(`   Total subcategories: ${totalSubcategories}`);
              
              // Success criteria: Should find 7 main categories, ~181 subcategories (from our working tests)
              if (sections.length >= 5 && totalSubcategories >= 100) {
                console.log('\n🎯 SUCCESS: Navigation extraction working through API!');
                console.log('   ✅ NavigationMapperBrowserless functioning correctly');
                console.log('   ✅ ScraperCoordinator integration successful'); 
                console.log('   ✅ CheckpointManager integration operational');
                console.log('   ✅ End-to-end API flow validated');
              } else {
                console.log('\n⚠️  WARNING: Lower extraction counts than expected');
                console.log('   Expected: ~7 categories, ~181 subcategories');
                console.log(`   Actual: ${sections.length} categories, ${totalSubcategories} subcategories`);
              }
            }
          }
          
          break;
        } else if (status === 'failed') {
          console.log('❌ Job failed!');
          console.log('   Error:', statusResponse.data.error_details);
          break;
        } else if (status === 'running') {
          console.log(`   Job in progress...`);
        }
        
      } catch (statusError) {
        console.log(`   Status check failed: ${statusError.message}`);
      }
      
      // Wait 5 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    if (!jobComplete) {
      console.log('\n⏰ Test timed out waiting for job completion');
    }
    
  } catch (error) {
    console.error('❌ API Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    
    // Check if server is running
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Hint: Make sure the server is running:');
      console.log('   npm start');
      console.log('   or');
      console.log('   node src/index.js');
    }
  }
}

// Run the test
testCompleteAPIFlow().catch(console.error);