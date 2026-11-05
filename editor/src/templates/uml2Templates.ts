import type { Diagram, DiagramNode, PortSide } from '../types';
import { sequenceNode } from '../lib/seq/node';
import type { FragmentOp, MessageKind, ParticipantKind, SeqItem, SeqNote, SequenceModel } from '../lib/seq/types';
import { stateModelToDiagram } from '../lib/state/convert';
import { parseStateMermaid } from '../lib/state/mermaid';
import type { UmlRelKind } from '../lib/uml/types';
import { actorNode, boundaryNode, componentNode, useCaseNode } from '../lib/uml2/nodes';
import { activityModelToDiagram } from '../lib/activity/convert';
import { parseActivityPlantuml } from '../lib/activity/plantuml';
import { deploymentModelToDiagram } from '../lib/deployment/convert';
import type { DeploymentModel } from '../lib/deployment/types';
import { packageModelToDiagram } from '../lib/package/convert';
import type { PackageModel } from '../lib/package/types';
import { objectModelToDiagram } from '../lib/object/convert';
import { blankClass, withClassSize } from '../lib/uml/geometry';
import { umlEdge } from '../lib/uml/edges';
import { timingNode } from '../lib/timing/node';
import type { Template } from './index';

// ---- sequence helpers -------------------------------------------------------------------------------------------
const people = (...p: [string, string, ParticipantKind][]) => p.map(([id, name, kind]) => ({ id, name, kind }));
function seqBuilder() {
  let n = 0;
  const id = (p: string) => `${p}${++n}`;
  return {
    msg: (from: string, to: string, text: string, kind: MessageKind = 'sync'): SeqItem => ({ type: 'message', id: id('m'), from, to, text, kind }),
    note: (over: string[], text: string): SeqNote => ({ type: 'note', id: id('n'), text, over }),
    frag: (op: FragmentOp, ...sections: [string, SeqItem[]][]): SeqItem => ({ type: 'fragment', id: id('f'), op, sections: sections.map(([guard, items]) => ({ id: id('s'), guard, items })) }),
  };
}
function oauth(): Diagram {
  const b = seqBuilder();
  const model: SequenceModel = {
    autonumber: true,
    participants: people(['u', 'User', 'actor'], ['app', 'Web App', 'participant'], ['as', 'Auth Server', 'control'], ['api', 'Resource API', 'boundary']),
    items: [
      b.msg('u', 'app', 'click "Sign in"'),
      b.msg('app', 'as', 'GET /authorize (client_id, code_challenge)'),
      b.msg('as', 'u', 'login + consent page', 'return'),
      b.msg('u', 'as', 'credentials, approve scopes'),
      b.note(['as'], 'Session cookie set on the auth server'),
      b.msg('as', 'app', '302 redirect_uri?code=…', 'return'),
      b.msg('app', 'as', 'POST /token (code, code_verifier)'),
      b.frag('alt', ['code and verifier match', [b.msg('as', 'app', 'access_token + id_token', 'return')]], ['else', [b.msg('as', 'app', 'invalid_grant', 'return')]]),
      b.msg('app', 'api', 'GET /me (Bearer access_token)'),
      b.msg('api', 'as', 'introspect token'),
      b.msg('as', 'api', 'active, scope=profile', 'return'),
      b.msg('api', 'app', '200 profile', 'return'),
      b.msg('app', 'u', 'signed in', 'return'),
    ],
  };
  return { version: 1, nodes: [sequenceNode('seq_oauth', { x: 0, y: 0 }, model, 'Login with OAuth 2.0 (code + PKCE)')], edges: [] };
}

