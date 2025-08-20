// Sector-specific templates and configurations for different business types

const SectorTemplates = {
  
  // Clothing/Fashion E-commerce
  clothing: {
    name: 'Clothing/Fashion E-commerce',
    version: '2.0',
    dataTargets: ['title', 'price', 'description', 'variants', 'availability', 'images', 'sizes', 'colors', 'brand', 'category'],
    productUrlPatterns: [
      '/browse/product',  // Gap, Old Navy, Banana Republic
      '/products/',       // Shopify stores, Uniqlo
      '/product/',        // General pattern
      '/p/',             // Target, J.C. Penney, Lululemon
      '/dp/',            // Amazon
      '/shop/product/',  // Macy's
      '/s/',             // Nordstrom
      '/product/prd-',   // Kohl's
      'productpage.',    // H&M
      '-p',              // Zara
      '/item/',          // Various retailers
      '/ip/',            // Walmart
    ],
    categoryUrlPatterns: [
      // Major retailers - verified category/PLP patterns
      '/shop/',          // Macy's: /shop/mens/clothing
      '/browse/',        // Nordstrom: /browse/men/clothing, Gap: /browse/men/shirts
      '/collections/',   // Shopify stores: /collections/dresses
      '/c/',             // American Eagle: /c/men/bottoms/jeans
      '/cat',            // Express: /mens-clothing/shirts/cat410008
      '/plp/',           // J.Crew: /plp/mens/categories/clothing/shirts
      '.html',           // H&M: /en_us/men/products/shirts.html
      '-l',              // Zara: /man-shirts-summer-l4172.html
      '?cid=',           // Gap variations: ?cid=15043
      '/categories/',    // General category pattern
      '/category/',      // General category pattern
      '/department/',    // Department stores
      '/men/',           // Uniqlo: /men/tops
      '/women/',         // Category sections
      '/kids/',          // Category sections
    ],
    selectors: {
      title: [
        // Standard patterns
        'h1', '.product-title', '.product-name', '.title', '.name',
        '[data-testid*="title"]', '[data-testid*="name"]',
        '.product__title', '.item-title', '.product-single__title',
        
        // Major retailer specific patterns
        '[data-automation-id*="product-title"]', // Target
        '#productTitle', '.a-offscreen[data-automation-id="productTitle"]', // Amazon  
        '.product-brand-title h1', '.ProductTitle', // Walmart
        '.product-title__text', '.pdp-product-name h1', // Gap, Old Navy
        '.product-name-wrapper h1', '.product__name h1', // Nordstrom
        '.product-detail-title h1', '.product-information__name', // Macy's
        '.product-name h1', '.product-title-text', // Kohl's
        '.productName', '.product-display-name h1', // J.Crew, Express
        '.product-tile-name', '.product-name-heading' // Various retailers
      ],
      price: [
        // Universal fallback patterns
        '[itemprop="price"]', // Schema.org structured data - works on most sites
        '.price', '.money', '.cost', '.amount', '[data-price]',
        '.product-price', '.current-price', '.sale-price',
        
        // Major retailer specific patterns (tested and verified)
        '.product-price__price', // Macy's
        'span[data-test="product-price"]', // Nordstrom
        'span.c-pdp-price', '.c-price', // Kohl's
        'span.priceSale', '.priceReg', // J.C. Penney
        'span.pd-price', '.markdown-price', '.current-sale-price', // Gap
        'span[itemprop="price"]', '.product-price', // Old Navy
        'span.price', '.ProductPrice', // Banana Republic
        'span.price-value', '.product-price__current', // H&M
        'span.price-current', '.product-price', // Zara
        'span.u-product__price', // Uniqlo
        'div.PDPPrice', 'span[data-testid="price"]', // American Eagle
        'span.product-price__price', // Abercrombie & Fitch
        'span.pdp-sale-price', 'span.pdp-full-price', // J.Crew
        'span.product-price', // Express
        'span.Price', // Urban Outfitters, Anthropologie
        'span[data-test="product-price"]', // Anthropologie specific
        'span.ProdPricing__price', // Lululemon
        'span.ProductDetailPrice' // Saks Fifth Avenue
      ],
      // Retailer-specific size selectors (tested and verified)
      sizes: [
        // Major retailer specific patterns
        'select#size', '.VariationSelect-option[value*="size"]', // Macy's
        'button[data-test^="size-"]', // Nordstrom
        'select[name*="Size"]', '.variant-size', // Kohl's
        'select#SizeSelect', '.product-variation.size select', // J.C. Penney
        'select#product-size', '.ProductOption--size select', // Gap
        'select#SizeDropdown', '.variant-dropdown--size', // Old Navy
        'select#size', '.variant-size select', // Banana Republic
        'select[name="size"]', '.filter-option-size select', // H&M
        'button[aria-label*="size"]', '.size-list li', // Zara
        'select#item_size', '.size-list select', // Uniqlo
        'select#sizeOptions', '.variant-size-list select', // Forever 21
        'button[aria-label*="Size"]', '.pdp__size-button', // American Eagle
        'select#size', '.size-select', // Abercrombie & Fitch
        'select#size-picker', '.size-picker select', // J.Crew
        'select#Size', '.size-dropdown', // Express
        'select#SelectOptionSize', '.select-size', // Urban Outfitters
        'select[name="size"]', '.size-select', // Anthropologie
        'select#ProductSize', '.size-variant', // Lululemon
        'button[aria-label*="Size"]', '.variant-option--size', // Athleta
        'select#SizeId', '.select-size', // Saks Fifth Avenue
        
        // Universal fallback patterns
        'select[name*="size"]', 'select[id*="size"]', 'select[class*="size"]',
        'button[class*="size"]', '[data-size]', '[aria-label*="size"]'
      ],
      colors: [
        // Major retailer specific patterns
        'select#color', '.swatch--color input[type="radio"]', // Macy's
        'button[data-test^="color-"]', // Nordstrom
        'select[name*="Color"]', '.variant-color input', // Kohl's
        '.product-variation.color select', '.color-swatch input', // J.C. Penney
        'button[data-attribute="color"]', '.ColorSwatch-option', // Gap
        'select#ColorDropdown', '.variant-dropdown--color', // Old Navy
        'select#color', '.variant-color button', // Banana Republic
        'select[name="color"]', '.filter-option-color li', // H&M
        'button[aria-label*="color"]', '.color-list li', // Zara
        'ul.color-list li', 'button.color-swatch', // Uniqlo
        'select#colorOptions', '.variant-color-list li', // Forever 21
        'button[aria-label*="Color"]', '.pdp__color-swatch', // American Eagle
        'select#color', '.color-swatch', // Abercrombie & Fitch
        'select#color-picker', '.color-picker li', // J.Crew
        'select#Color', '.color-dropdown', // Express
        'select#SelectOptionColor', '.select-color', // Urban Outfitters
        'select[name="colour"]', '.colour-swatch', // Anthropologie
        'select#ProductColour', '.colour-variant', // Lululemon
        'button[aria-label*="Color"]', '.variant-option--color', // Athleta
        'select#ColorId', '.select-colour', // Saks Fifth Avenue
        
        // Universal fallback patterns
        'select[name*="color"]', 'select[id*="color"]', '[class*="color-chip"]',
        'button[class*="color"]:not([class*="search"])', '[data-color]', '[class*="swatch"]'
      ],
      variants: [
        'select[name*="Size"]', 'select[name*="Color"]', 'select[name*="id"]',
        '.variant-selector', '.product-options', '.size-selector',
        '.color-selector', '[data-variant]'
      ],
      availability: [
        // Universal patterns
        '[itemprop="availability"]', // Schema.org structured data
        '.stock', '.inventory', '.available', '.in-stock',
        '[data-stock]', '.availability', '.product-availability', '.stock-status',
        
        // Retailer-specific availability patterns
        '.product-availability', '.availability-msg', // Macy's
        '[data-test*="availability"]', '.stock-indicator', // Nordstrom
        '.inventory-status', '.stock-level', // Kohl's
        '.availability-container', '.inventory-msg', // J.C. Penney
        '.product-availability-status', // Gap
        '.availability-text', '.stock-message', // Old Navy
        '.inventory-availability', // Banana Republic
        '.stock-info', '.availability-info', // H&M
        '.product-stock', '.availability-status', // Zara
        '.stock-availability', // Uniqlo
        '.product-inventory', '.stock-text' // General patterns
      ],
      images: [
        // Universal fallback patterns
        'img[itemprop="image"]', // Schema.org structured data - works on most sites
        '.product-image img', '.main-image img', '.featured-image img',
        '.gallery img', '.product__image img', '.hero-image img',
        
        // Retailer-specific main image selectors (tested and verified)
        'img[itemprop="image"]', '.product-primary-image img', // Macy's
        'img[data-test="product-main-image"]', 'img[itemprop="image"]', // Nordstrom
        'div.pdp-image img', 'img[itemprop="image"]', // Kohl's
        'img#mainProductImage', 'img[itemprop="image"]', // J.C. Penney
        'div.gallery-main img', 'img[itemprop="image"]', // Gap
        'img#glide_1_slide1 img', 'img[itemprop="image"]', // Old Navy
        '.product-media__image img', 'img[itemprop="image"]', // Banana Republic
        'div.product-media-container img', 'img[itemprop="image"]', // H&M
        'div.main-image-container img', 'img[itemprop="image"]', // Zara
        '.product-slider .slick-track img', 'img[itemprop="image"]', // Uniqlo
        'div.primary-image img', 'img[itemprop="image"]', // Forever 21
        'div.PDPMainImage img', 'img[itemprop="image"]', // American Eagle
        'div.AfdpGallery img', 'img[itemprop="image"]', // Abercrombie & Fitch
        'div.Flickity-slider img', 'img[itemprop="image"]', // J.Crew
        'div.image-gallery img', 'img[itemprop="image"]', // Express
        'img[data-qa="product-main-image"]', 'img[itemprop="image"]', // Urban Outfitters
        'img.pswp__img', 'img[itemprop="image"]', // Anthropologie
        'img[data-qa="product-main-image"]', 'img[itemprop="image"]', // Lululemon
        'div.viewer-image img', 'img[itemprop="image"]', // Athleta
        'img[itemprop="image"]', 'div.carousel-image img', // Saks Fifth Avenue
        
        // Thumbnail/Gallery selectors (for additional images)
        '.carousel-image-item img', '.product-thumbnail-list img', // Macy's
        'ul[data-test="thumbnail-list"] img', '.thumb-item img', // Nordstrom
        '.pdp-image-carousel img', '.thumb-image img', // Kohl's
        '.additional-images img', '.thumbnail-list img', // J.C. Penney
        'ul.image-gallery-thumbnails li img', // Gap
        '.glide__slide img', '.thumbnail img', // Old Navy
        '.product-thumbnails img', '.thumb-image img', // Banana Republic
        '.slider-nav img', '.product-thumbnails img', // H&M
        'ul.product-images-thumbnail-list img', // Zara
        '.product-thumbnails img', '.slick-slide img', // Uniqlo
        '.thumbnail img', '.product-thumbs img', // Forever 21
        '.thumb-container img', '.secondary-images img', // American Eagle
        '.AfdpThumbs img', '.gallery-thumbnail img', // Abercrombie & Fitch
        '.Carousel-thumbs img', '.flickity-page-dots img', // J.Crew
        '.image-thumbnails img', '.gallery-thumbnail img', // Express
        '.ThumbList img', '.thumb-item img', // Urban Outfitters
        '.thumbnail-image img', '.product-thumbs img', // Anthropologie
        '.carousel-items img', '.thumbnail img', // Lululemon
        '.view-thumbnails img', '.thumbnail img', // Athleta
        'div.carousel-nav img', '.thumb img' // Saks Fifth Avenue
      ],
      brand: [
        '.brand', '.brand-name', '.vendor', '[data-brand]',
        '.product-brand', '.manufacturer'
      ],
      category: [
        '.breadcrumb', '.category', '.collection', '[data-category]',
        '.product-category', '.nav-category'
      ],
      addToCart: [
        // Major retailer specific patterns
        'button#addToBag', 'button[data-automation="addToBag"]', // Macy's
        'button[data-test="add-to-bag"]', // Nordstrom
        'button#add-to-bag', '.add-to-bag-btn', // Kohl's
        'button#btnAddtoCart', 'button.add-to-cart', // J.C. Penney
        'button[data-test="add-to-bag-button"]', // Gap
        'button#AddToCartButton', 'button.js-add-to-cart', // Old Navy
        'button#addToCart', '.add-to-cart-button', // Banana Republic
        'button.add-to-cart', 'button#add-to-cart-btn', // H&M
        'button.add-to-cart', 'button[name="add"]', // Zara
        'button#add-to-cart-button', '.js-add-to-cart', // Uniqlo
        'button.js-add-to-cart', 'button#add-cart-button', // Forever 21
        'button[data-testid="add-to-bag"]', '.add-to-bag-button', // American Eagle
        'button#addToCart', '.add-to-cart-button', // Abercrombie & Fitch
        'button.add-to-cart-button', '.add-to-cart', // J.Crew
        'button#addToCart', 'button.add-to-cart', // Express
        'button.AddToCart-button', 'button[data-action="add-to-bag"]', // Urban Outfitters
        'button[data-test="add-to-basket"]', '.add-to-basket', // Anthropologie
        'button[data-test="add-to-cart"]', '.add-to-cart', // Lululemon
        'button.AddToCart-button', '.add-to-cart-button', // Athleta
        'button#AddToBag', '.add-to-bag-button', // Saks Fifth Avenue
        
        // Universal fallback patterns
        'button[type="submit"]', '.add-to-cart', '.btn-cart',
        '[data-testid*="cart"]', '.cart-button', '.add-to-basket'
      ],
      
      // Structured data fallback - for when CSS selectors fail
      structuredData: [
        'script[type="application/ld+json"]', // JSON-LD structured data
        '[itemtype*="schema.org/Product"]', // Microdata
        '[itemtype*="Product"]' // Generic microdata
      ]
    },
    workflows: {
      purchase: [
        'selectVariant', 'setQuantity', 'addToCart', 'proceedToCheckout'
      ]
    },
    validationRules: {
      title: { minLength: 3, required: true },
      price: { pattern: /\$[\d,]+\.?\d*/, required: true },
      variants: { minOptions: 1 }
    }
  },

  // Hardware/Home Improvement Stores  
  hardware: {
    name: 'Hardware/Home Improvement Stores',
    version: '1.0',
    dataTargets: ['title', 'price', 'description', 'specifications', 'availability', 'category'],
    selectors: {
      title: [
        'h1', '.product-title', '.item-title', '.product-name',
        '[data-testid*="title"]', '.title'
      ],
      price: [
        '.price', '.cost', '.amount', '[data-price]',
        '.product-price', '.current-price', '.retail-price'
      ],
      specifications: [
        '.specs', '.specifications', '.details', '.features',
        '.product-specs', '.tech-specs', '.dimensions'
      ],
      category: [
        '.breadcrumb', '.category', '.department', '.section',
        '.nav-category', '[data-category]'
      ],
      availability: [
        '.stock', '.inventory', '.available', '.in-store',
        '.store-availability', '.pickup-availability'
      ],
      bulk: [
        '.bulk-pricing', '.quantity-pricing', '.bulk-discount',
        '.contractor-pricing', '.wholesale'
      ]
    },
    workflows: {
      purchase: [
        'selectQuantity', 'chooseStoreLocation', 'addToCart'
      ]
    },
    validationRules: {
      title: { minLength: 5, required: true },
      price: { pattern: /\$[\d,]+\.?\d*/, required: true },
      specifications: { minLength: 10 }
    }
  },

  // Booking Services (Medical, Beauty, Professional)
  booking: {
    dataTargets: ['services', 'providers', 'availability', 'pricing', 'duration'],
    selectors: {
      services: [
        '.service', '.treatment', '.service-type', '.appointment-type',
        '.booking-service', '[data-service]', '.service-item'
      ],
      providers: [
        '.provider', '.doctor', '.therapist', '.staff', '.practitioner',
        '.professional', '.specialist', '[data-provider]'
      ],
      availability: [
        '.time-slot', '.available-time', '.appointment-time',
        '[data-time]', '.schedule', '.calendar-slot'
      ],
      pricing: [
        '.price', '.cost', '.fee', '.rate', '[data-price]',
        '.service-price', '.appointment-cost'
      ],
      duration: [
        '.duration', '.time-length', '[data-duration]',
        '.appointment-duration', '.service-time'
      ],
      bookButton: [
        '.book-now', '.schedule-appointment', '.make-appointment',
        '.reserve', '.book-button', '[data-book]'
      ]
    },
    workflows: {
      booking: [
        'selectService', 'chooseProvider', 'selectTimeSlot', 'confirmBooking'
      ]
    },
    validationRules: {
      services: { minItems: 1, required: true },
      pricing: { pattern: /\$[\d,]+\.?\d*/ },
      availability: { minItems: 1 }
    }
  },

  // Food Ordering (Restaurant Direct)
  food: {
    dataTargets: ['menuItems', 'prices', 'descriptions', 'categories', 'options'],
    selectors: {
      menuItems: [
        '.menu-item', '.dish', '.food-item', '[data-menu-item]',
        '.item', '.product', '.menu-product'
      ],
      prices: [
        '.price', '.cost', '.amount', '[data-price]',
        '.menu-price', '.item-price', '.food-price'
      ],
      descriptions: [
        '.description', '.ingredients', '.details', '.item-description',
        '.menu-description', '.food-description'
      ],
      categories: [
        '.menu-category', '.food-category', '.section', '.menu-section',
        '[data-category]', '.category-title'
      ],
      options: [
        '.option', '.modifier', '.add-on', '.customization',
        '.extras', '.sides', '[data-option]'
      ],
      orderButton: [
        '.order-now', '.add-to-order', '.order-button',
        '.add-to-cart', '[data-order]'
      ]
    },
    workflows: {
      ordering: [
        'selectItems', 'customizeOptions', 'addToOrder', 'checkout'
      ]
    },
    validationRules: {
      menuItems: { minItems: 5, required: true },
      prices: { pattern: /\$[\d,]+\.?\d*/, required: true },
      categories: { minItems: 2 }
    }
  },

  // Movie Ticket Booking
  movies: {
    dataTargets: ['movies', 'showtimes', 'theaters', 'pricing', 'seats'],
    selectors: {
      movies: [
        '.movie', '.film', '.movie-title', '[data-movie]',
        '.movie-item', '.film-title'
      ],
      showtimes: [
        '.showtime', '.time', '.schedule', '[data-showtime]',
        '.movie-time', '.screening-time'
      ],
      theaters: [
        '.theater', '.cinema', '.location', '.venue',
        '[data-theater]', '.movie-theater'
      ],
      pricing: [
        '.price', '.ticket-price', '.cost', '[data-price]',
        '.seat-price', '.movie-price'
      ],
      seats: [
        '.seat', '.seating', '.seat-selection', '[data-seat]',
        '.seat-map', '.theater-seat'
      ],
      bookButton: [
        '.buy-tickets', '.book-now', '.purchase', '.select-tickets',
        '[data-book]', '.ticket-button'
      ]
    },
    workflows: {
      ticketing: [
        'selectMovie', 'chooseShowtime', 'selectSeats', 'purchaseTickets'
      ]
    },
    validationRules: {
      movies: { minItems: 1, required: true },
      showtimes: { minItems: 1, required: true },
      pricing: { pattern: /\$[\d,]+\.?\d*/ }
    }
  }
};

