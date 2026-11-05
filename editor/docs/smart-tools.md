# Smart tooling (Phase 6, no AI)

Everything here is deterministic: parsers, rules, graph algorithms and arithmetic. The product contains **no LLM and calls no AI service**. (The MCP server only lets an *external* AI client use the product, see `docs/mcp.md`.)

Pure logic lives in `core/` and is shared by the browser (Vite alias `@core`) and the server (MCP tools): catalog search, graph edits, layout, the `.sdd` text format, infra import, lint, diff helpers, capacity, schema tools. Nothing in `core/` touches the DOM or Node APIs. Commands are in ⌘K, panels are popovers that are closed by default, and nothing adds a permanent bar.

| feature | open it | where the logic lives |
|---|---|---|
| Diagrams as code | ⌘⇧E (View menu, ⌘K "Diagram as code") | `core/dsl`, `lib/dsl`, `components/smart/SplitView` |
| Infra import | ⌘K "Import infrastructure…" | `core/infra`, `components/smart/InfraImport` |
| Problems (lint) | rail badge (only when there are problems), ⌘K "Problems" | `core/lint`, `components/smart/ProblemsPanel` |
| Diff and review | ⌘K "Compare with another file…", or "Show on canvas" in Version history | `core/diff`, `lib/smart/review`, `components/smart/ReviewPanel` |
| Capacity and latency | ⌘K "Capacity & latency" | `core/capacity`, `components/smart/CapacityPanel` |
| Schema tools | ⌘K "Import schema from a live database…", "Migration SQL…", ER export "Seedora seedora.yaml" | `core/schema`, `server/src/schemaTools`, `components/smart/SchemaTools` |
| Code to UML sync | ⌘K "Update this class diagram from code…" | `lib/uml/drift*`, `components/smart/DriftPanel` |
| Layouts | ⌘K "Layout: …", selection context menu "Tidy selection" | `core/layout`, `lib/smart/layoutBridge` |
| MCP server | `docs/mcp.md` | `server/src/mcp` |

## Diagrams as code (`.sdd` text)

The grammar is in `docs/sdd-format.md` ("Text format"). The split view (⌘⇧E) shows the text of the page next to the canvas and keeps both in step:

* **Text to canvas.** Edits are applied after a short pause, in one undo step, **only when the text has no syntax errors**. Errors appear inline (squiggle plus gutter marker, with line and column) and in the panel header; the canvas is never changed by broken text. Ids that already exist keep their position, size and every property the text does not express (fill colours, lock, custom styling); new ids are laid out in free space next to what is there; ids missing from the text are removed with their children and edges. Stickies, frames, drawings, clusters, UML classes and states are not touched.
* **Canvas to text.** Any canvas change that alters the printed text rewrites the editor (as a minimal edit, so the cursor stays). Moving, selecting or panning never changes the text. Printing is canonical and stable: `print(parse(text))` is a fixed point.
* **Autocomplete** for catalog icons (`icon=`), edge presets, node ids in edges, table names in `ref:` and statement keywords. CodeMirror 6 loads as its own chunk the first time the view opens.
* Read-only collaborators see diagnostics but cannot change the canvas.

## Infra import

`⌘K Import infrastructure…` takes pasted text or several files, shows the detected kind, counts, notes and a drawn preview, and inserts the result as a new file (or into the open file).

| input | what is read |
|---|---|
| Terraform `.tf` | `resource` and `module` blocks of an own HCL2 reader (comments, heredocs, interpolation, nested blocks); references and `depends_on` become edges |
| `terraform show -json` | a plan (configuration references, modules as groups) or a state (references found by matching ids and ARNs) |
| Kubernetes YAML | multi-document and `List` kinds, Helm-rendered output; Deployment, StatefulSet, DaemonSet, ReplicaSet, Job, CronJob, Pod, Service, Ingress, ConfigMap, Secret, PVC, HPA; unknown kinds become generic nodes with a note |
| docker-compose | services, networks as groups, named volumes, `depends_on` (list or map), `links`, environment URLs |
| CloudFormation | YAML (short-form `!Ref`, `!GetAtt`, `!Sub` ... ) and JSON; `Ref`, `Fn::GetAtt`, `Fn::Sub`, `DependsOn` |

Edges inferred: references and `depends_on`; load balancer chains (listener, target group, attachment contract to *load balancer to instance*); security group rules (who may reach whom, labelled with the port); Route 53 records and SNS subscriptions as pass-through; Kubernetes Service to workload by label selector, Ingress to Service (host and path), workload to ConfigMap/Secret/PVC, HPA to its target; environment URLs and connection strings whose host is a known Service or compose service. Grouping: VPC and subnet (public subnets get the public icon), namespace, compose network, Terraform module. Plumbing that only exists to wire things up (route tables, IAM, subnet groups, security groups themselves) is folded away. Icons come from the catalog (AWS, GCP, Azure, Kubernetes packs, product icons for well-known container images); a test checks that every icon id used exists. The page is laid out with the layered algorithm.

