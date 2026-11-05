# Logo sources

Brand icons are bundled through `scripts/gen-icons.mjs` into `src/data/icons/brands.generated.ts`
(only the icons we use). All markup is run through `scripts/sanitize.mjs` (no scripts, handlers,
foreignObject, style blocks or external references).

Most icons come from `@iconify-json/logos` (gilbarbara/logos), then `@iconify-json/devicon`,
then `simple-icons` (brand colour). Items below were not available in those packages and use
vendor files stored in this folder:

| File | Used for | Source |
|---|---|---|
| alloy.svg | Grafana Alloy | https://github.com/grafana/alloy/blob/main/docs/sources/assets/alloy_icon_orange.svg (class-based fill inlined) |
| tempo.png | Grafana Tempo | https://github.com/grafana/tempo/blob/main/cmd/tempo/app/static/tempo-icon.png (embedded as data URI in an SVG wrapper) |
| pyroscope.png | Pyroscope | https://github.com/grafana/pyroscope/blob/main/pkg/api/static/pyroscope-logo.png (same) |
| cadvisor-owl.png | cAdvisor | https://raw.githubusercontent.com/google/cadvisor/master/logo.png (owl only: the official logo cropped to the mascot, letter fragments under the feet erased, white background made transparent; no redrawing) |
| cadvisor.png | (unused) cAdvisor | https://raw.githubusercontent.com/google/cadvisor/master/logo.png (unaltered official logo, owl + wordmark, Apache-2.0 repo; embedded as data URI in an SVG wrapper) |
| victoriametrics.svg | VictoriaMetrics, vmalert | https://github.com/VictoriaMetrics/VictoriaMetrics/blob/master/app/vmui/packages/vmui/assets/favicon.svg |
| victorialogs.svg | VictoriaLogs | https://raw.githubusercontent.com/VictoriaMetrics/VictoriaLogs/master/app/vmui/packages/vmui/assets/favicon.svg (unaltered, Apache-2.0 repo) |
| systemd-mark.svg | journald | https://raw.githubusercontent.com/systemd/systemd/main/docs/assets/systemd-logo.svg (square `[●◀]` mark only: the official logo's bracket / dot / triangle shapes unchanged, the "systemd" wordmark paths dropped, viewBox squared) |
| systemd.svg | (unused, full wordmark kept for reference) | https://raw.githubusercontent.com/systemd/systemd/main/docs/assets/systemd-logo.svg (official systemd logo, LGPL-2.1-or-later; `currentColor` recoloured dark by the sanitizer) |
| azure-entra-domain-services.svg | Active Directory | https://learn.microsoft.com/azure/architecture/icons/ (Microsoft Entra Domain Services icon from the official Azure icon set, already vendored in the Azure pack; Microsoft terms of use for Azure icons) |
| aws-ecr.svg | Amazon ECR | https://aws.amazon.com/architecture/icons/ (official AWS Architecture Icons) |
| aws-sagemaker.svg | Amazon SageMaker | https://aws.amazon.com/architecture/icons/ (official AWS Architecture Icons) |

Vector uses `logos:vector` (gilbarbara/logos, official vector.dev mark). The earlier hand-drawn `vector.svg` (V on a dark tile) was removed from the catalog.

Notes:
- Items with no standalone logo carry their PARENT project's official logo (`PARENT_LOGO` in `scripts/catalog.mjs`, provenance `parent-project` in `src/data/icons/sources.generated.ts`):
  node_exporter and the other `*_exporter` / Pushgateway / Alertmanager -> Prometheus; vmalert, vmagent, vmauth, vmbackup, VictoriaMetrics Cluster -> VictoriaMetrics;
  journald -> systemd; Active Directory -> Microsoft Entra; Debezium connectors -> Debezium; kube-state-metrics -> Kubernetes; Grafana Agent -> Grafana.
- Every catalog icon has a recorded `source` (`ICON_SOURCES`); `src/data/iconSources.test.ts` and `npm run icons:audit` fail on any branded item whose source is `handmade` or not allowlisted.
- vmalert is a VictoriaMetrics component with no standalone logo; it uses the VictoriaMetrics mark.
- Alertmanager and node_exporter (generic "Exporter") are Prometheus-org projects with no standalone
  logo; they use the Prometheus mark (`logos:prometheus`).
- MinIO, Keycloak, Hetzner, BigQuery come from `simple-icons` with their brand hex colour.

## Fetched logos (scripts/fetch-logos.mjs)

