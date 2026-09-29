# Getting started

E3 Tracking is the single place where a Bloomreach Engagement migration is planned and checked: you record what should be tracked (events, properties, variants, catalogs, identity rules, consent categories, use cases), import what Bloomreach actually has (mapping, Data Manager, customer events export), and the app compares the two and reports findings.

## The fastest way to learn it

1. Open **Clients** and use **Create a sandbox**. It is a fully loaded sample project you can explore and break freely.
2. Open **Getting started** in the sidebar. It is a nine-step checklist for a project; each step is ticked automatically from your data and links to the page where you do it.
3. Come back to this Help page for explanations of each area.

## The sidebar in one minute

The sidebar is one flat list; the groups below are only a mental model.

| Group | Pages |
| --- | --- |
| Definitions | Events, Properties, Catalogs, Identity rules, Consent categories, Standard events |
| Use cases | Use cases, Use case templates, Requirements matrix |
| Evidence | Sources, Import, QA runs, Findings |
| Audit and discussion | History, Comments |
| Account | Getting started, Clients, Settings, Help |

## The core loop

1. **Define** events, properties and variants (see Events and properties).
2. **Import** Bloomreach files on the Import page. Every import shows a diff first and only applies after you confirm.
3. **Observe**: paste a customer events export or let an agent submit observations (see the MCP server reference). Observations are grouped in QA runs.
4. **Compare**: four comparisons run together and produce findings. Fix the definition or the implementation, then re-run.
5. **Certify and share**: a custom event is certified when it has no open errors, no acknowledged errors (errors resolved by hand while the problem persists), is not ignored, and has at least one observation. SDK and platform events are never certified. Share the documentation with the client through a share link.

Terms such as certified, variant, discriminator and context are defined in the Glossary.
