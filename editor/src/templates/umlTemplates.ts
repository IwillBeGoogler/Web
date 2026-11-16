import type { Diagram, DiagramNode } from '../types';
import { modelToDiagram } from '../lib/uml/convert';
import { umlEdge } from '../lib/uml/edges';
import { nodeSize } from '../lib/graph';
import { parseMember } from '../lib/uml/member';
import { newClassDef, type MemberDef, type UmlClassDef, type UmlModel, type UmlRelDef } from '../lib/uml/model';
import type { ClassKind } from '../lib/uml/types';
import type { Template } from './monitoringStack';

const attr = (t: string): MemberDef => parseMember(t, 'attribute');
const op = (t: string): MemberDef => parseMember(t, 'operation');
export const cls = (name: string, kind: ClassKind, attrs: string[], ops: string[], extra: Partial<UmlClassDef> = {}): UmlClassDef =>
  newClassDef(name, { kind, attributes: attrs.map(attr), operations: ops.map(op), ...extra });
export const rel = (from: string, to: string, kind: UmlRelDef['kind'], extra: Partial<UmlRelDef> = {}): UmlRelDef => ({ from, to, kind, ...extra });

export interface Pattern {
  id: string;
  name: string;
  title: string;
  note: string;
  /** the class the note is attached to */
  anchor: string;
  model: UmlModel;
}

