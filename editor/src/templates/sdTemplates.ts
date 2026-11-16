import { builder } from './builder';
import type { Template } from './monitoringStack';
import type { Diagram } from '../types';

type B = ReturnType<typeof builder>;
const title = (b: B, t: string, sub: string) => b.text('title', t, 0, -90, 760, 40, { fontSize: 28, bold: true, textColor: '#1f2430', subtitle: sub });
const RL: ['right', 'left'] = ['right', 'left'];
const BT: ['bottom', 'top'] = ['bottom', 'top'];
const TB: ['top', 'bottom'] = ['top', 'bottom'];
const LR: ['left', 'right'] = ['left', 'right'];

/** bit.ly style: client -> LB -> API (+ key generator) -> cache / DB, async click analytics. */
function urlShortener(): Diagram {
  const b = builder();
  title(b, 'System design — URL shortener', 'read-heavy, cache first');
  b.icon('client', 'Client', 'browser', 0, 200);
  b.icon('lb', 'Load balancer', 'load-balancer', 220, 200);
  b.icon('api', 'Shortener API', 'service', 440, 200, undefined, { subtitle: 'create / redirect' });
  b.icon('kgs', 'Key generator', 'service', 440, 0, undefined, { subtitle: 'pre-made base62 IDs' });
  b.plainGroup('store', 'Storage', 700, 110, 440, 240, { variant: 'dashed' });
  b.icon('cache', 'Cache', 'cache', 40, 70, 'store', { subtitle: 'hot short codes' });
  b.icon('db', 'URL database', 'database', 240, 70, 'store', { subtitle: 'code -> long URL' });
  b.icon('queue', 'Click events', 'queue', 440, 430, undefined, { subtitle: 'analytics' });
  b.icon('worker', 'Analytics worker', 'worker', 700, 430);
  b.icon('wh', 'Data warehouse', 'data-warehouse', 920, 430);
  b.link('client', 'lb', { label: 'HTTPS', pins: RL });
  b.link('lb', 'api', { pins: RL });
  b.link('api', 'kgs', { label: 'next key', pins: TB });
  b.link('api', 'cache', { label: 'lookup', pins: RL });
  b.link('cache', 'db', { label: 'miss', pins: RL });
  b.link('api', 'queue', { label: '301 + click', pins: BT, dashed: true });
  b.link('queue', 'worker', { pins: RL, dashed: true });
  b.link('worker', 'wh', { label: 'aggregate', pins: RL });
  return b.done();
}

/** Realtime chat: WebSocket gateway, presence, chat service, queue, NoSQL message store, push, media. */
function chat(): Diagram {
  const b = builder();
  title(b, 'System design — realtime chat', 'persistent connections, offline push');
  b.icon('alice', 'Sender app', 'mobile', 0, 60);
  b.icon('bob', 'Receiver app', 'mobile', 0, 380);
  b.icon('ws', 'WebSocket gateway', 'websocket', 240, 220, undefined, { subtitle: 'sticky connections' });
  b.plainGroup('core', 'Backend', 480, 20, 440, 460, { variant: 'dashed' });
  b.icon('chat', 'Chat service', 'service', 40, 70, 'core');
  b.icon('presence', 'Presence', 'cache', 240, 70, 'core', { subtitle: 'online / last seen' });
  b.icon('mq', 'Message queue', 'queue', 40, 260, 'core');
  b.icon('store', 'Message store', 'nosql', 240, 260, 'core', { subtitle: 'by conversation' });
  b.icon('push', 'Push notifications', 'push', 1000, 60);
  b.icon('media', 'Media storage', 'object-storage', 1000, 300, undefined, { subtitle: 'images, files' });
  b.link('alice', 'ws', { label: 'send', pins: RL });
  b.link('ws', 'bob', { label: 'deliver', pins: LR });
  b.link('ws', 'chat', { label: 'route', pins: RL });
  b.link('ws', 'presence', { label: 'heartbeat', pins: RL });
  b.link('chat', 'mq', { label: 'publish', pins: BT, dashed: true });
  b.link('mq', 'store', { label: 'persist', pins: RL });
  b.link('chat', 'push', { label: 'user offline', pins: RL, dashed: true });
  b.link('chat', 'media', { label: 'signed URL', pins: RL });
  return b.done();
}

