// Source of truth for the (non-AWS) component catalog. Run `node scripts/gen-icons.mjs` after editing.
// DEFS line format:  id | Label | aliases (comma) | source (optional) | port (optional)
// source: logos:name | devicon:name | si:slug | file:name | g:genericIconId | (empty = auto-detect)
// Every item has ONE canonical id; sections reference ids, so an item may appear in several sections.

/** Items with no standalone logo: they carry the PARENT project's official logo (item id -> parent name). */
export const PARENT_LOGO = {
  'node-exporter': 'Prometheus', exporter: 'Prometheus', 'blackbox-exporter': 'Prometheus', 'postgres-exporter': 'Prometheus', 'mysqld-exporter': 'Prometheus',
  'redis-exporter': 'Prometheus', 'kafka-exporter': 'Prometheus', pushgateway: 'Prometheus', 'kube-state-metrics': 'Kubernetes',
  vmalert: 'VictoriaMetrics', vmagent: 'VictoriaMetrics', vmauth: 'VictoriaMetrics', vmbackup: 'VictoriaMetrics', 'victoriametrics-cluster': 'VictoriaMetrics',
  journald: 'systemd', 'active-directory': 'Microsoft Entra (Azure icon pack)',
  'debezium-server': 'Debezium', 'debezium-postgres': 'Debezium', 'debezium-mysql': 'Debezium', 'debezium-mongodb': 'Debezium', 'debezium-sqlserver': 'Debezium', 'debezium-oracle': 'Debezium',
  'grafana-agent': 'Grafana', alertmanager: 'Prometheus',
};
/** `g:` (generic glyph) items that nevertheless name a real product. Must stay empty: such items need an official logo. */
export const BRANDED_GENERIC = [];

