-- Operational monotonic revisions: all writes, including REST/UI/imports, invalidate MCP inventories.
CREATE TABLE mcp_project_revisions (project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE, generation INTEGER NOT NULL DEFAULT 0);
CREATE TRIGGER mcp_revision_projects_insert AFTER INSERT ON projects BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_projects_update AFTER UPDATE ON projects BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.id,NEW.id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_projects_delete AFTER DELETE ON projects BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_sources_insert AFTER INSERT ON sources BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_sources_update AFTER UPDATE ON sources BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_sources_delete AFTER DELETE ON sources BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_properties_insert AFTER INSERT ON properties BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_properties_update AFTER UPDATE ON properties BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_properties_delete AFTER DELETE ON properties BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_property_definitions_insert AFTER INSERT ON property_definitions BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_property_definitions_update AFTER UPDATE ON property_definitions BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_property_definitions_delete AFTER DELETE ON property_definitions BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_events_insert AFTER INSERT ON events BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_events_update AFTER UPDATE ON events BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_events_delete AFTER DELETE ON events BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_variants_insert AFTER INSERT ON variants BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_variants_update AFTER UPDATE ON variants BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_variants_delete AFTER DELETE ON variants BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_standard_event_mappings_insert AFTER INSERT ON standard_event_mappings BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_standard_event_mappings_update AFTER UPDATE ON standard_event_mappings BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_standard_event_mappings_delete AFTER DELETE ON standard_event_mappings BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_identifiers_insert AFTER INSERT ON identifiers BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_identifiers_update AFTER UPDATE ON identifiers BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_identifiers_delete AFTER DELETE ON identifiers BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_identity_rules_insert AFTER INSERT ON identity_rules BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_identity_rules_update AFTER UPDATE ON identity_rules BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_identity_rules_delete AFTER DELETE ON identity_rules BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_catalogs_insert AFTER INSERT ON catalogs BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_catalogs_update AFTER UPDATE ON catalogs BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_catalogs_delete AFTER DELETE ON catalogs BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_consent_categories_insert AFTER INSERT ON consent_categories BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_consent_categories_update AFTER UPDATE ON consent_categories BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_consent_categories_delete AFTER DELETE ON consent_categories BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_use_cases_insert AFTER INSERT ON use_cases BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_use_cases_update AFTER UPDATE ON use_cases BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_use_cases_delete AFTER DELETE ON use_cases BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_rules_insert AFTER INSERT ON rules BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_rules_update AFTER UPDATE ON rules BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_rules_delete AFTER DELETE ON rules BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_property_bundles_insert AFTER INSERT ON property_bundles BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_property_bundles_update AFTER UPDATE ON property_bundles BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_property_bundles_delete AFTER DELETE ON property_bundles BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_qa_runs_insert AFTER INSERT ON qa_runs BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_qa_runs_update AFTER UPDATE ON qa_runs BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_qa_runs_delete AFTER DELETE ON qa_runs BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_observations_insert AFTER INSERT ON observations BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_observations_update AFTER UPDATE ON observations BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_observations_delete AFTER DELETE ON observations BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_findings_insert AFTER INSERT ON findings BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_findings_update AFTER UPDATE ON findings BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_findings_delete AFTER DELETE ON findings BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_qa_reports_insert AFTER INSERT ON qa_reports BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_qa_reports_update AFTER UPDATE ON qa_reports BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_qa_reports_delete AFTER DELETE ON qa_reports BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_qa_report_findings_insert AFTER INSERT ON qa_report_findings BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_qa_report_findings_update AFTER UPDATE ON qa_report_findings BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_qa_report_findings_delete AFTER DELETE ON qa_report_findings BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_change_log_insert AFTER INSERT ON change_log BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_change_log_update AFTER UPDATE ON change_log BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_change_log_delete AFTER DELETE ON change_log BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_historical_file_sources_insert AFTER INSERT ON historical_file_sources BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_historical_file_sources_update AFTER UPDATE ON historical_file_sources BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_historical_file_sources_delete AFTER DELETE ON historical_file_sources BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_historical_validation_reports_insert AFTER INSERT ON historical_validation_reports BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_historical_validation_reports_update AFTER UPDATE ON historical_validation_reports BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id,NEW.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_historical_validation_reports_delete AFTER DELETE ON historical_validation_reports BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN (OLD.project_id)
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_event_sources_insert AFTER INSERT ON event_sources BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN ((SELECT project_id FROM events WHERE id=NEW.event_id))
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_event_sources_update AFTER UPDATE ON event_sources BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN ((SELECT project_id FROM events WHERE id=OLD.event_id),(SELECT project_id FROM events WHERE id=NEW.event_id))
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_event_sources_delete AFTER DELETE ON event_sources BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN ((SELECT project_id FROM events WHERE id=OLD.event_id))
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_event_properties_insert AFTER INSERT ON event_properties BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN ((SELECT project_id FROM events WHERE id=NEW.event_id))
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_event_properties_update AFTER UPDATE ON event_properties BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN ((SELECT project_id FROM events WHERE id=OLD.event_id),(SELECT project_id FROM events WHERE id=NEW.event_id))
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_event_properties_delete AFTER DELETE ON event_properties BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN ((SELECT project_id FROM events WHERE id=OLD.event_id))
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_catalog_fields_insert AFTER INSERT ON catalog_fields BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN ((SELECT project_id FROM catalogs WHERE id=NEW.catalog_id))
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_catalog_fields_update AFTER UPDATE ON catalog_fields BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN ((SELECT project_id FROM catalogs WHERE id=OLD.catalog_id),(SELECT project_id FROM catalogs WHERE id=NEW.catalog_id))
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_catalog_fields_delete AFTER DELETE ON catalog_fields BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN ((SELECT project_id FROM catalogs WHERE id=OLD.catalog_id))
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_requirements_insert AFTER INSERT ON requirements BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN ((SELECT project_id FROM use_cases WHERE id=NEW.use_case_id))
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_requirements_update AFTER UPDATE ON requirements BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN ((SELECT project_id FROM use_cases WHERE id=OLD.use_case_id),(SELECT project_id FROM use_cases WHERE id=NEW.use_case_id))
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_requirements_delete AFTER DELETE ON requirements BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN ((SELECT project_id FROM use_cases WHERE id=OLD.use_case_id))
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_property_bundle_items_insert AFTER INSERT ON property_bundle_items BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN ((SELECT project_id FROM property_bundles WHERE id=NEW.bundle_id))
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_property_bundle_items_update AFTER UPDATE ON property_bundle_items BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN ((SELECT project_id FROM property_bundles WHERE id=OLD.bundle_id),(SELECT project_id FROM property_bundles WHERE id=NEW.bundle_id))
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_property_bundle_items_delete AFTER DELETE ON property_bundle_items BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id IN ((SELECT project_id FROM property_bundles WHERE id=OLD.bundle_id))
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
