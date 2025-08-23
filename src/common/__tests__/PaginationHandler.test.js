/**
 * Tests for PaginationHandler
 * Verifies pagination logic with mocked page interactions
 */

const { PaginationHandler, getNextNumberedPage, getNextLoadMorePage, basicFetchPage } = require('../PaginationHandler');

// Mock console for testing
const mockLogger = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

describe('PaginationHandler', () => {
    let handler;
    let mockPage;

    beforeEach(() => {
        handler = new PaginationHandler({
            maxPages: 3,
            maxDurationMs: 5000,
            sleepBetweenMs: 0, // No delays in tests
            logger: mockLogger
        });

        mockPage = {
            url: jest.fn(() => 'https://example.com/page-1'),
            goto: jest.fn(),
            $: jest.fn(),
            $$eval: jest.fn(),
            waitForTimeout: jest.fn()
        };

        // Clear mock calls
        Object.values(mockLogger).forEach(fn => fn.mockClear());
    });

    describe('paginate', () => {
        test('handles simple pagination correctly', async () => {
            const urls = [
                'https://example.com/page-1',
                'https://example.com/page-2', 
                'https://example.com/page-3',
                null // End of pages
            ];
            let urlIndex = 0;

            const config = {
                getNextUrl: jest.fn(() => Promise.resolve(urls[++urlIndex])),
                fetchPage: jest.fn(() => Promise.resolve(mockPage)),
                onPage: jest.fn(),
                page: mockPage,
                startUrl: urls[0]
            };

            const results = await handler.paginate(config);

            expect(results.pagesVisited).toBe(3);
            expect(results.completedNormally).toBe(true);
            expect(results.stoppedReason).toBe('no_more_pages');
            expect(config.onPage).toHaveBeenCalledTimes(3);
            expect(config.fetchPage).toHaveBeenCalledTimes(3);
        });

        test('prevents infinite loops with duplicate URLs', async () => {
            const config = {
                getNextUrl: jest.fn(() => Promise.resolve('https://example.com/page-1')), // Always same URL
                fetchPage: jest.fn(() => Promise.resolve(mockPage)),
                onPage: jest.fn(),
                page: mockPage,
                startUrl: 'https://example.com/page-1'
            };

            const results = await handler.paginate(config);

            expect(results.pagesVisited).toBe(1);
            expect(results.duplicateUrls).toBe(1);
            expect(config.onPage).toHaveBeenCalledTimes(1);
        });

        test('respects max pages limit', async () => {
            const config = {
                getNextUrl: jest.fn((page) => Promise.resolve(`https://example.com/page-${Date.now()}`)), // Always new URL
                fetchPage: jest.fn(() => Promise.resolve(mockPage)),
                onPage: jest.fn(),
                page: mockPage,
                startUrl: 'https://example.com/page-1'
            };

            const results = await handler.paginate(config);

            expect(results.pagesVisited).toBe(3); // maxPages = 3
            expect(results.stoppedReason).toBe('max_pages_reached');
        });

        test('handles errors gracefully', async () => {
            const config = {
                getNextUrl: jest.fn(() => Promise.resolve('https://example.com/page-2')),
                fetchPage: jest.fn(() => Promise.reject(new Error('Network error'))),
                onPage: jest.fn(),
                page: mockPage,
                startUrl: 'https://example.com/page-1'
            };

            const results = await handler.paginate(config);

            expect(results.errors).toBe(1);
            expect(results.stoppedReason).toBe('error');
            expect(mockLogger.error).toHaveBeenCalled();
        });

        test('validates required config parameters', async () => {
            await expect(handler.paginate({})).rejects.toThrow('Missing required pagination config');
        });

        test('uses canonicalized URLs for duplicate detection', async () => {
            const config = {
                getNextUrl: jest.fn()
                    .mockResolvedValueOnce('https://example.com/page-2?utm_source=test')
                    .mockResolvedValueOnce('https://example.com/page-2?_fid=123') // Same page, different params
                    .mockResolvedValueOnce(null),
                fetchPage: jest.fn(() => Promise.resolve(mockPage)),
                onPage: jest.fn(),
                page: mockPage,
                startUrl: 'https://example.com/page-1'
            };

            const results = await handler.paginate(config);

            expect(results.pagesVisited).toBe(2); // First page + one unique second page
            expect(results.duplicateUrls).toBe(1); // Third URL was duplicate after canonicalization
        });
    });

    describe('getNextNumberedPage', () => {
        test('finds next page link', async () => {
            const mockLink = {
                getAttribute: jest.fn(() => Promise.resolve('/page-2'))
            };
            mockPage.$ = jest.fn(() => Promise.resolve(mockLink));
            mockPage.url = jest.fn(() => 'https://example.com/page-1');

            const nextUrl = await getNextNumberedPage(mockPage);

            expect(nextUrl).toBe('https://example.com/page-2');
            expect(mockPage.$).toHaveBeenCalledWith('a[rel="next"]');
        });

        test('returns null when no next page', async () => {
            mockPage.$ = jest.fn(() => Promise.resolve(null));

            const nextUrl = await getNextNumberedPage(mockPage);

            expect(nextUrl).toBe(null);
        });

        test('handles relative URLs correctly', async () => {
            const mockLink = {
                getAttribute: jest.fn(() => Promise.resolve('page-3'))
            };
            mockPage.$ = jest.fn(() => Promise.resolve(mockLink));
            mockPage.url = jest.fn(() => 'https://example.com/collections/');

            const nextUrl = await getNextNumberedPage(mockPage);

            expect(nextUrl).toBe('https://example.com/collections/page-3');
        });
    });

    describe('getNextLoadMorePage', () => {
        test('loads more content when button clicked', async () => {
            const mockButton = {
                click: jest.fn()
            };
            mockPage.$ = jest.fn(() => Promise.resolve(mockButton));
            mockPage.$$eval = jest.fn()
                .mockResolvedValueOnce(10) // Before count
                .mockResolvedValueOnce(15); // After count

            const nextUrl = await getNextLoadMorePage(mockPage);

            expect(nextUrl).toBe('https://example.com/page-1'); // Same URL with more content
            expect(mockButton.click).toHaveBeenCalled();
        });

        test('returns null when no more content loads', async () => {
            const mockButton = {
                click: jest.fn()
            };
            mockPage.$ = jest.fn(() => Promise.resolve(mockButton));
            mockPage.$$eval = jest.fn()
                .mockResolvedValueOnce(10) // Before count
                .mockResolvedValueOnce(10); // After count (no change)

            const nextUrl = await getNextLoadMorePage(mockPage);

            expect(nextUrl).toBe(null);
        });

        test('returns null when no load more button found', async () => {
            mockPage.$ = jest.fn(() => Promise.resolve(null));

            const nextUrl = await getNextLoadMorePage(mockPage);

            expect(nextUrl).toBe(null);
        });
    });

    describe('basicFetchPage', () => {
        test('navigates to URL correctly', async () => {
            const url = 'https://example.com/test';
            
            const result = await basicFetchPage(url, mockPage);

            expect(mockPage.goto).toHaveBeenCalledWith(url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            expect(result).toBe(mockPage);
        });
    });

    describe('error handling and edge cases', () => {
        test('stops on critical errors', async () => {
            const config = {
                getNextUrl: jest.fn(() => Promise.reject(new Error('Browser crashed'))),
                fetchPage: jest.fn(() => Promise.resolve(mockPage)),
                onPage: jest.fn(),
                page: mockPage,
                startUrl: 'https://example.com/page-1'
            };

            const results = await handler.paginate(config);

            expect(results.stoppedReason).toBe('error');
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Critical pagination error'),
                expect.any(Object)
            );
        });

        test('retries getNextUrl on failures', async () => {
            let callCount = 0;
            const config = {
                getNextUrl: jest.fn(() => {
                    callCount++;
                    if (callCount === 1) {
                        return Promise.reject(new Error('Temporary failure'));
                    }
                    return Promise.resolve('https://example.com/page-2');
                }),
                fetchPage: jest.fn(() => Promise.resolve(mockPage)),
                onPage: jest.fn(),
                page: mockPage,
                startUrl: 'https://example.com/page-1'
            };

            const results = await handler.paginate(config);

            expect(config.getNextUrl).toHaveBeenCalledTimes(2); // Initial call + retry
            expect(results.pagesVisited).toBe(2); // Should succeed after retry
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Retrying getNextUrl'),
                expect.any(Object)
            );
        });
    });
});