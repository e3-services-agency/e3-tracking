# QA T-4-33 catalog fields table editor, task/T-4-33-catalog-table-editor @ 9caa96b

Overall: FAIL (1 failure, backend FK on deleting a linked field; everything else PASS). Setup: API 3014 (qa db), Vite 3012 (3011 was busy) via throwaway config, sandbox project. Browser pane could not resize/screenshot; layout verified by DOM. backup.json saved in this folder.

1. Table editor: PASS. Columns: handle, Name, Data type, Lookup key radio, "Searchable 1/40", Required, Client field name, Bloomreach column, actions (up/down/duplicate/delete). Summary "Lookup key: item_id. Searchable: 1 of 40. Not marked live." plus Jinja hint line. Panel (500 px): table 778 px in a scroll box 434 px wide (overflow-auto, max-h 60vh), th position sticky; maximized: 1086 = 1086, no inner scroll. Document scrollWidth = window width (no page scroll). Fields initially in name order (migration backfill).
2. Editing: PASS. Rename, type change, searchable ticks (count 3/40), move up/down, duplicate (title_copy), Add field (new Name focused), Enter on last row adds a row with focus. Save persisted via GET /catalogs/:id in new order (sort_order 0..10, flags and types as edited); reload shows same order; History shows create rows for new fields. Drag not tested (pane cannot drag).
3. Validation: PASS. Empty name: "A field has no name.", Save disabled. Duplicate: row note `Duplicate name "title".`, Save disabled. Radio is a single choice; number rows have a disabled radio; key field changed to number: Save disabled, "The lookup key field must have the data type string." 41 searchable: header amber at 40, red at 41, Save disabled, "Over the searchable limit."
4. Lookup key change item_id -> product_id on products_gb: PASS. API shows product_id key only; comparison re-run: no stale finding about the old key; new catalog_lookup_property / catalog_link_missing findings reflect the new key.
5. Delete: FAIL (see below), rest PASS. Unlinked field delete: no dialog, saved. Cancel with dirty draft closes and discards without a prompt (minor, planned fix). Linked field: confirm "item_id is referenced by a property link. Delete it anyway?" appears.
   FAIL F1: confirming the delete then Save shows "FOREIGN KEY constraint failed. Fields saved before the error were kept; the table was reloaded." and the API logs a 500 (console 500).
   Steps: sandbox, Catalogs, open products_gb, click Delete on item_id (property product_id links to it via properties.mapped_catalog_field_id), accept the confirm, Save Catalog.
   Expected: field deleted (link cleared or an explicit message). Actual: 500, field remains. Cause: CatalogDAL.deleteCatalogField (unchanged by this task) never nulls properties.mapped_catalog_field_id (FK without ON DELETE). Pre-existing backend bug, now reachable through a confirm that promises success. Also the saved-before-error fields stay while the delete's sibling edits after it are lost.
6. Mark live: PASS. Disabled while the draft is dirty, enabled after Save; live_at set and searchable_snapshot_json = [image_url, title, title_copy, url].
7. Regression: PASS. Catalogs list, event card (catalog field column, implementation snippet), shared view Catalogs section (order kept), Properties editor (Add value, definitions) all render; backup.json has sort_order on 31 catalog fields, restore into a new project keeps order (products_cz item_id..extra_b 0..9). Console: only the 500 from F1.

Minor notes
- Every searchable row shows its own "Over the searchable limit." row when over 40 (41 repeated messages).
- Sandbox variants_* fields all have sort_order 0 after restore (ties, shown alphabetically); sandbox backup predates the column.
- change_log sort_order values on created fields look relative (1..4), order is not logged (as announced).
- Dirty-Cancel prompt, swap-rename 409, Mark live while saving: reviewer notes, not retested.
- Rule item schema editor not reused or changed; the card's Item schemas section renders.

## Re-check 6b5c851

Sandbox project, API 3014, Vite 3011 (throwaway config), servers stopped, QA db and config removed. The browser pane was intermittently unrendered (viewport 0x0, React updates deferred until it woke); results were read from the DOM after the page drew, and window.confirm was recorded by an override.

Overall: PASS (F1 fixed; items 2 to 5 PASS; one note on item 5).

1. F1 PASS. products_gb, Delete on item_id: confirm text "product_id (event) links to item_id; the link will be removed. Delete the field anyway?" (names the property, says the link is removed). Save Catalog: requests PATCH catalog, DELETE field, PUT field order, no 500, no error text, no console errors. API: product_id.mapped_catalog_field_id is now null; the property editor's "Catalog field" shows "Not linked". History: `property product_id update mapped_catalog_field_id <old id> -> —` and `catalog_field products_gb.item_id delete` rows.
2. Dirty Cancel PASS. After editing a field name, Cancel and the Sheet X ("Close") both call confirm "Discard unsaved field changes?"; declining keeps the sheet open, accepting closes it.
3. Over-limit message PASS. 43 searchable ticks: header "Searchable 43/40" and one `<p>` under the table "43 searchable fields, the limit is 40." (the same sentence is also listed once in the Save-disabled reason list); zero messages inside table rows; Save disabled.
4. Rename clash PASS. Renaming image to item_id while item_id is renamed to item_id_new (no duplicate in the draft, but item_id is another field's saved name): Save disabled, reason "A rename takes a name another field still has: rename in two saves." A plain duplicate still shows `Duplicate name "item_id".`
5. Mark live while saving PASS (note). With the draft dirty, Save clicked with writes delayed 2.5 s each: the Mark live link was disabled during "Saving…", and enabled again after the reload (about 7 s, three delayed writes). The disabled state during saving cannot be separated from the dirty guard in the browser, since the draft is still dirty until the reload; the source has `disabled={dirty || saving}`.