function checkout(): Diagram {
  const b = seqBuilder();
  const model: SequenceModel = {
    autonumber: true,
    participants: people(['c', 'Customer', 'actor'], ['w', 'Web Shop', 'participant'], ['o', 'Orders', 'control'], ['cart', 'Cart', 'entity'], ['inv', 'Inventory', 'database'], ['pay', 'Payments', 'boundary'], ['mail', 'Mailer', 'participant'], ['ship', 'Shipment', 'entity']),
    items: [
      b.msg('c', 'w', 'place order'),
      b.msg('w', 'o', 'createOrder(cartId)'),
      b.msg('o', 'cart', 'items()'),
      b.msg('cart', 'o', 'item list', 'return'),
      b.frag('loop', ['for each item', [b.msg('o', 'inv', 'reserve(sku, qty)'), b.msg('inv', 'o', 'reserved', 'return')]]),
      b.frag('alt', ['payment approved', [
        b.msg('o', 'pay', 'charge(total)'),
        b.msg('pay', 'o', 'approved', 'return'),
        b.msg('o', 'inv', 'commit reservations'),
        b.msg('inv', 'o', 'committed', 'return'),
        b.msg('o', 'o', 'mark order paid'),
        b.frag('par', ['confirmation mail', [b.msg('o', 'mail', 'send receipt', 'async')]], ['clear the cart', [b.msg('o', 'cart', 'clear', 'destroy')]]),
        b.msg('o', 'ship', 'new Shipment', 'create'),
        b.msg('o', 'w', 'order #1042', 'return'),
      ]], ['payment declined', [
        b.msg('o', 'pay', 'charge(total)'),
        b.msg('pay', 'o', 'declined', 'return'),
        b.msg('o', 'inv', 'release reservations', 'async'),
        b.msg('o', 'w', 'payment failed', 'return'),
      ]]),
      b.note(['o', 'pay'], 'Charges are idempotent: the order id is the idempotency key'),
      b.msg('w', 'c', 'confirmation page', 'return'),
    ],
  };
  return { version: 1, nodes: [sequenceNode('seq_checkout', { x: 0, y: 0 }, model, 'Checkout')], edges: [] };
}

// ---- state ------------------------------------------------------------------------------------------------------
const ORDER_STATES = `stateDiagram-v2
  [*] --> Created
  Created --> Created : edit items / recalc()
  Created --> Paid : pay [in stock] / charge()
  Created --> Cancelled : cancel
  Paid --> Fulfilment : start fulfilment
  state Fulfilment {
    [*] --> Picking
    state fork1 <<fork>>
    state join1 <<join>>
    Picking --> fork1 : picked
    fork1 --> Packing
    fork1 --> Invoicing
    Packing --> join1
    Invoicing --> join1
    join1 --> Shipped : label()
  }
  Fulfilment --> Delivered : delivered
  state check <<choice>>
  Delivered --> check
  check --> Returned : [damaged] / refund()
  check --> [*] : [ok]
  Returned --> [*]
  Cancelled --> [*]
`;
function orderLifecycle(): Diagram {
  const model = parseStateMermaid(ORDER_STATES).model;
  // one end marker per ending path, so three arrows never converge on a single final state
  const into = model.transitions.filter((t) => t.to === 'final_root');
  into.slice(1).forEach((t, i) => {
    const id = `final_root_${i + 2}`;
    model.states.push({ id, name: '', kind: 'final' });
    t.to = id;
  });
  const d = stateModelToDiagram(model);
  const title: DiagramNode = { id: 'tpl_title', type: 'text', position: { x: 0, y: -70 }, width: 520, height: 40, data: { label: 'Order lifecycle', fontSize: 26, bold: true } };
  return { version: 1, nodes: [title, ...d.nodes], edges: d.edges };
}

