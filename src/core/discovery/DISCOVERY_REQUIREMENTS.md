Navigation Taxonomy Extraction – Claude MD Requirements (v1)
Goal

Extract the full taxonomy of categories (from top navigation down to PLPs) for any U.S. e-commerce domain and persist it into the categories collection, linked to its domains entry. Confirm that all collected taxonomy URLs resolve on the same domain.

Scope

In scope

E-commerce sites (U.S. versions only; per-domain crawl).

Navigation sources: top header / mega navs, sidebars.

Optional: use sitemap only if trivially accessible (not required in v1).

Depth: expand through hubs until PLPs (product grid pages) are reached.

Capture filters/facets from PLPs (if present).

Out of scope

Editorial/blog, store locator, gift cards, promos, non-product sections.

Non-U.S. locales/regions.

Checkout/cart flows.

Technical Approach

Stack: Node.js + Playwright (JavaScript).

Nav capture: simulate hover/click to reveal all nav menus.

Timing & stability: use respectful waits/retries, Playwright waitFor* patterns, handle infinite scroll, and close popups/consent modals.

Robots: try to respect robots.txt.

Performance defaults

Max depth: 4

Max category URLs visited: 600

Global timeout per domain: 8 minutes

Max concurrent pages: 2

Crawl rate target: ~1–2 rps

Data Model Integration
domains (site identity/metadata)

Use existing domains doc for identity (domain, platform, site_type, timestamps).

Every categories.domain must match an existing domains.domain.

Validate that all taxonomy URLs resolve on that domain (no cross-site links).

categories (canonical taxonomy per domain)

Populate the following (aligned to your schema + v1 additions):

Core: domain, canonical_id, name, slug, description, hierarchy_level (1–4),
category_type, parent_categories[], child_categories[], url_path, navigation_order,
gender_focus, product_focus, status, estimated_products, actual_product_count,
created_at, updated_at.

PLP & filters:

has_product_grid: boolean

base_plp_url: clean canonical PLP URL without filter/sort/tracking params

product_grid_selectors: { grid_container?, product_tile, title?, price?, image? }

pagination_selectors: { next_button?, load_more_button?, infinite_scroll_container? }

min_product_tiles_detected: number (threshold suggested: ≥ 6)

filters_kv: key/value map (extensible), e.g. { size: ["S","M","L"] }

filter_controls: array of { key, selector, action, url_param? }

plp_detection_evidence: string array of detection proofs

Nav placement:

nav_paths: array of arrays showing all menu placements (e.g., [["Women","Shoes","Boots"], ["Sale","Boots"]])

Deduping:

Deduplicate to a single canonical node per PLP; preserve nav_paths references to all placements.

PLP Confirmation (priority order)

DOM product grid found with minimum tile count and sensible selectors.

Structured data evidence (schema.org/Product or ItemList with products).

Network/XHR hints returning product arrays (fallback).

Canonicalization Rules

