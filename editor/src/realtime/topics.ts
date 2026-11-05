/** the MQTT topic space of the diagram workspace (Backend/docs/MQTT.md). `c` is a client id, `f` a file id, `p` a project id. */
export const topics = {
  projectEvents: (p: string) => `dg/p/${p}/events`,
  projectRoster: (p: string) => `dg/p/${p}/roster/+/+`,
  fileEvents: (f: string) => `dg/f/${f}/events`,
  fileRoster: (f: string) => `dg/f/${f}/roster/+`,
  presence: (f: string, c: string) => `dg/f/${f}/presence/${c}`,
  yjsReq: (f: string, c: string) => `dg/f/${f}/yjs/req/${c}`,
  yjsUp: (f: string, c: string) => `dg/f/${f}/yjs/up/${c}`,
  yjsDown: (f: string) => `dg/f/${f}/yjs/down`,
  yjsSync: (f: string, c: string) => `dg/f/${f}/yjs/sync/${c}`,
  awarenessUp: (f: string, c: string) => `dg/f/${f}/awareness/up/${c}`,
  awarenessOut: (f: string) => `dg/f/${f}/awareness/out`,
  rtcUp: (f: string, c: string) => `dg/f/${f}/rtc/up/${c}`,
  rtcInbox: (f: string, c: string) => `dg/f/${f}/rtc/${c}`,
  ctl: (c: string) => `dg/c/${c}/ctl`,
};

/** MQTT topic-filter match (`+` one level, `#` the rest) */
export function topicMatches(filter: string, topic: string): boolean {
  const f = filter.split('/');
  const t = topic.split('/');
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '#') return true;
    if (i >= t.length) return false;
    if (f[i] !== '+' && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}
