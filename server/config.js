'use strict';

/**
 * Central configuration — the ONE place for brand + business constants.
 * The brand name is temporary per the owner's request, so it lives here and
 * in .env (BRAND_NAME / BRAND_TAGLINE) and nowhere else in code. The frontend
 * reads it from GET /api/config, so renaming the site = changing .env only.
 */

module.exports = {
  brandName: process.env.BRAND_NAME || 'Property Direct',
  brandTagline: process.env.BRAND_TAGLINE || 'Buy Direct. Sell Direct. No Middlemen.',

  propertyTypes: [
    'House', 'Flat', 'Apartment', 'Villa', 'Shop', 'Office',
    'Commercial Building', 'Plot', 'Agricultural Land',
  ],
  // Category is derived from the property type.
  categoryForType: {
    House: 'Residential', Flat: 'Residential', Apartment: 'Residential', Villa: 'Residential',
    Shop: 'Commercial', Office: 'Commercial', 'Commercial Building': 'Commercial',
    Plot: 'Plots', 'Agricultural Land': 'Agricultural Land',
  },
  categories: ['Residential', 'Commercial', 'Plots', 'Agricultural Land'],
  listingTypes: ['sale', 'rent'],
  furnishingOptions: ['Unfurnished', 'Semi-Furnished', 'Fully Furnished', 'Not Applicable'],
  areaUnits: ['sqft', 'sqyd'],
  roles: ['owner', 'buyer', 'tenant', 'agent'],
  amenities: [
    'Lift', 'Power Backup', 'Water Supply 24x7', 'Security / CCTV', 'Gated Community',
    'Garden', 'Balcony', 'Modular Kitchen', 'RO Water', 'Vastu Compliant',
    'Near School', 'Near Hospital', 'Near Market', 'Public Transport Nearby', 'Pet Friendly',
  ],
  parkingOptions: ['None', 'Bike', 'Car', 'Bike + Car', 'Visitor Parking Also'],

  // Business model — displayed prices (INR). These are REQUEST prices only:
  // the platform stores a promotion request for the admin; it never charges
  // anyone and never takes a broker commission.
  plans: [
    { id: 'featured', name: 'Featured Listing', priceInr: 499, unit: 'per listing / 30 days',
      description: 'Your property appears in the Featured section on the homepage and on top of search results.' },
    { id: 'premium', name: 'Premium Seller Plan', priceInr: 1499, unit: 'per month',
      description: 'Unlimited featured listings for a month, priority support, and listing statistics.' },
    { id: 'promotion', name: 'Property Promotion', priceInr: 299, unit: 'per listing / 14 days',
      description: 'Extra promotion of one listing inside matching search results and assistant suggestions.' },
    { id: 'photography', name: 'Professional Photography', priceInr: 1999, unit: 'per property visit',
      description: 'A photographer visits and takes professional photos of your property (service arranged after request).' },
    { id: 'verification', name: 'Document Verification Service', priceInr: 999, unit: 'per property',
      description: 'Our team checks the ownership documents you provide. A property is only marked verified after this check is actually completed by an admin.' },
  ],

  glossary: {
    'carpet area': 'Carpet area is the actual usable area inside a home where you can lay a carpet — it excludes walls and balcony. It is always smaller than the built-up / super built-up area quoted in many ads, so compare properties by carpet area when you can.',
    'bhk': 'BHK means Bedroom, Hall, Kitchen. A 2 BHK flat has 2 bedrooms, 1 hall (living room) and 1 kitchen.',
    'registry': 'Registry (registration) is the legal process of recording the property sale in the government sub-registrar office in the buyer\u2019s name. It is done after paying stamp duty and registration charges, and it is what makes the transfer legally complete.',
    'stamp duty': 'Stamp duty is a government tax paid when a property is bought, calculated as a percentage of the property value. The rate differs by state. It is paid before registration (registry) of the property.',
    'super built-up area': 'Super built-up area includes the flat\u2019s own area plus a share of common areas like stairs, lobby and lift. It is larger than carpet area, so a property can sound bigger than the space you actually get.',
  },
};