## Problems (lint)

Rules (each can be switched off and re-leveled in **Settings > Problems**):

| id | checks |
|---|---|
| `arch/spof` | a load balancer sending to only one instance (replicas count) |
| `arch/db-no-replica`, `arch/db-no-backup` | a database with no replica / standby, or with no backup storage or "backup" edge |
| `arch/public-no-waf` | a client or the internet connected straight to a service |
| `arch/sync-cycle` | cycles in synchronous calls (async edges, queues and monitoring edges do not count) |
| `arch/no-monitoring` | components not connected to a monitoring component (one hint when the diagram has none) |
| `arch/cluster-profile` | warnings produced by cluster profiles (replication factor, quorum, zone spread) |
| `erd/fk-index`, `erd/no-pk`, `erd/fk-type`, `erd/nullable-fk`, `erd/naming` | foreign key without an index, table without a primary key, FK type differing from the referenced key, nullable FK on a required relation, naming convention (snake_case, camelCase or anything) |
| `uml/inheritance-cycle`, `uml/interface-no-impl`, `uml/unused-class`, `uml/seq-missing-method` | inheritance cycles (fix: remove the last edge of the cycle), interfaces nobody realizes (fix: add an implementing class), classes with no relation and no same-named sequence participant (fix: delete), sequence messages calling a method the same-named class lacks, own or inherited (fix: add the operation) |

Clicking a problem selects the nodes and zooms to them. **Fix** applies the trivial ones as one undo step: add an index, add an `id` primary key, copy the referenced type, make a column NOT NULL. The MCP tool `run_lint` returns the same list.

## Diff and review

*Compare with another file or version* reduces both sides to their active page, matches nodes by id and then by unique type and label (so a copy of a diagram compares as "no differences"), draws added / removed / changed items on the canvas and lists every item with its **property changes** (label, icon, position, table columns by name, relation fields). Click an item to zoom, add a **comment** on it (anchored to the node, prefixed "Review (from → to):", uses the normal comment threads, so it needs a server-backed file) and **Export report** to a Markdown change report that includes those comments. Version comparison from the Version history dialog opens the same panel.

## Capacity and latency

Inputs are persisted in the file (schema v8): `node.data.capacity` = `{ rps, replicas, capacityRps, p50Ms, p99Ms, payloadKb, writeRatio, growthGbPerDay, storageGb, sku, monthlyCostUsd }` and `edge.data.traffic` = `{ ratio, p50Ms, p99Ms, payloadKb }`. Demand propagates along the edges: a node's load is its own `rps` plus every caller's load times the edge `ratio` (default 1). Overload does not throttle downstream demand, so the numbers are the worst case; cycles are broken at the closing edge with a warning.

Results: utilisation per component (`ok` below 70%, `warn` from 70%, `over` above 100%), **bottlenecks** worst first, the **worst-case path** (largest summed p99 over nodes and calls, with the p50 along it), edge bandwidth, **storage growth** (`rps x writeRatio x payload`, or an explicit figure) per day, month and year, and a **rough monthly cost estimate**.

The cost uses a **generated** table (`core/capacity/prices.generated.json`, read by `core/capacity/prices.ts`): on-demand Linux list prices from the providers' official pricing APIs for one region each (AWS us-east-1, Azure eastus, GCP us-central1), no discounts, committed use, free tier or tax. No price is typed by hand. Every row keeps its provider, region, the provider's own rate and unit, the source URL and the fetch time. The panel shows the provenance (`Prices: AWS list, on-demand, us-east-1, as of <date>`, one entry per provider in use) next to the *rough estimate* label. Components without a price of their own get an *assumed* default for their icon, marked as such. It is an order of magnitude, never a quote.

### Refreshing the prices

`npm run prices:update` (or `make prices`, extra flags with `make prices ARGS="--only azure"`) rewrites `prices.generated.json`; commit the result. Needs network, no credentials except for GCP.

| Provider | Source | Credentials |
| --- | --- | --- |
| AWS | Price List bulk files: `offers/v1.0/aws/index.json`, then each service's region index, then the region's `index.csv`, streamed and filtered (the EC2 file is about 300 MB) | none |
| Azure | Retail Prices API, `https://prices.azure.com/api/retail/prices?$filter=...` | none |
| GCP | Cloud Billing Catalog API (`services/{id}/skus`) | `GCP_BILLING_API_KEY` in the environment; without it GCP is off (silently skipped, no GCP prices) |

`core/capacity/priceMap.ts` is the hand-maintained part: for every calculator price id it says which record to read (AWS offer code and column filters, Azure `armSkuName` / `meterName`, GCP service id and SKU descriptions). It contains no amounts. To add a price, add an entry there and run the script. The parsing is in `core/capacity/priceParse.ts` (pure functions, tested on recorded snippets in `server/tests/fixtures/prices`, no network in tests).

