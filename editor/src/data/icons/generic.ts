// Clean generic icons for non-brand items. 24x24, stroke only, round caps/joins, 1.6 width.
export interface GenericIcon {
  title: string;
  hex: string;
  paths: string[];
}

const G = (title: string, hex: string, ...paths: string[]): GenericIcon => ({ title, hex, paths });
const CIRCLE = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0 ${r} ${r} 0 1 0 ${-2 * r} 0z`;
const CLOUD = 'M6.5 18.5a4 4 0 01-.5-7.97 6 6 0 0111.6 1.1A3.5 3.5 0 0117.5 18.5z';
const GLOBE = [CIRCLE(12, 12, 9), 'M3 12h18', 'M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z'];
const SHIELD = 'M12 3l8 3v5.5c0 4.5-3.2 8-8 9.5-4.8-1.5-8-5-8-9.5V6z';
const CYL = ['M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3z', 'M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'];
const CUBE = ['M12 2.5l8.5 4.5v10L12 21.5 3.5 17V7z', 'M3.5 7L12 11.5 20.5 7', 'M12 11.5v10'];
const BUCKET = ['M4 7c0 1.7 3.6 3 8 3s8-1.3 8-3-3.6-3-8-3-8 1.3-8 3z', 'M4 7l2 13c0 .9 2.7 1.5 6 1.5s6-.6 6-1.5l2-13'];

export const GENERIC_ICONS: Record<string, GenericIcon> = {
  // clients
  user: G('User', '475569', CIRCLE(12, 8, 4), 'M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6'),
  users: G('Users', '475569', CIRCLE(9, 7.5, 3.5), 'M2.5 19.5c0-3.2 3-5.5 6.5-5.5s6.5 2.3 6.5 5.5', 'M16 4.3a3.5 3.5 0 010 6.4', 'M18 14.3c2.2.6 3.5 2.4 3.5 5.2'),
  browser: G('Web browser', '475569', 'M3 5h18v14H3z', 'M3 9h18', 'M6 7h.01', 'M9 7h.01'),
  mobile: G('Mobile app', '475569', 'M7 2.5h10a1 1 0 011 1v17a1 1 0 01-1 1H7a1 1 0 01-1-1v-17a1 1 0 011-1z', 'M10.5 18.5h3'),
  desktop: G('Desktop app', '475569', 'M3 4h18v12H3z', 'M8 20h8', 'M12 16v4'),
  iot: G('IoT device', '475569', 'M7 7h10v10H7z', 'M10 10h4v4h-4z', 'M10 7V4', 'M14 7V4', 'M10 20v-3', 'M14 20v-3', 'M7 10H4', 'M7 14H4', 'M20 10h-3', 'M20 14h-3'),
  admin: G('Admin', '475569', CIRCLE(10, 7.5, 3.5), 'M3.5 20c0-3.3 3-5.5 6.5-5.5', 'M17.5 13l3 1.2v2.6c0 2-1.4 3.4-3 4-1.6-.6-3-2-3-4v-2.6z'),
  // network / edge
  dns: G('DNS', '0f766e', ...GLOBE),
  cdn: G('CDN', '0f766e', CIRCLE(12, 4, 2), CIRCLE(5, 19, 2), CIRCLE(19, 19, 2), 'M12 6v5', 'M12 11l-6 6.2', 'M12 11l6 6.2'),
  'load-balancer': G('Load balancer', '0f766e', 'M3 12h6', 'M9 12l6-6h6', 'M9 12h12', 'M9 12l6 6h6', 'M18.5 4l2.5 2-2.5 2', 'M18.5 10l2.5 2-2.5 2', 'M18.5 16l2.5 2-2.5 2'),
  'api-gateway': G('API gateway', '0f766e', 'M4 20V9a8 8 0 0116 0v11', 'M9 20v-7h6v7', 'M2 20h20'),
  'reverse-proxy': G('Reverse proxy', '0f766e', 'M2 12h6', 'M16 12h6', 'M8 6h8v12H8z', 'M19 9l3 3-3 3'),
  firewall: G('Firewall', 'b91c1c', 'M3 5h18v14H3z', 'M3 9.7h18', 'M3 14.3h18', 'M9 5v4.7', 'M15 5v4.7', 'M12 9.7v4.6', 'M7 14.3V19', 'M17 14.3V19'),
  vpn: G('VPN', '0f766e', SHIELD, 'M9.5 11h5v4h-5z', 'M10.5 11V9.5a1.5 1.5 0 013 0V11'),
  internet: G('Internet', '0f766e', CLOUD),
  // compute
  service: G('Service', '3f6fd1', 'M12 2.5l8.5 4.9v9.2L12 21.5l-8.5-4.9V7.4z', CIRCLE(12, 12, 3)),
  server: G('Server', '3f6fd1', 'M4 4h16v6H4z', 'M4 14h16v6H4z', 'M7.5 7h.01', 'M7.5 17h.01', 'M11 7h6', 'M11 17h6'),
  container: G('Container', '3f6fd1', ...CUBE),
  function: G('Serverless function', '3f6fd1', 'M7 4h3.2l7.8 16', 'M5.5 20l5.8-9.5'),
  worker: G('Worker', '3f6fd1', CIRCLE(12, 12, 3), 'M12 2.5v3', 'M12 18.5v3', 'M2.5 12h3', 'M18.5 12h3', 'M5.3 5.3l2.1 2.1', 'M16.6 16.6l2.1 2.1', 'M18.7 5.3l-2.1 2.1', 'M7.4 16.6l-2.1 2.1'),
  cron: G('Cron job', '3f6fd1', CIRCLE(12, 12, 9), 'M12 7v5l3.5 2'),
  'k8s-pod': G('Pod', '326ce5', 'M12 3l7.5 4.3v8.4L12 20l-7.5-4.3V7.3z', 'M12 8l3.5 2v4L12 16l-3.5-2v-4z'),
  'k8s-deployment': G('Deployment', '326ce5', 'M7 3h14v14H7z', 'M3 7v14h14'),
  // data
  database: G('SQL database', '5b6475', ...CYL),
  nosql: G('NoSQL database', '5b6475', 'M6 3h9l4 4v14H6z', 'M15 3v4h4', 'M9 12h7', 'M9 16h7'),
  cache: G('Cache', 'd97706', 'M13 2.5L5 13.5h6l-1 8 8-11h-6z'),
  search: G('Search index', '5b6475', CIRCLE(10.5, 10.5, 7.5), 'M16 16l5 5'),
  'object-storage': G('Object storage', '5b6475', ...BUCKET),
  'file-storage': G('File storage', '5b6475', 'M3 6.5A1.5 1.5 0 014.5 5H10l2 2.5h7.5A1.5 1.5 0 0121 9v9.5a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.5z'),
  'data-warehouse': G('Data warehouse', '5b6475', 'M3 21h18', 'M5 21V9l7-5 7 5v12', 'M9 13h6', 'M9 17h6'),
  'vector-db': G('Vector database', '5b6475', CIRCLE(6, 6, 1.8), CIRCLE(18, 6, 1.8), CIRCLE(12, 12, 1.8), CIRCLE(6, 18, 1.8), CIRCLE(18, 18, 1.8), 'M7.3 7.3l3.4 3.4', 'M16.7 7.3l-3.4 3.4', 'M7.3 16.7l3.4-3.4', 'M16.7 16.7l-3.4-3.4'),
  // messaging
  queue: G('Message queue', 'd97706', 'M3 8h4v8H3z', 'M10 8h4v8h-4z', 'M17 8h4v8h-4z'),
  pubsub: G('Pub/Sub', 'd97706', CIRCLE(12, 12, 2), 'M6 8a6 6 0 000 8', 'M18 8a6 6 0 010 8', 'M3.5 5.5a10 10 0 000 13', 'M20.5 5.5a10 10 0 010 13'),
  'event-bus': G('Event bus', 'd97706', 'M3 12h18', 'M6 12V6', 'M12 12V6', 'M18 12V6', 'M6 12v6', 'M12 12v6', 'M18 12v6'),
  'stream-processor': G('Stream processor', 'd97706', 'M3 5h18l-7 8v6l-4-2v-4z'),
  // auth / security
  'auth-service': G('Auth service', 'b91c1c', SHIELD, 'M9.5 12.5l2 2 3.5-4'),
  'identity-provider': G('Identity provider', 'b91c1c', 'M3 5h18v14H3z', CIRCLE(8, 10, 2), 'M5 16c0-1.7 1.3-3 3-3s3 1.3 3 3', 'M14 9.5h5', 'M14 13h5'),
  secrets: G('Secrets manager', 'b91c1c', CIRCLE(8, 12, 4), 'M12 12h9', 'M18 12v3.5', 'M21 12v2.5'),
  certificate: G('Certificate / TLS', 'b91c1c', 'M3 4h18v12H3z', 'M7 8h10', 'M7 11.5h5', 'M15.5 16l-1 5 2.5-1.5 2.5 1.5-1-5'),
  'rate-limiter': G('Rate limiter', 'b91c1c', 'M4 18a8 8 0 0116 0', 'M12 18l4-6', 'M4 18h16'),
  // cloud (generic)
  cloud: G('Cloud', '0f766e', CLOUD),
  // devops
  'ci-pipeline': G('CI pipeline', '475569', 'M20 12a8 8 0 00-14-5.3L4 9', 'M4 4v5h5', 'M4 12a8 8 0 0014 5.3L20 15', 'M20 20v-5h-5'),
  'container-registry': G('Container registry', '475569', 'M12 3l9 4.5-9 4.5-9-4.5z', 'M3 12l9 4.5 9-4.5', 'M3 16.5l9 4.5 9-4.5'),
  // external
  'third-party-api': G('Third-party API', '475569', 'M8 4v5', 'M16 4v5', 'M6 9h12v4a6 6 0 01-12 0z', 'M12 19v3'),
  payment: G('Payment provider', '475569', 'M3 5h18v14H3z', 'M3 10h18', 'M6.5 15h4'),
  email: G('Email', '475569', 'M3 5h18v14H3z', 'M3 6l9 7 9-7'),
  sms: G('SMS', '475569', 'M4 4h16v12H10l-6 5z', 'M8 8.5h8', 'M8 11.5h5'),
  push: G('Push notification', '475569', 'M6 16v-5a6 6 0 0112 0v5l1.5 2h-15z', 'M10 21h4'),

  producer: G('Producer', '4b5563', 'M4 15v4h16v-4', 'M12 16V4', 'M7 9l5-5 5 5'),
  consumer: G('Consumer', '4b5563', 'M4 15v4h16v-4', 'M12 4v12', 'M7 11l5 5 5-5'),
  'consumer-group': G('Consumer group', '4b5563', 'M3 5h18v14H3z', 'M7 10h.01', 'M12 10h.01', 'M17 10h.01', 'M7 15h10'),
  // network / protocols / identity / hardware / helpers
  router: G('Router', '0f766e', 'M3 14h18v6H3z', 'M7 17h.01', 'M11 17h.01', 'M9 14V8', 'M15 14V8', 'M6 5.5a4 4 0 016 0', 'M12 5.5a4 4 0 016 0'),
  switch: G('Switch', '0f766e', 'M2.5 8h19v8h-19z', 'M6 12h.01', 'M9 12h.01', 'M12 12h.01', 'M15 12h.01', 'M18 12h.01'),
  nat: G('NAT', '0f766e', 'M3 8h13', 'M13 4l4 4-4 4', 'M21 16H8', 'M11 12l-4 4 4 4'),
  waf: G('WAF', 'b91c1c', SHIELD, 'M8.5 9.5h7', 'M8.5 12.5h7', 'M8.5 15.5h4'),
  'ids-ips': G('IDS / IPS', 'b91c1c', 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z', CIRCLE(12, 12, 2.8)),
  bastion: G('Bastion host', 'b91c1c', 'M4 21V9h3V6h2v3h2V6h2v3h2V6h2v3h3v12z', 'M10 21v-5a2 2 0 014 0v5'),
  rest: G('REST', '475569', 'M8 7l-5 5 5 5', 'M16 7l5 5-5 5', 'M13.5 5l-3 14'),
  websocket: G('WebSocket', '475569', 'M3 8h14', 'M14 5l3 3-3 3', 'M21 16H7', 'M10 13l-3 3 3 3'),
  sse: G('Server-Sent Events', '475569', 'M3 12h4', 'M10 6a8 8 0 010 12', 'M14 3a13 13 0 010 18', CIRCLE(5, 12, 1.2)),
  webhook: G('Webhook', '475569', CIRCLE(7, 17, 3), CIRCLE(17, 17, 3), CIRCLE(12, 6, 3), 'M12 9l-3.5 5.5', 'M14.5 11.5L17 14', 'M10 17h4'),
  soap: G('SOAP', '475569', 'M5 4h14v16H5z', 'M8 9h8', 'M8 12h8', 'M8 15h5', 'M8 6.5h.01'),
  amqp: G('AMQP', 'd97706', 'M3 7h5v10H3z', 'M16 7h5v10h-5z', 'M8 12h8', 'M13 9l3 3-3 3'),
  ldap: G('LDAP', 'b91c1c', 'M12 3v5', CIRCLE(12, 10, 2), 'M12 12v3', 'M5 15h14', 'M5 15v3', 'M12 15v3', 'M19 15v3', CIRCLE(5, 20, 1.5), CIRCLE(12, 20, 1.5), CIRCLE(19, 20, 1.5)),
  saml: G('SAML', 'b91c1c', 'M5 3h10l4 4v14H5z', 'M15 3v4h4', CIRCLE(11, 13, 2), 'M8 18c0-1.7 1.3-3 3-3s3 1.3 3 3'),
  oidc: G('OIDC', 'b91c1c', CIRCLE(12, 12, 9), CIRCLE(12, 10, 2.5), 'M7 18c.8-2.4 2.7-3.5 5-3.5s4.2 1.1 5 3.5'),
  'physical-server': G('Physical server', '475569', 'M3 3h18v5H3z', 'M3 10h18v5H3z', 'M3 17h18v4H3z', 'M6.5 5.5h.01', 'M6.5 12.5h.01', 'M6.5 19h.01', 'M11 5.5h6', 'M11 12.5h6'),
  rack: G('Server rack', '475569', 'M5 2.5h14v19H5z', 'M5 8.5h14', 'M5 14.5h14', 'M8 5.5h.01', 'M8 11.5h.01', 'M8 18h.01', 'M12 5.5h4', 'M12 11.5h4'),
  'data-center': G('Data center', '475569', 'M3 21V8l9-5 9 5v13', 'M3 21h18', 'M7 21v-8h4v8', 'M13 21v-8h4v8', 'M8.5 15.5h.01', 'M14.5 15.5h.01'),
  disk: G('Disk', '5b6475', 'M3 8l3-4h12l3 4v10a1 1 0 01-1 1H4a1 1 0 01-1-1z', 'M3 8h18', 'M17 15.5h.01', 'M13 15.5h.01'),
  gpu: G('GPU', '16a34a', 'M2 6h20v10H2z', CIRCLE(8, 11, 2.5), CIRCLE(15.5, 11, 2.5), 'M5 16v3', 'M9 16v3', 'M13 16v3'),
  laptop: G('Laptop', '475569', 'M5 5h14v10H5z', 'M2.5 19h19', 'M2.5 19l2.5-4', 'M21.5 19L19 15'),
  phone: G('Phone', '475569', 'M7 2.5h10a1 1 0 011 1v17a1 1 0 01-1 1H7a1 1 0 01-1-1v-17a1 1 0 011-1z', 'M11 19h2'),
  tablet: G('Tablet', '475569', 'M4 3h16v18H4z', 'M11 18h2'),
  printer: G('Printer', '475569', 'M7 8V3h10v5', 'M7 17H4V8h16v9h-3', 'M7 14h10v7H7z'),
  'iot-sensor': G('IoT sensor', '475569', 'M10 14V5a2 2 0 014 0v9a4 4 0 11-4 0z', 'M12 8v8', 'M18 6h3', 'M18 10h3'),
  actor: G('Actor', '475569', CIRCLE(12, 5, 2.5), 'M12 8v8', 'M6 11h12', 'M12 16l-4 5', 'M12 16l4 5'),
  team: G('Team', '475569', CIRCLE(12, 7, 3), CIRCLE(5, 9, 2.2), CIRCLE(19, 9, 2.2), 'M6.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5', 'M1.5 17c0-2 1.5-3.5 3.5-3.5', 'M22.5 17c0-2-1.5-3.5-3.5-3.5'),
  'external-system': G('External system', '8a93a3', 'M4 5h16v14H4z', 'M9 5V3', 'M15 5V3', 'M9 21v-2', 'M15 21v-2', 'M4 10h-2', 'M4 14h-2', 'M22 10h-2', 'M22 14h-2'),
  // diagram helpers / shapes (palette items that are not brand icons)
  rectangle: G('Rectangle', '475569', 'M4 6h16v12H4z'),
  rounded: G('Rounded box', '475569', 'M7 6h10a3 3 0 013 3v6a3 3 0 01-3 3H7a3 3 0 01-3-3V9a3 3 0 013-3z'),
  circle: G('Circle', '475569', CIRCLE(12, 12, 8)),
  cylinder: G('Cylinder', '475569', ...CYL),
  ellipsis: G('Ellipsis', '475569', 'M6 12h.01', 'M12 12h.01', 'M18 12h.01'),
  diamond: G('Diamond', '475569', 'M12 3l9 9-9 9-9-9z'),
  text: G('Text', '475569', 'M5 6V5h14v1', 'M12 5v14', 'M9 19h6'),
  note: G('Note', 'b7791f', 'M5 3.5h14a1 1 0 011 1V15l-5.5 5.5H5a1 1 0 01-1-1v-15a1 1 0 011-1z', 'M14.5 20.5V16a1 1 0 011-1H20', 'M8 8.5h8', 'M8 12h5'),
  group: G('Group', '475569', 'M4 5h4', 'M12 5h4', 'M20 5v4', 'M20 13v4', 'M20 19h-4', 'M12 19H8', 'M4 19v-4', 'M4 11V9'),
  title: G('Title', '475569', 'M5 7V5h14v2', 'M12 5v14', 'M9 19h6'),
  card: G('Card', '475569', 'M4 5h16v14H4z', 'M4 10h16', 'M7 14h6'),
  'card-horizontal': G('Card (horizontal)', '475569', 'M3 7h18v10H3z', 'M9 7v10', 'M12 11h6', 'M12 14h4'),
  junction: G('Junction', '475569', CIRCLE(12, 12, 3), 'M3 12h6', 'M15 12h6', 'M12 3v6'),
  'group-dashed': G('Group (dashed)', '475569', 'M4 5h3', 'M10 5h4', 'M17 5h3', 'M20 8v3', 'M20 14v3', 'M20 19h-3', 'M14 19h-4', 'M7 19H4', 'M4 16v-3', 'M4 10V8'),
  'group-card': G('Group (card)', '475569', 'M4 5h16v14H4z', 'M4 9h16'),
  boundary: G('Boundary', '475569', 'M3 5h18v14H3z', 'M7 9h10v6H7z'),
  zone: G('Zone', '475569', 'M4 6h16v12H4z', 'M4 10h16', 'M10 6v12'),
  'legend-box': G('Legend', '475569', 'M4 5h16v14H4z', 'M7 9h2', 'M11 9h6', 'M7 13h2', 'M11 13h6'),
  'step-badge': G('Step badge', '475569', CIRCLE(12, 12, 8), 'M11 9.5l1.5-1v7'),
  callout: G('Callout', '475569', 'M4 5h16v11H11l-4 4v-4H4z', 'M8 9h8', 'M8 12h5'),
};