/** News feed: fan-out on write through workers into per-user feed caches. */
function newsFeed(): Diagram {
  const b = builder();
  title(b, 'System design — news feed', 'fan-out on write');
  b.icon('user', 'User', 'user', 0, 230);
  b.icon('gw', 'API gateway', 'api-gateway', 220, 230);
  b.icon('post', 'Post service', 'service', 460, 40);
  b.icon('feed', 'Feed service', 'service', 460, 480);
  b.icon('postdb', 'Posts DB', 'database', 720, 0);
  b.icon('media', 'Media storage', 'object-storage', 720, 160);
  b.icon('cdn', 'Media CDN', 'cdn', 960, 160);
  b.icon('queue', 'Post events', 'queue', 720, 320);
  b.icon('workers', 'Fan-out workers', 'worker', 960, 320);
  b.icon('graph', 'Graph DB', 'database', 1200, 320, undefined, { subtitle: 'followers' });
  b.icon('fcache', 'Feed cache', 'cache', 960, 480, undefined, { subtitle: 'per-user timelines' });
  b.link('user', 'gw', { pins: RL });
  b.link('gw', 'post', { label: 'POST /post', pins: RL });
  b.link('gw', 'feed', { label: 'GET /feed', pins: RL });
  b.link('post', 'postdb', { label: 'save', pins: RL });
  b.link('post', 'media', { label: 'upload', pins: RL });
  b.link('media', 'cdn', { label: 'origin', pins: RL });
  b.link('post', 'queue', { label: 'new post', pins: RL, dashed: true });
  b.link('queue', 'workers', { pins: RL, dashed: true });
  b.link('workers', 'graph', { label: 'followers', pins: RL });
  b.link('workers', 'fcache', { label: 'push to feeds', pins: BT });
  b.link('feed', 'fcache', { label: 'read', pins: RL });
  return b.done();
}

/** Rate limiter as gateway middleware with Redis counters and a 429 path. */
function rateLimiter(): Diagram {
  const b = builder();
  title(b, 'System design — rate limiter', 'token bucket in Redis');
  b.icon('client', 'Client', 'browser', 0, 200);
  b.icon('gw', 'API gateway', 'api-gateway', 240, 200);
  b.icon('rl', 'Rate limiter', 'rate-limiter', 480, 200, undefined, { subtitle: 'middleware' });
  b.icon('redis', 'Redis counters', 'cache', 480, 420, undefined, { subtitle: 'INCR + TTL' });
  b.icon('rules', 'Rules config', 'database', 480, 0, undefined, { subtitle: 'limits per key' });
  b.icon('admin', 'Ops admin', 'admin', 240, 0);
  b.icon('api', 'Backend API', 'service', 760, 200);
  b.icon('reject', '429 Too Many Requests', 'firewall', 760, 420, undefined, { subtitle: 'Retry-After header' });
  b.link('client', 'gw', { label: 'request', pins: RL });
  b.link('gw', 'rl', { label: 'check', pins: RL });
  b.link('rl', 'redis', { label: 'count', pins: BT });
  b.link('rules', 'rl', { label: 'load rules', pins: BT, dashed: true });
  b.link('admin', 'rules', { label: 'update', pins: RL });
  b.link('rl', 'api', { label: 'allowed', pins: RL });
  b.link('rl', 'reject', { label: 'over limit', pins: ['bottom', 'left'], dashed: true, color: '#d33' });
  b.link('reject', 'client', { label: 'HTTP 429', pins: ['bottom', 'bottom'], dashed: true, color: '#d33', labelT: 0.5 });
  return b.done();
}

