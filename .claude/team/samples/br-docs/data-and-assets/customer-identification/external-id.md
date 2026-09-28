---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# External ID

Bloomreach uses 2 types of customer identifiers: the **internal ID** and the **external ID**. The internal ID is assigned automatically and appears in the URL when you view a customer's profile. The external ID is set by you and maps customers from your external [data source](https://documentation.bloomreach.com/engagement/docs/data-import#data-sources). Think of it as a database index.

Every customer must have at least one external ID. For basic use cases — like importing customers by email address — you can use an email as the external ID. For more advanced use cases, such as tracking anonymous customers before they authenticate, you can configure multiple external identifiers per project.

## Types of external IDs

Each external identifier has its own group name. The simplest configuration includes:

* `registered`: [hard ID](https://documentation.bloomreach.com/engagement/docs/customer-identification#section-hard-id) used to track the ID from your system's database.
* `cookie`: [soft ID](https://documentation.bloomreach.com/engagement/docs/customer-identification#section-soft-id) used to track anonymous customers.

> 📘 Note
>
> You can configure an unlimited number of external identifiers per project. For example, you may need an ID from your own system, an ID from Facebook, and an email address—all as separate identifiers.

## Customer ID use cases

The following use cases cover the most common tasks that involve manipulating customer IDs. You need administration access to make project-level ID configurations.

| Use case                           | IDs                                  | Identification call                                                      | Result                                                                                                                                            |
| :--------------------------------- | :----------------------------------- | :----------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create a new customer by hard ID   | `registered` (hard), `cookie` (soft) | `{registered: 1}`                                                        | New customer with external IDs: `{'registered': '1'}`                                                                                             |
| Create a new customer by soft ID   | `registered` (hard), `cookie` (soft) | `{'cookie': '123e4567-e89b-12d3-a456-426655440000'}`                     | New customer with external IDs: `{'cookie': '123e4567-e89b-12d3-a456-426655440000'}`                                                              |
| Look up an existing customer by ID | `registered` (hard), `cookie` (soft) | `{'registered': '1'}`                                                    | Customer (existing customer with `{'registered': '1', 'cookie': '123e4567...'}`) is returned with all external IDs intact.                        |
| Identify an anonymous customer     | `registered` (hard), `cookie` (soft) | `{'registered': '1', 'cookie': '123e4567-e89b-12d3-a456-426655440000'}`  | Customer (previously known only by `cookie`) is updated: `{'registered': '1', 'cookie': '123e4567-e89b-12d3-a456-426655440000'}`                  |
| Handle multiple cookies            | `registered` (hard), `cookie` (soft) | ` {'registered': '1', 'cookie': '234e5678-e90b-12d3-a456-426655440000'}` | Customer gains a second cookie: `{'registered': '1', 'cookie': ['123e4567-e89b-12d3-a456-426655440000', '234e5678-e90b-12d3-a456-426655440000']}` |

## Anonymize customer

1. Remove private customer properties.
2. Remove external IDs and replace the cookie (cookies are replaced with a random UUID).
3. Remove private properties of events.
4. Add an anonymization event.

For instructions, see the [anonymization guide](https://documentation.bloomreach.com/engagement/docs/individual-rights#anonymization).

### Export ID history

To export all past IDs, present the ID in a JSON file in GCS.

## Customer merging

For general merging rules and behavior—including how properties, events, and A/B tests are handled during a merge—see [Merging](https://documentation.bloomreach.com/engagement/docs/merging). The sections below cover conflict resolution specific to external ID configuration.

### Basic customer merging

* **IDs:** `registered` (hard), `cookie` (soft)
* **Customers:**
  * Customer 1 with `{'cookie': '123e4567-e89b-12d3-a456-426655440000'}` and properties `{'a': 1, 'b': 2}`
  * Customer 2 with `{'registered': '1'} and properties {'a': 2, 'c': 3}`
* **Identification calls:** `{'registered': '1', 'cookie': '123e4567-e89b-12d3-a456-426655440000'}`
* **Expected result:**
* **Customer 1 with external IDs:** `{'registered': '1', 'cookie': '123e4567-e89b-12d3-a456-426655440000'} and properties {'a': 2, 'b': 2, 'c': 3}`
* Customer 2 is removed and all its properties and events are moved to Customer 1.

> 📘 Note
>
> c2 is merged into c1 because c1 is older, even though c2 has a hard ID.

## Merge conflict resolving

A merge conflict occurs when the standard [merge rules](https://documentation.bloomreach.com/engagement/docs/merging) would result in a customer having more than one hard ID of the same type. When this happens, the following rules apply:

* **If soft IDs are involved:** The system tries to resolve the conflict by moving soft IDs between customers. Each soft ID has an assigned priority rank. The algorithm selects the combination that maximizes the sum of priorities for IDs that are moved — keeping the most important IDs intact and moving the least important ones. If moving soft IDs doesn't resolve the conflict, the same strategy used for hard-ID-only conflicts is applied.
* **If only hard IDs are involved:** The conflict can't be resolved. The operation is discarded and a merge failure is returned.

### Soft ID priority ranking

Each soft ID is assigned a priority rank based on its position in the external ID array (excluding hard IDs), starting at 1.

Example of IDs priority ranking:

* `registered` (hard - no rank),
* `email` (soft - rank 1),
* `Facebook` (hard - no rank),
* `phone` (soft - rank 2),
* `cookie` (soft - rank 3)

In this example, `email` is the most important soft ID, `phone` is second, and `cookie` is the least important.

## Conflict resolving use cases

### Unresolvable hard ID request

* **IDs:** `registered` (hard), `Facebook` (hard)
* **Customers:**
  * Customer 1 with `{'registered': '1', 'facebook': '1'}`
  * Customer 2 with `{'registered': '2', 'facebook': '2'}`
* **Identification calls:**  `{'registered': '1', 'facebook': '2'}`
* **Expected result:** No customers are modified. A merge error is returned.

### Move a cookie between customers (ID transfer)

* **IDs:** `registered` (hard), `cookie` (soft)
* **Customers:**
  * Customer 1 with `{'registered': '1', 'cookie': ['1', '3']}`
  * Customer 2 with `{'registered': '2', 'cookie': '2'}`
* **Identification calls:**  `{'registered': '2', 'cookie': '1'}`
* **Expected result:**
  * Customer 1 with `{'registered': '1', 'cookie': '3']}`
  * Customer 2 with `{'registered': '2', 'cookie': ['2', '1']}`

Merging these two customers isn't possible since it would result in a customer having two registered hard IDs. Moving the cookie from Customer 1 to Customer 2 resolves the conflict without a merge.

## Use soft ID priority to resolve a conflict

* **IDs:** `registered` (hard), `email` (soft), `cookie` (soft)
* **Customers:**
  * Customer 1 with `{'registered': '1', 'email': '2', 'cookie': '3'}`
  * Customer 2 with `{'registered': '4', 'email': '5'}`
* **Identification calls:**  `{'cookie': '3', 'email': '5'}`
* **Expected result:**
  * Customer 1 with `{'registered': '1', 'email': '2']}`
  * Customer 2 with `{'registered': '4', 'email': '5', 'cookie': '3'}`\
    A full merge would cause a hard ID conflict (`registered` → 1 and 4). The conflict can be resolved by either moving `email` from Customer 2 →  Customer 1, or moving `cookie` from Customer 1 → Customer 2. Since `email` has a higher rank (rank 1), the system preserves it and moves `cookie` (rank 2) instead.

### Move soft IDs from 2 different customers at once

* **IDs:** `registered` (hard), `email` (soft), `phone` (soft), `cookie` (soft)
* **Customers:**
  * Customer 1 with `{'registered': '1', 'email': '1'}`
  * Customer 2 with `{'registered': '2', 'phone': '2'}`
  * Customer 3 with `{'registered': '3', 'cookie': '3'}`
* **Identification calls:** `{'registered': '1', 'email': '1', 'phone': '2', 'cookie': '3'}`
* **Expected result:**
  * Customer 1 with `{'registered': '1', 'email': '1', 'phone': '2', 'cookie': '3'}`
  * Customer 2 with `{'registered': '2'}`
  * Customer 3 with `{'registered': '3'}`

### Move 2 soft IDs from one customer at once

* **IDs:** registered (hard), email (soft), phone (soft), cookie (soft), device (soft)
* **Customers:**
  * Customer 1 with `{'registered': '1', 'email': '1', 'cookie': '1'}`
  * Customer 2 with `{'registered': '2', 'phone': '2', 'device': '2'}`
* **Identification calls:** `{'email': '1', 'cookie': '1, 'phone': '2', 'device': '2'}`
* **Expected result:**
  * Customer 1 with `{'registered': '1', 'email': '1', 'phone': '2', 'cookie': '1', 'device': '2'}`
  * Customer 2 with `{'registered': '2'}`

## Unable to resolve a conflict by moving soft IDs

* **IDs:** registered (hard), Facebook (hard), a cookie (soft)
* **Customers:**
  * Customer 1 with `{'registered': 'A', 'facebook': 'B'}`
  * Customer 2 with `{'registered': 'B'}`
  * Customer 3 with `{'facebook': 'C', 'cookie': 'X'}`
* **Identification calls:**  `{'facebook': 'B', 'registered': 'B', 'cookie': 'X'}`
* **Expected result:**
  * Customer 1 with `{'registered': 'A', 'facebook': 'B'}`
  * Customer 2 with `{'registered': 'B', 'cookie': 'X'}`
  * Customer 3 with `{'facebook': 'C'}`

The best resolution here is to move the `cookie` from Customer 3 → Customer 2. This doesn't resolve the conflict between Customer 1 and Customer 2, but it's better than returning Customer 2 unchanged. `registered` has the lowest rank, which is why Customer 2 receives the `cookie`.

### Hard ID conflict from an ID not yet in the data

* **IDs:** `registered` (hard), `Facebook` (hard)
* **Customers:** Customer 1 with `{'registered': '2', 'facebook': '1'}`
* **Identification calls:** `{'registered': '1', 'facebook': '1'}`
* **Expected result:** None of the customers are modified, and a merge error is returned.

### Hard ID conflict from a new ID resolved by moving a soft ID

* **IDs:** `registered` (hard), `cookie` (soft)
* **Customers:** Customer 1 with `{'registered': 'A', 'cookie': 'B'}`
* **Identification calls:** `{'registered': 'B', 'cookie': 'B'}`
* **Expected result:**
  * Customer 1 with {'registered': 'A'}
  * Customer 2 with {'registered': 'B', 'cookie': 'B'}

### Hard ID conflict from a new ID resolved by moving a soft ID (multiple hard IDs)

* **IDs:** `registered` (hard), `Facebook` (hard), `cookie` (soft)
* Customers:
  * Customer 1 with `{'facebook': '1', 'cookie': '1'}`
  * Customer 2 with `{'registered': '2'}`
* Identification calls: `{'registered': '2', 'facebook '2', 'cookie': '1'}`
* **Expected result:**
  * Customer 1 with `{'facebook': '1'}`
  * Customer 2 with `{'registered': '2', 'facebook': '2', 'cookie': '1'}`

### Two hard ID conflicts at once caused by soft IDs

* **IDs:** `registered` (hard), `facebook` (hard), `email` (soft), `phone` (soft), `cookie` (soft), `device` (soft)
* **Customers:**
  * Customer 1 with `{'registered': '1', 'email': '1', 'device': '3'}`
  * Customer 2 with `{'registered': '2', 'facebook': '2', 'phone': '2'}`
  * Customer 3 with `{'facebook': '3', 'cookie': '3', 'device': '4'}`
* **Identification calls:** `{'email': '1', 'phone '2', 'cookie': '3', 'device': '5'}`
* **Expected result:**
  * Customer 1 with `{'registered': '1', 'facebook': '3', 'email': '1', 'phone': '2', 'cookie': '3', 'device': ['3', '4', '5']}`
  * Customer 2 with `{'registered': '2', 'facebook': '2'}`

### Non-trivial hard ID conflict 1

* **IDs:** `email` (hard), `strange` (hard), `registered` (soft), `cookie` (soft)
* **Customers:**
  * Customer 1 with `{'email': 'example@example.com', 'strange': '1', 'registered': 'A', 'cookie': '09e7c434'}`
  * Customer 2 with `{'email': 'example@example.com', 'strange': '2'}`
* **Identification calls:** `{'email': 'example@example.com', 'strange': '3', 'registered': 'A'}`
* **Expected result:** No customers are modified, and a merge error is returned.

### Non-trivial hard ID conflict 2

* **IDs:** `email` (hard), `strange1` (hard), `strange2` (hard), `registered` (soft), `cookie` (soft)
* **Customers:**
  * Customer 1 with `{'email': 'example@example.com', 'strange1': '1', 'registered': 'A', 'cookie': '09e7c434'}`
  * Customer 2 with `{'strange2': 's1', 'cookie': '0a3c2f45'}`
  * Customer 3 with `{'email': 'example@example.com', 'strange1': '2'}`
* **Identification calls:** `{'email': 'example@example.com', 'strange1': '3', 'strange2': 's2', 'registered': 'A', 'cookie': '0a3c2f45'}`
* **Expected result:** No customers are modified and a merge error is returned.

## Modify ID configuration

You can define external IDs per project. Only the following changes are supported:

* Adding a new identifier.
* Converting a hard ID to a soft ID.

Other operations—such as reordering IDs, removing an ID, or converting a soft ID to a hard ID—aren't supported. Making these changes would require traversing all existing data to check for conflicts (for example, customers with multiple soft IDs that would become customers with multiple hard IDs, which isn't allowed).

## Limitations

Each customer can have a maximum of 64 soft IDs of any one type. When this limit is reached, the oldest soft ID is removed to make room for the new one.

For example, if a customer has 64 cookies and receives a new one, the oldest cookie is dropped and the new one is added—keeping the total at 64.

When resolving soft ID conflicts, the system looks for the optimal subset of IDs to move. Since there are 2^n possible subsets (where n is the number of soft IDs involved), examining all combinations would create performance vulnerabilities. To prevent this, the system examines only the first 16 subsets. This may produce suboptimal results in highly complex edge cases, but such cases are unlikely to occur in production unless artificially constructed.

### Too many cookies

* **IDs:** registered (hard), a cookie (soft)
* Identification calls: `{'registered': '1', 'cookie': '1'}`, `{'registered': '1', 'cookie': '2'}`, `{'registered': '1', 'cookie': '3'}`, ..., `{'registered': '1', 'cookie': '65'}`
* **Expected result:** After first 64 requests the only customer should look like this: `{'registered': '1', 'cookie': ['2', '3', ... '65']}`

### Too many soft IDs — complex case

* **IDs:** `registered1` (hard), `registered2` (hard), `cookie` (soft), `phone` (soft)
* Identification calls:
  * `{'registered1': '1', 'cookie': '5', 'phone': '123'}` → Customer 1
  * `{'registered1': '1', 'cookie': '2', 'phone': '234'}`→ Customer 1
  * `{'registered1': '1', 'cookie': '3', 'phone': '345'}` → Customer 1
  * `{'registered2': '2', 'cookie': '4', 'phone': '456'}`→ Customer 2
  * `{'registered2': '2', 'cookie': '1', 'phone': '567'}` → Customer 2
  * `{'registered1': '1', 'registered2': '2', 'cookie': '6'}` → triggers a merge, but `cookie` is over limit by 2 and `phone` is over limit by 1
* **Result after the first 5 calls:**
  * Customer 1 with `{'registered1': '1', 'cookie': ['5', '2', '3'], 'phone': ['123', '234', '345']}`
  * Customer 2 with `{'registered2': '2', 'cookie': ['4', '1'], 'phone': ['456', '567']}`
* Result after the 6th call: Customer 12 with `{ 'registered1': '1', 'registered2': '2', 'cookie': ['3', '4', '5', '6'], 'phone': ['234', '345', '456', '567']}`