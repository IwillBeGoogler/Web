import { describe, expect, it } from 'vitest';
import { isCompose, parseCompose } from '@core/infra/compose';
import { InfraError } from '@core/infra';

describe('compose', () => {
  it('isCompose guards', () => {
    expect(isCompose(null)).toBe(false);
    expect(isCompose([])).toBe(false);
    expect(isCompose({ services: null })).toBe(false);
    expect(isCompose({ services: {}, apiVersion: 'v1' })).toBe(false);
    expect(isCompose({ services: {} })).toBe(true);
  });
  it('throws without services', () => {
    expect(() => parseCompose([{ name: 'a.yml', text: 'foo: 1\n' }])).toThrow(InfraError);
  });
  it('merges files, handles networks, ports, env forms, volumes, links', () => {
    const a = `services:
  web:
    build: .
    ports:
      - "8080:80/tcp"
      - "443"
      - target: 3000
    networks: [front]
    depends_on: [db, ghost]
    links: ["db:database", "ghost"]
    environment:
      - DB=http://db:5432/x
      - EMPTY
    volumes:
      - data:/var/lib
      - ./local:/x
      - type: volume
        source: data
        target: /y
      - type: volume
        target: /z
  db:
    image: postgres:16
    networks:
      back: {}
    environment:
      URL: http://web:80
      NIL:
networks:
  front:
  back:
volumes:
  data:
`;
    const b = `services:
  web:
    build:
      context: ./w
  cache:
    image: redis
    networks: [default]
`;
    const m = parseCompose([{ name: 'a.yml', text: a }, { name: 'b.yml', text: b }]);
    expect(m.format).toBe('compose');
    const ids = m.resources.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['svc/web', 'svc/db', 'svc/cache', 'net/front', 'net/back', 'vol/data']));
    expect(m.edges.some((e) => e.label === 'mount')).toBe(true);
  });
});
