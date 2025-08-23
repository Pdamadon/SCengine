/**
 * Tests for UrlCanonicalizer
 * Verifies that the extracted logic matches the proven approach from test_all_filters_robust.js
 */

const { canonicalizeUrl, areUrlsEquivalent, canonicalizeUrls, getUniqueUrls, UrlCanonicalizer } = require('../UrlCanonicalizer');

describe('UrlCanonicalizer', () => {
    describe('canonicalizeUrl (simple function)', () => {
        test('removes query parameters like the working test', () => {
            // Test the exact scenario from test_all_filters_robust.js
            const urlWithParams = 'https://glasswingshop.com/products/nike-air-max?_fid=123&_pos=1&_ss=r';
            const expected = 'https://glasswingshop.com/products/nike-air-max';
            
            expect(canonicalizeUrl(urlWithParams)).toBe(expected);
        });

        test('removes hash fragments', () => {
            const url = 'https://example.com/product#section';
            expect(canonicalizeUrl(url)).toBe('https://example.com/product');
        });

        test('removes both query params and hash', () => {
            const url = 'https://example.com/product?param=value#section';
            expect(canonicalizeUrl(url)).toBe('https://example.com/product');
        });

        test('handles URLs without params', () => {
            const url = 'https://example.com/product';
            expect(canonicalizeUrl(url)).toBe('https://example.com/product');
        });

        test('handles empty/invalid URLs gracefully', () => {
            expect(canonicalizeUrl('')).toBe('');
            expect(canonicalizeUrl(null)).toBe(null);
            expect(canonicalizeUrl(undefined)).toBe(undefined);
        });
    });

    describe('areUrlsEquivalent', () => {
        test('identifies equivalent URLs with different params', () => {
            const url1 = 'https://example.com/product?_fid=123';
            const url2 = 'https://example.com/product?_pos=456';
            const url3 = 'https://example.com/product';
            
            expect(areUrlsEquivalent(url1, url2)).toBe(true);
            expect(areUrlsEquivalent(url1, url3)).toBe(true);
            expect(areUrlsEquivalent(url2, url3)).toBe(true);
        });

        test('identifies different URLs', () => {
            const url1 = 'https://example.com/product1';
            const url2 = 'https://example.com/product2';
            
            expect(areUrlsEquivalent(url1, url2)).toBe(false);
        });
    });

    describe('getUniqueUrls', () => {
        test('deduplicates URLs like the working test expects', () => {
            // Simulate the 50 → 20 unique products scenario
            const urls = [
                'https://glasswingshop.com/products/nike-air-max',
                'https://glasswingshop.com/products/nike-air-max?_fid=123',
                'https://glasswingshop.com/products/nike-air-max?_pos=1',
                'https://glasswingshop.com/products/adidas-shoe',
                'https://glasswingshop.com/products/adidas-shoe?_fid=456',
            ];

            const unique = getUniqueUrls(urls);
            
            expect(unique).toHaveLength(2);
            expect(unique).toContain('https://glasswingshop.com/products/nike-air-max');
            expect(unique).toContain('https://glasswingshop.com/products/adidas-shoe');
        });
    });

    describe('UrlCanonicalizer class', () => {
        test('uses simple approach by default', () => {
            const canonicalizer = new UrlCanonicalizer();
            const url = 'https://example.com/product?_fid=123&utm_source=google';
            
            expect(canonicalizer.canonicalize(url)).toBe('https://example.com/product');
        });

        test('can preserve specific parameters', () => {
            const canonicalizer = new UrlCanonicalizer({
                preserveParams: ['sku', 'variant']
            });
            
            const url = 'https://example.com/product?sku=123&_fid=456&variant=red';
            const result = canonicalizer.canonicalize(url);
            
            // Should preserve sku and variant, remove _fid
            expect(result).toContain('sku=123');
            expect(result).toContain('variant=red');
            expect(result).not.toContain('_fid=456');
        });
    });

    describe('Integration with proven deduplication logic', () => {
        test('matches exact logic from test_all_filters_robust.js line 138', () => {
            const testUrl = 'https://glasswingshop.com/products/nike-air-max?_fid=123&_pos=1&_ss=r';
            
            // Original logic: product.url.split('?')[0]
            const originalLogic = testUrl.split('?')[0];
            
            // Our canonicalizer
            const ourResult = canonicalizeUrl(testUrl);
            
            expect(ourResult).toBe(originalLogic);
        });
    });
});