// ---- use case ---------------------------------------------------------------------------------------------------
function ecommerce(): Diagram {
  const sys = boundaryNode('sys', { x: 150, y: 0 }, 'Online Shop', 560, 660);
  const inside = (id: string, label: string, x: number, y: number): DiagramNode => ({ ...useCaseNode(id, { x, y }, label), parentId: 'sys' });
  // actors that use the shop sit left, the supporting actors right: lines stay short and never cross a use case
  const nodes: DiagramNode[] = [
    { id: 'tpl_title', type: 'text', position: { x: 0, y: -70 }, width: 520, height: 40, data: { label: 'E-commerce use cases', fontSize: 26, bold: true } } as DiagramNode,
    sys,
    inside('browse', 'Browse Catalog', 40, 70), inside('search', 'Search Products', 40, 170),
    inside('cart', 'Add to Cart', 40, 270), inside('checkout', 'Checkout', 40, 380), inside('track', 'Track Order', 40, 500),
    inside('manage', 'Manage Catalog', 330, 70),
    inside('coupon', 'Apply Coupon', 330, 290), inside('pay', 'Pay Order', 330, 390), inside('address', 'Validate Address', 330, 490), inside('auth', 'Authenticate', 330, 580),
    actorNode('guest', { x: 30, y: 90 }, 'Guest'), actorNode('customer', { x: 30, y: 390 }, 'Customer'),
    actorNode('admin', { x: 790, y: 70 }, 'Admin'), actorNode('gateway', { x: 760, y: 380 }, 'Payment Gateway'),
  ];
  const e = (id: string, a: string, b: string, kind: UmlRelKind) => umlEdge(id, a, b, { kind });
  return {
    version: 1,
    nodes,
    edges: [
      e('e1', 'guest', 'browse', 'association'), e('e2', 'guest', 'search', 'association'),
      e('e3', 'customer', 'cart', 'association'), e('e4', 'customer', 'checkout', 'association'), e('e5', 'customer', 'track', 'association'),
      e('e6', 'customer', 'guest', 'generalization'),
      e('e7', 'gateway', 'pay', 'association'), e('e8', 'admin', 'manage', 'association'),
      e('e9', 'checkout', 'address', 'include'), e('e10', 'checkout', 'pay', 'include'), e('e11', 'track', 'auth', 'include'),
      e('e12', 'coupon', 'checkout', 'extend'),
    ],
  };
}

// ---- activity ---------------------------------------------------------------------------------------------------
const ORDER_ACTIVITY = `@startuml
|Customer|
start
:Place order;
|Shop|
:Validate order;
if (in stock?) then (yes)
  :Charge payment;
  note right: retry twice on failure
  fork
    |Warehouse|
    :Pick items;
    :Pack parcel;
  fork again
    |Shop|
    :Send confirmation;
  end fork
  |Warehouse|
  :Order [shipped]]
  :Dispatch;
  |Customer|
  :Receive parcel;
  stop
else (out of stock)
  |Shop|
  :Notify customer;
  |Customer|
  :Cancel or wait;
  end
endif
@enduml`;
function orderFulfillment(): Diagram {
  const d = activityModelToDiagram(parseActivityPlantuml(ORDER_ACTIVITY).model, { x: 0, y: 0 });
  const title: DiagramNode = { id: 'tpl_title', type: 'text', position: { x: 0, y: -70 }, width: 520, height: 40, data: { label: 'Order fulfillment', fontSize: 26, bold: true } };
  return { version: 1, nodes: [title, ...d.nodes], edges: d.edges };
}

