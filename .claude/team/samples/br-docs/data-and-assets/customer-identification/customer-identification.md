---
updatedAt: 2026-09-11T10:49:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Customer identification

Defining the right customer identifiers is a critical decision at the beginning of a project. There are 2 types of identifiers:

* Hard identifier (hard ID)
* Soft identifier (soft ID)

Usually, there is one hard ID and multiple soft IDs.

## Soft IDs

A soft ID typically represents a cookie. One customer can have multiple soft IDs when they use multiple devices to visit your website.

### Soft ID limitations

You can assign a maximum of 64 soft IDs of the same type (for example, cookies) to one customer. The system discards any additional IDs with their data.

For example, if you track a new event to a customer with 64 cookies and this event adds a new cookie, the system discards the ID that was unused for the longest time and adds the new one to the profile.

## Hard IDs

A hard ID often represents the email address that the customer used to register. Every customer can have multiple hard IDs, but each hard ID can only have one value.

### Case sensitivity considerations

Hard IDs are case-sensitive. You can track two different hard IDs where the only difference is uppercase and lowercase letters (<email@email.com>, <Email@email.com>). This creates one customer unrecognized due to case differences, which could result in sending an email twice to the same customer.

<Callout icon="👍" theme="okay">
  ### Best practice

  Automatically convert IDs to lowercase to prevent duplicate profiles.
</Callout>

## How customer identification works

Bloomreach automatically creates a customer record for every first-time visitor to your website. Initially, the system identifies the customer by a `cookie` (soft ID). The cookie is unique for every device or browser (this also applies to incognito browsing).

Once the customer performs an action such as making a purchase or logging in, the system identifies them by a hard ID called `registered`. The nature of the hard ID depends on how your project is integrated. This usually includes the user's email address or an internal ID your company uses.

<Callout icon="📘" theme="info">
  ### Note

  While the hard ID used in this example is called `registered`, your hard ID may differ. Replace it if applicable. If you're unsure, ask your Customer Success Manager.
</Callout>

The diagram below illustrates the customer identification process. A new visitor starts as an anonymous profile with only a soft ID (cookie). When they perform a registration action like creating an account or making a purchase, the system associates their profile with a hard ID, typically their email address or customer ID. This process links all previous anonymous activity to their identified profile.

<Image src="https://files.readme.io/d9f9764f6c5c2d2d705712a794f267e2b98598abd6674e5e634fd252ae04263c-Group_11.png" alt="The diagram below illustrates the customer identification process" align="center" border={true} />

## ID configuration rules

### Requirements and capabilities

* Every customer profile must have at least one ID (hard or soft) with a filled value.
* You can set more than one hard ID identifier in a project. For example, customer ID from ecommerce and offline loyalty card number. However, we recommend having only one hard ID such as email or customer ID.
* You can have more than one soft ID:
  * A cookie is a standard soft ID.
  * Special kinds of soft IDs can be required by some integrations.
* When you import IDs from a table in Excel, you can apply automatic transformations to both ID types:
  * **Trim:** Removes blank spaces before and after the identifier string.
  * **Lowercase:** Converts all characters to lowercase. Apply this transformation to prevent duplicate customer profiles because Bloomreach identifiers are case sensitive.
* **Contact your Customer Success Manager for ID changes**: To introduce new hard IDs or soft IDs, or to change a hard ID to a soft ID, reach out to your Customer Success Manager. Changing a hard ID to a soft ID is a one-way, non-reversible operation.

### Restrictions

* You can't delete or rename any identifier once you set it.
* You can't change a soft ID into a hard ID once you set it. However, you can have multiple soft IDs.
* Any ID must contain at least one alphanumeric character.
* Any ID must not contain "null" or "undefined".

## Internal IDs

Bloomreach automatically assigns an internal ID to each customer. You don't specify this as a user. However, you can see it when viewing customer details. The internal ID appears in the URL.

You can also use the internal ID to retrieve the timestamp of the customer profile creation. To do so, decompose it according to [MongoDB documentation](https://www.mongodb.com/docs/mongodb-shell/reference/data-types/#timestamp).

You can't assign an internal ID to a particular customer.