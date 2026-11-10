import { describe, expect, it } from 'vitest';
import { parsePython } from './python';
import type { UmlModel } from './model';

const cls = (m: UmlModel, n: string) => m.classes.find((c) => c.name === n)!;
const rel = (m: UmlModel, from: string, to: string, kind?: string) => m.relations.find((r) => r.from === from && r.to === to && (!kind || r.kind === kind));

describe('python cov: logical lines', () => {
  it('handles CRLF, comments, triple-quoted docstrings (single and multi-line), continuation lines', () => {
    const src = [
      'class A:  # comment',
      '    """one line doc"""',
      '    x: int = 1',
      '    \'\'\'',
      '    multi',
      '    line \'\'\'',
      '    y: str = "a#b"',
      '    z: int = 1 + \\',
      '        2',
      '    def f(self,',
      '          a: int,',
      '          b: str) -> int:',
      '        return 1',
      '    """start',
      'end""" ',
      '    w: int = 3',
      '',
    ].join('\r\n');
    const { model } = parsePython(src);
    const a = cls(model, 'A');
    expect(a.attributes.map((x) => x.name)).toEqual(['x', 'y', 'z', 'w']);
    expect(a.attributes.find((x) => x.name === 'y')?.default).toBe('"a#b"');
    expect(a.attributes.find((x) => x.name === 'z')?.default).toBe('1 + 2');
    expect(a.operations[0]).toMatchObject({ name: 'f', params: [{ name: 'a', type: 'int' }, { name: 'b', type: 'str' }], type: 'int' });
  });
  it('unterminated bracket flushes at EOF; escape in string; leftover docstring close with trailing code', () => {
    const { model } = parsePython('class A:\n    x: "a\\"b" = 1\n    def f(self, a:\n');
    expect(cls(model, 'A')).toBeDefined();
    const r = parsePython('class B:\n    """doc\n    """ ; x: int = 1\n').model;
    expect(cls(r, 'B')).toBeDefined();
  });
});

