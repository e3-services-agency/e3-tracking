---
updatedAt: 2026-09-11T11:10:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Cookies

This guide introduces you to cookies and explains how Bloomreach uses them to identify and track customers across sessions and devices.

Bloomreach identifies users by tracking their cookie. A customer's cookie acts as their soft ID, and when a user is identified (for example, by email), it serves as a complement to their hard ID. Read more on the difference between hard and soft ID in the [Customer identification article](https://documentation.bloomreach.com/engagement/docs/customer-identification).

<Callout icon="🚧" theme="warn">
  ### Important

  Before customer's cookies can be tracked, you must receive explicit consent from them for doing so.
</Callout>

# Cookie journey

A customer's cookie goes through the following journey:

1. When a customer visits your website, it is one of these two scenarios:

* Their Bloomreach cookie has already been tracked and stored in Bloomreach.
* No Bloomreach cookie can be found, and so a new cookie is created via an API request.

2. Bloomreach then checks whether the customer is identified via an email or an account sign-up.

* If yes, then Bloomreach checks if they are an existing customer.
  * If they are an existing customer, a cookie is added to the customer’s profile as a soft ID.
  * If they aren't an existing user, a new customer profile is made with the cookie as a soft ID.
* If no, a Bloomreach cookie is stored as a soft ID without a hard ID.

3. All the user’s following actions are [tracked](https://documentation.bloomreach.com/engagement/docs/tracking) in the customer's profile with this particular cookie as their soft ID.

<Callout icon="📘" theme="info">
  ### Note

  A cookie is automatically recognized as [PII](https://documentation.bloomreach.com/engagement/docs/managing-pii) and expires three years after the last time it was tracked (unless you [configure a different expiration in the JS SDK](https://documentation.bloomreach.com/engagement/docs/configuration#cookies-options)).
</Callout>

<Image src="https://files.readme.io/e7e31fd29b09f575e73253b9ba018f1a9aaa86bba71884c92302744c9800f7bb-marketing_cookie_flow_1.png" alt="Cookie journey diagram showing how a customer cookie is created, stored, and linked to a customer profile" align="center" width="80%" border={true} />

**Example**<br />James has never visited your website. After agreeing to cookies and Bloomreach is launched, Bloomreach recognizes that James doesn't have a cookie. A new cookie is created to track his actions.

When James checks out of your store and creates an account, his cookie is attached to his email address. His hard ID is the email address, and his soft ID is the cookie.

To show how a customer can have multiple cookies: if James visits your site from a new device — an iPhone 11 — he gains another cookie as a soft ID in his customer profile.

# Storage

To read about how and which cookies are stored in Bloomreach, go to [Cookies & Storage article](https://documentation.bloomreach.com/engagement/docs/cookies-storage).

# Anonymization

To read about how cookies can be anonymized, go to the [Right to erasure section](https://documentation.bloomreach.com/engagement/docs/individual-rights#anonymization).

# Bloomreach cookies and other platforms

Some of the integrations send IDs for mapping. For more information, see the [Terms of Use for Third-Party Integrations](https://www.bloomreach.com/en/legal/bloomreach-engagement-integration-terms).