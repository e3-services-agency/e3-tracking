# Bloomreach identity and Web SDK tracking: condensed reference

Source: Bloomreach Engagement documentation, "Customer identification" (updated 2026-09-11) and "Customer identification and tracking" for the Web SDK (updated 2026-09-03). Index at https://documentation.bloomreach.com/engagement/llms.txt (append .md to any page URL for markdown). Condensed here for the agents; consult the source for detail.

## Identifiers
- Two kinds: hard ID (typically email or an internal customer id; each hard ID has exactly one value per customer) and soft ID (typically the cookie; up to 64 per customer of one type, oldest unused discarded).
- Usually one hard ID and several soft IDs. Extra hard IDs (e.g. loyalty card number) are possible but discouraged.
- IDs are case sensitive. Best practice: lowercase and trim before sending. Import transformations available: trim, lowercase.
- Restrictions: an ID can never be deleted or renamed; soft cannot become hard; hard to soft is one-way and needs the Customer Success Manager; an ID must contain at least one alphanumeric character and never the strings "null" or "undefined". Every profile needs at least one filled ID.
- Default hard ID name is `registered`; the soft ID is `cookie`. Projects may use other names. Custom identifier names must exist under Administration > Projects > Identifiers or calls are discarded.
- Internal ID is assigned by Bloomreach, visible in the profile URL, cannot be set.

## Identification flow
- Every first visitor gets an anonymous profile keyed by cookie.
- On registration, login, or purchase the site calls identify with the hard ID; all prior anonymous events move to the identified profile.
- Re-identification rule: to add a second hard ID to an already identified customer, pass both IDs in one identify call; passing only the new one creates a separate profile.
- Never set `cookie` in identify; it is ignored.
- Logout on a shared device: call anonymize to start a fresh anonymous profile; original data stays on the original profile. Push token and weblayers need explicit handling.
- Keep identify out of server-side cached content.

## Web SDK calls
- `identify(customerIds, customerProperties?, success?, error?, immediate?)`; ids as string (default hard ID) or object `{ registered: ..., user_id: ... }`.
- `update(customerAttributes)`; special attributes: first_name, last_name, company_name, photo, email, phone (E.164 with plus), language (must match project settings), domain.
- `track(eventName, eventProperties?, success?, error?)`; asynchronous; use success callback before a redirect (e.g. consent).
- `trackLink(selector, eventName, props?)`, `trackEnhancedEcommerce(gaObject, kind?)` adds `tracked_via: ecommerce`.
- `anonymize()`.

## Facts the tooling must honour
- The SDK appends `os`, `browser`, `device`, `location` to every tracked event automatically. QA must treat these as expected on every frontend event, not as unexpected properties.
- Limits: 255 event types, 255 properties per event, 128 Kbit per attribute; customer attributes 255 or 1024 depending on contract. Event and property names must be ASCII.
- Deferred events (`suggest_click`, `search_submit`) attach to the next page view event with a `df_` prefix on their properties; relevant for Search only.
- Cookies: `__exponea_etc__` tracking cookie (7 days to 3 years, reset each page load; recommended one year or more), `xnpe_[stream]` server-side twin, `__exponea_time2__` time offset (60 minutes), A/B test cookies, `_br_uid_2` and `_cdp_segments` for Search and real-time segments.