const PATTERNS: Pattern[] = [
  {
    id: 'uml-strategy', name: 'UML — Strategy', title: 'Strategy pattern', anchor: 'Strategy',
    note: 'Define a family of algorithms, encapsulate each one and make them interchangeable at runtime.',
    model: {
      classes: [
        cls('Context', 'class', ['- strategy: Strategy'], ['+ setStrategy(strategy: Strategy): void', '+ executeStrategy(data: Data): Result']),
        cls('Strategy', 'interface', [], ['+ execute(data: Data): Result']),
        cls('ConcreteStrategyA', 'class', [], ['+ execute(data: Data): Result']),
        cls('ConcreteStrategyB', 'class', [], ['+ execute(data: Data): Result']),
      ],
      relations: [rel('Context', 'Strategy', 'association', { directed: true, toMult: '1', toRole: 'strategy' }), rel('ConcreteStrategyA', 'Strategy', 'realization'), rel('ConcreteStrategyB', 'Strategy', 'realization')],
    },
  },
  {
    id: 'uml-observer', name: 'UML — Observer', title: 'Observer pattern', anchor: 'Observer',
    note: 'One-to-many dependency: when the subject changes state, every registered observer is notified.',
    model: {
      classes: [
        cls('Subject', 'class', ['- observers: Observer[]'], ['+ attach(o: Observer): void', '+ detach(o: Observer): void', '+ notify(): void']),
        cls('Observer', 'interface', [], ['+ update(subject: Subject): void']),
        cls('ConcreteSubject', 'class', ['- state: State'], ['+ getState(): State', '+ setState(state: State): void']),
        cls('ConcreteObserver', 'class', ['- observerState: State'], ['+ update(subject: Subject): void']),
      ],
      relations: [rel('Subject', 'Observer', 'association', { directed: true, fromMult: '1', toMult: '0..*', toRole: 'observers' }), rel('ConcreteSubject', 'Subject', 'inheritance'), rel('ConcreteObserver', 'Observer', 'realization'), rel('ConcreteObserver', 'ConcreteSubject', 'dependency', { label: 'reads state' })],
    },
  },
  {
    id: 'uml-factory-method', name: 'UML — Factory Method', title: 'Factory Method pattern', anchor: 'Creator',
    note: 'Let subclasses decide which class to instantiate: the creator only depends on the product interface.',
    model: {
      classes: [
        cls('Creator', 'abstract', [], ['+ operation(): void', '+ factoryMethod(): Product']),
        cls('Product', 'interface', [], ['+ use(): void']),
        cls('ConcreteCreatorA', 'class', [], ['+ factoryMethod(): Product']),
        cls('ConcreteCreatorB', 'class', [], ['+ factoryMethod(): Product']),
        cls('ConcreteProductA', 'class', [], ['+ use(): void']),
        cls('ConcreteProductB', 'class', [], ['+ use(): void']),
      ],
      relations: [
        rel('ConcreteCreatorA', 'Creator', 'inheritance'), rel('ConcreteCreatorB', 'Creator', 'inheritance'),
        rel('ConcreteProductA', 'Product', 'realization'), rel('ConcreteProductB', 'Product', 'realization'),
        rel('Creator', 'Product', 'dependency', { label: 'uses' }),
        rel('ConcreteCreatorA', 'ConcreteProductA', 'dependency', { label: 'creates' }), rel('ConcreteCreatorB', 'ConcreteProductB', 'dependency', { label: 'creates' }),
      ],
    },
  },
  {
    id: 'uml-singleton', name: 'UML — Singleton', title: 'Singleton pattern', anchor: 'Singleton',
    note: 'Ensure a class has exactly one instance and give global access to it through getInstance().',
    model: {
      classes: [
        cls('Singleton', 'class', ['static - instance: Singleton', '- value: string'], ['- Singleton()', 'static + getInstance(): Singleton', '+ doWork(): void']),
        cls('Client', 'class', [], ['+ main(): void']),
        cls('Config', 'class', ['- settings: Map<string, string>'], ['+ get(key: string): string']),
      ],
      relations: [rel('Client', 'Singleton', 'dependency', { label: 'getInstance()' }), rel('Config', 'Singleton', 'inheritance')],
    },
  },
  {
    id: 'uml-decorator', name: 'UML — Decorator', title: 'Decorator pattern', anchor: 'Decorator',
    note: 'Attach extra responsibilities to an object dynamically by wrapping it in decorators.',
    model: {
      classes: [
        cls('Component', 'interface', [], ['+ operation(): void']),
        cls('ConcreteComponent', 'class', [], ['+ operation(): void']),
        cls('Decorator', 'abstract', ['# component: Component'], ['+ operation(): void']),
        cls('ConcreteDecoratorA', 'class', ['- addedState: string'], ['+ operation(): void']),
        cls('ConcreteDecoratorB', 'class', [], ['+ operation(): void', '+ addedBehavior(): void']),
      ],
      relations: [
        rel('ConcreteComponent', 'Component', 'realization'), rel('Decorator', 'Component', 'realization'),
        rel('Component', 'Decorator', 'aggregation', { fromMult: '1', toMult: '1' }),
        rel('ConcreteDecoratorA', 'Decorator', 'inheritance'), rel('ConcreteDecoratorB', 'Decorator', 'inheritance'),
      ],
    },
  },
  {
    id: 'uml-adapter', name: 'UML — Adapter', title: 'Adapter pattern', anchor: 'Adapter',
    note: 'Convert the interface of a class into the one the client expects, so incompatible classes can work together.',
    model: {
      classes: [
        cls('Client', 'class', [], ['+ run(): void']),
        cls('Target', 'interface', [], ['+ request(): void']),
        cls('Adapter', 'class', ['- adaptee: Adaptee'], ['+ request(): void']),
        cls('Adaptee', 'class', [], ['+ specificRequest(): void']),
      ],
      relations: [rel('Client', 'Target', 'dependency', { label: 'uses' }), rel('Adapter', 'Target', 'realization'), rel('Adapter', 'Adaptee', 'association', { directed: true, toMult: '1', toRole: 'adaptee' })],
    },
  },
  {
    id: 'uml-repository', name: 'UML — Repository', title: 'Repository pattern', anchor: 'Repository',
    note: 'Mediate between the domain and data-mapping layers with a collection-like interface for domain objects.',
    model: {
      classes: [
        cls('Repository', 'interface', [], ['+ find(id: ID): T', '+ findAll(): T[]', '+ save(entity: T): T', '+ delete(id: ID): void'], { generics: 'T, ID' }),
        cls('UserRepository', 'interface', [], ['+ findByEmail(email: string): User']),
        cls('SqlUserRepository', 'class', ['- db: Database'], ['+ find(id: string): User', '+ findAll(): User[]', '+ save(entity: User): User', '+ delete(id: string): void', '+ findByEmail(email: string): User']),
        cls('User', 'class', ['- id: string', '- email: string', '- name: string'], []),
        cls('UserService', 'class', ['- users: UserRepository'], ['+ register(email: string): User']),
        cls('Database', 'class', [], ['+ query(sql: string): Row[]']),
      ],
      relations: [
        rel('UserRepository', 'Repository', 'inheritance', { label: '<User, string>' }), rel('SqlUserRepository', 'UserRepository', 'realization'),
        rel('UserService', 'UserRepository', 'association', { directed: true, toMult: '1', toRole: 'users' }),
        rel('UserService', 'User', 'dependency'),
        rel('SqlUserRepository', 'Database', 'association', { directed: true, toMult: '1', toRole: 'db' }),
      ],
    },
  },
  {
    id: 'uml-builder', name: 'UML — Builder', title: 'Builder pattern', anchor: 'Builder',
    note: 'Construct a complex object step by step; the same construction process can create different representations.',
    model: {
      classes: [
        cls('Director', 'class', ['- builder: Builder'], ['+ construct(): void']),
        cls('Builder', 'interface', [], ['+ reset(): void', '+ buildPartA(): void', '+ buildPartB(): void']),
        cls('ConcreteBuilder', 'class', ['- product: Product'], ['+ reset(): void', '+ buildPartA(): void', '+ buildPartB(): void', '+ getResult(): Product']),
        cls('Product', 'class', ['- parts: string[]'], ['+ show(): void']),
      ],
      relations: [rel('Director', 'Builder', 'association', { directed: true, toMult: '1', toRole: 'builder' }), rel('ConcreteBuilder', 'Builder', 'realization'), rel('ConcreteBuilder', 'Product', 'dependency', { label: 'creates' })],
    },
  },
  {
    id: 'uml-abstract-factory', name: 'UML — Abstract Factory', title: 'Abstract Factory pattern', anchor: 'AbstractFactory',
    note: 'Create families of related objects without specifying their concrete classes.',
    model: {
      classes: [
        cls('AbstractFactory', 'interface', [], ['+ createProductA(): ProductA', '+ createProductB(): ProductB']),
        cls('ConcreteFactory1', 'class', [], ['+ createProductA(): ProductA', '+ createProductB(): ProductB']),
        cls('ConcreteFactory2', 'class', [], ['+ createProductA(): ProductA', '+ createProductB(): ProductB']),
        cls('ProductA', 'interface', [], ['+ operationA(): void']),
        cls('ProductB', 'interface', [], ['+ operationB(): void']),
        cls('ProductA1', 'class', [], ['+ operationA(): void']),
        cls('ProductB1', 'class', [], ['+ operationB(): void']),
        cls('Client', 'class', ['- factory: AbstractFactory'], ['+ run(): void']),
      ],
      relations: [
        rel('ConcreteFactory1', 'AbstractFactory', 'realization'), rel('ConcreteFactory2', 'AbstractFactory', 'realization'),
        rel('ProductA1', 'ProductA', 'realization'), rel('ProductB1', 'ProductB', 'realization'),
        rel('Client', 'AbstractFactory', 'association', { directed: true, toMult: '1', toRole: 'factory' }),
        rel('Client', 'ProductA', 'dependency', { label: 'uses' }), rel('Client', 'ProductB', 'dependency', { label: 'uses' }),
      ],
    },
  },
  {
    id: 'uml-command', name: 'UML — Command', title: 'Command pattern', anchor: 'Command',
    note: 'Encapsulate a request as an object so it can be queued, logged and undone.',
    model: {
      classes: [
        cls('Invoker', 'class', ['- command: Command'], ['+ setCommand(c: Command): void', '+ invoke(): void']),
        cls('Command', 'interface', [], ['+ execute(): void', '+ undo(): void']),
        cls('ConcreteCommand', 'class', ['- receiver: Receiver', '- params: Params'], ['+ execute(): void', '+ undo(): void']),
        cls('Receiver', 'class', [], ['+ action(params: Params): void']),
        cls('Client', 'class', [], ['+ main(): void']),
      ],
      relations: [
        rel('Invoker', 'Command', 'association', { directed: true, toMult: '1', toRole: 'command' }),
        rel('ConcreteCommand', 'Command', 'realization'),
        rel('ConcreteCommand', 'Receiver', 'association', { directed: true, toMult: '1', toRole: 'receiver' }),
        rel('Client', 'ConcreteCommand', 'dependency', { label: 'creates' }),
      ],
    },
  },
  {
    id: 'uml-state', name: 'UML — State', title: 'State pattern', anchor: 'State',
    note: 'Let an object alter its behaviour when its internal state changes; it appears to change class.',
    model: {
      classes: [
        cls('Context', 'class', ['- state: State'], ['+ setState(s: State): void', '+ request(): void']),
        cls('State', 'interface', [], ['+ handle(ctx: Context): void']),
        cls('ConcreteStateA', 'class', [], ['+ handle(ctx: Context): void']),
        cls('ConcreteStateB', 'class', [], ['+ handle(ctx: Context): void']),
      ],
      relations: [rel('Context', 'State', 'association', { directed: true, toMult: '1', toRole: 'state' }), rel('ConcreteStateA', 'State', 'realization'), rel('ConcreteStateB', 'State', 'realization')],
    },
  },
  {
    id: 'uml-composite', name: 'UML — Composite', title: 'Composite pattern', anchor: 'Component',
    note: 'Compose objects into tree structures and treat single objects and compositions uniformly.',
    model: {
      classes: [
        cls('Component', 'interface', [], ['+ operation(): void']),
        cls('Leaf', 'class', [], ['+ operation(): void']),
        cls('Composite', 'class', ['- children: Component[]'], ['+ operation(): void', '+ add(c: Component): void', '+ remove(c: Component): void']),
        cls('Client', 'class', [], ['+ main(): void']),
      ],
      relations: [rel('Leaf', 'Component', 'realization'), rel('Composite', 'Component', 'realization'), rel('Composite', 'Component', 'composition', { fromMult: '1', toMult: '0..*' }), rel('Client', 'Component', 'dependency', { label: 'uses' })],
    },
  },
  {
    id: 'uml-proxy', name: 'UML — Proxy', title: 'Proxy pattern', anchor: 'Subject',
    note: 'Provide a surrogate that controls access to another object (lazy loading, caching, protection).',
    model: {
      classes: [
        cls('Client', 'class', [], ['+ main(): void']),
        cls('Subject', 'interface', [], ['+ request(): void']),
        cls('RealSubject', 'class', [], ['+ request(): void']),
        cls('Proxy', 'class', ['- real: RealSubject'], ['+ request(): void', '- checkAccess(): boolean']),
      ],
      relations: [rel('Client', 'Subject', 'dependency', { label: 'uses' }), rel('RealSubject', 'Subject', 'realization'), rel('Proxy', 'Subject', 'realization'), rel('Proxy', 'RealSubject', 'association', { directed: true, toMult: '1', toRole: 'real' })],
    },
  },
  {
    id: 'uml-facade', name: 'UML — Facade', title: 'Facade pattern', anchor: 'Facade',
    note: 'Provide one simple interface to a complex subsystem of classes.',
    model: {
      classes: [
        cls('Client', 'class', [], ['+ main(): void']),
        cls('Facade', 'class', [], ['+ operation(): void']),
        cls('SubsystemA', 'class', [], ['+ stepA(): void']),
        cls('SubsystemB', 'class', [], ['+ stepB(): void']),
        cls('SubsystemC', 'class', [], ['+ stepC(): void']),
      ],
      relations: [rel('Client', 'Facade', 'dependency', { label: 'uses' }), rel('Facade', 'SubsystemA', 'dependency'), rel('Facade', 'SubsystemB', 'dependency'), rel('Facade', 'SubsystemC', 'dependency')],
    },
  },
  {
    id: 'uml-chain-of-responsibility', name: 'UML — Chain of Responsibility', title: 'Chain of Responsibility pattern', anchor: 'Handler',
    note: 'Pass a request along a chain of handlers until one of them handles it.',
    model: {
      classes: [
        cls('Client', 'class', [], ['+ send(r: Request): void']),
        cls('Handler', 'abstract', ['# next: Handler'], ['+ setNext(h: Handler): Handler', '+ handle(r: Request): void']),
        cls('AuthHandler', 'class', [], ['+ handle(r: Request): void']),
        cls('ValidationHandler', 'class', [], ['+ handle(r: Request): void']),
        cls('LoggingHandler', 'class', [], ['+ handle(r: Request): void']),
      ],
      relations: [rel('Client', 'Handler', 'dependency', { label: 'sends to' }), rel('AuthHandler', 'Handler', 'inheritance'), rel('ValidationHandler', 'Handler', 'inheritance'), rel('LoggingHandler', 'Handler', 'inheritance')],
    },
  },
  {
    id: 'uml-template-method', name: 'UML — Template Method', title: 'Template Method pattern', anchor: 'AbstractClass',
    note: 'Define the skeleton of an algorithm in a base class and let subclasses override specific steps.',
    model: {
      classes: [
        cls('AbstractClass', 'abstract', [], ['+ templateMethod(): void', '# step1(): void', '# step2(): void', '# hook(): void']),
        cls('ConcreteClassA', 'class', [], ['# step1(): void', '# step2(): void']),
        cls('ConcreteClassB', 'class', [], ['# step1(): void', '# step2(): void', '# hook(): void']),
      ],
      relations: [rel('ConcreteClassA', 'AbstractClass', 'inheritance'), rel('ConcreteClassB', 'AbstractClass', 'inheritance')],
    },
  },
  {
    id: 'uml-mediator', name: 'UML — Mediator', title: 'Mediator pattern', anchor: 'Mediator',
    note: 'Colleagues communicate only through a mediator, which removes direct coupling between them.',
    model: {
      classes: [
        cls('Mediator', 'interface', [], ['+ notify(sender: Colleague, event: string): void']),
        cls('ConcreteMediator', 'class', ['- a: ColleagueA', '- b: ColleagueB'], ['+ notify(sender: Colleague, event: string): void']),
        cls('Colleague', 'abstract', ['# mediator: Mediator'], ['+ changed(): void']),
        cls('ColleagueA', 'class', [], ['+ doA(): void']),
        cls('ColleagueB', 'class', [], ['+ doB(): void']),
      ],
      relations: [
        rel('ConcreteMediator', 'Mediator', 'realization'),
        rel('Colleague', 'Mediator', 'association', { directed: true, toMult: '1', toRole: 'mediator' }),
        rel('ColleagueA', 'Colleague', 'inheritance'), rel('ColleagueB', 'Colleague', 'inheritance'),
        rel('ConcreteMediator', 'ColleagueA', 'association', { directed: true, toMult: '1', toRole: 'a' }),
        rel('ConcreteMediator', 'ColleagueB', 'association', { directed: true, toMult: '1', toRole: 'b' }),
      ],
    },
  },
];

