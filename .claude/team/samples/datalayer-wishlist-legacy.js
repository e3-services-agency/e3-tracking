// Reference fixture for D-63 (2026-09-29): a client's legacy add_to_wishlist push, flat on the dataLayer root.
// See DECISIONS.md D-63 for the target shape (bloomreach.event / properties / item / items).
window.dataLayer = window.dataLayer || [];
window.dataLayer.push({
  event: 'add_to_wishlist',
  active: true, category_name: 'Longsleeve', certificate_vegan: true, color_class_text: 'schwarz', color_text: 'black',
  fit_cut: 'Fitted', handle: 'malanaa-acid-black', has_bulk_discount: true, is_bundle: true, is_gift_card: true,
  item_webshop_hierarchy_0: 'string', item_webshop_hierarchy_1: 'string', item_webshop_hierarchy_2: 'string', item_webshop_hierarchy_3: 'string',
  launch_date: 123, local_currency: 'EUR', material_filter: ['Baumwolle (bio)'], on_sale: true, placement: 'plp',
  price: 123, price_local_currency: 123, product_family: '10252805', product_id: '15062099820869', product_ids: ['15062099820869'],
  product_list: { product_id: '15062099820869', quantity: 123 }, product_title: 'Longsleeve aus Bio-Baumwolle', product_type: 'Shirts T-Shirt Solid',
  sku: '30003749000056', sku_ids: ['30003749000056'], sku_list: { quantity: 123, sku_id: '30003749000056' },
  store_country: 'DE', store_language: 'de', tags: ['RGroup_10252805'], title: 'MALANAA | acid black',
  total_price: 123, total_price_local_currency: 123, total_quantity: 123,
  variant_id: '54723199795525', variant_ids: ['54723199795525'], variant_list: { quantity: 123, variant_id: '54723199795525' },
  // Optional:
  details_sleeves: 'Langarm', ecommerce: {}, size: 'string', size_length: 'string', size_waist: 'string',
});