// ---- component --------------------------------------------------------------------------------------------------
function microservices(): Diagram {
  const comp = (id: string, label: string, x: number, y: number, stereotype = 'service') => ({ ...componentNode(id, { x, y }, 'component', label), data: { ...componentNode(id, { x, y }, 'component', label).data, stereotype } });
  const iface = (id: string, kind: 'provided' | 'required', label: string, x: number, y: number) => componentNode(id, { x, y }, kind, label);
  const nodes: DiagramNode[] = [
    { id: 'tpl_title', type: 'text', position: { x: 0, y: -70 }, width: 760, height: 40, data: { label: 'Microservices: components and deployment', fontSize: 26, bold: true } } as DiagramNode,
    comp('gw', 'API Gateway', 0, 170, 'edge'),
    comp('orders', 'Orders Service', 460, 40), comp('catalog', 'Catalog Service', 460, 300),
    comp('payments', 'Payments Service', 940, 40), comp('notify', 'Notification Service', 940, 200),
    // gateway -> orders
    iface('r_orders', 'required', 'IOrders', 250, 66), iface('p_orders', 'provided', 'IOrders', 330, 66),
    // gateway -> catalog
    iface('r_catalog', 'required', 'ICatalog', 250, 326), iface('p_catalog', 'provided', 'ICatalog', 330, 326),
    // orders -> payments
    iface('r_pay', 'required', 'IPayments', 730, 66), iface('p_pay', 'provided', 'IPayments', 810, 66),
    // deployment
    { ...componentNode('k8s', { x: 460, y: 470 }, 'node', 'Kubernetes cluster'), data: { ...componentNode('k8s', { x: 0, y: 0 }, 'node', 'Kubernetes cluster').data, stereotype: 'execution environment' } },
    componentNode('a_orders', { x: 760, y: 450 }, 'artifact', 'orders.jar'),
    componentNode('a_catalog', { x: 760, y: 550 }, 'artifact', 'catalog.jar'),
  ];
  const a = (id: string, s: string, t: string, kind: UmlRelKind = 'assembly', label?: string, pins?: [PortSide, PortSide]) =>
    umlEdge(id, s, t, { kind }, { ...(label ? { label } : {}), ...(pins ? { data: { pinSource: pins[0], pinTarget: pins[1] } } : {}) });
  return {
    version: 1,
    nodes,
    edges: [
      a('c1', 'gw', 'r_orders', 'assembly', undefined, ['right', 'left']), a('c2', 'r_orders', 'p_orders', 'assembly', undefined, ['right', 'left']), a('c3', 'orders', 'p_orders', 'assembly', undefined, ['left', 'right']),
      a('c4', 'gw', 'r_catalog', 'assembly', undefined, ['right', 'left']), a('c5', 'r_catalog', 'p_catalog', 'assembly', undefined, ['right', 'left']), a('c6', 'catalog', 'p_catalog', 'assembly', undefined, ['left', 'right']),
      a('c7', 'orders', 'r_pay', 'assembly', undefined, ['right', 'left']), a('c8', 'r_pay', 'p_pay', 'assembly', undefined, ['right', 'left']), a('c9', 'payments', 'p_pay', 'assembly', undefined, ['left', 'right']),
      a('d1', 'orders', 'notify', 'dependency', '«async»', ['bottom', 'left']),
      a('d4', 'a_orders', 'k8s', 'dependency', '«deploy»', ['left', 'right']), a('d5', 'a_catalog', 'k8s', 'dependency', '«deploy»', ['left', 'right']),
    ],
  };
}

// ---- deployment -------------------------------------------------------------------------------------------------
function webDeployment(): Diagram {
  const model: DeploymentModel = {
    nodes: [
      { id: 'phone', name: 'Customer phone', kind: 'device', stereotype: 'mobile' },
      { id: 'app', name: 'shop.apk', kind: 'artifact', parent: 'phone' },
      { id: 'edge', name: 'Edge', kind: 'node', stereotype: 'CDN', iconId: 'cdn' },
      { id: 'server', name: 'Web server', kind: 'node' },
      { id: 'tomcat', name: 'Tomcat 10', kind: 'executionEnvironment', parent: 'server' },
      { id: 'war', name: 'shop.war', kind: 'artifact', parent: 'tomcat' },
      { id: 'shop', name: 'Shop', kind: 'component', parent: 'tomcat' },
      { id: 'db', name: 'DB server', kind: 'node', iconId: 'postgresql' },
      { id: 'schema', name: 'shop.sql', kind: 'artifact', parent: 'db' },
    ],
    links: [
      { from: 'phone', to: 'edge', kind: 'communication', label: 'HTTPS' },
      { from: 'edge', to: 'server', kind: 'communication', label: 'HTTP/2' },
      { from: 'server', to: 'db', kind: 'communication', label: 'JDBC' },
      { from: 'war', to: 'shop', kind: 'manifest' },
    ],
  };
  const d = deploymentModelToDiagram(model);
  const title: DiagramNode = { id: 'tpl_title', type: 'text', position: { x: 0, y: -70 }, width: 520, height: 40, data: { label: 'Web shop deployment', fontSize: 26, bold: true } };
  return { version: 1, nodes: [title, ...d.nodes], edges: d.edges };
}