The script is strict: a query that matches no row, matches rows with different prices, has a unit that does not fit, or yields a price of 0 or less is reported as `FAILED <id>`, the previous value of that id is kept, the rest is still updated and the exit code is 1. Flags: `--region aws=eu-west-1` (also `azure=`, `gcp=`; repeatable; rows of another region are never mixed in) and `--only aws,azure,gcp`. Amounts are converted to the calculator's units (730 h per month, per million requests, per GB-month, per GB transferred); tiered rates use the first tier (data transfer out, the first paid tier). Not covered: CloudFront egress (its price list has no per-region file), EKS / Fargate / other services, Windows and reserved prices.

## Schema tools

* **Live database to ERD.** `POST /api/schema/introspect` (PostgreSQL, MySQL / MariaDB) and `POST /api/schema/introspect/sqlite` (an uploaded file). Read only by construction: only fixed catalog `SELECT`s run, the PostgreSQL session is `BEGIN READ ONLY` with a 10 s statement timeout, MySQL uses `START TRANSACTION READ ONLY`, SQLite is opened `readonly` (and `query_only`); connect timeout 5 s and a 20 s overall deadline. Credentials are used for that one connection and are never stored or logged; errors are scrubbed of the password. The server connects out for the user, so private, loopback and link-local targets are refused unless `SCHEMA_ALLOW_PRIVATE=true` (the default is true only with `AUTH_MODE=none`, i.e. a single local user). `SCHEMA_INTROSPECT=false` turns it off. The result goes through the normal ER import (preview, new file or this file).
* **Migration SQL from an ERD diff.** *Migration SQL from changes…* compares the open ERD with another file or a saved version and prints the statements for PostgreSQL, MySQL / MariaDB or SQLite: create / drop tables (parents first), add / drop / alter columns (type, nullability, default, identity), primary keys, unique constraints, indexes, foreign keys (dropped before columns and tables go, added after everything exists). Destructive statements are marked. SQLite rebuilds the table (create new, copy the surviving columns, drop, rename) because it cannot alter columns in place; PostgreSQL and SQLite are wrapped in a transaction. *Revert* generates the down migration. **Renames:** within one table a dropped + added column of the same type, nullability, default, key and unique flags becomes `RENAME COLUMN` (PostgreSQL, MySQL 8, SQLite 3.25+), and a dropped + added table with identical columns becomes `RENAME TO` / `RENAME TABLE`. Diagram ids win: a table node or column that keeps its id across a rename is matched exactly, even when its type changed too (the alter follows the rename). A shape match must be unique on both sides; when several columns or tables look alike the migration keeps drop + add and adds `-- possible rename: a -> b`. Indexes and foreign keys that follow a renamed column or table are not re-created. *Revert* inverts renames. `detectRenames: false` (option of `diffSchemas` / `migrationSql`) switches detection off. Review before running: a rename match by shape is still a guess.
* **Seedora.** *Export database schema* gains `seedora.yaml`: the same model as the JSON export (tables, columns, primary keys, foreign keys, checks, enums) plus a `seed` block with row counts (children get more rows), parents first, and one data generator per column chosen by fixed rules from the name and type (`email`, `timestamp`, `uuid`, `money`, `reference` for foreign keys, `enum` ...). Seedora's own YAML schema is not published with this project, so the `seed` block uses this tool's vocabulary and is meant to be edited.

## Code to UML sync

*Update this class diagram from code…* (or *Update this class diagram* in the UML import dialog) parses the source with the existing TypeScript / Java / Python / Go / C# readers, compares it with the classes on the canvas (classes and members by name, operations by name and parameter count) and opens the **Code sync** panel. Existing classes keep their position; markers on the canvas show changed and removed rows, ghost rows for members that only the code has, and a count in the class header. Per item: **Accept** takes the code's version (one undo step each; members keep their ids), **Reject** keeps the diagram's. *Accept all* and *Reject all* work on everything left. Classes that are not in the code are flagged only if you tick *Also mark classes that are not in this code as removed* (a re-import of one file must not flag the rest). Relations: new hierarchy and association edges are offered; only inheritance and realization edges are ever called stale.

## Layouts

`core/layout.ts`, all deterministic: **layered** (longest-path layering, cycle breaking, barycenter ordering), **orthogonal** (layered on a snap grid with orthogonal edges), **tree**, **radial**, **force-directed** (Fruchterman-Reingold with a seeded generator) and a **compact grid**. Groups are laid out bottom-up (children first, then the group grows to fit); *Tidy selection* lays out only the selected nodes around their own top-left corner; *Remove edge label overlaps* slides and offsets colliding labels (`labelT`, `labelOffset`); *Align groups* puts the top-level groups in a row or a column with even gaps. No layout engine dependency: the algorithms are small and tested for "no overlaps" and "same input, same output", so `elkjs` was not needed.