Store clean base PLP URL only (strip filters/sorts/tracking: ?size=, utm_*, fbclid, #).

Normalize trailing slashes; keep path only.

Disallow obvious non-category paths (login, cart, wishlist, help, policies, blog).

Validation

Every non-leaf must have ≥ 1 child.

No cycles in parent_categories/child_categories.

URLs must return 200 or acceptable 3xx.

Enforce unique (domain, canonical_id).

Deduplicate PLPs; preserve all nav_paths.

Coverage: capture all main header + side nav menus.

Filters: if present, capture all discovered filter groups.

Assumptions

Target sites are e-commerce with PLPs reachable via navigation.

U.S. site versions only for v1.

Respectful crawling is acceptable even if it restricts some paths.

Update in place; no historical snapshots for v1.

JSON-only output aligned to MongoDB schema.

Development & Testing

ALL discovery development tests should be placed in src/core/discovery/__tests__/ for organization and co-location with the discovery modules being tested.

Risks & Mitigations

Lazy/mega menus & modals → Use robust waits, scrolling inside menus, popup dismissal.

Duplicates across placements → Dedup by canonical PLP; store all nav_paths.

Bot defenses → Respectful rates, retries, headless stability; capture screenshots for triage.

Unusual PLPs (tile hubs) → Click deeper until real product grid detected.

Inconsistent filters → Keep filters_kv extensible; map filter_controls generically.

Sample JSON (Illustrative)
{
  "domains": [
    {
      "domain": "macys.com",
      "platform": "custom",
      "site_type": "ecommerce",
      "intelligence_score": 62,
      "capabilities": {
        "can_extract_products": true,
        "can_extract_pricing": true,
        "can_extract_variants": true,
        "can_navigate_categories": true,
        "can_add_to_cart": false,
        "can_checkout": false,
        "can_search": true,
        "can_filter": true,
        "can_book_appointments": false,
        "can_check_availability": true
      },
      "navigation_map": {
        "main_sections": ["Women", "Men", "Kids", "Home", "Beauty"],
        "dropdown_menus": {},
        "footer_links": [],
        "breadcrumb_pattern": ".breadcrumbs li"
      },
      "created_at": "2025-08-18T20:20:00.000Z",
      "updated_at": "2025-08-18T20:20:00.000Z",
      "last_scraped": "2025-08-18T20:20:00.000Z"
    }
  ],
  "categories": [
    {
      "domain": "macys.com",
      "canonical_id": "macys:women",
      "name": "Women",
      "slug": "women",
      "description": "Women's department",
      "hierarchy_level": 1,
      "category_type": "gender",
      "parent_categories": [],
      "child_categories": ["macys:women:shoes"],
      "url_path": "/shop/womens-clothing",
      "navigation_order": 1,
      "gender_focus": "womens",
      "product_focus": "mixed",
      "status": "active",
      "has_product_grid": false,
      "base_plp_url": null,
      "product_grid_selectors": {},
      "pagination_selectors": {},
      "min_product_tiles_detected": 0,
      "filters_kv": {},
      "filter_controls": [],
      "plp_detection_evidence": [],
      "nav_paths": [["Women"]],
      "estimated_products": 0,
      "actual_product_count": 0,
      "created_at": "2025-08-18T20:20:00.000Z",
      "updated_at": "2025-08-18T20:20:00.000Z"
    },
    {
      "domain": "macys.com",
      "canonical_id": "macys:women:shoes",
      "name": "Shoes",
      "slug": "women-shoes",
      "description": "Women's shoes",
      "hierarchy_level": 2,
      "category_type": "product_type",
      "parent_categories": ["macys:women"],
      "child_categories": ["macys:women:shoes:boots"],
      "url_path": "/shop/shoes/womens-shoes",
      "navigation_order": 3,
      "gender_focus": "womens",
      "product_focus": "shoes",
      "status": "active",
      "has_product_grid": false,
      "base_plp_url": null,
      "product_grid_selectors": {},
      "pagination_selectors": {},
      "min_product_tiles_detected": 0,
      "filters_kv": {},
      "filter_controls": [],
      "plp_detection_evidence": [],
      "nav_paths": [["Women","Shoes"]],
      "estimated_products": 0,
      "actual_product_count": 0,
      "created_at": "2025-08-18T20:20:00.000Z",
      "updated_at": "2025-08-18T20:20:00.000Z"
    },
    {
      "domain": "macys.com",
      "canonical_id": "macys:women:shoes:boots",
      "name": "Boots",
      "slug": "women-shoes-boots",
      "description": "Women's boots",
      "hierarchy_level": 3,
      "category_type": "product_type",
      "parent_categories": ["macys:women:shoes"],
      "child_categories": [],
      "url_path": "/shop/shoes/womens-boots",
      "navigation_order": 4,
      "gender_focus": "womens",
      "product_focus": "shoes",
      "status": "active",
      "has_product_grid": true,
      "base_plp_url": "/shop/shoes/womens-boots",
      "product_grid_selectors": {
        "grid_container": ".productGrid, .results-items",
        "product_tile": ".productThumbnail, .product-tile, li.product",
        "title": ".product-title, .product-name",
        "price": ".price, [data-el='price']",
        "image": "img.productThumbnailImage, .product-image img"
      },
      "pagination_selectors": {
        "next_button": "a[rel='next'], .pagination-next",
        "load_more_button": ".load-more, button[aria-label*='More']",
        "infinite_scroll_container": ".productGrid"
      },
      "min_product_tiles_detected": 6,
      "filters_kv": {
        "Category": ["Ankle Boots","Knee-High Boots","Chelsea Boots"],
        "Size": ["5","6","7","8","9","10","11"],
        "Color": ["Black","Brown","Beige","White"],
        "Brand": ["Calvin Klein","Lucky Brand","Nine West"],
        "Price": ["Under $50","$50-$100","$100-$200","$200 & Above"]
      },
      "filter_controls": [
        { "key": "Size", "selector": "[data-facet='size'] input[type='checkbox']", "action": "checkbox", "url_param": "SIZE" },
        { "key": "Color", "selector": "[data-facet='color'] input[type='checkbox']", "action": "checkbox", "url_param": "COLOR" },
        { "key": "Brand", "selector": "[data-facet='brand'] input[type='checkbox']", "action": "checkbox", "url_param": "BRAND" },
        { "key": "Price", "selector": "[data-facet='price'] a, [data-facet='price'] input", "action": "click", "url_param": "PRICE" }
      ],
      "plp_detection_evidence": [
        "DOMGrid:.productGrid tiles:48 sel:.product-tile",
        "LDProduct:12"
      ],
      "nav_paths": [
        ["Women","Shoes","Boots"],
        ["Women","Shoes","Shop All Boots"]
      ],
      "estimated_products": 500,
      "actual_product_count": 432,
      "created_at": "2025-08-18T20:20:00.000Z",
      "updated_at": "2025-08-18T20:20:00.000Z"
    }
  ]
}