// ---- package ----------------------------------------------------------------------------------------------------
function layeredShop(): Diagram {
  const model: PackageModel = {
    packages: [
      { id: 'web', name: 'web' },
      { id: 'ctl', name: 'controllers', parent: 'web' },
      { id: 'view', name: 'views', parent: 'web' },
      { id: 'domain', name: 'domain' },
      { id: 'infra', name: 'infrastructure' },
      { id: 'util', name: 'util' },
    ],
    classes: [
      { id: 'oc', name: 'OrderController', kind: 'class', parent: 'ctl', attributes: ['- service: OrderService'], operations: ['+ place(cart: Cart): Order', '+ cancel(id: string): void'] },
      { id: 'ov', name: 'OrderView', kind: 'class', parent: 'view', attributes: ['- order: Order'], operations: ['+ render(): void'] },
      { id: 'ord', name: 'Order', kind: 'class', parent: 'domain', attributes: ['- id: string', '- total: Money', '- status: Status'], operations: ['+ addLine(item: Item): void', '+ pay(): void'] },
      { id: 'repo', name: 'OrderRepository', kind: 'interface', parent: 'domain', attributes: [], operations: ['+ find(id: string): Order', '+ save(order: Order): void'] },
      { id: 'jpa', name: 'JpaOrderRepository', kind: 'class', parent: 'infra', attributes: ['- em: EntityManager'], operations: ['+ find(id: string): Order', '+ save(order: Order): void'] },
    ],
    links: [
      { from: 'web', to: 'domain', kind: 'import' },
      { from: 'infra', to: 'domain', kind: 'import' },
      { from: 'domain', to: 'util', kind: 'access' },
      { from: 'infra', to: 'util', kind: 'merge' },
      { from: 'ctl', to: 'view', kind: 'dependency' },
    ],
  };
  const d = packageModelToDiagram(model);
  const title: DiagramNode = { id: 'tpl_title', type: 'text', position: { x: 0, y: -90 }, width: 520, height: 40, data: { label: 'Layered shop: packages', fontSize: 26, bold: true } };
  return { version: 1, nodes: [title, ...d.nodes], edges: d.edges };
}

// ---- object -----------------------------------------------------------------------------------------------------
function orderSnapshot(): Diagram {
  const member = (id: string, name: string, type: string) => ({ id, visibility: '-', name, type });
  const cls = (id: string, label: string, x: number, attrs: [string, string][]) => {
    const n = blankClass(id, { x, y: 0 }, 'class', label);
    return withClassSize({ ...n, data: { ...n.data, attributes: attrs.map(([a, t], i) => member(`a${i}`, a, t)), operations: [] } } as DiagramNode);
  };
  const customer = cls('cls_customer', 'Customer', 0, [['name', 'String'], ['email', 'String']]);
  const order = cls('cls_order', 'Order', 0, [['number', 'int'], ['total', 'Money']]);
  const d = objectModelToDiagram({
    objects: [
      { id: 'alice', name: 'alice', className: 'Customer', slots: [{ name: 'name', value: '"Alice"' }, { name: 'email', value: '"alice@example.com"' }] },
      { id: 'o1', name: 'order1', className: 'Order', slots: [{ name: 'number', value: '1001' }, { name: 'total', value: '49.90' }] },
      { id: 'o2', name: 'order2', className: 'Order', slots: [{ name: 'number', value: '1002' }, { name: 'total', value: '12.00' }] },
    ],
    links: [{ from: 'alice', to: 'o1', label: 'places', srcRole: 'customer', dstRole: 'orders' }, { from: 'alice', to: 'o2', label: 'places', srcRole: 'customer', dstRole: 'orders' }],
  }, { x: 0, y: 330 });
  const place = [{ ...customer, position: { x: 0, y: 0 } }, { ...order, position: { x: 260, y: 0 } }];
  const rel = umlEdge('cls_rel', 'cls_customer', 'cls_order', { kind: 'association', sourceMult: '1', targetMult: '0..*' }, { label: 'places' });
  const title: DiagramNode = { id: 'tpl_title', type: 'text', position: { x: 0, y: -70 }, width: 520, height: 40, data: { label: 'Order snapshot (object diagram)', fontSize: 26, bold: true } };
  return { version: 1, nodes: [title, ...place, ...d.nodes], edges: [rel, ...d.edges] };
}

