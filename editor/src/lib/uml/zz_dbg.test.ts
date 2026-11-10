import { expect, it } from 'vitest';
import { parseCSharp } from './csharp';

it('c# generic method is skipped, plain/this-param methods are kept', () => {
  const ops = (s: string) => parseCSharp(s).model.classes[0].operations;
  expect(ops('class B { List<int> Make<T>(int n) { } }')).toEqual([]);
  expect(ops('class B { List<int> Make(int n) { } }')[0]).toMatchObject({ name: 'Make', type: 'List<int>' });
  expect(ops('class B { int Make(this B self) { } }')[0].params).toEqual([{ name: 'self', type: 'B' }]);
});