export const DEFS = `
# ---- generic glyphs ----
user|User|person,actor,end user|g:user
users|Users|customers,people,group of users|g:users
browser|Web browser|client,frontend,spa,chrome|g:browser
mobile|Mobile app|ios app,android app,phone|g:mobile
desktop|Desktop app|electron app,native app|g:desktop
iot|IoT device|sensor,embedded,edge device|g:iot
admin|Admin|operator,backoffice,administrator|g:admin
dns|DNS|domain,resolver,bind|g:dns|:53
cdn|CDN|edge cache,content delivery|g:cdn
load-balancer|Load balancer|lb,balancer,elb,alb|g:load-balancer
api-gateway|API gateway|gateway,apigw|g:api-gateway
reverse-proxy|Reverse proxy|proxy|g:reverse-proxy
firewall|Firewall|fw,acl|g:firewall
waf|WAF|web application firewall|g:waf
vpn|VPN|tunnel|g:vpn
internet|Internet|public network,www|g:internet
router|Router|routing,gateway device|g:router
switch|Switch|network switch,l2|g:switch
nat|NAT|nat gateway,masquerade|g:nat
ids-ips|IDS / IPS|intrusion detection,intrusion prevention|g:ids-ips
bastion|Bastion host|jump host,jumpbox|g:bastion
service|Service|microservice,app,api,backend|g:service
server|Server / VM|host,vm,machine,bare metal|g:server
container|Container|oci|g:container
function|Serverless function|lambda,faas,cloud function|g:function
worker|Worker|job,consumer,background|g:worker
cron|Cron job|scheduler,timer,batch|g:cron
k8s-pod|K8s Pod|pod|g:k8s-pod
k8s-deployment|K8s Deployment|deployment,replicaset,statefulset|g:k8s-deployment
database|SQL database|rdbms,db|g:database
nosql|NoSQL database|document db|g:nosql
cache|Cache|in-memory|g:cache
search|Search index|full-text|g:search
object-storage|Object storage|blob,bucket|g:object-storage
file-storage|File storage|nfs,disk,volume,nas|g:file-storage
data-warehouse|Data warehouse|olap,dwh,analytics|g:data-warehouse
vector-db|Vector database|embeddings,vector store|g:vector-db
queue|Message queue|mq|g:queue
pubsub|Pub/Sub|publish subscribe,topic|g:pubsub
event-bus|Event bus|events|g:event-bus
stream-processor|Stream processor|streaming,etl|g:stream-processor
auth-service|Auth service|authn,authz,authentication|g:auth-service
identity-provider|Identity provider|idp,sso|g:identity-provider
secrets|Secrets manager|kms,credentials|g:secrets
certificate|Certificate / TLS|ssl,x509,tls|g:certificate
rate-limiter|Rate limiter|throttle|g:rate-limiter
cloud|Cloud|generic cloud|g:cloud
ci-pipeline|CI pipeline|build pipeline|g:ci-pipeline
container-registry|Container registry|image registry|g:container-registry
third-party-api|Third-party API|external api,saas|g:third-party-api
payment|Payment provider|billing|g:payment
email|Email|smtp,mail|g:email
sms|SMS|text message|g:sms
push|Push notification|notify,fcm,apns|g:push
rest|REST|http api,restful|g:rest
websocket|WebSocket|ws,wss|g:websocket
sse|Server-Sent Events|sse,event stream|g:sse
webhook|Webhook|callback,http callback|g:webhook
soap|SOAP|wsdl,xml api|g:soap
amqp|AMQP|amqp 0-9-1|g:amqp
producer|Producer|publisher,kafka producer|g:producer
consumer|Consumer|subscriber,kafka consumer|g:consumer
consumer-group|Consumer group|kafka consumer group,group of consumers|g:consumer-group
# ---- compute / OS ----
kubernetes|Kubernetes|k8s,kube,cluster|logos:kubernetes
docker|Docker|containers,dockerd|logos:docker-icon
linux|Linux|host,tux|logos:linux-tux
ubuntu|Ubuntu|canonical|logos:ubuntu
debian|Debian|deb|logos:debian
centos|CentOS|rhel clone|logos:centos-icon
rhel|Red Hat Enterprise Linux|rhel,redhat,red hat|logos:redhat-icon
alpine|Alpine Linux|alpine|devicon:alpinelinux
windows-server|Windows Server|windows,microsoft windows|logos:microsoft-windows-icon
# ---- databases: relational ----
postgresql|PostgreSQL|pg,postgres,psql|logos:postgresql|:5432
mysql|MySQL|my sql|logos:mysql-icon|:3306
mariadb|MariaDB|maria|logos:mariadb-icon|:3306
oracle-db|Oracle Database|oracle,ora|logos:oracle|:1521
sqlserver|SQL Server|mssql,ms sql,microsoft sql|devicon:microsoftsqlserver|:1433
sqlite|SQLite|sqlite3|logos:sqlite
db2|IBM Db2|db2,ibm db2|file:ls-ibmdb2.svg.svg
cockroachdb|CockroachDB|crdb,cockroach|si:cockroachlabs|:26257
yugabytedb|YugabyteDB|yugabyte,ybdb|logos:yugabyte
tidb|TiDB|ti db,pingcap|si:tidb|:4000
planetscale|PlanetScale|pscale|logos:planetscale-icon
neon|Neon|neon postgres|si:neon
supabase|Supabase|supa|logos:supabase-icon
aurora|Amazon Aurora|aurora,aws aurora|logos:aws-aurora
cloud-sql|Cloud SQL|gcp sql,google cloud sql|si:googlecloud
spanner|Cloud Spanner|spanner,gcp spanner|si:googlecloud
vitess|Vitess|vt|si:vitess
firebird|Firebird|fb|si:firebird
# ---- document ----
mongodb|MongoDB|mongo,mdb|logos:mongodb-icon|:27017
couchbase|Couchbase|cb|logos:couchbase-icon
couchdb|CouchDB|couch|logos:couchdb
firestore|Firestore|cloud firestore,firebase firestore|logos:firebase
ravendb|RavenDB|raven|si:ravendb
documentdb|Amazon DocumentDB|documentdb,docdb|logos:aws-documentdb
cosmosdb|Azure Cosmos DB|cosmos,cosmosdb|si:azurecosmosdb
# ---- key-value / cache ----
redis|Redis|redis cache|logos:redis|:6379
valkey|Valkey||si:valkey|:6379
keydb|KeyDB||si:keydb
dragonfly|DragonflyDB|dragonfly,dfly|file:ls-dragonflydb.svg.svg
memcached|Memcached|memcache|logos:memcached|:11211
etcd|etcd||logos:etcd|:2379
dynamodb|Amazon DynamoDB|dynamo,ddb|logos:aws-dynamodb
riak|Riak||si:riak
hazelcast|Hazelcast|hz|file:ls-hazelcast.svg.svg
aerospike|Aerospike|aero|si:aerospike
# ---- wide column ----
cassandra|Apache Cassandra|cass|logos:cassandra|:9042
scylladb|ScyllaDB|scylla|logos:scylladb-icon
hbase|Apache HBase|hbase|logos:apache-hbase
bigtable|Cloud Bigtable|bigtable,gcp bigtable|si:googlecloud
# ---- search ----
elasticsearch|Elasticsearch|es,elastic,elk|logos:elasticsearch|:9200
opensearch|OpenSearch|os|logos:opensearch-icon|:9200
solr|Apache Solr|solr|logos:apache-solr
meilisearch|Meilisearch|meili|si:meilisearch
typesense|Typesense||si:typesense
algolia|Algolia||logos:algolia
manticore|Manticore Search|manticore|si:manticoresearch
# ---- time-series ----
influxdb|InfluxDB|influx|logos:influxdb-icon|:8086
timescaledb|TimescaleDB|timescale,tsdb|si:timescale
questdb|QuestDB|quest|file:gh-questdb.svg
prometheus-tsdb|Prometheus TSDB|tsdb|logos:prometheus
victoriametrics|VictoriaMetrics|vm,victoria|file:victoriametrics.svg|:8428
opentsdb|OpenTSDB||file:ls-opentsdb.svg.svg
druid|Apache Druid|druid|si:apachedruid
# ---- graph ----
neo4j|Neo4j|neo|logos:neo4j|:7687
arangodb|ArangoDB|arango|logos:arangodb-icon
janusgraph|JanusGraph|janus|file:gh-janusgraph.svg
neptune|Amazon Neptune|neptune|logos:aws-neptune
dgraph|Dgraph||si:dgraph
memgraph|Memgraph||si:memgraph
nebulagraph|NebulaGraph|nebula|file:ls-nebulagraph.svg.svg
# ---- analytical / warehouse ----
clickhouse|ClickHouse|ch,click house|devicon:clickhouse|:8123
snowflake|Snowflake|snow|logos:snowflake-icon
bigquery|BigQuery|bq,gcp bigquery|si:googlebigquery
redshift|Amazon Redshift|redshift|logos:aws-redshift
databricks|Databricks|dbx,delta lake|logos:databricks-icon
duckdb|DuckDB|duck|si:duckdb
pinot|Apache Pinot|pinot|file:ls-pinot.svg.svg
starrocks|StarRocks|star rocks|file:ls-starrocks.svg.svg
doris|Apache Doris|doris|si:apachedoris
greenplum|Greenplum|gp|si:greenplum
vertica|Vertica||file:ls-vertica-ot.svg.svg
trino|Trino|presto,prestodb|logos:trino
hive|Apache Hive|hive|si:apachehive
# ---- vector ----
pinecone|Pinecone||logos:pinecone-icon
weaviate|Weaviate||logos:weaviate-icon
milvus|Milvus||si:milvus
qdrant|Qdrant||logos:qdrant-icon|:6333
chroma|Chroma|chromadb|si:chroma
pgvector|pgvector|pg vector|logos:postgresql
lancedb|LanceDB|lance|si:lancedb
# ---- embedded / other ----
rocksdb|RocksDB|rocks|si:rocksdb
leveldb|LevelDB|level|si:leveldb
lmdb|LMDB||si:lmdb
h2|H2 Database|h2|si:h2database
realm|Realm||si:realm
# ---- object / file storage ----
s3|Amazon S3|s3,simple storage service,bucket|logos:aws-s3
minio|MinIO|min io|si:minio|:9000
ceph|Ceph||logos:ceph
gcs|Google Cloud Storage|gcs,gcp storage|si:googlecloud
azure-blob|Azure Blob Storage|blob,azure storage|logos:azure-icon
backblaze|Backblaze B2|b2,backblaze|si:backblaze
cloudflare-r2|Cloudflare R2|r2|logos:cloudflare-icon
hdfs|HDFS|hadoop dfs|logos:hadoop
nfs|NFS|network file system|g:file-storage
# ---- db tooling ----
pgbouncer|PgBouncer|pgbouncer,connection pooler|logos:postgresql
proxysql|ProxySQL|proxy sql|si:proxysql
debezium|Debezium|cdc,change data capture|file:gh-debezium.svg
flyway|Flyway|migrations|si:flyway
liquibase|Liquibase|lb migrations|si:liquibase
pgadmin|pgAdmin|pg admin|devicon:postgresql
dbeaver|DBeaver||si:dbeaver
# ---- languages ----
go|Go|golang|logos:go
java|Java|jvm|logos:java
kotlin|Kotlin|kt|logos:kotlin-icon
scala|Scala||logos:scala
python|Python|py|logos:python
nodejs|Node.js|node,nodejs|logos:nodejs-icon
deno|Deno||logos:deno
bun|Bun||logos:bun
typescript|TypeScript|ts|logos:typescript-icon
javascript|JavaScript|js|logos:javascript
rust|Rust|rs|logos:rust
csharp|C#|csharp,c sharp|logos:c-sharp
dotnet|.NET|dotnet,net core|logos:dotnet
php|PHP||logos:php
ruby|Ruby|rb|logos:ruby
elixir|Elixir|ex|logos:elixir
erlang|Erlang||logos:erlang
c-lang|C|c language|logos:c
cpp|C++|cpp,cplusplus|logos:c-plusplus
swift|Swift||logos:swift
dart|Dart||logos:dart
# ---- frameworks ----
spring|Spring Boot|spring,springboot,spring boot|logos:spring-icon
quarkus|Quarkus||logos:quarkus-icon
micronaut|Micronaut||si:micronaut
django|Django||logos:django-icon
fastapi|FastAPI|fast api|logos:fastapi-icon
flask|Flask||logos:flask
express|Express|expressjs|logos:express
nestjs|NestJS|nest|logos:nestjs
fastify|Fastify||logos:fastify-icon
koa|Koa||si:koa
hono|Hono||logos:hono
gin|Gin|gin gonic|si:gin
echo|Echo||si:labstack
fiber|Fiber|gofiber|si:fiber
laravel|Laravel||logos:laravel
symfony|Symfony||logos:symfony
rails|Ruby on Rails|rails,ror|logos:rails
phoenix|Phoenix||logos:phoenix
aspnet|ASP.NET Core|asp.net,aspnet|logos:dotnet
actix|Actix|actix web|si:actix
axum|Axum||si:rust
ktor|Ktor||si:ktor
grpc|gRPC|grpc|logos:grpc-icon
graphql|GraphQL|gql|logos:graphql
apollo|Apollo GraphQL|apollo|logos:apollostack
trpc|tRPC||logos:trpc
mqtt|MQTT|mqtt broker|logos:mqtt
# ---- messaging / streaming ----
kafka|Apache Kafka|kafka|logos:kafka-icon|:9092
rabbitmq|RabbitMQ|rabbit,rmq|logos:rabbitmq-icon|:5672
nats|NATS|nats.io|logos:nats-icon|:4222
activemq|ActiveMQ|amq|file:asf-activemq.png
pulsar|Apache Pulsar|pulsar|si:apachepulsar
redis-streams|Redis Streams|redis stream|logos:redis
sqs|Amazon SQS|sqs,simple queue service|logos:aws-sqs
sns|Amazon SNS|sns,simple notification service|logos:aws-sns
kinesis|Amazon Kinesis|kinesis|logos:aws-kinesis
gcp-pubsub|Google Pub/Sub|pubsub,gcp pubsub|si:googlecloud
service-bus|Azure Service Bus|service bus,asb|logos:azure-icon
event-hubs|Azure Event Hubs|event hubs|logos:azure-icon
eventbridge|Amazon EventBridge|eventbridge,event bridge|logos:aws-eventbridge
zeromq|ZeroMQ|zmq,0mq|file:zeromq.svg
celery|Celery||logos:celery
sidekiq|Sidekiq||si:sidekiq
temporal|Temporal|temporal.io|logos:temporal-icon
airflow|Apache Airflow|airflow|logos:airflow-icon
# ---- big data ----
spark|Apache Spark|spark|logos:apache-spark
flink|Apache Flink|flink|logos:apache-flink-icon
hadoop|Apache Hadoop|hadoop|logos:hadoop
beam|Apache Beam|beam|file:ls-beam.svg.svg
kafka-streams|Kafka Streams|kstreams|logos:kafka-icon
dbt|dbt|data build tool|logos:dbt-icon
airbyte|Airbyte||logos:airbyte-icon
fivetran|Fivetran||si:fivetran
nifi|Apache NiFi|nifi|si:apachenifi
# ---- frontend / mobile ----
react|React|reactjs|logos:react
nextjs|Next.js|next|logos:nextjs-icon
vue|Vue.js|vue,vuejs|logos:vue
nuxt|Nuxt|nuxtjs|logos:nuxt-icon
angular|Angular||logos:angular-icon
svelte|Svelte||logos:svelte-icon
sveltekit|SvelteKit|svelte kit|logos:svelte-icon
solid|SolidJS|solid|logos:solidjs-icon
astro|Astro||logos:astro-icon
remix|Remix||logos:remix-icon
vite|Vite||logos:vitejs
webpack|Webpack||logos:webpack
tailwind|Tailwind CSS|tailwind|logos:tailwindcss-icon
react-native|React Native|rn|logos:react
flutter|Flutter||logos:flutter
ios|Swift / iOS|ios,swiftui,apple|logos:swift
android|Android / Kotlin|android|logos:android-icon
electron|Electron||logos:electron
tauri|Tauri||logos:tauri
# ---- AI / ML ----
openai|OpenAI|gpt,chatgpt|si:openai
anthropic|Anthropic / Claude|claude,anthropic|si:anthropic
huggingface|Hugging Face|hf,transformers|logos:hugging-face-icon
pytorch|PyTorch|torch|logos:pytorch-icon
tensorflow|TensorFlow|tf,tflow|logos:tensorflow
langchain|LangChain||si:langchain
llamaindex|LlamaIndex|llama index|file:ls-llamaindex.svg.svg
ollama|Ollama||si:ollama
vllm|vLLM||si:vllm
mlflow|MLflow||si:mlflow
kubeflow|Kubeflow||si:kubeflow
ray|Ray||si:ray
jupyter|Jupyter|notebook|logos:jupyter
sagemaker|Amazon SageMaker|sagemaker|file:aws-sagemaker.svg
vertex-ai|Vertex AI|vertex|si:googlecloud
# ---- cloud providers ----
aws|AWS|amazon web services|logos:aws
gcp|Google Cloud|gcp|logos:google-cloud
azure|Microsoft Azure|azure|logos:azure-icon
cloudflare|Cloudflare|cf|logos:cloudflare-icon
digitalocean|DigitalOcean|do,digital ocean,droplet,droplets,doks,do spaces|logos:digital-ocean-icon
hetzner|Hetzner||si:hetzner
linode|Linode / Akamai|linode,akamai cloud|si:linode
vultr|Vultr||si:vultr
ovh|OVHcloud|ovh|si:ovh
oracle-cloud|Oracle Cloud|oci,oracle cloud|logos:oracle
alibaba-cloud|Alibaba Cloud|aliyun,alicloud|si:alibabacloud
ibm-cloud|IBM Cloud|ibm|file:ibmcloud.svg
vercel|Vercel||logos:vercel-icon
netlify|Netlify||logos:netlify
heroku|Heroku||logos:heroku-icon
flyio|Fly.io|fly|si:flydotio
render|Render||si:render
railway|Railway||si:railway
# ---- network / security ----
nginx|NGINX|nginx|logos:nginx|:80
haproxy|HAProxy|ha proxy|devicon:haproxy
traefik|Traefik|traefik proxy|logos:traefik-proxy-icon
envoy|Envoy|envoy proxy|logos:envoy-icon
kong|Kong|kong gateway|logos:kong-icon
istio|Istio|service mesh|logos:istio
linkerd|Linkerd||logos:linkerd-icon
consul|Consul|hashicorp consul|logos:consul
cilium|Cilium|ebpf|logos:cilium
calico|Calico||file:gh-calico-dark.svg
metallb|MetalLB|metal lb|file:ls-metallb.svg.svg
cert-manager|cert-manager|certmanager|file:ls-jetstack-cert-manager.svg.svg
external-dns|ExternalDNS|external dns|si:kubernetes
akamai|Akamai||si:akamai
fastly|Fastly||si:fastly
pfsense|pfSense||si:pfsense
wireguard|WireGuard|wg|logos:wireguard
openvpn|OpenVPN||si:openvpn
tailscale|Tailscale|ts net|si:tailscale
okta|Okta||logos:okta-icon
auth0|Auth0||logos:auth0-icon
keycloak|Keycloak|kc|si:keycloak|:8080
zitadel|Zitadel||file:ls-zitadel.svg.svg
authentik|Authentik||si:authentik
oauth|OAuth / OIDC|oidc,openid|logos:oauth
letsencrypt|Let's Encrypt|lets encrypt,acme|si:letsencrypt
crowdstrike|CrowdStrike|falcon|file:gh-crowdstrike.svg
vault|HashiCorp Vault|vault,hashicorp vault|logos:vault-icon|:8200
sops|SOPS|mozilla sops|si:mozilla
sealed-secrets|Sealed Secrets||si:kubernetes
external-secrets|External Secrets|eso|si:kubernetes
trivy|Trivy||si:trivy
snyk|Snyk||logos:snyk-icon
sonarqube|SonarQube|sonar|logos:sonarqube
falco|Falco||si:falco
opa|OPA / Gatekeeper|opa,gatekeeper,open policy agent|file:ls-opa-icon-color.svg.svg
kyverno|Kyverno||file:ls-kyverno.svg.svg
aqua|Aqua Security|aqua|si:aqua
checkov|Checkov||file:ls-checkov.svg.svg
# ---- devops ----
git|Git|git scm|logos:git-icon
github|GitHub|gh|logos:github-icon
gitlab|GitLab|gl|logos:gitlab-icon
bitbucket|Bitbucket|bb|logos:bitbucket
gitea|Gitea||logos:gitea
azure-repos|Azure Repos|azure devops repos|logos:azure-icon
github-actions|GitHub Actions|gha,actions|logos:github-actions
gitlab-ci|GitLab CI|gitlab ci/cd,glci|logos:gitlab-icon
jenkins|Jenkins||logos:jenkins
circleci|CircleCI|circle|logos:circleci
travis-ci|Travis CI|travis|logos:travis-ci
teamcity|TeamCity||logos:teamcity-icon
bamboo|Bamboo||logos:bamboo
drone|Drone CI|drone|si:drone
tekton|Tekton||si:tekton
buildkite|Buildkite||logos:buildkite-icon
azure-pipelines|Azure Pipelines|ado pipelines|logos:azure-icon
codepipeline|AWS CodePipeline|codepipeline|logos:aws-codepipeline
argo-workflows|Argo Workflows|argo wf|logos:argo-icon
spinnaker|Spinnaker||si:spinnaker
argocd|Argo CD|argocd,argo cd,gitops|logos:argo-icon
flux|Flux|fluxcd|si:flux
harness|Harness||logos:harness-icon
octopus|Octopus Deploy|octopus|si:octopusdeploy
podman|Podman||logos:podman-icon
containerd|containerd||si:containerd
buildkit|BuildKit||logos:docker-icon
buildah|Buildah||file:gh-buildah.svg
kaniko|Kaniko||si:google
openshift|OpenShift|ocp|logos:openshift
rancher|Rancher||logos:rancher-icon
k3s|k3s||si:k3s
nomad|HashiCorp Nomad|nomad|logos:nomad-icon
swarm|Docker Swarm|swarm|logos:docker-icon
eks|Amazon EKS|eks,elastic kubernetes service|logos:aws-eks
gke|Google GKE|gke|logos:google-cloud
aks|Azure AKS|aks|logos:azure-icon
helm|Helm|helm charts|logos:helm
kustomize|Kustomize||si:kubernetes
kubectl|kubectl||logos:kubernetes
lens|Lens||si:lens
k9s|k9s||si:kubernetes
skaffold|Skaffold||si:skaffold
tilt|Tilt||file:ls-tilt.svg.svg
kind|kind|k8s in docker|si:kubernetes
minikube|Minikube||file:ls-minikube.svg.svg
terraform|Terraform|tf,hcl|logos:terraform-icon
opentofu|OpenTofu|tofu|si:opentofu
pulumi|Pulumi||logos:pulumi-icon
cloudformation|AWS CloudFormation|cfn,cloudformation|logos:aws-cloudformation
aws-cdk|AWS CDK|cdk|logos:aws
crossplane|Crossplane||si:crossplane
ansible|Ansible||logos:ansible
chef|Chef||logos:chef
puppet|Puppet||logos:puppet-icon
saltstack|SaltStack|salt|logos:saltstack
packer|Packer||logos:packer-icon
vagrant|Vagrant||logos:vagrant-icon
dockerhub|Docker Hub|hub|logos:docker-icon
harbor|Harbor||devicon:harbor
quay|Quay|quay.io|logos:quay
ghcr|GitHub Container Registry|ghcr|logos:github-icon
ecr|Amazon ECR|ecr|file:aws-ecr.svg
gar|Google Artifact Registry|gcr,artifact registry|logos:google-cloud
acr|Azure Container Registry|acr|logos:azure-icon
artifactory|JFrog Artifactory|artifactory,jfrog|logos:jfrog
nexus|Sonatype Nexus|nexus|si:sonatype
selenium|Selenium||logos:selenium
cypress|Cypress||logos:cypress-icon
playwright|Playwright||logos:playwright
k6|k6|grafana k6|logos:k6
jmeter|Apache JMeter|jmeter|logos:apache-jmeter
gatling|Gatling||logos:gatling
jira|Jira||logos:jira
confluence|Confluence||logos:confluence
slack|Slack||logos:slack-icon
msteams|Microsoft Teams|teams|logos:microsoft-teams
mattermost|Mattermost||logos:mattermost-icon
discord|Discord||logos:discord-icon
telegram|Telegram|tg|logos:telegram
npm|npm||logos:npm-icon
yarn|Yarn||logos:yarn
pnpm|pnpm||logos:pnpm
maven|Apache Maven|maven,mvn|logos:maven
gradle|Gradle||logos:gradle
pip|pip|pypi|logos:pypi
poetry|Poetry||logos:poetry
cargo|Cargo|crates.io|logos:rust
gomod|Go modules|go mod|logos:go
make|GNU Make|make,makefile|si:gnu
bazel|Bazel||logos:bazel
emqx|EMQX|mqtt broker cluster|file:ls-emqx.svg|:1883
glusterfs|GlusterFS|gluster|file:ls-gluster.svg
keepalived|Keepalived|vrrp,vip|file:gh-keepalived.png
foundationdb|FoundationDB|fdb|logos:foundationdb-icon|:4500
singlestore|SingleStore|memsql|logos:singlestore-icon|:3306
pacemaker|Pacemaker / Corosync|corosync,linux-ha|logos:linux-tux
# ---- observability ----
prometheus|Prometheus|prom,metrics|logos:prometheus|:9090
grafana|Grafana|dashboards|logos:grafana|:3000
loki|Grafana Loki|loki,logs|devicon:grafanaloki|:3100
tempo|Grafana Tempo|tempo,traces|file:tempo.png|:3200
mimir|Grafana Mimir|mimir|si:grafana
alloy|Grafana Alloy|alloy,agent,collector|file:alloy.svg|:12345
pyroscope|Pyroscope|profiles,profiling|file:pyroscope.png|:4040
jaeger|Jaeger|tracing|logos:jaeger
zipkin|Zipkin||file:ls-zipkin.svg.svg
opentelemetry|OpenTelemetry|otel,otlp|logos:opentelemetry-icon
logstash|Logstash||logos:logstash
kibana|Kibana||logos:kibana
fluentd|Fluentd||logos:fluentd
fluent-bit|Fluent Bit|fluentbit|si:fluentbit
vector|Vector|vector.dev|logos:vector
datadog|Datadog|dd|logos:datadog
newrelic|New Relic|nr|logos:newrelic
sentry|Sentry||logos:sentry-icon
pagerduty|PagerDuty|pd|logos:pagerduty
opsgenie|Opsgenie||logos:opsgenie
thanos|Thanos||si:thanos
alertmanager|Alertmanager|alerts|logos:prometheus|:9093
vmalert|vmalert|alerting rules|file:victoriametrics.svg|:8880
victorialogs|VictoriaLogs|vlogs|file:victorialogs.svg|:9428
node-exporter|node_exporter|node exporter,host metrics|logos:prometheus|:9100
journald|journald|systemd journal,journalctl|file:systemd-mark.svg
exporter|Exporter|node_exporter,metrics exporter|logos:prometheus
cadvisor|cAdvisor|container metrics|file:cadvisor-owl.png|:8080
# ---- SaaS / external ----
stripe|Stripe||logos:stripe
paypal|PayPal||logos:paypal
adyen|Adyen||logos:adyen
twilio|Twilio||logos:twilio-icon
sendgrid|SendGrid||logos:sendgrid-icon
mailgun|Mailgun||logos:mailgun-icon
postmark|Postmark||si:postmark
firebase|Firebase||logos:firebase
segment|Segment||logos:segment-icon
mixpanel|Mixpanel||logos:mixpanel
amplitude|Amplitude||logos:amplitude
google-analytics|Google Analytics|ga,ga4|logos:google-analytics
intercom|Intercom||logos:intercom
zendesk|Zendesk||logos:zendesk
hubspot|HubSpot||logos:hubspot
salesforce|Salesforce|sfdc|logos:salesforce
shopify|Shopify||logos:shopify
google-maps|Google Maps|gmaps|logos:google-maps
mapbox|Mapbox||logos:mapbox

# ---- observability: metrics ----
vmagent|vmagent|victoria agent,vm agent|file:victoriametrics.svg|:8429
vmauth|vmauth|vm auth|file:victoriametrics.svg|:8427
vmbackup|vmbackup|vm backup|file:victoriametrics.svg
victoriametrics-cluster|VictoriaMetrics Cluster|vm cluster,vmcluster|file:victoriametrics.svg
cortex|Cortex||file:ls-cortex.svg.svg
m3db|M3DB|m3|file:gh-m3db.svg
graphite|Graphite|carbon,whisper|
telegraf|Telegraf|influx agent|file:gh-telegraf.svg
netdata|Netdata||
zabbix|Zabbix||
nagios|Nagios||file:ls-nagios.svg.svg
icinga|Icinga||si:icinga
checkmk|Checkmk|check_mk|
prtg|PRTG|paessler|file:gh-prtg.svg
munin|Munin||file:gh-munin.svg
collectd|collectd||
statsd|StatsD||
# ---- exporters / agents ----
blackbox-exporter|blackbox_exporter|blackbox,probe|logos:prometheus|:9115
postgres-exporter|postgres_exporter|pg exporter|logos:prometheus|:9187
mysqld-exporter|mysqld_exporter|mysql exporter|logos:prometheus|:9104
redis-exporter|redis_exporter|redis metrics|logos:prometheus|:9121
kafka-exporter|kafka_exporter|kafka metrics|logos:prometheus|:9308
kube-state-metrics|kube-state-metrics|ksm|logos:kubernetes|:8080
pushgateway|Pushgateway|push gateway|logos:prometheus|:9091
grafana-agent|Grafana Agent|agent|logos:grafana|:12345
otel-collector|OpenTelemetry Collector|otelcol,otel collector|logos:opentelemetry-icon|:4317
filebeat|Filebeat|beats|logos:beats
metricbeat|Metricbeat|beats|logos:beats
promtail|Promtail|loki agent|devicon:grafanaloki|:9080
# ---- logs ----
graylog|Graylog||
splunk|Splunk||
papertrail|Papertrail||
logzio|Logz.io|logzio|file:ls-logz-io.svg.svg
quickwit|Quickwit||file:ls-quickwit.png.png
openobserve|OpenObserve|o2|file:ls-openobserve.svg.svg
signoz|SigNoz||
# ---- traces / apm ----
skywalking|Apache SkyWalking|skywalking|file:ls-sky-walking.svg.svg
elastic-apm|Elastic APM|apm|logos:elasticsearch
pinpoint|Pinpoint||file:ls-pinpoint.svg.svg
uptrace|Uptrace||file:gh-uptrace.svg
honeycomb|Honeycomb||file:ls-honeycomb.svg.svg
lightstep|Lightstep||
dynatrace|Dynatrace||
appdynamics|AppDynamics|appd|
instana|Instana||file:ls-instana.svg.svg
# ---- profiling ----
parca|Parca||file:gh-parca.svg
async-profiler|async-profiler||logos:java
pprof|pprof||logos:go
# ---- dashboards ----
opensearch-dashboards|OpenSearch Dashboards||logos:opensearch-icon
chronograf|Chronograf||logos:influxdb-icon
perses|Perses||file:ls-perses.svg.svg
metabase|Metabase||
superset|Apache Superset|superset|
redash|Redash||
# ---- alerting / on-call ----
grafana-oncall|Grafana OnCall|oncall|logos:grafana
victorops|Splunk On-Call (VictorOps)|victorops,splunk oncall|
incident-io|incident.io||logos:incident-icon
rootly|Rootly||file:ls-rootly.svg.svg
# ---- uptime / synthetic ----
uptime-kuma|Uptime Kuma|kuma|
gatus|Gatus||file:gh-gatus.svg
pingdom|Pingdom||
uptimerobot|UptimeRobot|uptime robot|file:gh-uptimerobot.svg
betterstack|Better Stack|better uptime,logtail|
statuspage|Statuspage||
checkly|Checkly||file:ls-checkly.svg.svg
# ---- error tracking / rum ----
glitchtip|GlitchTip||file:gh-glitchtip.svg
rollbar|Rollbar||
bugsnag|Bugsnag||
logrocket|LogRocket||
grafana-faro|Grafana Faro|faro,rum|logos:grafana
# ---- ebpf / k8s observability ----
pixie|Pixie||file:ls-pixie.svg.svg
hubble|Cilium Hubble|hubble|file:ls-hubble-rgb-.svg.svg
coroot|Coroot||file:ls-coroot.svg.svg
kubecost|Kubecost||file:ls-kubecost.svg.svg
robusta|Robusta||file:ls-robusta.svg.svg
# ---- cloud-native monitoring ----
cloudwatch|Amazon CloudWatch|cloudwatch,cw|logos:aws-cloudwatch
azure-monitor|Azure Monitor||logos:azure-icon
gcp-monitoring|Google Cloud Monitoring|stackdriver,cloud logging|logos:google-cloud
# ---- CDC / data integration ----
debezium-server|Debezium Server||file:gh-debezium.svg
debezium-postgres|Debezium PostgreSQL connector|debezium pg|file:gh-debezium.svg
debezium-mysql|Debezium MySQL connector|debezium mysql|file:gh-debezium.svg
debezium-mongodb|Debezium MongoDB connector|debezium mongo|file:gh-debezium.svg
debezium-sqlserver|Debezium SQL Server connector|debezium mssql|file:gh-debezium.svg
debezium-oracle|Debezium Oracle connector|debezium oracle|file:gh-debezium.svg
kafka-connect|Kafka Connect|connect|logos:kafka-icon
s3-sink|S3 Sink Connector|kafka s3 sink,confluent s3 sink,s3 connector,s3 sink|logos:aws-s3
gcs-sink|GCS Sink Connector|kafka gcs sink,google cloud storage sink|si:googlecloud
azure-blob-sink|Azure Blob Sink Connector|kafka azure blob sink|logos:azure-icon
jdbc-sink|JDBC Sink Connector|jdbc sink,jdbc connector,kafka jdbc|logos:kafka-icon
jdbc-source|JDBC Source Connector|jdbc source,kafka jdbc source|logos:kafka-icon
elasticsearch-sink|Elasticsearch Sink Connector|kafka elasticsearch sink,es sink|logos:elasticsearch
opensearch-sink|OpenSearch Sink Connector|kafka opensearch sink|logos:opensearch-icon
snowflake-sink|Snowflake Sink Connector|kafka snowflake sink,snowflake connector|logos:snowflake-icon
bigquery-sink|BigQuery Sink Connector|kafka bigquery sink|si:googlebigquery
clickhouse-sink|ClickHouse Sink Connector|kafka clickhouse sink|devicon:clickhouse
mongodb-sink|MongoDB Sink Connector|kafka mongodb sink,mongo sink|logos:mongodb-icon
redis-sink|Redis Sink Connector|kafka redis sink|logos:redis
hdfs-sink|HDFS Sink Connector|kafka hdfs sink|logos:hadoop
maxwell|Maxwell|maxwell's daemon|
canal|Canal|alibaba canal|
meltano|Meltano||
estuary|Estuary Flow|estuary|
striim|Striim||
aws-dms|AWS DMS|dms,database migration service|logos:aws
confluent|Confluent|confluent cloud|file:gh-confluent-dark.svg
redpanda|Redpanda||file:ls-redpanda.svg.svg
schema-registry|Schema Registry|avro registry|logos:kafka-icon
kafka-ui|Kafka UI|provectus|logos:kafka-icon
akhq|AKHQ|kafkahq|logos:kafka-icon
conduktor|Conduktor||
# ---- Apache Software Foundation ----
zookeeper|Apache ZooKeeper|zookeeper,zk|file:ls-apache-zookeeper.svg.svg
artemis|Apache Artemis|artemis|file:asf-activemq.png
rocketmq|Apache RocketMQ|rocketmq|
camel|Apache Camel|camel|file:asf-camel.png
storm|Apache Storm|storm|
samza|Apache Samza|samza|file:asf-samza.png
kylin|Apache Kylin|kylin|
iceberg|Apache Iceberg|iceberg|file:asf-iceberg.png
hudi|Apache Hudi|hudi|file:asf-hudi.png
paimon|Apache Paimon|paimon|file:asf-paimon.png
parquet|Apache Parquet|parquet|
orc|Apache ORC|orc|file:asf-orc.png
avro|Apache Avro|avro|
arrow|Apache Arrow|arrow|
thrift|Apache Thrift|thrift|file:ls-apache-thrift.svg.svg
drill|Apache Drill|drill|file:asf-drill.png
impala|Apache Impala|impala|
phoenix-hbase|Apache Phoenix|phoenix sql|file:asf-phoenix.png
kudu|Apache Kudu|kudu|file:asf-kudu.png
ignite|Apache Ignite|ignite|
geode|Apache Geode|geode|
lucene|Apache Lucene|lucene|
nutch|Apache Nutch|nutch|file:asf-nutch.png
tika|Apache Tika|tika|file:asf-tika.png
tomcat|Apache Tomcat|tomcat|
httpd|Apache HTTP Server|httpd,apache,apache2|file:asf-httpd.png
apisix|Apache APISIX|apisix|file:ls-apisix.svg.svg
dubbo|Apache Dubbo|dubbo|file:ls-dubbo.svg.svg
shardingsphere|Apache ShardingSphere|shardingsphere|file:ls-shardingsphere.svg.svg
zeppelin|Apache Zeppelin|zeppelin|file:ls-apache-zeppelin.svg.svg
livy|Apache Livy|livy|file:asf-livy.png
oozie|Apache Oozie|oozie|file:asf-oozie.png
sqoop|Apache Sqoop|sqoop|
flume|Apache Flume|flume|file:asf-flume.png
ranger|Apache Ranger|ranger|file:asf-ranger.png
atlas|Apache Atlas|atlas|file:asf-atlas.png
knox|Apache Knox|knox|file:asf-knox.png
shiro|Apache Shiro|shiro|file:asf-shiro.png
ant|Apache Ant|ant|
groovy|Apache Groovy|groovy|
struts|Apache Struts|struts|
wicket|Apache Wicket|wicket|
openwhisk|Apache OpenWhisk|openwhisk|file:ls-apache-openwhisk.svg.svg
mesos|Apache Mesos|mesos|
guacamole|Apache Guacamole|guacamole|
seatunnel|Apache SeaTunnel|seatunnel|file:ls-seatunnel.svg.svg
dolphinscheduler|Apache DolphinScheduler|dolphinscheduler|
inlong|Apache InLong|inlong|file:asf-inlong.png
hop|Apache Hop|hop|file:asf-hop.png
kvrocks|Apache Kvrocks|kvrocks|file:asf-kvrocks.png
answer|Apache Answer|answer|
yarn-hadoop|Hadoop YARN|yarn|file:asf-hadoop.png
mapreduce|Hadoop MapReduce|mapreduce|file:asf-hadoop.png
# ---- gap sweep ----
caddy|Caddy||
jetty|Eclipse Jetty|jetty|
undertow|Undertow||
varnish|Varnish Cache|varnish|file:ls-varnish-software.svg.svg
squid|Squid|squid proxy|
litespeed|LiteSpeed||
tyk|Tyk||file:ls-tyk.svg.svg
krakend|KrakenD||file:ls-krakend.svg.svg
gravitee|Gravitee||file:ls-gravitee.svg.svg
aws-api-gateway|Amazon API Gateway|apigw|logos:aws-api-gateway
apigee|Apigee||
camunda|Camunda||
conductor|Netflix Conductor|conductor|file:gh-conductor.svg
prefect|Prefect||
dagster|Dagster||file:gh-dagster.svg
launchdarkly|LaunchDarkly|feature flags|
unleash|Unleash||file:ls-unleash.svg.svg
flagsmith|Flagsmith||file:ls-flagsmith.svg.svg
consul-kv|Consul KV|consul config|logos:consul
spring-cloud-config|Spring Cloud Config|config server|logos:spring-icon
eureka|Netflix Eureka|eureka|file:ls-netflix-oss-eureka.svg.svg
ldap|LDAP|openldap|g:ldap
active-directory|Active Directory|ad,entra,entra domain services|file:azure-entra-domain-services.svg
saml|SAML|saml sso|g:saml
oidc|OIDC|openid connect|g:oidc
velero|Velero||file:ls-project-velero.svg.svg
restic|Restic||file:restic.png
longhorn|Longhorn||
rook|Rook||
portworx|Portworx||file:ls-portworx.svg.svg
vmware|VMware|vsphere,esxi|
proxmox|Proxmox|pve|
kvm|KVM||
qemu|QEMU||
virtualbox|VirtualBox|vbox|
hyper-v|Hyper-V|hyperv|
openstack|OpenStack||
physical-server|Physical server|bare metal,rack server|g:physical-server
rack|Server rack|rack,cabinet|g:rack
data-center|Data center|datacenter,dc|g:data-center
disk|Disk|hdd,ssd,drive|g:disk
gpu|GPU|graphics card,cuda|g:gpu
laptop|Laptop|notebook|g:laptop
phone|Phone|smartphone|g:phone
tablet|Tablet|ipad|g:tablet
printer|Printer||g:printer
iot-sensor|IoT sensor|sensor,thermometer|g:iot-sensor
actor|Actor|person,stick figure|g:actor
team|Team|squad,group of people|g:team
external-system|External system|third party system|g:external-system
`;