describe('python cov: classes', () => {
  it('bases: ABC, ABCMeta, Protocol[T], Generic[T], Enum variants, object/NamedTuple/TypedDict, keyword args', () => {
    const { model } = parsePython(`
from abc import ABC
class A(ABC): pass
class M(metaclass=ABCMeta): pass
class M2(ABCMeta): pass
class P(Protocol[T]):
    def run(self) -> None: ...
class P2(Protocol): ...
class G(Generic[T, K], Base): ...
class G2(Generic): ...
class E(Enum):
    RED = 1
    GREEN = 2
    RED = 3
    name: str
class S(StrEnum):
    A = "a"
class O(object, NamedTuple, TypedDict): ...
class Sub(P): ...
`);
    expect(cls(model, 'A').kind).toBe('abstract');
    expect(cls(model, 'M2').kind).toBe('abstract');
    expect(cls(model, 'P')).toMatchObject({ kind: 'interface', generics: 'T' });
    expect(cls(model, 'P2').kind).toBe('interface');
    expect(cls(model, 'G').generics).toBe('T, K');
    expect(cls(model, 'G2').generics).toBeUndefined();
    expect(cls(model, 'E').kind).toBe('enum');
    expect(cls(model, 'E').attributes.map((a) => a.name)).toEqual(['RED', 'GREEN']);
    expect(cls(model, 'S').attributes.map((a) => a.name)).toEqual(['A']);
    expect(rel(model, 'G', 'Base', 'inheritance')).toBeDefined();
    expect(rel(model, 'Sub', 'P', 'realization')).toBeDefined();
    expect(model.relations.some((r) => r.from === 'O')).toBe(false);
  });

  it('members: visibility prefixes, properties, setters, static/class/abstract methods, async def, dunders', () => {
    const { model } = parsePython(`
class A:
    count: int = 0
    _prot = 5
    __priv: str
    limit = 10
    @property
    def name(self) -> str:
        return self._n
    @name.setter
    def name(self, v): ...
    @cached_property
    def big(self) -> "int": ...
    @prop.getter
    def g(self): ...
    @staticmethod
    def make(x: int = 3, *args, **kw) -> "A": ...
    @classmethod
    def build(cls, /, a, *, b: int): ...
    @abc.abstractmethod
    def ab(self): ...
    @abstractmethod
    def ab2(self): ...
    async def run(self, a: list[int] = [1, 2]) -> None:
        pass
    def _helper(self): ...
    def __secret(self): ...
    def __init__(self, a: int, b: "B", c, d=None):
        self.a = a
        self.b = b
        self.c = c
        self.d: float = 1.0
        self.e = 5
        self.a = a
        self.__hidden: int
    x = 1
    if True:
        pass
    return_value: int
    print: int
    @deco(1)
    y: int
`);
    const a = cls(model, 'A');
    const at = (n: string) => a.attributes.find((x) => x.name === n);
    expect(at('count')).toMatchObject({ visibility: '+', type: 'int', default: '0' });
    expect(at('prot')).toMatchObject({ visibility: '#', static: true, default: '5' });
    expect(at('priv')).toMatchObject({ visibility: '-', type: 'str' });
    expect(at('name')).toMatchObject({ type: 'str' });
    expect(at('big')).toMatchObject({ type: 'int' });
    expect(at('g')).toBeDefined();
    expect(at('a')).toMatchObject({ type: 'int' });
    expect(at('b')).toMatchObject({ type: 'B' });
    expect(at('c')).toBeDefined();
    expect(at('c')?.type).toBeUndefined();
    expect(at('d')).toMatchObject({ type: 'float' });
    expect(at('hidden')).toMatchObject({ visibility: '-', type: 'int' });
    expect(a.operations.filter((o) => o.name === 'name')).toEqual([]);
    const op = (n: string) => a.operations.find((o) => o.name === n)!;
    expect(op('make')).toMatchObject({ static: true, type: 'A', params: [{ name: 'x', type: 'int' }, { name: '*args' }, { name: '**kw' }] });
    expect(op('build')).toMatchObject({ static: true });
    expect(op('build').params.map((p) => p.name)).toEqual(['a', 'b']);
    expect(op('ab').abstract).toBe(true);
    expect(op('ab2').abstract).toBe(true);
    expect(op('run')).toMatchObject({ type: 'None', visibility: '+' });
    expect(op('helper').visibility).toBe('#');
    expect(op('secret').visibility).toBe('-');
    expect(op('__init__').visibility).toBe('+');
  });

  it('nested classes (in class body and inside methods), repeat declarations, malformed class header', () => {
    const { model } = parsePython(`
class Outer:
    class Inner:
        v: int
    def m(self):
        class Local:
            w: int
        return 1
    z: int
class Outer2(Base): ...
class Outer2(Other):
    q: int
class
class Bad Header
def top():
    class InFn:
        k: int
`);
    expect(cls(model, 'Inner').attributes.map((a) => a.name)).toEqual(['v']);
    expect(cls(model, 'Local').attributes.map((a) => a.name)).toEqual(['w']);
    expect(cls(model, 'Outer').attributes.map((a) => a.name)).toEqual(['z']);
    expect(rel(model, 'Outer2', 'Base')).toBeDefined();
    expect(rel(model, 'Outer2', 'Other')).toBeDefined();
    expect(cls(model, 'InFn')).toBeDefined();
  });

  it('inline body class, class with no body, decorators at top level and before nested class', () => {
    const { model } = parsePython(`
@dataclass
class D: x = 1
@dataclass(frozen=True)
class E:
    @dataclass
    class N:
        a: int
    b: int
class F:
class G:
    x: int
`);
    expect(cls(model, 'D')).toBeDefined();
    expect(cls(model, 'N').attributes.length).toBe(1);
    expect(cls(model, 'E').attributes.map((a) => a.name)).toEqual(['b']);
    expect(cls(model, 'F')).toBeDefined();
    expect(cls(model, 'G').attributes.length).toBe(1);
  });

  it('deeper indented lines inside class body are skipped', () => {
    const { model } = parsePython(`
class A:
    x: int
        stray: int
    y: int
`);
    expect(cls(model, 'A').attributes.map((a) => a.name)).toEqual(['x', 'y']);
  });
});

describe('python cov: associations', () => {
  it('unions, Optional, Union, collections, mappings, quoted, plain, unknown', () => {
    const { model } = parsePython(`
class B1: ...
class B2: ...
class B3: ...
class B4: ...
class B5: ...
class B6: ...
class B7: ...
class B8: ...
class B9: ...
class C1: ...
class C2: ...
class C3: ...
class H:
    a: B1
    b: B2 | None
    c: B3 | B4
    d: Optional[B5]
    e: Union[B6, None]
    f: Union[B7, B8]
    g: list[B9]
    h: dict[str, C1]
    i: dict
    j: "C2"
    k: Unknown[B3]
    l: mod.C3
    m: Dict[str, list[B5]]
    n: list[B6 | None]
    o: int
`);
    const m = model.relations.filter((r) => r.kind === 'association').map((r) => `${r.toRole}:${r.to}:${r.toMult}`);
    expect(m).toEqual(expect.arrayContaining(['a:B1:1', 'b:B2:0..1', 'c:B3:1', 'c:B4:1', 'd:B5:0..1', 'e:B6:0..1', 'f:B7:1', 'f:B8:1', 'g:B9:0..*', 'h:C1:0..*', 'j:C2:1', 'l:C3:1']));
    expect(m.some((x) => x.startsWith('i:') || x.startsWith('k:') || x.startsWith('o:'))).toBe(false);
  });
});