/** Video streaming: upload -> raw bucket -> transcode queue/workers -> encoded segments -> CDN. */
function videoStreaming(): Diagram {
  const b = builder();
  title(b, 'System design — video streaming', 'upload, transcode, deliver via CDN');
  b.icon('creator', 'Creator', 'user', 0, 100);
  b.icon('upload', 'Upload service', 'service', 220, 100);
  b.icon('raw', 'Raw video', 'object-storage', 440, 100);
  b.icon('queue', 'Transcode jobs', 'queue', 660, 100);
  b.icon('workers', 'Transcoding workers', 'worker', 880, 100, undefined, { subtitle: '240p - 4K' });
  b.icon('out', 'Encoded segments', 'object-storage', 880, 300, undefined, { subtitle: 'HLS / DASH' });
  b.icon('meta', 'Metadata DB', 'database', 220, 300);
  b.icon('search', 'Search index', 'search', 220, 460);
  b.icon('cdn', 'CDN', 'cdn', 880, 680);
  b.icon('viewer', 'Viewer', 'user', 0, 680);
  b.link('creator', 'upload', { label: 'upload', pins: RL });
  b.link('upload', 'raw', { label: 'store', pins: RL });
  b.link('raw', 'queue', { label: 'object created', pins: RL, dashed: true });
  b.link('queue', 'workers', { pins: RL, dashed: true });
  b.link('workers', 'out', { label: 'write segments', pins: BT });
  b.link('upload', 'meta', { label: 'title, status', pins: BT });
  b.link('meta', 'search', { label: 'index', pins: BT, dashed: true });
  b.link('out', 'cdn', { label: 'origin pull', pins: BT });
  b.link('viewer', 'cdn', { label: 'stream HLS', pins: RL });
  b.link('viewer', 'search', { label: 'query', pins: ['top', 'left'] });
  return b.done();
}

/** Ride hailing: apps, WebSocket location stream, geo index, matching, trips, payments, events. */
function rideHailing(): Diagram {
  const b = builder();
  title(b, 'System design — ride hailing', 'location streaming and driver matching');
  b.icon('rider', 'Rider app', 'mobile', 0, 60);
  b.icon('driver', 'Driver app', 'mobile', 0, 420);
  b.icon('gw', 'API gateway', 'api-gateway', 240, 60);
  b.icon('ws', 'WebSocket gateway', 'websocket', 240, 420, undefined, { subtitle: 'GPS pings' });
  b.icon('loc', 'Location service', 'service', 480, 420);
  b.icon('geo', 'Geo index', 'cache', 720, 420, undefined, { subtitle: 'geohash cells' });
  b.icon('match', 'Matching service', 'service', 720, 60);
  b.icon('trip', 'Trip service', 'service', 960, 60);
  b.icon('tripdb', 'Trips DB', 'database', 1200, 60);
  b.icon('events', 'Trip events', 'pubsub', 960, 240);
  b.icon('pay', 'Payment', 'payment', 1200, 240);
  b.link('rider', 'gw', { label: 'request ride', pins: RL });
  b.link('gw', 'match', { pins: RL });
  b.link('driver', 'ws', { label: 'location', pins: RL });
  b.link('ws', 'loc', { label: 'stream', pins: RL });
  b.link('loc', 'geo', { label: 'update', pins: RL });
  b.link('match', 'geo', { label: 'nearby drivers', pins: BT });
  b.link('match', 'trip', { label: 'assign', pins: RL });
  b.link('trip', 'tripdb', { pins: RL });
  b.link('trip', 'events', { label: 'state change', pins: BT, dashed: true });
  b.link('events', 'pay', { label: 'trip completed', pins: RL, dashed: true });
  return b.done();
}

