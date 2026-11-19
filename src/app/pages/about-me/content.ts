/** Author profile for /about-me, taken from the CV. English only: it mirrors the CV wording. */

export type Job = { company: string; domain: string; role: string; period: string; points: string[] };
export type Project = { name: string; version: string; blurb: string; tags: string[] };

const GH = "https://github.com/bakhod1r";

export const profile = {
  name: "Bakhodir Mansurov",
  role: "Backend & DevOps Engineer",
  location: "Tashkent, Uzbekistan",
  summary:
    "Backend and DevOps engineer with 5 years of Go experience building production systems in fintech, telecom, e-commerce, CRM and marketplace domains. I care about payments that never double-charge, services that deploy without downtime, and systems that tell you when they are unwell.",
  focus: [
    { title: "Distributed systems", text: "Async pipelines, workers, distributed locks, idempotency, DLQs." },
    { title: "Fintech & payments", text: "Payment providers, reconciliation, no double charges." },
    { title: "DevOps & cloud", text: "Docker Swarm, Terraform, AWS, CI/CD, zero-downtime deploys." },
    { title: "Databases", text: "PostgreSQL tuning, replication, MongoDB transactions, Redis." },
  ],
  links: [
    { label: "GitHub", href: GH },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/baxodir-mansurov-602bb2283/" },
    { label: "LeetCode", href: "https://leetcode.com/u/bakhod1r/" },
  ],
  github: GH,
};

export const jobs: Job[] = [
  {
    company: "Wayll",
    domain: "Investment & fintech platform",
    role: "Software Engineer",
    period: "May 2026 – Present",
    points: [
      "Own the payment service end to end: providers, A2C/C2A flows, withdrawals, card processing and multi cash desks for dividends, deposits and top-ups.",
      "Built a reconciliation worker that continuously detects status, amount and missing-record mismatches across two payment providers.",
      "Designed layered idempotency and concurrency control (distributed locks, idempotency keys, explicit payment states, time-window dedup) to prevent duplicate charges.",
      "Decoupled 100k+ investor notifications from payments with an async RabbitMQ pipeline; added MongoDB multi-document transactions to kill partial writes.",
      "Provisioned AWS with Terraform, set up a Teleport cluster for certificate-based audited SSH, and deployed Metabase on Aurora.",
    ],
  },
  {
    company: "Turon Telecom",
    domain: "Telecommunications & digital services",
    role: "Software Engineer",
    period: "Dec 2024 – May 2026",
    points: [
      "Cut payment p95 latency by 20% with zero downtime by rewriting a PHP backend and a redundant Go proxy as one gRPC Payment service.",
      "Integrated 10+ systems: payment providers, MyID, SMS gateways, legacy billing, Cinerama.uz.",
      "Built a Go scheduling platform for autopayments, installments, loyalty tiers, cashback and tariff activation with row-level locking.",
      "Ran 8 Go microservices on Docker Swarm with rolling updates and auto-rollback; Prometheus, Grafana, Loki and Alertmanager to Telegram; PostgreSQL streaming replication.",
    ],
  },
  {
    company: "Vanguard",
    domain: "Food delivery startup",
    role: "Software Engineer",
    period: "Apr 2024 – Dec 2024",
    points: [
      "Designed the system architecture, diagrams and technical docs.",
      "Reworked product variant selection as a trie over dot-separated prefix paths instead of scanning the full variant matrix.",
      "Set up production from scratch: TLS, firewall, SSH hardening, secrets and DB backups.",
    ],
  },
  {
    company: "Iqro Agency",
    domain: "Education CRM & restaurant automation",
    role: "Software Engineer",
    period: "Aug 2023 – Apr 2024",
    points: [
      "Built a production CRM for education centers and a restaurant ordering bot.",
      "Tuned PostgreSQL with CTEs, targeted indexes and query-plan analysis.",
      "Cut AWS cost with a scheduled Lambda that terminates untagged EC2 instances.",
    ],
  },
  {
    company: "Smart Code",
    domain: "Marketplace, CRM & e-commerce",
    role: "Software Engineer",
    period: "Mar 2022 – Aug 2023",
    points: [
      "Cut hot API response times by 30% with a tuned pgx pool and removed N+1 queries.",
      "Implemented retry-safe multi-provider payments and GiST-indexed polygon real-estate search.",
    ],
  },
];

/** Best open source work, picked by usefulness and maturity. */
export const projects: Project[] = [
  {
    name: "guard",
    version: "v0.6.1",
    blurb: "Authorization and API security for Go: sessions, RBAC, ABAC, API keys, rate limiting, audit logging.",
    tags: ["security", "auth"],
  },
  { name: "oneenv", version: "v1.10.3", blurb: "Parse .env files straight into Go structs. Zero dependencies, pure stdlib.", tags: ["config", "stdlib"] },
  { name: "synth", version: "v1.8.0", blurb: "Locale-aware synthetic data engine for API and load testing.", tags: ["testing", "data"] },
  { name: "env4ci", version: "v1.0.1", blurb: "Sync .env secrets with GitHub Actions, GitLab CI/CD and HashiCorp Vault.", tags: ["devops", "ci/cd"] },
  { name: "seedora", version: "v0.9.0", blurb: "Discovers your database schema and generates realistic seed data.", tags: ["database", "testing"] },
  { name: "spector", version: "v0.7.0", blurb: "OpenAPI docs generator that auto-detects routes in Gin, Chi and stdlib.", tags: ["api", "docs"] },
  {
    name: "phonex",
    version: "v0.2.0",
    blurb: "Phone parsing, validation and formatting generated from libphonenumber. Zero-allocation parsing.",
    tags: ["parsing", "perf"],
  },
  {
    name: "uax",
    version: "v0.1.0",
    blurb: "Client intelligence from User-Agent, Client Hints and fetch metadata, with confidence per field.",
    tags: ["http", "perf"],
  },
];

export const skills: { group: string; items: string[] }[] = [
  { group: "Backend", items: ["Go", "Python", "gRPC", "REST", "Gin"] },
  { group: "Distributed systems", items: ["RabbitMQ", "Background workers", "Distributed locking", "Idempotency", "DLQ"] },
  { group: "Data", items: ["PostgreSQL", "MySQL", "MongoDB", "Aurora", "Redis", "MinIO", "Replication"] },
  { group: "Infra & DevOps", items: ["Docker Swarm", "Terraform", "AWS", "Teleport", "GitHub Actions", "GitLab CI", "Nginx", "Prometheus", "Grafana"] },
];

export const education = "BSc in Electrical Engineering, Navoi State Mining and Technology University (2018 – 2022)";
export const certificates = ["HackerRank SQL (Advanced), 2024", "HackerRank Go (Basic), 2023"];
