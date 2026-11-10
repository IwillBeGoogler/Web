import { describe, expect, it } from 'vitest';
import { buildCloudModel, classify, norm, type CloudRes } from '@core/infra/aws';

const res = (id: string, type: string, refs: Record<string, string[]> = {}, extra: Partial<CloudRes> = {}): CloudRes => ({ id, type, name: id, refs, explicit: [], ...extra });
const E = (m: ReturnType<typeof buildCloudModel>) => m.edges.map((e) => `${e.from}>${e.to}${e.label ? `:${e.label}` : ''}`).sort();

describe('classify / norm', () => {
  it('maps resource types to kinds, case-insensitively, and unknown types to empty', () => {
    expect(classify('AWS_VPC')).toBe('vpc');
    expect(classify('AWS::EC2::Subnet')).toBe('subnet');
    expect(classify('aws_lb_listener_rule')).toBe('listener');
    expect(classify('aws_s3_bucket_policy')).toBe('plumbing');
    expect(classify('aws_instance')).toBe('');
    expect(norm('Subnet_Id-1')).toBe('subnetid1');
  });
});

describe('buildCloudModel grouping', () => {
  it('subnets: public by flag or by name, parented by their vpc, a module or nothing', () => {
    const m = buildCloudModel('terraform', [
      res('vpc1', 'aws_vpc'),
      res('s1', 'aws_subnet', { vpcid: ['vpc1'] }),
      res('s2', 'aws_subnet', {}, { mapPublic: true, module: 'mod' }),
      { ...res('public-b', 'aws_subnet'), name: 'public-b' },
      res('lonely', 'aws_subnet'),
      res('m1', 'aws_instance', { subnetid: ['s1'] }), res('m2', 'aws_instance', { subnetid: ['s2'] }), res('m3', 'aws_instance', { subnetid: ['public-b'] }), res('m4', 'aws_instance', { subnetid: ['lonely'] }),
    ], [], []);
    const g = (id: string) => m.resources.find((r) => r.id === id)!;
    expect(g('s1')).toMatchObject({ groupKind: 'subnet', groupOf: 'vpc1' });
    expect(g('s2')).toMatchObject({ groupKind: 'subnet-public', groupOf: undefined });
    expect(g('public-b').groupKind).toBe('subnet-public');
    expect(g('lonely')).toMatchObject({ groupKind: 'subnet', groupOf: undefined });
    expect(g('m1').groupOf).toBe('s1');
  });
  it('a resource in several subnets goes to their shared vpc, else to the first subnet; one subnet wins directly', () => {
    const base = [res('v1', 'aws_vpc'), res('v2', 'aws_vpc'), res('a', 'aws_subnet', { vpcid: ['v1'] }), res('b', 'aws_subnet', { vpcid: ['v1'] }), res('c', 'aws_subnet', { vpcid: ['v2'] }), res('d', 'aws_subnet')];
    const where = (subnets: string[]) => buildCloudModel('terraform', [...base, res('x', 'aws_instance', { subnetids: subnets })], [], []).resources.find((r) => r.id === 'x')!.groupOf;
    expect(where(['a'])).toBe('a');
    expect(where(['a', 'b'])).toBe('v1');
    expect(where(['a', 'c'])).toBe('a');
    expect(where(['d', 'a'])).toBe('d');
    expect(where(['d', 'd'])).toBe('d');
  });
  it('subnet groups lead to their subnets; a vpc is inferred through security groups; modules are the last resort', () => {
    const items = [
      res('v', 'aws_vpc'), res('s', 'aws_subnet', { vpcid: ['v'] }), res('sg', 'aws_security_group', { vpcid: ['v'] }), res('sgx', 'aws_security_group'),
      res('grp', 'aws_db_subnet_group', { subnetids: ['s'] }),
      res('db', 'aws_db_instance', { dbsubnetgroupname: ['grp'] }),
      res('ec2', 'aws_instance', { vpcsecuritygroupids: ['sg'] }),
      res('ec2b', 'aws_instance', { vpcsecuritygroupids: ['sgx'] }, { module: 'm1' }),
      res('own', 'aws_instance', { vpcid: ['v'] }),
    ];
    const m = buildCloudModel('terraform', items, [], []);
    const at = (id: string) => m.resources.find((r) => r.id === id)?.groupOf;
    expect(at('db')).toBe('s');
    expect(at('ec2')).toBe('v');
    expect(at('own')).toBe('v');
    expect(at('ec2b')).toBeUndefined();
  });
});

describe('buildCloudModel edges', () => {
  it('references, explicit dependencies and structural attributes', () => {
    const m = buildCloudModel('terraform', [res('v', 'aws_vpc'), res('a', 'aws_instance', { vpcid: ['v'], role: ['b', 'a', 'ghost', 'v'] }, { explicit: ['b', 'ghost'] }), res('b', 'aws_instance')], [], []);
    expect(E(m)).toEqual(['a>b:depends on']); // the plain reference and the explicit one are merged
  });
  it('security group rules connect users of the source to users of the target, never to themselves', () => {
    const items = [res('src', 'aws_security_group'), res('dst', 'aws_security_group'), res('web', 'aws_instance', { securitygroups: ['src'] }), res('both', 'aws_instance', { securitygroups: ['src', 'dst'] }), res('db', 'aws_db_instance', { securitygroups: ['dst'] })];
    const m = buildCloudModel('terraform', items, [{ target: 'dst', sources: ['src', 'nobody'], port: '5432' }, { target: 'dst', sources: ['src'], port: '' }, { target: 'unused', sources: ['src'], port: '1' }], []);
    expect(E(m)).toEqual(['both>db::5432', 'web>both::5432', 'web>db::5432']);
    expect(m.edges.some((e) => e.from === e.to)).toBe(false);
  });
  it('pass-through resources become direct edges: listeners, target group attachments, DNS records, subscriptions, event mappings', () => {
    const items = [
      res('lb', 'aws_lb'), res('tg', 'aws_lb_target_group'), res('listener', 'aws_lb_listener', { loadbalancerarn: ['lb'], defaultactiontargetgrouparn: ['tg'] }),
      res('lonely-listener', 'aws_lb_listener', { loadbalancerarn: ['lb'] }),
      res('app', 'aws_instance'), res('att', 'aws_lb_target_group_attachment', { targetgrouparn: ['tg'], targetid: ['app'] }),
      res('att2', 'aws_lb_target_group_attachment', { targetgrouparn: ['tg'] }),
      res('zone', 'aws_route53_zone'), res('rec', 'aws_route53_record', { zoneid: ['zone'], alias: ['lb'] }), res('rec2', 'aws_route53_record', { alias: ['lb'] }),
      res('topic', 'aws_sns_topic'), res('q', 'aws_sqs_queue'), res('fn', 'aws_lambda_function'),
      res('sub1', 'aws_sns_topic_subscription', { topicarn: ['topic'], endpoint: ['q'] }), res('sub2', 'aws_sns_topic_subscription', { topicarn: ['topic'], functionarn: ['fn'] }), res('sub3', 'aws_sns_topic_subscription', { endpoint: ['q'] }),
      res('map', 'aws_lambda_event_source_mapping', { eventsourcearn: ['q'], functionname: ['fn'] }), res('map2', 'aws_lambda_event_source_mapping', { functionname: ['fn'] }),
    ];
    const m = buildCloudModel('terraform', items, [], []);
    expect(E(m)).toEqual(['lb>app', 'q>fn', 'topic>fn', 'topic>q', 'zone>lb']); // the target group is contracted away
  });
});