/** Notification system: event bus, prefs, per-channel queues + workers, providers, retry / DLQ. */
function notification(): Diagram {
  const b = builder();
  title(b, 'System design — notification system', 'per-channel queues with retry and DLQ');
  b.icon('orders', 'Order service', 'service', 0, 60);
  b.icon('auth', 'Auth service', 'auth-service', 0, 420);
  b.icon('bus', 'Event bus', 'event-bus', 220, 240);
  b.icon('notif', 'Notification service', 'service', 440, 240, undefined, { subtitle: 'templates, dedupe' });
  b.icon('prefs', 'User prefs DB', 'database', 440, 20);
  b.icon('qe', 'Email queue', 'queue', 700, 60);
  b.icon('qs', 'SMS queue', 'queue', 700, 240);
  b.icon('qp', 'Push queue', 'queue', 700, 420);
  b.icon('we', 'Email worker', 'worker', 920, 60);
  b.icon('wsms', 'SMS worker', 'worker', 920, 240);
  b.icon('wp', 'Push worker', 'worker', 920, 420);
  b.icon('pe', 'Email provider', 'third-party-api', 1140, 60);
  b.icon('ps', 'SMS gateway', 'third-party-api', 1140, 240);
  b.icon('pp', 'APNs / FCM', 'third-party-api', 1140, 420);
  b.icon('dlq', 'Dead-letter queue', 'queue', 920, 600);
  b.link('orders', 'bus', { label: 'OrderPlaced', pins: RL });
  b.link('auth', 'bus', { label: 'LoginAlert', pins: RL });
  b.link('bus', 'notif', { label: 'event', pins: RL });
  b.link('notif', 'prefs', { label: 'check prefs', pins: TB });
  b.link('notif', 'qe', { pins: RL, dashed: true });
  b.link('notif', 'qs', { pins: RL, dashed: true });
  b.link('notif', 'qp', { pins: RL, dashed: true });
  b.link('qe', 'we', { pins: RL, dashed: true });
  b.link('qs', 'wsms', { pins: RL, dashed: true });
  b.link('qp', 'wp', { pins: RL, dashed: true });
  b.link('we', 'pe', { label: 'send', pins: RL });
  b.link('wsms', 'ps', { label: 'send', pins: RL });
  b.link('wp', 'pp', { label: 'send', pins: RL });
  b.link('we', 'qe', { label: 'retry', pins: ['top', 'top'], dashed: true });
  b.link('wp', 'dlq', { label: 'failed after N retries', pins: BT, dashed: true });
  return b.done();
}

/** Web crawler: seed URLs -> frontier -> fetchers -> parser -> content store, with a link extractor loop. */
function webCrawler(): Diagram {
  const b = builder();
  title(b, 'System design — web crawler', 'frontier, politeness, dedupe');
  b.icon('seeds', 'Seed URLs', 'file-storage', 0, 200);
  b.icon('frontier', 'URL frontier', 'queue', 220, 200, undefined, { subtitle: 'priority + politeness' });
  b.icon('fetch', 'Fetchers', 'worker', 440, 200);
  b.icon('dns', 'DNS resolver', 'dns', 440, 0);
  b.icon('web', 'Web', 'internet', 440, 400);
  b.icon('parser', 'Parser', 'service', 680, 200, undefined, { subtitle: 'HTML to text' });
  b.icon('store', 'Content store', 'object-storage', 920, 200);
  b.icon('index', 'Search index', 'search', 1160, 200);
  b.icon('links', 'Link extractor', 'worker', 680, 400);
  b.icon('seen', 'Seen-URL cache', 'cache', 920, 400, undefined, { subtitle: 'bloom filter' });
  b.link('seeds', 'frontier', { label: 'seed', pins: RL });
  b.link('frontier', 'fetch', { label: 'next URL', pins: RL });
  b.link('fetch', 'dns', { label: 'resolve', pins: TB });
  b.link('fetch', 'web', { label: 'GET', pins: BT });
  b.link('fetch', 'parser', { label: 'HTML', pins: RL });
  b.link('parser', 'store', { label: 'save page', pins: RL });
  b.link('store', 'index', { pins: RL, dashed: true });
  b.link('parser', 'links', { pins: BT });
  b.link('links', 'seen', { label: 'seen?', pins: RL });
  b.link('links', 'frontier', { label: 'new URLs', pins: ['bottom', 'bottom'], dashed: true });
  return b.done();
}

const tags = (t: string) => ['system-design', 'architecture', t];
export const TEMPLATES: Template[] = [
  { id: 'sd-url-shortener', name: 'System design — URL shortener', tags: tags('url-shortener'), build: urlShortener },
  { id: 'sd-chat', name: 'System design — realtime chat', tags: tags('chat'), build: chat },
  { id: 'sd-news-feed', name: 'System design — news feed', tags: tags('news-feed'), build: newsFeed },
  { id: 'sd-rate-limiter', name: 'System design — rate limiter', tags: tags('rate-limiter'), build: rateLimiter },
  { id: 'sd-video-streaming', name: 'System design — video streaming', tags: tags('video'), build: videoStreaming },
  { id: 'sd-ride-hailing', name: 'System design — ride hailing', tags: tags('ride-hailing'), build: rideHailing },
  { id: 'sd-notification', name: 'System design — notification system', tags: tags('notification'), build: notification },
  { id: 'sd-web-crawler', name: 'System design — web crawler', tags: tags('crawler'), build: webCrawler },
];
