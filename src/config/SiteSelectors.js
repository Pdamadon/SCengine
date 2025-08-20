/**
 * SiteSelectors - Simple, explicit, maintainable
 * 
 * No magic, no complexity, just what works for each site
 * Easy to debug, easy to update, easy to understand
 */

const siteSelectors = {
  'glasswingshop.com': {
    products: '.product-item',
    title: '.product-item__title',
    price: '.price',
    link: '.product-item a'
  },
  
  'macys.com': {
    products: '.productThumbnail',
    title: '.productDescription',
    price: '.prices',
    link: '.productThumbnail a'
  },
  
  // Add more as needed, but only when actually needed
  // No premature optimization!
};

module.exports = siteSelectors;