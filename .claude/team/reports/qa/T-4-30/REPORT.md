# QA T-4-30 identity codegen parity, task/T-4-30-identity-codegen-parity @ 37d1215

Overall: PASS with 2 findings (1 medium bug, 1 low gap) and notes. Setup: worktree C:/t/t430, API on 3013 (3012 was held by another process, left alone), throwaway Vite config proxying to 3013 (ports 3010/3011/3012 all served it), sandbox via POST /api/projects/sandbox. Saved: td.json, doc.html, shared-td.json, shared-doc.html, identity-codegen.json.

## 1. Identity rules page tabs and copy: PASS
Identify, update and anonymize each render as a block with tabs "GTM / dataLayer", "Web SDK", "Web SDK (legacy)", "Tracking API" and one "Copy code" button, identical labels to the event card block. With navigator.clipboard.writeText hooked, clicking Copy on all 4 tabs x 3 blocks (12 combinations) wrote exactly the displayed pre text each time.

Identify snippet per tab (seed rules, before my edits):

Web SDK
    // emailId: raw value for the hard identifier "email_id"
    brweb.identify({ email_id: String(emailId).trim().toLowerCase(), });
    // Standalone identify call when the checkout page loads: binds cart_id, cookie
    // The cookie is bound by the SDK automatically.
    brweb.identify({ cart_id: cartId, });
    (plus phone_id standalone block "when the SMS consent form is submitted")

Web SDK (legacy): same three blocks with exponea.identify({...}).

Tracking API
    // Sending a hard id together with the cookie in customer_ids merges the cookie profile into the customer.
    // Tracking API: POST /track/v2/projects/{project_token}/customers (see ...)
    { "customer_ids": { "cookie": "<cookie>", "email_id": "<email_id>" }, "properties": {} }
    then one body per standalone rule (cart_id+cookie, cookie, phone_id+cookie), each with a "Standalone identify call (client-side in production; the Tracking API equivalent is shown) when ..." header.

GTM / dataLayer
    // emailId: raw value ...
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ bloomreach: null });
    window.dataLayer.push({ event: 'bloomreach_identify', bloomreach: { identify: { email_id: String(emailId).trim().toLowerCase(), }, }, });
    ... one reset+push per standalone rule, then
    // This push needs a trigger in the shared E3 GTM template for the `bloomreach_<call>` events; the template ships only the
    // event forwarding today. Do not call the SDK from the site for this.

## 2. Content: PASS (one FAIL below)
- Web SDK brweb.identify/update/anonymize, legacy exponea.*, Tracking API customers body with customer_ids + properties (update), anonymize endpoint POST /data/v2/projects/{project_token}/customers/anonymize with note "Server-side anonymization removes the customer's personal data; it is not the SDK logout" : verified (anonymize needed a rule with sdk_call anonymize; the sandbox has none and shows "// No logout (anonymize) rule configured." in all four tabs, which is expected).
- GTM: `{ bloomreach: null }` reset push precedes every `bloomreach_<call>` push (identify, update, anonymize) and the trigger note is present.
- cart_id standalone appears once per tab, phrased "when the checkout page loads". With cart_id's source set to a Tracking API source, the client tabs (and GTM) show the comment block "Standalone server-side identification ... there is no SDK identify call. // customer_ids: { cart_id: cartId }"; no code call. No empty `identify({})`: the cookie-only standalone rule produces no block in client tabs (still present as a body in the Tracking API tab, which is correct there).
- Transformations: changing email_id to ["lowercase"] gave `String(emailId).toLowerCase()` in exactly 3 tabs (Web SDK, legacy, GTM); back to trim+lowercase restored it.

### FAIL 2a (medium): an anonymize rule leaks into identify as a standalone identify block
Steps: 1. POST /api/projects/<id>/identity-rules {identifier_name:"registered", identity_type:"hard", name:"Logout", sdk_call:"anonymize", trigger_text:"the user logs out"}. 2. GET /identity-rules/codegen (or open Identity rules page).
Expected: identify tabs unchanged; the rule appears only in the anonymize tabs.
Actual: every identify tab gains "// Standalone identify call when the user logs out: binds registered, cookie ... brweb.identify({ registered: registered });" (legacy, GTM and Tracking API too), the same block appears on the view_item card Identity block, and the identification-flow standalone sets treat it as an identify. Anonymize output itself is correct. Cause is probably that rules with trigger_text and no trigger event are all treated as standalone identify calls regardless of sdk_call.

### Gap 2b (low): transformations ignored on standalone identify calls
phone_id (transformations ["trim"], standalone) renders `phone_id: phoneId` and cart_id with ["trim","lowercase"] renders `cart_id: cartId` / comment `{ cart_id: cartId }`. Hard-id identify applies them correctly. Task text only asks for hard-rule transformations; flagging for consistency.

## 3. Event card: PASS
Implementation method / Identity block: view_item, checkout, search (client_web with identifiers) show the "Identity" section with "Identifiers sent in customer_ids: ..." and the four-tab identify block. cart_update and purchase (server_api) and page_visit (sdk_auto) show no Identity block; the Identifiers (customer_ids) field remains. Navigation view_item, cart_update, view_item, purchase, checkout, cart_update, search via the Events table: block present or absent strictly per event each time, no stale block.
Note: the card block shows the project-wide identify snippet, not one limited to the event's own identifiers (e.g. cookie only for view_item).

## 4. Exports: PASS
- tracking-document.json `identity_codegen` has identify, update, anonymize, each with web_sdk, web_sdk_legacy, tracking_api, gtm_datalayer.
- documentation.html section #identity-codegen: h3 identify/update/anonymize, each with four h4 labels "GTM / dataLayer", "Bloomreach Web SDK", "Bloomreach Web SDK (legacy)", "Bloomreach Tracking API".
- Shared view (POST /share {access:read, force:true}): #identity shows three blocks, each collapsed behind "Show implementation snippets", four tabs each; the view_item card has the extra identify block (2 Show buttons, bloomreach_identify present), cart_update and page_visit have none. Public tracking-document.json and documentation.html carry identity_codegen (4 forms x 3); markers set on view_item agent_instructions ("QAMARK430"), email_id rule owner and description: zero occurrences in the shared page, shared JSON and shared HTML.

## 5. Regression: PASS
Events, Properties, History, Findings, Identity rules load with content; comparison run: open 15 (5 error, 10 warning), produced 16, unchanged. No console errors; API log has no 500s.

## Other notes
- Flow wording "when first page view of a new visitor" (trigger_text is a noun phrase; pre-existing from T-4-28).
- Tracking API snippet for a standalone cookie rule is emitted although the SDK binds cookie itself (intended: Tracking API form needs it).
