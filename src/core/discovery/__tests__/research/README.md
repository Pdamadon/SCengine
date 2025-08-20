# RESEARCH TEST FILES
**Experimental extraction logic and proof-of-concepts**

## DIRECTORY STRUCTURE

### `research/macys/`
**High-value successful extractions from Macy's:**
- `test_product_extraction_with_browser_manager.js` - **69 products extracted, 100% anti-bot bypass**
- `examine_2_categories_only.js` - **161 navigation items, perfect data quality**  
- `test_fixed_macys_extraction.js` - **868 navigation items, 95% accuracy**
- `test_macys_detailed.js` - Detailed navigation analysis
- `test_macys_meganav.js` - Mega-menu specific extraction
- `debug_link_extraction_macys.js` - Link extraction debugging

### `research/glasswing/` 
**Glasswing shop extraction research:**
- `test_glasswing_original_meganav.js` - Original mega-menu strategy testing

### `research/gap/`
**Gap.com research (future):**
- *Ready for Gap-specific research files*

### `integration/`
**System integration tests:**
- `test_navigation_mapper.js` - NavigationMapper integration testing
- `test_centralized_browser_manager.js` - BrowserManager integration validation

### `development/`
**Strategy development tests:**
- *Ready for strategy-specific test files*

## PROMOTION WORKFLOW

### Research → Development
```bash
# When research proves successful (>90% success rate):
npm run promote-research -- --site=macys --strategy=navigation
```

### Development → Production  
```bash
# When development strategy is battle-tested (>95% success rate):
npm run promote-production -- --strategy=MacysNavigationStrategy
```

## SUCCESS METRICS

### Macy's Research Results:
- **Navigation Extraction**: 868 items (95% accuracy)
- **Product Extraction**: 69 products (100% success rate)  
- **Anti-Bot Bypass**: 100% success rate with BrowserManager
- **Data Quality**: Perfect URLs and text validation

### Next Steps:
1. Extract successful patterns into development strategies
2. Add comprehensive error handling and edge cases
3. Promote to production with full monitoring

## RESEARCH GUIDELINES

### File Naming Convention:
- `test_[site]_[focus].js` - Main research files
- `debug_[specific_issue].js` - Debugging specific problems  
- `examine_[data_analysis].js` - Data quality analysis

### Required Documentation:
Each research file should include:
```javascript
/**
 * RESEARCH: [Site] [Focus Area]
 * 
 * SUCCESS METRICS:
 * - Items extracted: X
 * - Success rate: X%
 * - Anti-bot bypass: Yes/No
 * - Data quality: Perfect/Good/Needs work
 * 
 * KEY DISCOVERIES:
 * - [Pattern 1]: Working selector approach
 * - [Pattern 2]: Timing requirements  
 * - [Pattern 3]: Error handling needs
 * 
 * PROMOTION READINESS: Ready/Needs work/Experimental
 */
```