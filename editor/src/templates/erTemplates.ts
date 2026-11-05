// the Seedora demo template embeds Seedora's testdata/demo_large.sql.
import type { Diagram, DiagramNode } from '../types';
import { schemaToDiagram } from '../lib/er/convert';
import { parseSql } from '../lib/er/sqlParse';
import demoLarge from '../lib/er/fixtures/demo_large.sql?raw';
import type { Template } from './monitoringStack';

export const ECOMMERCE_SQL = `
CREATE TABLE customers (
  id          bigserial PRIMARY KEY,
  email       varchar(190) NOT NULL UNIQUE,
  full_name   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE addresses (
  id           bigserial PRIMARY KEY,
  customer_id  bigint NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  line1        text NOT NULL,
  city         text NOT NULL,
  country      char(2) NOT NULL
);
CREATE TABLE categories (
  id         serial PRIMARY KEY,
  parent_id  int REFERENCES categories(id),
  name       text NOT NULL,
  slug       varchar(80) NOT NULL UNIQUE
);
CREATE TABLE products (
  id           bigserial PRIMARY KEY,
  category_id  int NOT NULL REFERENCES categories(id),
  sku          varchar(40) NOT NULL UNIQUE,
  name         text NOT NULL,
  price_cents  integer NOT NULL CHECK (price_cents >= 0),
  active       boolean NOT NULL DEFAULT true
);
CREATE TABLE orders (
  id                  bigserial PRIMARY KEY,
  customer_id         bigint NOT NULL REFERENCES customers(id),
  shipping_address_id bigint REFERENCES addresses(id),
  status              varchar(20) NOT NULL DEFAULT 'pending',
  total_cents         integer NOT NULL DEFAULT 0,
  placed_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_customer ON orders (customer_id, placed_at);
CREATE TABLE order_items (
  order_id    bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  bigint NOT NULL REFERENCES products(id),
  quantity    integer NOT NULL DEFAULT 1,
  unit_cents  integer NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
CREATE TABLE payments (
  id         bigserial PRIMARY KEY,
  order_id   bigint NOT NULL UNIQUE REFERENCES orders(id),
  provider   varchar(30) NOT NULL,
  paid_cents integer NOT NULL,
  paid_at    timestamptz
);
CREATE TABLE reviews (
  id          bigserial PRIMARY KEY,
  product_id  bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id bigint NOT NULL REFERENCES customers(id),
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        text
);
`;

export const BLOG_SQL = `
CREATE TYPE post_status AS ENUM ('draft', 'published', 'archived');
CREATE TABLE users (
  id         serial PRIMARY KEY,
  username   varchar(40) NOT NULL UNIQUE,
  email      varchar(190) NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE profiles (
  user_id  int PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio      text,
  avatar   text
);
CREATE TABLE categories (
  id    serial PRIMARY KEY,
  name  varchar(60) NOT NULL UNIQUE
);
CREATE TABLE posts (
  id           serial PRIMARY KEY,
  author_id    int NOT NULL REFERENCES users(id),
  category_id  int REFERENCES categories(id),
  title        text NOT NULL,
  body         text NOT NULL,
  status       post_status NOT NULL DEFAULT 'draft',
  published_at timestamp
);
CREATE INDEX idx_posts_author ON posts (author_id);
CREATE TABLE comments (
  id         serial PRIMARY KEY,
  post_id    int NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    int NOT NULL REFERENCES users(id),
  parent_id  int REFERENCES comments(id),
  body       text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE tags (
  id    serial PRIMARY KEY,
  name  varchar(40) NOT NULL UNIQUE
);
CREATE TABLE post_tags (
  post_id  int NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id   int NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
`;

function fromSql(sql: string, title: string): Diagram {
  const d = schemaToDiagram(parseSql(sql).schema);
  const minX = Math.min(...d.nodes.map((n) => n.position.x));
  const minY = Math.min(...d.nodes.map((n) => n.position.y));
  const heading: DiagramNode = { id: 'er_title', type: 'text', position: { x: minX, y: minY - 80 }, width: 640, height: 40, data: { label: title, fontSize: 28, bold: true } };
  return { version: 1, nodes: [heading, ...d.nodes], edges: d.edges };
}

export const TEMPLATES: Template[] = [
  { id: 'er-ecommerce', name: 'ER — e-commerce', build: () => fromSql(ECOMMERCE_SQL, 'E-commerce schema') },
  { id: 'er-blog', name: 'ER — blog', build: () => fromSql(BLOG_SQL, 'Blog schema') },
  { id: 'er-seedora-demo', name: 'ER — Seedora demo', build: () => fromSql(demoLarge, 'Seedora demo schema') },
];
