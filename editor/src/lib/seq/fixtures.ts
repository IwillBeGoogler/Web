import type { SequenceModel } from './types';

/** login flow with a nested call, a return, an alt fragment and a self message */
export const LOGIN: SequenceModel = {
  autonumber: true,
  participants: [
    { id: 'u', name: 'User', kind: 'actor' },
    { id: 'w', name: 'Web', kind: 'participant' },
    { id: 'a', name: 'Auth', kind: 'control' },
    { id: 'd', name: 'DB', kind: 'database' },
  ],
  items: [
    { type: 'message', id: 'm1', from: 'u', to: 'w', text: 'login', kind: 'sync' },
    { type: 'message', id: 'm2', from: 'w', to: 'a', text: 'verify', kind: 'sync' },
    { type: 'message', id: 'm3', from: 'a', to: 'd', text: 'find user', kind: 'sync' },
    { type: 'message', id: 'm4', from: 'd', to: 'a', text: 'row', kind: 'return' },
    { type: 'message', id: 'm5', from: 'a', to: 'a', text: 'hash', kind: 'sync' },
    {
      type: 'fragment', id: 'f1', op: 'alt',
      sections: [
        { id: 's1', guard: 'ok', items: [{ type: 'message', id: 'm6', from: 'a', to: 'w', text: 'token', kind: 'return' }] },
        { id: 's2', guard: 'else', items: [{ type: 'message', id: 'm7', from: 'a', to: 'w', text: 'denied', kind: 'return' }] },
      ],
    },
    { type: 'message', id: 'm8', from: 'w', to: 'u', text: 'done', kind: 'async' },
  ],
};