export function build(p: Pattern): Diagram {
  const d = modelToDiagram(p.model);
  const classes = d.nodes.filter((n) => n.type === 'class');
  const minX = Math.min(...classes.map((n) => n.position.x));
  const minY = Math.min(...classes.map((n) => n.position.y));
  const maxX = Math.max(...classes.map((n) => n.position.x + nodeSize(n).width));
  const anchor = classes.find((n) => (n.data as { label?: string }).label === p.anchor) ?? classes[0];
  const title: DiagramNode = { id: 'uml_title', type: 'text', position: { x: minX, y: minY - 90 }, width: 520, height: 40, data: { label: p.title, fontSize: 28, bold: true } };
  const note: DiagramNode = { id: 'uml_note', type: 'sticky', position: { x: maxX + 90, y: minY }, width: 220, height: 110, data: { label: p.note, umlNote: true, fill: '#fff8c5', stroke: '#c9b037', strokeWidth: 1.2, fontSize: 12, textColor: '#3d3a1e' } };
  return { version: 1, nodes: [title, ...d.nodes, note], edges: [...d.edges, umlEdge('note_link', 'uml_note', anchor.id, { kind: 'note' })] };
}

const TAGS = ['uml', 'class', 'oop', 'ood', 'design-pattern'];
export const TEMPLATES: Template[] = PATTERNS.map((p) => ({ id: p.id, name: p.name, tags: [...TAGS, p.title.split(' ')[0].toLowerCase()], build: () => build(p) }));