// ---- communication ----------------------------------------------------------------------------------------------
function loginCommunication(): Diagram {
  const d = objectModelToDiagram({
    objects: [
      { id: 'user', name: 'user', className: 'Customer', slots: [] },
      { id: 'web', name: 'web', className: 'WebApp', slots: [] },
      { id: 'auth', name: 'auth', className: 'AuthService', slots: [] },
      { id: 'db', name: 'users', className: 'UserStore', slots: [] },
    ],
    links: [
      { from: 'user', to: 'web', messages: [{ id: 'm1', seq: '1', text: 'login(user, pw)', dir: 'fwd' }, { id: 'm6', seq: '4', text: 'session', dir: 'back' }] },
      { from: 'web', to: 'auth', messages: [{ id: 'm2', seq: '2', text: 'authenticate()', dir: 'fwd' }, { id: 'm5', seq: '3', text: 'token', dir: 'back' }] },
      { from: 'auth', to: 'db', messages: [{ id: 'm3', seq: '2.1', text: 'find(user)', dir: 'fwd' }, { id: 'm4', seq: '2.2', text: 'audit()', dir: 'fwd', async: true }] },
    ],
  });
  const title: DiagramNode = { id: 'tpl_title', type: 'text', position: { x: 0, y: -70 }, width: 520, height: 40, data: { label: 'Login (communication diagram)', fontSize: 26, bold: true } };
  return { version: 1, nodes: [title, ...d.nodes], edges: d.edges };
}

// ---- timing -----------------------------------------------------------------------------------------------------
function webRequestTiming(): Diagram {
  const node = timingNode('tm_web', { x: 0, y: 0 }, {
    end: 400, unit: 'ms',
    lifelines: [
      { id: 'clk', name: 'Clock', kind: 'clock', states: [], period: 50 },
      { id: 'user', name: 'Web user', kind: 'concise', states: ['Idle', 'Waiting', 'Viewing'] },
      { id: 'web', name: 'Web browser', kind: 'robust', states: ['Idle', 'Sending', 'Waiting', 'Rendering'] },
      { id: 'net', name: 'Link', kind: 'binary', states: ['high', 'low'] },
    ],
    changes: [
      { id: 'c1', life: 'user', t: 0, state: 'Idle' }, { id: 'c2', life: 'user', t: 100, state: 'Waiting' }, { id: 'c3', life: 'user', t: 330, state: 'Viewing' },
      { id: 'c4', life: 'web', t: 0, state: 'Idle' }, { id: 'c5', life: 'web', t: 100, state: 'Sending' }, { id: 'c6', life: 'web', t: 150, state: 'Waiting' }, { id: 'c7', life: 'web', t: 300, state: 'Rendering' }, { id: 'c8', life: 'web', t: 350, state: 'Idle' },
      { id: 'c9', life: 'net', t: 0, state: 'low' }, { id: 'c10', life: 'net', t: 120, state: 'high' }, { id: 'c11', life: 'net', t: 280, state: 'low' },
    ],
    messages: [{ id: 'm1', from: 'user', to: 'web', t: 100, text: 'URL' }, { id: 'm2', from: 'web', to: 'user', t: 330, text: 'page' }],
    durations: [{ id: 'k1', life: 'web', t1: 150, t2: 300, text: '{150 ms}' }],
  }, 'Web request');
  return { version: 1, nodes: [node], edges: [] };
}

