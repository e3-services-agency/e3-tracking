---
updatedAt: 2026-08-27T05:44:53.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Merging customers

This guide introduces you to customer merging—how it works, what rules govern it, and how to avoid common merging problems.

Customer merging lets you identify a single customer across multiple devices and browsers. When a customer visits your website using their phone and later through a PC, the platform sees this as 2 separate customers with 2 different cookies. Once they're identified on both devices—after making a purchase or logging in—the 2 profiles are automatically merged into one, together with all their historical events and customer properties. When properties conflict, the newer value overwrites the older one. After merging, a `merge` event is tracked. This avoids duplicate profiles and gives you coherent, reliable tracking of your customers.

## Merging rules

* No 2 customers can exist with the same hard or soft ID at the same time in the same project.
* It isn't possible to merge customer profiles with different hard IDs of the same type.
* If there is a “clash” of identical soft IDs of the same type in 2 customer profiles with different hard IDs of the same type, then the soft ID is transferred (or “stolen”) from the “older” profile and will remain only in the “newer” profile.
  * However, historic events aren't moved from the “older” into the “newer” profile. This ensures the maintenance of your previous customer’s data.
  * The soft ID in the profile from which the cookie is stolen reverts back to being "not set". The cookie remains present only in the events on the profile; however, it can't be found in the customer filter anymore.
* Events are moved from source customers to destination customers. In this case, destination customers are those whose record in the database was created first - they have lower customer [ID number](https://documentation.bloomreach.com/engagement/docs/cookies) and by default higher priority.
* Properties from source customers are added to the destination customer.
* If the destination customer already has a property with a given name, it is replaced.
* The same rule that applies to properties also applies to assigned HTML campaigns.
* Latest communication overwrites the older one.
* Assigned A/B tests are merged in reversed order (the A/B test from a customer with a newer (larger) internal ID wins over the older (smaller) one).
* `add_first_session` flag is set only if any of the customers has it set to **True**.

## Merge event

When the customer's IDs from multiple devices finally merge into one customer profile, an event `merge` is tracked with the following properties:

| Attribute                 | Description                                                                      | Example                                                                                                                                          |
| :------------------------ | :------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| source\_internal\_ids     | Internal IDs of merged customers                                                 | `["58244a8dfb6009d9d3213198", "5820734f83043485f66795eb"]`                                                                                       |
| destination\_internal\_id | Internal ID of the final customer                                                | `"5820734f83043485f66795eb"`                                                                                                                     |
| original\_external\_ids   | External IDs (registered, cookie) of merged customers                            | `{"5820734f83043485f66795eb":{"registered":["bruckner@hu.com"]},"58244a8dfb6009d9d3213198":{"cookie":["c50961e7-9086-4169-8066-1ee47615108b"]}}` |
| final\_external\_ids      | List of all external IDs (registered, cookie) from two initial profiles          | `{"cookie":["c50961e7-9086-4169-8066-1ee47615108b"],"registered":["bruckner@hu.com"]}`                                                           |
| requested\_ids            | List of external IDs (registered, cookie) in the request that merged the clients | `{"cookie":"c50961e7-9086-4169-8066-1ee47615108b","registered":"bruckner@hu.com"}`                                                               |

## Merging problem

A merging problem can occur when customers in your project don't have hard IDs. If Customer 1 visits your website from Customer 2's device, the system doesn't recognize Customer 1 as a unique individual. Instead, it treats them as an additional soft ID and adds them to Customer 2's profile—leaving you with one profile where there should be two.

To prevent this, set `email` as a hard ID. If you want to keep `email` as a soft ID, set another attribute as the hard ID instead. With a hard ID in place, the system recognizes that a unique customer is visiting from another customer's device and doesn't trigger a merge.

New soft IDs can be defined when creating a new project. To add soft IDs to an existing project or adjust ID settings, contact your CSM.