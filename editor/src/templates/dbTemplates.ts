import type { Template } from './monitoringStack';
import { fromSql } from './erTemplates';

const SAAS_SQL = `
CREATE TYPE plan_tier AS ENUM ('free', 'team', 'enterprise');
CREATE TABLE tenants (
  id         bigserial PRIMARY KEY,
  slug       varchar(60) NOT NULL UNIQUE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
  id            bigserial PRIMARY KEY,
  email         varchar(190) NOT NULL UNIQUE,
  full_name     text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE roles (
  id        serial PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name      varchar(40) NOT NULL,
  can_admin boolean NOT NULL DEFAULT false
);
CREATE TABLE memberships (
  tenant_id bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id   bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id   int NOT NULL REFERENCES roles(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE TABLE projects (
  id         bigserial PRIMARY KEY,
  tenant_id  bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_id   bigint REFERENCES users(id),
  name       text NOT NULL,
  archived   boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_projects_tenant ON projects (tenant_id);
CREATE TABLE subscriptions (
  id         bigserial PRIMARY KEY,
  tenant_id  bigint NOT NULL UNIQUE REFERENCES tenants(id),
  plan       plan_tier NOT NULL DEFAULT 'free',
  seats      integer NOT NULL DEFAULT 1,
  renews_at  timestamptz
);
CREATE TABLE invoices (
  id              bigserial PRIMARY KEY,
  subscription_id bigint NOT NULL REFERENCES subscriptions(id),
  amount_cents    integer NOT NULL,
  status          varchar(20) NOT NULL DEFAULT 'open',
  issued_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  tenant_id  bigint NOT NULL REFERENCES tenants(id),
  actor_id   bigint REFERENCES users(id),
  action     varchar(80) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

const BANKING_SQL = `
CREATE TYPE account_kind AS ENUM ('checking', 'savings', 'credit');
CREATE TABLE customers (
  id         bigserial PRIMARY KEY,
  national_id varchar(30) NOT NULL UNIQUE,
  full_name  text NOT NULL,
  email      varchar(190) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE branches (
  id    serial PRIMARY KEY,
  name  text NOT NULL,
  city  text NOT NULL
);
CREATE TABLE accounts (
  id          bigserial PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES customers(id),
  branch_id   int REFERENCES branches(id),
  iban        varchar(34) NOT NULL UNIQUE,
  kind        account_kind NOT NULL DEFAULT 'checking',
  currency    char(3) NOT NULL,
  opened_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE transfers (
  id              bigserial PRIMARY KEY,
  from_account_id bigint NOT NULL REFERENCES accounts(id),
  to_account_id   bigint NOT NULL REFERENCES accounts(id),
  amount_cents    bigint NOT NULL CHECK (amount_cents > 0),
  status          varchar(20) NOT NULL DEFAULT 'pending',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ledger_entries (
  id            bigserial PRIMARY KEY,
  account_id    bigint NOT NULL REFERENCES accounts(id),
  transfer_id   bigint REFERENCES transfers(id),
  amount_cents  bigint NOT NULL,
  balance_after bigint NOT NULL,
  posted_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_account ON ledger_entries (account_id, posted_at);
CREATE TABLE cards (
  id          bigserial PRIMARY KEY,
  account_id  bigint NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pan_last4   char(4) NOT NULL,
  expires_on  date NOT NULL,
  blocked     boolean NOT NULL DEFAULT false
);
CREATE TABLE card_transactions (
  id          bigserial PRIMARY KEY,
  card_id     bigint NOT NULL REFERENCES cards(id),
  merchant    text NOT NULL,
  amount_cents integer NOT NULL,
  authorized_at timestamptz NOT NULL DEFAULT now()
);
`;

const CHAT_SQL = `
CREATE TYPE conversation_kind AS ENUM ('direct', 'group');
CREATE TABLE users (
  id         bigserial PRIMARY KEY,
  username   varchar(40) NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE conversations (
  id         bigserial PRIMARY KEY,
  kind       conversation_kind NOT NULL DEFAULT 'direct',
  title      text,
  created_by bigint REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE participants (
  conversation_id bigint NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE TABLE messages (
  id              bigserial PRIMARY KEY,
  conversation_id bigint NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       bigint NOT NULL REFERENCES users(id),
  reply_to_id     bigint REFERENCES messages(id),
  body            text,
  sent_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conv ON messages (conversation_id, sent_at);
CREATE TABLE attachments (
  id         bigserial PRIMARY KEY,
  message_id bigint NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  url        text NOT NULL,
  mime_type  varchar(80) NOT NULL,
  size_bytes bigint NOT NULL
);
CREATE TABLE reactions (
  message_id bigint NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      varchar(16) NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);
CREATE TABLE read_receipts (
  conversation_id    bigint NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id            bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id bigint REFERENCES messages(id),
  read_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
`;

const RIDE_SQL = `
CREATE TYPE trip_status AS ENUM ('requested', 'accepted', 'in_progress', 'completed', 'cancelled');
CREATE TABLE riders (
  id         bigserial PRIMARY KEY,
  full_name  text NOT NULL,
  phone      varchar(20) NOT NULL UNIQUE,
  rating     smallint
);
CREATE TABLE drivers (
  id         bigserial PRIMARY KEY,
  full_name  text NOT NULL,
  phone      varchar(20) NOT NULL UNIQUE,
  license_no varchar(40) NOT NULL UNIQUE,
  online     boolean NOT NULL DEFAULT false
);
CREATE TABLE vehicles (
  id         bigserial PRIMARY KEY,
  driver_id  bigint NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  plate      varchar(16) NOT NULL UNIQUE,
  model      text NOT NULL,
  seats      smallint NOT NULL DEFAULT 4
);
CREATE TABLE trips (
  id          bigserial PRIMARY KEY,
  rider_id    bigint NOT NULL REFERENCES riders(id),
  driver_id   bigint REFERENCES drivers(id),
  vehicle_id  bigint REFERENCES vehicles(id),
  status      trip_status NOT NULL DEFAULT 'requested',
  pickup_lat  double precision NOT NULL,
  pickup_lng  double precision NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_trips_rider ON trips (rider_id, requested_at);
CREATE TABLE trip_locations (
  id         bigserial PRIMARY KEY,
  trip_id    bigint NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  lat        double precision NOT NULL,
  lng        double precision NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payments (
  id          bigserial PRIMARY KEY,
  trip_id     bigint NOT NULL UNIQUE REFERENCES trips(id),
  fare_cents  integer NOT NULL,
  method      varchar(20) NOT NULL,
  paid_at     timestamptz
);
CREATE TABLE ratings (
  id         bigserial PRIMARY KEY,
  trip_id    bigint NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  rider_id   bigint REFERENCES riders(id),
  driver_id  bigint REFERENCES drivers(id),
  stars      smallint NOT NULL CHECK (stars BETWEEN 1 AND 5)
);
`;

const LMS_SQL = `
CREATE TABLE users (
  id        bigserial PRIMARY KEY,
  email     varchar(190) NOT NULL UNIQUE,
  full_name text NOT NULL,
  is_teacher boolean NOT NULL DEFAULT false
);
CREATE TABLE courses (
  id         bigserial PRIMARY KEY,
  teacher_id bigint NOT NULL REFERENCES users(id),
  title      text NOT NULL,
  summary    text,
  published  boolean NOT NULL DEFAULT false
);
CREATE TABLE lessons (
  id         bigserial PRIMARY KEY,
  course_id  bigint NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position   integer NOT NULL,
  title      text NOT NULL,
  video_url  text
);
CREATE TABLE enrollments (
  course_id   bigint NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id  bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (course_id, student_id)
);
CREATE TABLE lesson_progress (
  lesson_id  bigint NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  done_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lesson_id, student_id)
);
CREATE TABLE quizzes (
  id         bigserial PRIMARY KEY,
  lesson_id  bigint NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  title      text NOT NULL,
  pass_score smallint NOT NULL DEFAULT 60
);
CREATE TABLE questions (
  id        bigserial PRIMARY KEY,
  quiz_id   bigint NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  body      text NOT NULL,
  answer    text NOT NULL
);
CREATE TABLE submissions (
  id         bigserial PRIMARY KEY,
  quiz_id    bigint NOT NULL REFERENCES quizzes(id),
  student_id bigint NOT NULL REFERENCES users(id),
  score      smallint NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
`;

const HOTEL_SQL = `
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled');
CREATE TABLE hotels (
  id      serial PRIMARY KEY,
  name    text NOT NULL,
  city    text NOT NULL,
  stars   smallint
);
CREATE TABLE room_types (
  id          serial PRIMARY KEY,
  hotel_id    int NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name        varchar(60) NOT NULL,
  capacity    smallint NOT NULL,
  price_cents integer NOT NULL
);
CREATE TABLE rooms (
  id           serial PRIMARY KEY,
  room_type_id int NOT NULL REFERENCES room_types(id),
  number       varchar(10) NOT NULL,
  floor        smallint
);
CREATE TABLE guests (
  id        bigserial PRIMARY KEY,
  email     varchar(190) NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone     varchar(20)
);
CREATE TABLE bookings (
  id         bigserial PRIMARY KEY,
  guest_id   bigint NOT NULL REFERENCES guests(id),
  room_id    int NOT NULL REFERENCES rooms(id),
  check_in   date NOT NULL,
  check_out  date NOT NULL,
  status     booking_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bookings_room ON bookings (room_id, check_in);
CREATE TABLE payments (
  id          bigserial PRIMARY KEY,
  booking_id  bigint NOT NULL REFERENCES bookings(id),
  amount_cents integer NOT NULL,
  paid_at     timestamptz
);
CREATE TABLE services (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  price_cents integer NOT NULL
);
CREATE TABLE booking_services (
  booking_id bigint NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id int NOT NULL REFERENCES services(id),
  quantity   integer NOT NULL DEFAULT 1,
  PRIMARY KEY (booking_id, service_id)
);
CREATE TABLE reviews (
  id         bigserial PRIMARY KEY,
  hotel_id   int NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  guest_id   bigint NOT NULL REFERENCES guests(id),
  rating     smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       text
);
`;

const SOCIAL_SQL = `
CREATE TABLE users (
  id         bigserial PRIMARY KEY,
  handle     varchar(30) NOT NULL UNIQUE,
  email      varchar(190) NOT NULL UNIQUE,
  bio        text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE follows (
  follower_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id)
);
CREATE TABLE posts (
  id         bigserial PRIMARY KEY,
  author_id  bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_posts_author ON posts (author_id, created_at);
CREATE TABLE comments (
  id         bigserial PRIMARY KEY,
  post_id    bigint NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  bigint NOT NULL REFERENCES users(id),
  parent_id  bigint REFERENCES comments(id),
  body       text NOT NULL
);
CREATE TABLE likes (
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    bigint NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
CREATE TABLE media (
  id       bigserial PRIMARY KEY,
  post_id  bigint NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  url      text NOT NULL,
  kind     varchar(10) NOT NULL
);
CREATE TABLE notifications (
  id         bigserial PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id   bigint REFERENCES users(id),
  kind       varchar(20) NOT NULL,
  seen       boolean NOT NULL DEFAULT false
);
`;

const INVENTORY_SQL = `
CREATE TYPE po_status AS ENUM ('draft', 'ordered', 'received', 'cancelled');
CREATE TABLE warehouses (
  id    serial PRIMARY KEY,
  code  varchar(10) NOT NULL UNIQUE,
  name  text NOT NULL,
  city  text NOT NULL
);
CREATE TABLE suppliers (
  id      serial PRIMARY KEY,
  name    text NOT NULL,
  email   varchar(190),
  lead_days smallint NOT NULL DEFAULT 7
);
CREATE TABLE products (
  id          bigserial PRIMARY KEY,
  sku         varchar(40) NOT NULL UNIQUE,
  name        text NOT NULL,
  supplier_id int REFERENCES suppliers(id),
  unit_cost_cents integer NOT NULL
);
CREATE TABLE stock_levels (
  warehouse_id int NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  product_id   bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity     integer NOT NULL DEFAULT 0,
  reorder_point integer NOT NULL DEFAULT 10,
  PRIMARY KEY (warehouse_id, product_id)
);
CREATE TABLE purchase_orders (
  id           bigserial PRIMARY KEY,
  supplier_id  int NOT NULL REFERENCES suppliers(id),
  warehouse_id int NOT NULL REFERENCES warehouses(id),
  status       po_status NOT NULL DEFAULT 'draft',
  ordered_at   timestamptz
);
CREATE TABLE purchase_order_lines (
  purchase_order_id bigint NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id        bigint NOT NULL REFERENCES products(id),
  quantity          integer NOT NULL,
  unit_cost_cents   integer NOT NULL,
  PRIMARY KEY (purchase_order_id, product_id)
);
CREATE TABLE stock_movements (
  id           bigserial PRIMARY KEY,
  warehouse_id int NOT NULL REFERENCES warehouses(id),
  product_id   bigint NOT NULL REFERENCES products(id),
  delta        integer NOT NULL,
  reason       varchar(30) NOT NULL,
  moved_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_movements_product ON stock_movements (product_id, moved_at);
`;

const defs: [string, string, string, string, string][] = [
  ['db-saas-multitenant', 'DB — SaaS multi-tenant', 'Multi-tenant SaaS schema', SAAS_SQL, 'saas'],
  ['db-banking-ledger', 'DB — banking ledger', 'Banking ledger schema', BANKING_SQL, 'banking'],
  ['db-chat', 'DB — chat', 'Chat schema', CHAT_SQL, 'chat'],
  ['db-ride-hailing', 'DB — ride hailing', 'Ride hailing schema', RIDE_SQL, 'ride-hailing'],
  ['db-lms', 'DB — learning platform (LMS)', 'Learning platform schema', LMS_SQL, 'lms'],
  ['db-hotel-booking', 'DB — hotel booking', 'Hotel booking schema', HOTEL_SQL, 'hotel'],
  ['db-social-network', 'DB — social network', 'Social network schema', SOCIAL_SQL, 'social'],
  ['db-inventory', 'DB — inventory & purchasing', 'Inventory schema', INVENTORY_SQL, 'inventory'],
];
export const TEMPLATES: Template[] = defs.map(([id, name, title, sql, topic]) => ({ id, name, tags: ['db', 'er', 'schema', topic], build: () => fromSql(sql, title) }));
