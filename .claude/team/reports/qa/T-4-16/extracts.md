# T-4-16 QA extracts (4be1454)
- Nav: aria-labels "Collapse/Expand Events (62)", "Custom events (42)", "SDK events (5)", "Platform events (15)"; collapse Custom -> 71 to 29 visible nav links; filter "cart" -> [Events, Custom events, cart_update]; clear -> back to prior collapsed state (29).
- Section clicks (Properties, Use cases, Consents, Mapping, Findings): aria-current set on clicked item each time; Findings (page bottom) top=658 at max scroll. Wheel up 100px keeps Findings; wheel up 500px -> Use cases; +200 -> Mapping.
- Nav hrefs all resolve to DOM ids (0 missing). Catalogs / Identity / Sources not in nav and not in DOM (empty for sandbox, hidden).
- Shared: cart_update bubble 0 -> 1 after post as "Client QA"; UC-01 email requirement 0 -> 1; th = Target/Level/Status/Comments; 0 "Comments on this requirement / No comments yet" blocks; 1 "Comments / No comments yet" (use-case level block, still present).
- Internal: card header "Comments on this event: 1" -> thread shows "via share link"; internal-only comments absent from GET /api/shared/<token>/comments and shared DOM (marker grep false).
