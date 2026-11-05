-- PostgreSQL fixture: quoted identifiers, enums, composite keys, ALTER TABLE constraints, indexes, comments
/* block
   comment; with a semicolon */
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'it''s done');
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SEQUENCE seq_x;

CREATE TABLE public."Users" (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "e-mail" character varying(255) NOT NULL UNIQUE,
  name text DEFAULT 'a;b, c' NOT NULL,
  age integer CHECK (age >= 0 AND age < 150),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  tags text[]
);
COMMENT ON TABLE public."Users" IS 'people';
COMMENT ON COLUMN public."Users".name IS 'display name';

CREATE TABLE orders (
  id bigserial,
  user_id uuid NOT NULL,
  status order_status NOT NULL DEFAULT 'pending',
  total numeric(10, 2) NOT NULL DEFAULT 0,
  note text,
  CONSTRAINT orders_pk PRIMARY KEY (id),
  CONSTRAINT orders_user_fk FOREIGN KEY (user_id) REFERENCES public."Users" (id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT positive CHECK (total >= 0)
);

CREATE TABLE order_items (
  order_id bigint,
  line int,
  sku text NOT NULL,
  qty int NOT NULL DEFAULT 1,
  PRIMARY KEY (order_id, line)
);
ALTER TABLE ONLY order_items
  ADD CONSTRAINT order_items_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD CONSTRAINT sku_unique UNIQUE (order_id, sku);

CREATE TABLE employees (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  manager_id int REFERENCES employees(id),
  full_name text GENERATED ALWAYS AS (first || ' ' || last) STORED
);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user_status ON orders USING btree (user_id, status) WHERE status <> 'pending';
CREATE INDEX idx_lower_email ON public."Users" (lower("e-mail"));
CREATE VIEW paid_orders AS SELECT id, user_id AS buyer FROM orders WHERE status = 'paid';
INSERT INTO orders VALUES (1, 'x', 'paid', 1, 'CREATE TABLE fake (a int);');
