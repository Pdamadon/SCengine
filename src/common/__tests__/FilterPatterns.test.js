/**
 * Tests for FilterPatterns
 * Verifies that the extracted logic matches the proven approach from test_all_filters_robust.js
 */

const { shouldExcludeFilter, filterValidFilters, FilterPatterns, DEFAULT_EXCLUDE_PATTERNS } = require('../FilterPatterns');

describe('FilterPatterns', () => {
    describe('shouldExcludeFilter (simple function)', () => {
        test('excludes filters that match working test patterns', () => {
            // Test exact patterns from test_all_filters_robust.js lines 59-67
            const testCases = [
                { label: 'In Stock', shouldExclude: true },
                { label: 'Out of Stock', shouldExclude: true },
                { label: 'Clear All', shouldExclude: true },
                { label: 'Reset Filters', shouldExclude: true },
                { label: 'Availability', shouldExclude: true },
                { label: 'Price Range', shouldExclude: true },
                { label: '$100-$200', shouldExclude: true },
                
                // Product filters that should NOT be excluded
                { label: 'ACCESSORIES', shouldExclude: false },
                { label: 'BAGS', shouldExclude: false },
                { label: 'NIKE', shouldExclude: false },
                { label: 'SHIRTS', shouldExclude: false },
                { label: 'DENIM', shouldExclude: false }
            ];

            testCases.forEach(({ label, shouldExclude }) => {
                expect(shouldExcludeFilter(label)).toBe(shouldExclude);
            });
        });

        test('handles case insensitive matching', () => {
            expect(shouldExcludeFilter('in stock')).toBe(true);
            expect(shouldExcludeFilter('IN STOCK')).toBe(true);
            expect(shouldExcludeFilter('In Stock')).toBe(true);
        });
    });

    describe('filterValidFilters', () => {
        test('filters array like the working test', () => {
            const mockFilters = [
                { label: 'ACCESSORIES' },
                { label: 'In Stock' },
                { label: 'BAGS' },
                { label: 'Out of Stock' },
                { label: 'SHIRTS' },
                { label: 'Clear All' },
                { label: 'Price Range' },
                { label: 'DENIM' }
            ];

            const filtered = filterValidFilters(mockFilters);
            
            expect(filtered).toHaveLength(4);
            expect(filtered.map(f => f.label)).toEqual([
                'ACCESSORIES', 'BAGS', 'SHIRTS', 'DENIM'
            ]);
        });
    });

    describe('FilterPatterns class', () => {
        test('excludes non-product filters by default', () => {
            const patterns = new FilterPatterns();
            
            expect(patterns.shouldExclude('In Stock')).toBe(true);
            expect(patterns.shouldExclude('Price')).toBe(true);
            expect(patterns.shouldExclude('Sort by')).toBe(true);
            expect(patterns.shouldExclude('$50-100')).toBe(true);
        });

        test('keeps product-related filters by default', () => {
            const patterns = new FilterPatterns();
            
            expect(patterns.shouldExclude('ACCESSORIES')).toBe(false);
            expect(patterns.shouldExclude('NIKE')).toBe(false);
            expect(patterns.shouldExclude('SHIRTS')).toBe(false);
        });

        test('can add custom exclusion patterns', () => {
            const patterns = new FilterPatterns({
                additionalExclude: [/custom/i, 'special']
            });
            
            expect(patterns.shouldExclude('Custom Filter')).toBe(true);
            expect(patterns.shouldExclude('special')).toBe(true);
        });

        test('handles invalid inputs gracefully', () => {
            const patterns = new FilterPatterns();
            
            expect(patterns.shouldExclude('')).toBe(true);
            expect(patterns.shouldExclude(null)).toBe(true);
            expect(patterns.shouldExclude(undefined)).toBe(true);
        });

        test('provides filter stats', () => {
            const patterns = new FilterPatterns();
            const original = [
                { label: 'ACCESSORIES' },
                { label: 'In Stock' },
                { label: 'BAGS' },
                { label: 'Price Range' }
            ];
            const filtered = patterns.filterValidCandidates(original);
            const stats = patterns.getFilterStats(original, filtered);
            
            expect(stats.total).toBe(4);
            expect(stats.kept).toBe(2);
            expect(stats.excluded).toBe(2);
            expect(stats.exclusionRate).toBe('50.0%');
        });
    });

    describe('Integration with proven exclusion logic', () => {
        test('matches exact patterns from test_all_filters_robust.js', () => {
            // Test the exact exclude patterns from lines 59-67
            const testPatterns = [
                /in\s*stock/i,
                /out\s*of\s*stock/i,
                /clear\s*all/i,
                /reset/i,
                /availability/i,
                /price/i,
                /\$\d+/
            ];

            const testLabel = 'In Stock';
            
            // Original logic check
            const originalLogic = testPatterns.some(pattern => pattern.test(testLabel));
            
            // Our filter check
            const ourResult = shouldExcludeFilter(testLabel);
            
            expect(ourResult).toBe(originalLogic);
            expect(ourResult).toBe(true);
        });

        test('correctly identifies all patterns from DEFAULT_EXCLUDE_PATTERNS', () => {
            const testCases = [
                'In Stock',
                'Out of Stock', 
                'Clear All',
                'Reset',
                'Availability',
                'Price',
                '$100',
                'Sort by Price',
                'Pickup',
                'Store Location',
                'Customer Rating'
            ];

            testCases.forEach(label => {
                expect(shouldExcludeFilter(label)).toBe(true);
            });
        });
    });
});