export const TEMPLATES: Template[] = [
  { id: 'seq-oauth-login', name: 'Sequence — login with OAuth', description: 'OAuth 2.0 authorization code flow with PKCE: redirect, consent, token exchange and a protected API call', tags: ['uml', 'sequence', 'oauth', 'auth', 'login', 'security', 'interaction'], build: oauth },
  { id: 'seq-checkout', name: 'Sequence — checkout', description: 'Order placement with a loop, alt and par fragments, an async receipt, create / destroy lifelines and a note', tags: ['uml', 'sequence', 'checkout', 'ecommerce', 'payment', 'interaction'], build: checkout },
  { id: 'state-order-lifecycle', name: 'State — order lifecycle', description: 'Order states with guards and actions, a composite fulfilment state with fork / join, a choice and a self transition', tags: ['uml', 'state', 'statechart', 'order', 'fsm', 'ecommerce'], build: orderLifecycle },
  { id: 'usecase-ecommerce', name: 'Use case — e-commerce', description: 'Actors outside a system boundary, use cases inside it, with include, extend and generalization', tags: ['uml', 'usecase', 'use case', 'ecommerce', 'requirements'], build: ecommerce },
  { id: 'activity-order-fulfillment', name: 'Activity — order fulfillment', description: 'Swimlanes for customer, shop and warehouse with a decision, guards, a parallel fork / join, an object node and a note', tags: ['uml', 'activity', 'swimlane', 'workflow', 'order', 'fulfillment', 'process', 'ecommerce'], build: orderFulfillment },
  { id: 'component-microservices', name: 'Component — microservices', description: 'Services with provided / required interfaces, assembly connectors and a deployment node with artifacts', tags: ['uml', 'component', 'microservices', 'deployment', 'architecture'], build: microservices },
  { id: 'deployment-web-shop', name: 'Deployment — web shop', description: 'A phone, a CDN edge, a web server with an execution environment holding an artifact that manifests a component, and a database node, joined by protocol-labelled communication paths', tags: ['uml', 'deployment', 'node', 'artifact', 'infrastructure', 'architecture', 'web'], build: webDeployment },
  { id: 'package-layered-shop', name: 'Package — layered shop', description: 'Nested packages holding classes, with import, access and merge relations and a dependency, laid out layered by dependency', tags: ['uml', 'package', 'layers', 'architecture', 'namespace', 'module', 'dependency'], build: layeredShop },
  { id: 'communication-login', name: 'Communication — login', description: 'Four objects joined by links that carry numbered messages (1, 2, 2.1, 2.2, 3, 4) in both directions, with a nested call and an async audit', tags: ['uml', 'communication', 'collaboration', 'object', 'message', 'login', 'interaction', 'numbered'], build: loginCommunication },
  { id: 'timing-web-request', name: 'Timing — web request', description: 'A clock, a concise user lifeline, a robust browser lifeline with four state rows and a binary link signal, with state changes, two messages and a duration constraint', tags: ['uml', 'timing', 'waveform', 'signal', 'clock', 'robust', 'concise', 'binary', 'interaction'], build: webRequestTiming },
  { id: 'object-order-snapshot', name: 'Object — order snapshot', description: 'Two classes and three objects (alice : Customer, order1 and order2 : Order) with slots and named links with roles', tags: ['uml', 'object', 'instance', 'snapshot', 'class', 'slots', 'link'], build: orderSnapshot },
];