| File | Used for | Source | License / note |
|---|---|---|---|
| ls-ibmdb2.svg | db2 | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/ibmdb2.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-dragonflydb.svg | dragonfly | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/dragonflydb.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-hazelcast.svg | hazelcast | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/hazelcast.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-opentsdb.svg | opentsdb | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/opentsdb.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-nebulagraph.svg | nebulagraph | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/nebulagraph.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-pinot.svg | pinot | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/pinot.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-starrocks.svg | starrocks | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/starrocks.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-vertica-ot.svg | vertica | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/Vertica-OT.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-beam.svg | beam | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/beam.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-llamaindex.svg | llamaindex | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/llamaindex.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-metallb.svg | metallb | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/metallb.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-jetstack-cert-manager.svg | cert-manager | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/jetstack-cert-manager.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-zitadel.svg | zitadel | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/zitadel.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-opa-icon-color.svg | opa | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/opa-icon-color.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-kyverno.svg | kyverno | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/kyverno.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-checkov.svg | checkov | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/checkov.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-tilt.svg | tilt | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/tilt.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-minikube.svg | minikube | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/minikube.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-zipkin.svg | zipkin | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/zipkin.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-cortex.svg | cortex | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/cortex.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-nagios.svg | nagios | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/nagios.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-logz-io.svg | logzio | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/logz-io.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-quickwit.png.png | quickwit | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/quickwit.png | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-openobserve.svg | openobserve | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/openobserve.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-sky-walking.svg | skywalking | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/sky-walking.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-pinpoint.svg | pinpoint | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/pinpoint.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-honeycomb.svg | honeycomb | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/honeycomb.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-instana.svg | instana | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/instana.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-perses.svg | perses | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/perses.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-rootly.svg | rootly | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/rootly.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-checkly.svg | checkly | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/checkly.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-pixie.svg | pixie | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/pixie.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-hubble-rgb-.svg | hubble | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/hubble(rgb).svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-coroot.svg | coroot | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/coroot.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-kubecost.svg | kubecost | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/kubecost.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-robusta.svg | robusta | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/robusta.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-redpanda.svg | redpanda | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/redpanda.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-apache-zookeeper.svg | zookeeper | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/apache-zookeeper.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-apache-thrift.svg | thrift | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/apache-thrift.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-apisix.svg | apisix | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/apisix.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-dubbo.svg | dubbo | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/dubbo.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-shardingsphere.svg | shardingsphere | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/shardingsphere.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-apache-zeppelin.svg | zeppelin | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/apache-zeppelin.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-apache-openwhisk.svg | openwhisk | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/apache-openwhisk.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-seatunnel.svg | seatunnel | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/seatunnel.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-varnish-software.svg | varnish | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/varnish-software.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-tyk.svg | tyk | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/tyk.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-krakend.svg | krakend | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/krakend.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-gravitee.svg | gravitee | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/gravitee.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-unleash.svg | unleash | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/unleash.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-flagsmith.svg | flagsmith | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/flagsmith.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-netflix-oss-eureka.svg | eureka | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/netflix-oss-eureka.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-project-velero.svg | velero | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/project-velero.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-portworx.svg | portworx | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/portworx.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-cockroach-labs.svg | cockroachdb | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/cockroach-labs.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| asf-activemq.png | activemq | https://www.apache.org/logos/res/activemq/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-activemq.png | artemis | https://www.apache.org/logos/res/activemq/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-samza.png | samza | https://www.apache.org/logos/res/samza/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-iceberg.png | iceberg | https://www.apache.org/logos/res/iceberg/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-hudi.png | hudi | https://www.apache.org/logos/res/hudi/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-paimon.png | paimon | https://www.apache.org/logos/res/paimon/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-orc.png | orc | https://www.apache.org/logos/res/orc/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-drill.png | drill | https://www.apache.org/logos/res/drill/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-phoenix.png | phoenix-hbase | https://www.apache.org/logos/res/phoenix/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-kudu.png | kudu | https://www.apache.org/logos/res/kudu/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-nutch.png | nutch | https://www.apache.org/logos/res/nutch/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-tika.png | tika | https://www.apache.org/logos/res/tika/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-httpd.png | httpd | https://www.apache.org/logos/res/httpd/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-livy.png | livy | https://www.apache.org/logos/res/livy/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-oozie.png | oozie | https://www.apache.org/logos/res/oozie/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-flume.png | flume | https://www.apache.org/logos/res/flume/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-ranger.png | ranger | https://www.apache.org/logos/res/ranger/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-knox.png | knox | https://www.apache.org/logos/res/knox/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-shiro.png | shiro | https://www.apache.org/logos/res/shiro/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-inlong.png | inlong | https://www.apache.org/logos/res/inlong/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-hop.png | hop | https://www.apache.org/logos/res/hop/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-kvrocks.png | kvrocks | https://www.apache.org/logos/res/kvrocks/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-hadoop.png | yarn-hadoop | https://www.apache.org/logos/res/hadoop/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-hadoop.png | mapreduce | https://www.apache.org/logos/res/hadoop/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-camel.png | camel | https://www.apache.org/logos/res/camel/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| asf-atlas.png | atlas | https://www.apache.org/logos/res/atlas/default.png | Apache Software Foundation project logo (trademark of the ASF) |
| gh-buildah.svg | buildah | https://raw.githubusercontent.com/containers/buildah/HEAD/logos/buildah-logo-source.svg | Official project repository |
| gh-janusgraph.svg | janusgraph | https://raw.githubusercontent.com/JanusGraph/janusgraph/HEAD/docs/janusgraph-logomark.svg | Official project repository |
| gh-gatus.svg | gatus | https://raw.githubusercontent.com/TwiN/gatus/HEAD/.github/assets/logo.svg | Official project repository |
| gh-parca.svg | parca | https://raw.githubusercontent.com/parca-dev/parca/HEAD/ui/packages/app/web/public/logo.svg | Official project repository |
| gh-dagster.svg | dagster | https://raw.githubusercontent.com/dagster-io/dagster/HEAD/docs/static/img/dagster-logo.svg | Official project repository |
| gh-uptrace.svg | uptrace | https://raw.githubusercontent.com/uptrace/uptrace/HEAD/vue/public/uptrace/logo-small.svg | Official project repository |
| gh-m3db.svg | m3db | https://raw.githubusercontent.com/m3db/m3/HEAD/site/static/logo.svg | Official project repository |
| gh-conductor.svg | conductor | https://raw.githubusercontent.com/conductor-oss/conductor/HEAD/docs/img/logo.svg | Official project repository |
| gh-munin.svg | munin | https://raw.githubusercontent.com/munin-monitoring/munin/HEAD/logo.svg | Official project repository |
| gh-debezium.svg | debezium | https://raw.githubusercontent.com/debezium/debezium.github.io/develop/assets/images/color_black_debezium_type_600px.svg | Official project repository |
| gh-telegraf.svg | telegraf | https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/telegraf.svg | homarr-labs/dashboard-icons or selfhst/icons (Apache-2.0 / MIT, logos belong to owners) |
| gh-uptimerobot.svg | uptimerobot | https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/uptimerobot.svg | homarr-labs/dashboard-icons or selfhst/icons (Apache-2.0 / MIT, logos belong to owners) |
| gh-glitchtip.svg | glitchtip | https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/glitchtip.svg | homarr-labs/dashboard-icons or selfhst/icons (Apache-2.0 / MIT, logos belong to owners) |
| gh-crowdstrike.svg | crowdstrike | https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/crowdstrike-light.svg | homarr-labs/dashboard-icons or selfhst/icons (Apache-2.0 / MIT, logos belong to owners) |
| gh-questdb.svg | questdb | https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/questdb.svg | homarr-labs/dashboard-icons or selfhst/icons (Apache-2.0 / MIT, logos belong to owners) |
| gh-prtg.svg | prtg | https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/prtg.svg | homarr-labs/dashboard-icons or selfhst/icons (Apache-2.0 / MIT, logos belong to owners) |
| gh-confluent-dark.svg | confluent | https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/confluent-dark.svg | homarr-labs/dashboard-icons or selfhst/icons (Apache-2.0 / MIT, logos belong to owners) |
| gh-calico-dark.svg | calico | https://raw.githubusercontent.com/selfhst/icons/main/svg/calico-dark.svg | homarr-labs/dashboard-icons or selfhst/icons (Apache-2.0 / MIT, logos belong to owners) |
| ls-emqx.svg | emqx | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/emqx.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| ls-gluster.svg | glusterfs | https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/gluster.svg | CNCF Landscape hosted_logos (logos belong to their owners) |
| gh-keepalived.png | keepalived | https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/png/keepalived.png | homarr-labs/dashboard-icons or selfhst/icons (Apache-2.0 / MIT, logos belong to owners) |
| zeromq.svg | ZeroMQ | https://raw.githubusercontent.com/simple-icons/simple-icons/9.21.0/icons/zeromq.svg (removed from current simple-icons; official mark, fill #DF0000 added) |
| ibmcloud.svg | IBM Cloud | https://raw.githubusercontent.com/simple-icons/simple-icons/11.14.0/icons/ibmcloud.svg (removed from current simple-icons; official mark, fill #1261FE added) |
| restic.png | Restic | https://raw.githubusercontent.com/restic/restic/master/doc/logo/logo.png (unaltered official logo, embedded as data URI in an SVG wrapper) |