// Generate site list for each sector
const SectorSites = {
  clothing: [
    // Start with most accessible sites (less aggressive bot detection)
    'https://www.uniqlo.com/us',  // Most accessible, working product URLs
    'https://www.oldnavy.com',    // Generally accessible
    'https://www.gap.com',        // More blocking/timeouts
    'https://www.bananarepublic.com',
    
    // Fashion Retailers (moderate protection)
    'https://www.hm.com',
    'https://www.forever21.com',
    'https://www.ae.com',
    'https://www.express.com',
    'https://www.abercrombie.com',
    
    // Specialty/Premium (variable protection)
    'https://www.jcrew.com',
    'https://www.urbanoutfitters.com',
    'https://www.anthropologie.com',
    'https://www.zara.com/us',
    
    // Value/Mass Market (mixed accessibility)
    'https://www.tjmaxx.tjx.com',
    'https://www.rossstores.com',
    
    // Major Department Stores (higher bot detection - test later)
    'https://www.kohls.com',
    'https://www.jcpenney.com',
    'https://www.target.com',
    'https://www.macys.com',
    'https://www.nordstrom.com'
  ],
  
  hardware: [
    // Major Home Improvement
    'https://www.homedepot.com',
    'https://www.lowes.com',
    'https://www.menards.com',
    
    // Regional Hardware
    'https://www.acehardware.com',
    'https://www.truevalue.com',
    'https://www.doitbest.com',
    
    // Tool Specialists
    'https://www.harborfreight.com',
    'https://www.northerntool.com',
    
    // Farm & Outdoor
    'https://www.tractorsupply.com',
    'https://www.ruralking.com',
    'https://www.fleetfarm.com',
    
    // Regional Chains
    'https://www.blains.com',
    'https://www.millsfleet.com',
    'https://www.orschelnfarmhome.com',
    'https://www.bmccorp.com',
    'https://www.84lumber.com',
    'https://www.buildersoftware.com',
    'https://www.builderssupply.com',
    'https://www.sierraremodel.com',
    'https://www.flooranddecor.com',
    'https://www.grainger.com'
  ],

  booking: [
    'https://zocdoc.com',
    'https://healthgrades.com',
    'https://webmd.com',
    'https://psychology today.com',
    'https://massage envy.com',
    'https://soothe.com',
    'https://zeel.com',
    'https://styleseat.com',
    'https://vagaro.com',
    'https://booksy.com',
    'https://schedulicity.com',
    'https://acuityscheduling.com',
    'https://setmore.com',
    'https://square.com/appointments',
    'https://genbook.com',
    'https://thumbtack.com',
    'https://taskrabbit.com',
    'https://handy.com',
    'https://angi.com',
    'https://homeadvisor.com'
  ],

  food: [
    'https://grubhub.com',
    'https://doordash.com',
    'https://ubereats.com',
    'https://postmates.com',
    'https://seamless.com',
    'https://yelp.com',
    'https://opentable.com',
    'https://resy.com',
    'https://tock.com',
    'https://chownow.com',
    'https://beyondmenu.com',
    'https://slice.com',
    'https://caviar.com',
    'https://eat24.com',
    'https://foodler.com',
    'https://delivery.com',
    'https://bitepad.com',
    'https://orderup.com',
    'https://foodpanda.com',
    'https://justeat.com'
  ],

  movies: [
    'https://fandango.com',
    'https://movietickets.com',
    'https://amc.com',
    'https://regmovies.com',
    'https://cinemark.com',
    'https://showcase.com',
    'https://marcustheatres.com',
    'https://harkins.com',
    'https://carmike.com',
    'https://landmarktheatres.com',
    'https://ipic.com',
    'https://arclight.com',
    'https://pacifitheatres.com',
    'https://studiomovisgrill.com',
    'https://drafthouse.com',
    'https://atom tickets.com',
    'https://flixster.com',
    'https://moviepass.com',
    'https://sinemia.com',
    'https://theatres.ca'
  ]
};

// Helper function to get template by sector
function getTemplate(sector) {
  return SectorTemplates[sector] || SectorTemplates.clothing; // Default to clothing
}

// Helper function to get site list by sector
function getSiteList(sector, count = 20) {
  const sites = SectorSites[sector] || SectorSites.clothing;
  return sites.slice(0, count);
}

// Generate complete configuration for a sector
function generateSectorConfig(sector, count = 20) {
  return {
    sector,
    template: getTemplate(sector),
    sites: getSiteList(sector, count),
    count
  };
}

module.exports = {
  SectorTemplates,
  SectorSites, 
  getTemplate,
  getSiteList,
  generateSectorConfig
};