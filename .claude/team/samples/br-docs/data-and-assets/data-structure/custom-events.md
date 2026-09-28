---
updatedAt: 2026-07-16T09:27:30.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Custom events

Custom events are a group of events that are manually tailored for each customer. As opposed to [system events](https://documentation.bloomreach.com/engagement/docs/system-events), custom events included in different projects greatly vary as it is your choice which of them you decide to incorporate. This article lists and explains the most commonly used custom events and attributes. If you want to learn how to set up their tracking, go to our [Web tracking](https://documentation.bloomreach.com/engagement/docs/web-tracking) article.

<Callout icon="📘" theme="info">
  ###

  `Location`, `os`, `device` & `browser` are already tracked by default in every event using `exponea.track()` function of the SDK. If you want to add some more default properties TO EVERY EVENT then you can use the `track.default_properties`. If you need it only for some events, you can also update the events individually. [Find out more.](https://documentation.bloomreach.com/engagement/docs/configuration#tracking-options)
</Callout>

## purchase

`purchase` happens when the customer purchases a product/products on your website.

| Attribute                     | Description                                                                            | Example                                     |
| :---------------------------- | :------------------------------------------------------------------------------------- | :------------------------------------------ |
| purchase\_id                  | Automatically-generated ID of the purchase.                                            | 123456a                                     |
| purchase\_status              | Status of the purchase.                                                                | success / refund                            |
| purchase\_source\_type        | Type of the source from which the purchase was done.                                   | online / store                              |
| purchase\_source\_name        | Name of the source from which the purchase was done.                                   | domain.com / Corner Store 1st Street, ...   |
| product\_list                 | List of all purchased products, their quantities and other required properties.        | \[ {"product_id": "abc123", "quantity":1} ] |
| product\_ids                  | List of IDs of all purchased products.                                                 | \[ "abc123", "abc456", "abc789" ]           |
| total\_price                  | Total price paid by the customer in the reference currency including tax and shipping. | 24                                          |
| total\_price\_without\_tax    | Total price paid by customer in reference currency including shipping but not the tax. | 20                                          |
| total\_price\_local\_currency | Total price paid by the customer in the currency they used for the payment.            | 2                                           |
| local\_currency               | Currency the customer used for the  payment.                                           | USD, GBP, EUR                               |
| total\_quantity               | Total quantity of the products purchased.                                              | 2                                           |
| payment\_type                 | Payment method.                                                                        | bank transfer / online payment / cash / cod |
| shipping\_type                | Type of delivery.                                                                      | courier / personally                        |
| shipping\_company             | Delivery company.                                                                      | ups                                         |
| shipping\_cost                | Price of the delivery.                                                                 | 69                                          |
| shipping\_country             | Name of the country to which the products are delivered.                               | USA                                         |
| shipping\_city                | Name of the city to which the products are delivered.                                  | New York                                    |
| tax\_percentage               | Sales tax expressed as a percentage.                                                   | 20                                          |
| tax\_value                    | Sales tax expressed as money.                                                          | 4                                           |
| voucher\_code                 | Code of the voucher used in this purchase.                                             | KA54-548C                                   |
| voucher\_percentage           | The discount rate conferred on the customer by the voucher expressed as a percentage.  | 10                                          |
| voucher\_value                | The amount that the voucher subtracted from the prize of the purchase.                 | 2                                           |
| variant\_list                 | List of all purchased variants, their quantities and other required properties.        | \[ {"variant_id": "abc123", "quantity":1} ] |
| variant\_ids                  | List of IDs of all purchased variants.                                                 | \[ "abc123", "abc456", "abc789" ]           |
| language                      | Language of website from which the purchase was made.                                  | en                                          |
| location                      | URL of the page where the `purchase` event occurred.                                   | `https://webshop.com/purchase`              |
| domain                        | Default domain of your website.                                                        | webshop.com                                 |

## purchase\_item

`purchase_item` happens when the customer purchases a product on your website. For each item within a `purchase`, a separate `purchase_item` should also be rendered. There should be as many `purchase_item` events along with a single `purchase` event as there were items bought.

| Attribute                        | Description                                                                                                             | Example                                   |
| :------------------------------- | :---------------------------------------------------------------------------------------------------------------------- | :---------------------------------------- |
| purchase\_id                     | Automatically-generated ID of the purchase.                                                                             | 123456a                                   |
| purchase\_status                 | Status of the purchase.                                                                                                 | success / refund                          |
| purchase\_source\_type           | Type of the source from which the purchase was done.                                                                    | online / store                            |
| purchase\_source\_name           | Name of the source from which the purchase was done.                                                                    | domain.com / Corner Store 1st Street, ... |
| product\_id                      | Automatically-generated ID of the product.                                                                              | abc123                                    |
| variant\_id                      | Automatically-generated ID of the variant of the product that includes information about  colour, size or materials.    | abc123small                               |
| title                            | Item name that includes colour, size or materials if available.                                                         | Tassel Loafers in Navy Faux Sued          |
| brand                            | Brand of the purchased item.                                                                                            | END.                                      |
| price                            | Price of one unit of the item paid by the customer in the reference currency.                                           | 18                                        |
| price\_local\_currency           | Price of one unit of the item paid by the customer in the currency they used for the payment.                           | 90                                        |
| discount\_percentage             | In case of a discount, the discount rate used on the item expressed as a percentage.                                    | 10                                        |
| discount\_value                  | In case of a discount, the amount subtracted from the price of the product as a result of the discount.                 | 2                                         |
| original\_price                  | Price of the item without a discount in a reference currency.                                                           | 20                                        |
| original\_price\_local\_currency | Price of the item without a discount in a currency the customer used for the payment.                                   | 100                                       |
| quantity                         | Quantity of the purchased products.                                                                                     | 2                                         |
| total\_price                     | Total price paid by the customer in the reference currency including tax and shipping.                                  | 24                                        |
| total\_price\_without\_tax       | Total price paid by the customer in reference currency including shipping but not the tax.                              | 20                                        |
| total\_price\_local\_currency    | Total price paid by the customer in the currency they used for the payment.                                             | 43                                        |
| local\_currency                  | Currency the customer used for the payment.                                                                             | USD, GBP, EUR                             |
| tags                             | Custom tags for describing the item.                                                                                    | \["new", "sales", "teen", "man"]          |
| category\_1                      | Top level category of products on the website where the item can be found.                                              | Shoes                                     |
| category\_2                      | Second level category of products on the website where the item can be found.                                           | Trekking                                  |
| category\_3                      | Third level category of products on the website where the item can be found. (number of categories is not limited to 3) | Ankle boots                               |
| categories\_path                 | Path through the categories leading to the product.                                                                     | Shoes > Trekking > Ankle boots            |
| category\_id                     | Automatically-generated ID of the final category where the purchased product belongs.                                   | abc123                                    |
| categories\_ids                  | List of IDs of all categories from root until the final one where the purchased product belongs.                        | \["abc123","abc456","abc789"]             |
| language                         | Language of website from which the purchase was made.                                                                   | en                                        |
| location                         | URL of the page where the `purchase` event occurred.                                                                    | `https://webshop.com/purchase`            |
| domain                           | Default domain of your website.                                                                                         | `webshop.com`                             |

## cart\_update

`cart_update` happens when an item/items are added or removed from the cart.

| Attribute                        | Description                                                                                                                       | Example                                         |
| :------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------- |
| action                           | Customer's action on the basket.                                                                                                  | add / remove / empty                            |
| button\_copy                     | Text of the button used for adding item to the cart.                                                                              | Add / Purchase / Add to cart                    |
| page\_type                       | Type of a page where cart contents changed.                                                                                       | product / homepage / category / page / checkout |
| product\_id                      | Automatically-generated ID of the product added/removed.                                                                          | abc123                                          |
| variant\_id                      | Automatically-generated ID of the variant of the product added/removed that includes information about colour, size or materials. | abc123small                                     |
| title                            | Name of the item added/removed that includes colour, size or materials if available.                                              | Tassel Loafers in Navy Faux Sued                |
| brand                            | Brand of an item added/removed.                                                                                                   | END.                                            |
| price                            | Price of one unit of the item added/removed to be paid by the customer in the reference currency.                                 | 18                                              |
| price\_local\_currency           | Price of one unit of the item added/removed to be paid by the customer in the currency they are going to use for the payment.     | 90                                              |
| discount\_percentage             | In case of a discount, the discount rate used on the item added/removed expressed as a percentage.                                | 10                                              |
| discount\_value                  | In case of a discount, the amount subtracted from the price of the item added/removed as a result of the discount.                | 2                                               |
| original\_price                  | Price of the item added/removed without a discount in a reference currency.                                                       | 20                                              |
| original\_price\_local\_currency | Price of the item added/removed without a discount in a currency the customer used for the payment.                               | 100                                             |
| product\_list                    | List of all products in the cart after cart update.                                                                               | \[ {"product_id": "abc123", "quantity":1} ]     |
| product\_ids                     | List of IDs of all products in the cart after cart update.                                                                        | \[ "abc123", "abc456", "abc789" ]               |
| total\_quantity                  | Total quantity of the products in the cart.                                                                                       | 2                                               |
| total\_price                     | Total price of the products in the cart in the reference currency.                                                                | 24                                              |
| total\_price\_without\_tax       | Total price of items in the cart in the reference currency including the shipping but not the tax.                                | 20                                              |
| total\_price\_local\_currency    | Total price of items in the cart in the currency the customer will use for the payment.                                           | 43                                              |
| local\_currency                  | Currency the customer will use for the payment.                                                                                   | USD, GBP, EUR                                   |
| tags                             | Custom tags for describing the item.                                                                                              | \["new", "sales", "teen", "man"]                |
| category\_1                      | Top level category of products on the website where the item can be found.                                                        | Shoes                                           |
| category\_2                      | Second level category of products on the website where the item can be found.                                                     | Trekking                                        |
| category\_3                      | Third level category of products on the website where the item can be found.                                                      | Ankle boots                                     |
| categories\_path                 | Path through the categories leading to the product.                                                                               | Shoes > Trekking > Ankle boots                  |
| category\_id                     | Automatically-generated ID of the final category from which the cart was updated.                                                 | abc123                                          |
| categories\_ids                  | List of IDs of all categories from root until the final one from which the cart was updated.                                      | \["abc123","abc456","abc789"]                   |
| variant\_list                    | List of all variants of the items in the cart, their quantities and other required properties.                                    | \[ {"variant_id": "abc123", "quantity":1} ]     |
| variant\_ids                     | List of IDs of all variants of the items in the cart.                                                                             | \[ "abc123", "abc456", "abc789" ]               |
| language                         | Language of website where the cart was updated.                                                                                   | en                                              |
| location                         | URL of the page where the `cart_update` event occurred.                                                                           | `https://webshop.com/cart-update`               |
| domain                           | Default domain of your website.                                                                                                   | `webshop.com`                                   |

## checkout

`checkout` happens on with every step (page) of the checkout process.

| Attribute                     | Description                                                                                        | Example                                     |
| :---------------------------- | :------------------------------------------------------------------------------------------------- | :------------------------------------------ |
| step\_number                  | Number of the step of the checkout process.                                                        | 1                                           |
| step\_title                   | Title of the step of the checkout process.                                                         | Shipping / Personal information / Completed |
| product\_list                 | List of all products in the cart.                                                                  | \[ {"product_id": "abc123", "quantity":1} ] |
| product\_ids                  | List of IDs of all products in the cart.                                                           | \[ "abc123", "abc456", "abc789" ]           |
| payment\_type                 | Payment method.                                                                                    | bank transfer / online payment / cash / cod |
| total\_price                  | Total price of the products to be purchased.                                                       | 24                                          |
| total\_price\_without\_tax    | Total price of items in the cart in the reference currency including the shipping but not the tax. | 20                                          |
| total\_price\_local\_currency | Total price of items in the cart in the currency the customer will use for the payment.            | 43                                          |
| local\_currency               | Currency the customer will use for the payment.                                                    | USD, GBP, EUR                               |
| total\_quantity               | Total quantity of the products to be purchased.                                                    | 2                                           |
| tax\_value                    | Sales tax expressed as money.                                                                      | 24                                          |
| tax\_percentage               | Sales tax expressed as a percentage.                                                               | 20                                          |
| shipping\_type                | Type of delivery.                                                                                  | courier / personally                        |
| shipping\_company             | Delivery company.                                                                                  | ups                                         |
| shipping\_cost                | Price of shipping.                                                                                 | 69                                          |
| shipping\_country             | Name of the country to which the products will be delivered.                                       | USA                                         |
| shipping\_city                | Name of the city to which the products will be delivered.                                          | New York                                    |
| voucher\_code                 | Code of the voucher to be used in this purchase.                                                   | KA54-548C-TEST                              |
| voucher\_percentage           | The discount rate conferred on the customer by the voucher expressed as a percentage.              | 10                                          |
| voucher\_value                | The amount that the voucher will subtract from the prize of the purchase.                          | 2                                           |
| variant\_list                 | List of all variants of the items in the cart, their quantities and other required properties.     | \[ {"variant_id": "abc123", "quantity":1} ] |
| variant\_ids                  | List of IDs of all variants of the items in the cart.                                              | \[ "abc123", "abc456", "abc789" ]           |
| language                      | Language of website.                                                                               | en                                          |
| location                      | URL of the page where the `checkout` event occurred.                                               | `https://webshop.com/checkout`              |
| domain                        | Default domain of your website.                                                                    | `webshop.com`                               |

## view\_item

`view_item` happens every time the customer opens the page of a particular product.

| Attribute                        | Description                                                                                                                | Example                                 |
| :------------------------------- | :------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------- |
| product\_id                      | Automatically-generated ID of the product.                                                                                 | abc123                                  |
| variant\_id                      | Automatically-generated ID of the variant of the viewed product that includes information about colour, size or materials. | abc123small                             |
| title                            | Name of the item viewed that includes colour, size or materials if available.                                              | Tassel Loafers in Navy Faux Sued        |
| brand                            | Brand of an item viewed.                                                                                                   | END.                                    |
| price                            | Price of one unit of the item viewed to be paid by the customer in the reference currency.                                 | 18                                      |
| price\_local\_currency           | Price of one unit of the item viewed by the customer in the currency listed on the website.                                | 90                                      |
| discount\_percentage             | In case of a discount, the discount rate used on the viewed item expressed as a percentage.                                | 10                                      |
| discount\_value                  | In case of a discount, the amount subtracted from the price of the viewed item as a result of the discount.                | 2                                       |
| original\_price                  | Price of the viewed item without a discount in a reference currency.                                                       | 20                                      |
| original\_price\_local\_currency | Price of the viewed item without a discount in the currency listed on the website.                                         | 100                                     |
| local\_currency                  | Currency the customer will use for the payment.                                                                            | USD, GBP, EUR                           |
| stock\_level                     | Number of the particular item in stock.                                                                                    | 46                                      |
| tags                             | Custom tags for describing the item.                                                                                       | \["new", "sales", "teen", "man"]        |
| category\_1                      | Top level category of products on the website where the item can be found.                                                 | Shoes                                   |
| category\_2                      | Second level category of products on the website where the item can be found.                                              | Trekking                                |
| category\_3                      | Third level category of products on the website where the item can be found. (number of categories is not limited to 3)    | Ankle boots                             |
| categories\_path                 | Path through the categories leading to the product.                                                                        | Shoes > Trekking > Ankle boots          |
| category\_id                     | Automatically-generated ID of the final category where the viewed product belongs.                                         | abc123                                  |
| categories\_ids                  | List of IDs of all categories from root until the final where the viewed item belongs.                                     | \["abc123","abc456","abc789"]           |
| language                         | Language of website.                                                                                                       | en                                      |
| location                         | URL of the page where the `view_item` event occurred.                                                                      | `https://webshop.com/shoes/end.-red-39` |
| domain                           | Default domain of your website.                                                                                            | `webshop.com`                           |

## view\_category

`view_category` happens every time the customer opens the page of a particular category of products.

| Attribute                  | Description                                                                                                                                                      | Example                           |
| :------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------- |
| category\_id               | Automatically-generated ID of the viewed category.                                                                                                               | abc123                            |
| category\_name             | Name of the category.                                                                                                                                            | Shoes                             |
| category\_listed\_products | List of all product IDs in the category.                                                                                                                         | \["A1", "C3", "G5", "A2"]         |
| category\_1                | Either the top level category of products preceding the currently viewed category or the currently viewed category.                                              | Shoes                             |
| category\_2                | Either the second level category of products preceding the currently viewed category or the currently viewed category.                                           | Trekking                          |
| category\_3                | Either the third level category of products preceding the currently viewed category or the currently viewed category. (number of categories is not limited to 3) | Ankle boots                       |
| categories\_path           | Path through the categories leading to the category page currently seen.                                                                                         | Shoes > Trekking > Ankle boots    |
| categories\_ids            | List of IDs of all categories from the root until the selected category.                                                                                         | \["abc123","abc456","abc789"]     |
| local\_currency            | Currency the customer will use for the payment.                                                                                                                  | USD, GBP, EUR                     |
| language                   | Language of website.                                                                                                                                             | en                                |
| location                   | URL of the page where the `view_category` event occurred.                                                                                                        | `https://webshop.com/shoes/shoes` |
| domain                     | Default domain of your website.                                                                                                                                  | `webshop.com`                     |

## consent

Attributes of the `consent` can be found in our [Tracking consent events](https://documentation.bloomreach.com/engagement/docs/tracking-consent) article.

## banner

`banner` happens when the customer is shown a banner you had created. `banner` is considered to be a semi-custom event because you have to manually set up the tracking of a new custom-made banner while the banner templates provided are tracked automatically. Learn more about weblayers in our [guide](https://documentation.bloomreach.com/engagement/docs/web-layers-1).

<Callout icon="🚧" theme="warn">
  ### Javascript editing

  Web layer conditions rely on the event `banner` and attributes `action = show` and `interaction = true / false`. If you change this structure in the JS editor, the web layer won't work properly.
</Callout>

| Attribute                  | Description                                                                                                                                 | Example                                                                                                   |
| :------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------- |
| action                     | User's action towards the banner. If there was none the value is just "show".                                                               | [click / subscribe / show / close](https://documentation.bloomreach.com/engagement/docs/custom-events#section-values-of-the-action-attribute-for-a-banner) |
| banner\_name               | Custom-given name of the banner.                                                                                                            | Subscription banner                                                                                       |
| banner\_id                 | Automatically-generated ID of the banner.                                                                                                   | 4sa5729971a4f992sj9                                                                                       |
| banner\_type               | Template or custom-given name of the type of a banner with certain properties.                                                              | medium\_rectangle                                                                                         |
| interaction                | Information on whether the user interacted with the banner.                                                                                 | true                                                                                                      |
| category\_listed\_products | List of all product IDs in the category.                                                                                                    | \["A1", "C3", "G5", "A2"]                                                                                 |
| category\_1                | Top level category of products on the website where the banner can be found.                                                                | Shoes                                                                                                     |
| category\_2                | Second level category of products on the website where the banner can be found.                                                             | Trekking                                                                                                  |
| category\_3                | Third level category of products on the website where the banner can be found. (number of categories is not limited to 3)                   | Ankle boots                                                                                               |
| categories\_path           | Path through the categories leading to the category page currently seen.                                                                    | Shoes > Trekking > Ankle boots                                                                            |
| categories\_ids            | List of IDs of all categories from the root until the selected category.                                                                    | \["abc123","abc456","abc789"]                                                                             |
| local\_currency            | Currency the customer will use for the payment.                                                                                             | USD, GBP, EUR                                                                                             |
| language                   | Language of website.                                                                                                                        | en                                                                                                        |
| domain                     | Default domain of your website.                                                                                                             | `webshop.com`                                                                                             |
| location                   | URL of the page with the banner.                                                                                                            | `http://eshop.exponea.com/chaz-kangeroo-hoodie-banner.html`                                               |
| path                       | Last part of the URL of the page with the banner.                                                                                           | `chaz-kangeroo-hoodie-banner.html`                                                                        |
| device                     | Mobile device from which the user sees the page with the banner. If the visit was not through a mobile device then it is marked as "other". | Iphone                                                                                                    |
| os                         | Operating system of the device through which the user sees the page with the banner.                                                        | Windows                                                                                                   |
| browser                    | Browser through which the the user sees the page with the banner.                                                                           | Chrome                                                                                                    |

### Values of the action attribute for a banner

| Value     | Description                                                                          |
| :-------- | :----------------------------------------------------------------------------------- |
| click     | The customer clicked on the promotional banner to see more about the offer.          |
| subscribe | The customer filled the subscribe banner with their contact information and sent it. |
| show      | The banner was shown to the customer.                                                |
| close     | The customer closed the banner.                                                      |

### Additional banner attributes for in-app personalization

In mobile apps, [in-app messages](https://documentation.bloomreach.com/engagement/docs/in-app-messages) and [in-app content blocks](https://documentation.bloomreach.com/engagement/docs/in-app-content-blocks) shown to the customer are also tracked as `banner` events. In these cases, the following additional attributes are tracked:

| Attribute     | Description                                                                                                               | Example         |
| :------------ | :------------------------------------------------------------------------------------------------------------------------ | :-------------- |
| app\_version  | The version of the mobile app.                                                                                            | 2.21.3          |
| device\_model | The device model used.                                                                                                    | iPhone          |
| device\_type  | The type of device used.                                                                                                  | mobile          |
| os\_name      | The name of the operating system used.                                                                                    | iOS             |
| os\_version   | The version of the operating system used.                                                                                 | 17.2            |
| placeholder   | The name of the placeholder in the app in where the in-app content block was shown.<br />Not tracked for in-app messages. | example\_top    |
| platform      | The platform used.                                                                                                        | iOS             |
| sdk           | The name of the mobile SDK used by the app.                                                                               | Exponea iOS SDK |
| sdk\_version  | The version of the mobile SDK used by the app.                                                                            | 2.21.3          |
| type          | The type of the banner shown (in-app message or in-app content block).                                                    | in-app message  |

## recommendation

`recommendation` happens when the customer is shown a recommendation box you had created. `recommendation` is considered to be a semi-custom event because you have to manually set up the tracking of a new custom-made recommendation while the recommendation templates provided are tracked automatically. Learn more about recommendations in our [guide](https://documentation.bloomreach.com/engagement/docs/recommendations).

| Attribute                   | Description                                                                                                                                                                            | Example                                                                                                       |
| :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| action                      | User's action towards the banner. If there was none the value is just "show". The "click" action is only possible when it's implemented and is applicable only to website deployments. | [serve / get / show / timeout / click](https://documentation.bloomreach.com/engagement/docs/custom-events#values-of-the-action-attribute-for-a-recommendation) |
| recommendation\_id          | Automatically-generated ID of the recommendation engine variant (model) used.                                                                                                          | 4sa5729971a4f992sj9                                                                                           |
| recommendation\_variant\_id | Automatically-generated ID of the recommendation engine variant (model) used.                                                                                                          | cf\_5729971a4f992sj9                                                                                          |
| product\_id                 | Automatically-generated ID of a product from the recommendation box that was clicked on by the customer.                                                                               | abc123                                                                                                        |
| product\_ids                | List of automatically-generated IDs of the products shown in the recommendation.                                                                                                       | a262740, b256429, c270262, d248197                                                                            |
| price                       | Price of a product from the recommendation box that was clicked on by the customer.                                                                                                    | 15                                                                                                            |
| placement                   | Placement of the recommendation box rendering.                                                                                                                                         | homepage / product\_detail / ...                                                                              |
| ab\_variant                 | Name of the particular recommendation variant.                                                                                                                                         | Variant A / Variant B / Control Group                                                                         |
| variant\_id                 | Automatically-generated ID of a particular variant of a product from the recommendation box that was clicked on by the customer.                                                       | abc123small                                                                                                   |

### Values of the action attribute for a recommendation

| Value                             | Description                                                                                                                                                                                                                                                        |
| :-------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| serve                             | The webpage requested information on the recommendation from the server.                                                                                                                                                                                           |
| get                               | The webpage received the information on the recommendation from the server and rendered the recommendation on the page. (The customer might still not have seen it, for example, if the box was located at the bottom and they didn't scroll down the page enough) |
| show (often named wrapper\_reach) | The webpage received the recommendation information from the server and rendered the recommendation on the page, and the customer actually saw it.                                                                                                                 |
| timeout                           | The requested recommendation was not returned by the servers to the webpage within the specified time period.                                                                                                                                                      |
| click                             | The customer clicked on the recommendation box to see the recommended product.                                                                                                                                                                                     |
| close                             | The customer closed the recommendation box.                                                                                                                                                                                                                        |

<br />

<Callout icon="📘" theme="info">
  ### Efficient platform usage

  When generated, custom events are processed and stored and can contribute to your usage allowances. For full details, see [Efficient event-based platform usage](doc:efficient-engagement-usage>) for event-based pricing, or [Pricing and usage](https://documentation.bloomreach.com/data-hub/docs/pricing-and-usage) and [Efficient profile-based usage](https://documentation.bloomreach.com/data-hub/docs/efficient-profile-based-marketing-usage) for profile-based pricing.
</Callout>

<br />