export const SECTIONS = [
  { id: 'generic', label: 'Generic', subs: [
    { id: 'shapes', label: 'Shapes', shapes: true, ids: [] },
    { id: 'components', label: 'Components', ids: 'service server container function worker cron queue database cache search object-storage file-storage data-warehouse vector-db nosql stream-processor event-bus pubsub third-party-api cloud'.split(' ') },
  ] },
  { id: 'clients', label: 'Clients', subs: [{ id: 'clients', label: 'Clients', ids: 'user users browser mobile desktop iot admin'.split(' ') }] },
  { id: 'network', label: 'Network', subs: [
    { id: 'devices', label: 'Network devices', ids: 'router switch load-balancer api-gateway reverse-proxy firewall waf ids-ips vpn nat dns cdn bastion internet'.split(' ') },
    { id: 'net-software', label: 'Proxies & mesh', ids: 'nginx haproxy keepalived traefik envoy kong istio linkerd consul cilium calico metallb cert-manager external-dns'.split(' ') },
    { id: 'edge', label: 'Edge / CDN', ids: 'cloudflare akamai fastly cdn dns'.split(' ') },
  ] },
  { id: 'compute', label: 'Compute', subs: [
    { id: 'compute', label: 'Compute', ids: 'server container function worker cron k8s-pod k8s-deployment kubernetes docker'.split(' ') },
    { id: 'os', label: 'Operating systems', ids: 'linux ubuntu debian centos rhel alpine windows-server'.split(' ') },
  ] },
  { id: 'databases', label: 'Databases', subs: [
    { id: 'db-generic', label: 'Generic types', ids: 'database nosql cache search object-storage file-storage data-warehouse vector-db'.split(' ') },
    { id: 'relational', label: 'Relational', ids: 'postgresql mysql mariadb oracle-db sqlserver sqlite db2 cockroachdb yugabytedb tidb planetscale neon supabase aurora cloud-sql spanner vitess firebird singlestore foundationdb'.split(' ') },
    { id: 'document', label: 'Document', ids: 'mongodb couchbase couchdb firestore ravendb documentdb cosmosdb'.split(' ') },
    { id: 'kv', label: 'Key-value / cache', ids: 'redis valkey keydb dragonfly memcached etcd dynamodb riak hazelcast aerospike'.split(' ') },
    { id: 'wide', label: 'Wide-column', ids: 'cassandra scylladb hbase bigtable'.split(' ') },
    { id: 'db-search', label: 'Search', ids: 'elasticsearch opensearch solr meilisearch typesense algolia manticore'.split(' ') },
    { id: 'tsdb', label: 'Time-series', ids: 'influxdb timescaledb questdb prometheus-tsdb victoriametrics opentsdb druid'.split(' ') },
    { id: 'graph', label: 'Graph', ids: 'neo4j arangodb janusgraph neptune dgraph memgraph nebulagraph'.split(' ') },
    { id: 'olap', label: 'Analytical / warehouse', ids: 'clickhouse snowflake bigquery redshift databricks duckdb pinot starrocks doris greenplum vertica trino hive'.split(' ') },
    { id: 'vector', label: 'Vector', ids: 'pinecone weaviate milvus qdrant chroma pgvector lancedb'.split(' ') },
    { id: 'embedded', label: 'Embedded / other', ids: 'rocksdb leveldb lmdb h2 realm sqlite'.split(' ') },
    { id: 'object', label: 'Object / file storage', ids: 's3 minio ceph gcs azure-blob backblaze cloudflare-r2 hdfs nfs glusterfs'.split(' ') },
    { id: 'db-tools', label: 'DB tooling', ids: 'pgbouncer proxysql debezium flyway liquibase pgadmin dbeaver'.split(' ') },
  ] },
  { id: 'backend', label: 'Backend', subs: [
    { id: 'languages', label: 'Languages', ids: 'go java kotlin scala python nodejs deno bun typescript rust csharp dotnet php ruby elixir erlang c-lang cpp swift dart javascript'.split(' ') },
    { id: 'frameworks', label: 'Frameworks', ids: 'spring quarkus micronaut django fastapi flask express nestjs fastify koa hono gin echo fiber laravel symfony rails phoenix aspnet actix axum ktor grpc graphql apollo trpc'.split(' ') },
    { id: 'protocols', label: 'API styles & protocols', ids: 'rest grpc graphql websocket sse webhook soap mqtt amqp'.split(' ') },
  ] },
  { id: 'messaging', label: 'Messaging', subs: [
    { id: 'brokers', label: 'Messaging / streaming', ids: 'queue pubsub event-bus producer consumer consumer-group emqx kafka rabbitmq nats activemq pulsar redis-streams sqs sns kinesis gcp-pubsub service-bus event-hubs eventbridge zeromq celery sidekiq temporal airflow'.split(' ') },
    { id: 'bigdata', label: 'Big data / processing', ids: 'stream-processor spark flink hadoop beam kafka-streams dbt airbyte fivetran nifi'.split(' ') },
  ] },
  { id: 'frontend', label: 'Frontend / Mobile', subs: [
    { id: 'web', label: 'Web', ids: 'react nextjs vue nuxt angular svelte sveltekit solid astro remix vite webpack tailwind typescript javascript'.split(' ') },
    { id: 'mobile', label: 'Mobile & desktop', ids: 'react-native flutter ios android electron tauri mobile desktop'.split(' ') },
  ] },
  { id: 'ai', label: 'AI / ML', subs: [
    { id: 'ai', label: 'AI / ML', ids: 'openai anthropic huggingface pytorch tensorflow langchain llamaindex ollama vllm mlflow kubeflow ray jupyter sagemaker vertex-ai'.split(' ') },
  ] },
  { id: 'devops', label: 'DevOps', subs: [
    { id: 'scm', label: 'Source control', ids: 'git github gitlab bitbucket gitea azure-repos'.split(' ') },
    { id: 'cicd', label: 'CI/CD', ids: 'github-actions gitlab-ci jenkins circleci travis-ci teamcity bamboo drone tekton buildkite azure-pipelines codepipeline argo-workflows spinnaker ci-pipeline'.split(' ') },
    { id: 'gitops', label: 'GitOps / CD', ids: 'argocd flux harness octopus'.split(' ') },
    { id: 'containers', label: 'Containers', ids: 'docker podman containerd buildkit buildah kaniko'.split(' ') },
    { id: 'orchestration', label: 'Orchestration', ids: 'kubernetes openshift rancher k3s nomad swarm eks gke aks'.split(' ') },
    { id: 'k8s-tools', label: 'Kubernetes tooling', ids: 'helm kustomize kubectl lens k9s skaffold tilt kind minikube'.split(' ') },
    { id: 'mesh', label: 'Service mesh / networking', ids: 'istio linkerd consul envoy cilium calico traefik nginx haproxy kong metallb cert-manager external-dns'.split(' ') },
    { id: 'iac', label: 'IaC / config', ids: 'terraform opentofu pulumi cloudformation aws-cdk crossplane ansible chef puppet saltstack packer vagrant'.split(' ') },
    { id: 'registries', label: 'Registries / artifacts', ids: 'dockerhub harbor quay ghcr ecr gar acr artifactory nexus container-registry'.split(' ') },
    { id: 'testing', label: 'Testing / quality', ids: 'selenium cypress playwright k6 jmeter gatling sonarqube'.split(' ') },
    { id: 'chatops', label: 'Collaboration / ChatOps', ids: 'jira confluence slack msteams mattermost discord telegram'.split(' ') },
    { id: 'build', label: 'Package managers / build', ids: 'npm yarn pnpm maven gradle pip poetry cargo gomod make bazel'.split(' ') },
    { id: 'devops-os', label: 'Operating systems / servers', ids: 'linux ubuntu debian centos rhel alpine windows-server'.split(' ') },
  ] },
  { id: 'observability', label: 'Observability', subs: [
    { id: 'grafana-stack', label: 'Grafana stack', ids: 'prometheus grafana loki tempo mimir alloy pyroscope alertmanager vmalert victoriametrics victorialogs exporter cadvisor thanos'.split(' ') },
    { id: 'metrics', label: 'Metrics', ids: 'prometheus victoriametrics victoriametrics-cluster vmagent vmalert vmauth vmbackup thanos cortex mimir m3db graphite influxdb telegraf netdata zabbix nagios icinga checkmk prtg munin collectd statsd'.split(' ') },
    { id: 'exporters', label: 'Exporters & agents', ids: 'exporter node-exporter journald cadvisor blackbox-exporter postgres-exporter mysqld-exporter redis-exporter kafka-exporter kube-state-metrics pushgateway alloy grafana-agent otel-collector telegraf vector fluentd fluent-bit filebeat metricbeat logstash promtail'.split(' ') },
    { id: 'logs', label: 'Logs', ids: 'loki victorialogs elasticsearch opensearch graylog splunk papertrail logzio clickhouse quickwit openobserve signoz'.split(' ') },
    { id: 'traces', label: 'Traces / APM', ids: 'tempo jaeger zipkin opentelemetry skywalking elastic-apm pinpoint uptrace honeycomb lightstep dynatrace appdynamics newrelic datadog instana'.split(' ') },
    { id: 'profiling', label: 'Profiling', ids: 'pyroscope parca async-profiler pprof'.split(' ') },
    { id: 'dashboards', label: 'Dashboards', ids: 'grafana kibana opensearch-dashboards chronograf perses metabase superset redash'.split(' ') },
    { id: 'alerting', label: 'Alerting / on-call', ids: 'alertmanager vmalert grafana-oncall pagerduty opsgenie victorops incident-io rootly telegram slack email'.split(' ') },
    { id: 'uptime', label: 'Uptime / synthetic', ids: 'uptime-kuma gatus pingdom uptimerobot betterstack statuspage checkly blackbox-exporter'.split(' ') },
    { id: 'errors', label: 'Error tracking / RUM', ids: 'sentry glitchtip rollbar bugsnag logrocket grafana-faro'.split(' ') },
    { id: 'ebpf', label: 'eBPF / Kubernetes', ids: 'pixie hubble coroot kubecost robusta cilium'.split(' ') },
    { id: 'cloud-mon', label: 'Cloud-native monitoring', ids: 'cloudwatch azure-monitor gcp-monitoring'.split(' ') },
  ] },
  { id: 'security', label: 'Security', subs: [
    { id: 'sec-generic', label: 'Generic', ids: 'auth-service identity-provider secrets certificate rate-limiter firewall waf ids-ips vpn bastion'.split(' ') },
    { id: 'identity', label: 'Identity & access', ids: 'okta auth0 keycloak zitadel authentik oauth'.split(' ') },
    { id: 'secsec', label: 'Secrets & scanning', ids: 'vault sops sealed-secrets external-secrets trivy snyk sonarqube falco opa kyverno aqua checkov crowdstrike letsencrypt'.split(' ') },
    { id: 'netsec', label: 'Network security', ids: 'pfsense wireguard openvpn tailscale cloudflare'.split(' ') },
  ] },
  { id: 'cloud', label: 'Cloud providers', subs: [
    { id: 'cloud', label: 'Cloud providers', ids: 'aws gcp azure cloudflare digitalocean hetzner linode vultr ovh oracle-cloud alibaba-cloud ibm-cloud vercel netlify heroku flyio render railway'.split(' ') },
  ] },
  { id: 'saas', label: 'SaaS / External', subs: [
    { id: 'payments', label: 'Payments', ids: 'stripe paypal adyen payment'.split(' ') },
    { id: 'comms', label: 'Communication', ids: 'twilio sendgrid mailgun postmark email sms push slack telegram'.split(' ') },
    { id: 'backend-saas', label: 'Backend services', ids: 'firebase supabase auth0 algolia third-party-api'.split(' ') },
    { id: 'analytics', label: 'Analytics & CRM', ids: 'segment mixpanel amplitude google-analytics intercom zendesk hubspot salesforce shopify'.split(' ') },
    { id: 'maps', label: 'Maps', ids: 'google-maps mapbox'.split(' ') },
  ] },
  { id: 'cdc', label: 'CDC / Data integration', subs: [
    { id: 'cdc', label: 'CDC & integration', ids: 'debezium debezium-server debezium-postgres debezium-mysql debezium-mongodb debezium-sqlserver debezium-oracle kafka-connect s3-sink gcs-sink azure-blob-sink jdbc-sink jdbc-source elasticsearch-sink opensearch-sink snowflake-sink bigquery-sink clickhouse-sink mongodb-sink redis-sink hdfs-sink maxwell canal airbyte fivetran meltano estuary striim aws-dms'.split(' ') },
    { id: 'kafka-eco', label: 'Kafka ecosystem', ids: 'kafka confluent redpanda schema-registry kafka-connect kafka-ui akhq conduktor kafka-streams'.split(' ') },
  ] },
  { id: 'apache', label: 'Apache (ASF)', subs: [
    { id: 'asf-stream', label: 'Streaming & messaging', ids: 'kafka pulsar activemq artemis rocketmq camel storm samza flink flume inlong'.split(' ') },
    { id: 'asf-bigdata', label: 'Big data & storage', ids: 'hadoop hdfs yarn-hadoop mapreduce spark hive hbase impala kudu drill zookeeper ignite geode kvrocks'.split(' ') },
    { id: 'asf-db', label: 'Databases & query', ids: 'cassandra couchdb druid pinot doris kylin phoenix-hbase solr lucene shardingsphere'.split(' ') },
    { id: 'asf-formats', label: 'Table formats & serialization', ids: 'iceberg hudi paimon parquet orc avro arrow thrift'.split(' ') },
    { id: 'asf-processing', label: 'Data processing & orchestration', ids: 'nifi airflow beam oozie sqoop seatunnel dolphinscheduler hop zeppelin livy superset mesos'.split(' ') },
    { id: 'asf-web', label: 'Web & servers', ids: 'httpd tomcat apisix dubbo struts wicket openwhisk guacamole nutch tika'.split(' ') },
    { id: 'asf-security', label: 'Security & governance', ids: 'ranger atlas knox shiro'.split(' ') },
    { id: 'asf-dev', label: 'Dev tools', ids: 'maven ant groovy skywalking'.split(' ') },
    { id: 'asf-other', label: 'Other', ids: 'answer'.split(' ') },
  ] },
  { id: 'platform', label: 'Platform & infra', subs: [
    { id: 'webservers', label: 'Web servers & proxies', ids: 'nginx caddy httpd tomcat jetty undertow varnish squid litespeed haproxy traefik envoy'.split(' ') },
    { id: 'gateways', label: 'API gateways', ids: 'kong tyk krakend apisix gravitee aws-api-gateway apigee api-gateway'.split(' ') },
    { id: 'workflow', label: 'Workflow / orchestration', ids: 'temporal camunda conductor argo-workflows prefect dagster airflow'.split(' ') },
    { id: 'config', label: 'Feature flags & config', ids: 'launchdarkly unleash flagsmith consul-kv spring-cloud-config'.split(' ') },
    { id: 'discovery', label: 'Service discovery', ids: 'consul eureka zookeeper etcd'.split(' ') },
    { id: 'identity-generic', label: 'Identity protocols', ids: 'ldap active-directory saml oidc oauth'.split(' ') },
    { id: 'backup', label: 'Storage & backup', ids: 'velero restic longhorn rook portworx ceph minio glusterfs pacemaker'.split(' ') },
    { id: 'virt', label: 'Virtualization', ids: 'vmware proxmox kvm qemu virtualbox hyper-v openstack'.split(' ') },
    { id: 'hardware', label: 'Hardware', ids: 'physical-server rack data-center disk gpu laptop phone tablet printer iot-sensor'.split(' ') },
  ] },
  { id: 'helpers', label: 'Diagram helpers', subs: [
    { id: 'helpers', label: 'Helpers', helpers: true, ids: 'actor team external-system'.split(' ') },
  ] },
];
