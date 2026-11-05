import { finalizeModel } from './finalize';
import type { InfraEdgeRaw, InfraFormat, InfraModel, InfraRes } from './types';

/** a resource as the AWS-like layer sees it, independent of whether it came from Terraform or CloudFormation */
export interface CloudRes {
  id: string;
  type: string;
  name: string;
  /** normalized attribute name -> ids of the resources referenced anywhere inside that attribute */
  refs: Record<string, string[]>;
  explicit: string[];
  subtitle?: string;
  mapPublic?: boolean;
  /** ingress rules written on a security group itself (sources are security group ids) */
  rules?: { sources: string[]; port: string }[];
  /** group resource id from a Terraform module */
  module?: string;
  /** a hint for a node whose type has no rule (e.g. the engine of a database) */
  icons?: string[];
}
export interface CloudRule { target: string; sources: string[]; port: string }

export const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const kindTable: [RegExp, string][] = [
  [/^(aws_vpc|aws::ec2::vpc|google_compute_network|azurerm_virtual_network)$/i, 'vpc'],
  [/^(aws_subnet|aws::ec2::subnet|google_compute_subnetwork|azurerm_subnet)$/i, 'subnet'],
  [/^(aws_security_group|aws::ec2::securitygroup)$/i, 'sg'],
  [/^(aws_security_group_rule|aws_vpc_security_group_ingress_rule|aws::ec2::securitygroupingress)$/i, 'sg_rule'],
  [/^(aws_db_subnet_group|aws::rds::dbsubnetgroup|aws_elasticache_subnet_group|aws::elasticache::subnetgroup|aws_redshift_subnet_group)$/i, 'subnet_group'],
  [/^(aws_lb_listener|aws_alb_listener|aws::elasticloadbalancingv2::listener|aws_lb_listener_rule)$/i, 'listener'],
  [/^(aws_lb_target_group|aws_alb_target_group|aws::elasticloadbalancingv2::targetgroup)$/i, 'tg'],
  [/^(aws_lb_target_group_attachment|aws_alb_target_group_attachment|aws_autoscaling_attachment)$/i, 'tg_attach'],
  [/^(aws_route53_record|aws::route53::recordset)$/i, 'record'],
  [/^(aws_sns_topic_subscription|aws::sns::subscription)$/i, 'sns_sub'],
  [/^(aws_lambda_event_source_mapping|aws::lambda::eventsourcemapping)$/i, 'event_mapping'],
  [/^(aws_route_table|aws_route|aws_route_table_association|aws_main_route_table_association|aws_network_acl\w*|aws_eip\w*|aws_key_pair|aws_lambda_permission|aws_cloudwatch_log_group|aws_s3_bucket_\w+|aws_iam_\w+|aws_sqs_queue_policy|aws_sns_topic_policy|aws_vpc_endpoint\w*|aws_vpc_dhcp\w*|aws_default_\w+|aws_flow_log|aws_ssm_parameter|aws_cloudwatch_metric_alarm|aws::ec2::route|aws::ec2::routetable|aws::ec2::subnetroutetableassociation|aws::ec2::vpcgatewayattachment|aws::ec2::eip|aws::iam::\w+|aws::lambda::permission|aws::sqs::queuepolicy|aws::s3::bucketpolicy|aws::logs::loggroup|aws::ec2::networkacl\w*|aws::ec2::keypair|aws::sns::topicpolicy|aws::cloudwatch::alarm|aws::ssm::parameter)$/i, 'plumbing'],
];
export function classify(type: string): string {
  for (const [re, kind] of kindTable) if (re.test(type)) return kind;
  return '';
}
const STRUCT = new Set(['vpc', 'subnet', 'sg', 'sg_rule', 'subnet_group', 'plumbing']);
const PASS = new Set(['listener', 'tg', 'tg_attach', 'record', 'sns_sub', 'event_mapping']);

const KEYS = {
  vpc: ['vpcid', 'vpc', 'network', 'virtualnetworkname'],
  subnet: ['subnetid', 'subnetids', 'subnets', 'subnet', 'subnetworks', 'subnetwork', 'vpczoneidentifier', 'vpcsubnetids'],
  subnetGroup: ['dbsubnetgroupname', 'dbsubnetgroup', 'subnetgroupname', 'cachesubnetgroupname', 'subnetgroup', 'subnetgroupids'],
  sg: ['securitygroups', 'securitygroupids', 'vpcsecuritygroupids', 'vpcsecuritygroups', 'securitygroup', 'securitygroupid'],
};
const pick = (r: CloudRes, keys: string[]): string[] => [...new Set(keys.flatMap((k) => r.refs[k] ?? []))];
const pickLike = (r: CloudRes, part: string): string[] => [...new Set(Object.entries(r.refs).filter(([k]) => k.includes(part)).flatMap(([, v]) => v))];

/** groups, plumbing and edges for AWS-style resources (also reasonable for GCP / Azure networks) */
export function buildCloudModel(format: InfraFormat, items: CloudRes[], rules: CloudRule[], warnings: string[], modules: InfraRes[] = []): InfraModel {
  const byId = new Map(items.map((r) => [r.id, r]));
  const kind = (id: string) => classify(byId.get(id)?.type ?? '');
  const subnetsOf = (r: CloudRes): string[] => {
    const direct = pick(r, KEYS.subnet).filter((x) => kind(x) === 'subnet');
    const viaGroup = pick(r, KEYS.subnetGroup).filter((x) => kind(x) === 'subnet_group').flatMap((g) => pick(byId.get(g)!, KEYS.subnet).filter((x) => kind(x) === 'subnet'));
    return [...new Set([...direct, ...viaGroup])];
  };
  const vpcOf = (r: CloudRes): string | undefined => {
    const own = pick(r, KEYS.vpc).find((x) => kind(x) === 'vpc');
    if (own) return own;
    const sgs = pick(r, KEYS.sg).filter((x) => kind(x) === 'sg');
    for (const sg of sgs) {
      const v = pick(byId.get(sg)!, KEYS.vpc).find((x) => kind(x) === 'vpc');
      if (v) return v;
    }
    return undefined;
  };

  const resources: InfraRes[] = [...modules];
  for (const r of items) {
    const k = classify(r.type);
    const base: InfraRes = { id: r.id, type: r.type, kind: k, name: r.name, ...(r.subtitle ? { subtitle: r.subtitle } : {}), ...(r.icons ? { icons: r.icons } : {}) };
    if (k === 'vpc') resources.push({ ...base, group: true, groupKind: 'vpc', groupOf: r.module });
    else if (k === 'subnet') resources.push({ ...base, group: true, groupKind: r.mapPublic || /public/i.test(r.name) ? 'subnet-public' : 'subnet', groupOf: vpcOf(r) ?? r.module });
    else if (STRUCT.has(k) || PASS.has(k)) resources.push({ ...base, hidden: true });
    else {
      const subs = subnetsOf(r);
      let groupOf: string | undefined;
      if (subs.length === 1) groupOf = subs[0];
      else if (subs.length > 1) {
        const vpcs = [...new Set(subs.map((s) => pick(byId.get(s)!, KEYS.vpc).find((x) => kind(x) === 'vpc')))];
        groupOf = vpcs.length === 1 && vpcs[0] ? vpcs[0] : subs[0];
      } else groupOf = vpcOf(r);
      resources.push({ ...base, groupOf: groupOf ?? r.module });
    }
  }

  const edges: InfraEdgeRaw[] = [];
  const users = new Map<string, string[]>(); // sg id -> resources using it
  for (const r of items) {
    const k = classify(r.type);
    if (STRUCT.has(k) || PASS.has(k)) continue;
    for (const sg of pick(r, KEYS.sg).filter((x) => kind(x) === 'sg')) users.set(sg, [...(users.get(sg) ?? []), r.id]);
  }
  const structKeys = new Set([...KEYS.vpc, ...KEYS.subnet, ...KEYS.subnetGroup, ...KEYS.sg]);
  for (const r of items) {
    const k = classify(r.type);
    if (STRUCT.has(k) || PASS.has(k)) continue;
    for (const [attr, ids] of Object.entries(r.refs)) {
      if (structKeys.has(attr)) continue;
      for (const x of ids) if (x !== r.id && byId.has(x) && !STRUCT.has(kind(x))) edges.push({ from: r.id, to: x });
    }
    for (const x of r.explicit) if (byId.has(x) && !STRUCT.has(kind(x))) edges.push({ from: r.id, to: x, label: 'depends on' });
  }
  // security groups: who may talk to whom
  for (const rule of rules) {
    for (const src of rule.sources)
      for (const a of users.get(src) ?? [])
        for (const b of users.get(rule.target) ?? []) if (a !== b) edges.push({ from: a, to: b, label: rule.port ? `:${rule.port}` : undefined });
  }
  // pass-through resources: say who really talks to whom
  for (const r of items) {
    const k = classify(r.type);
    if (k === 'listener') {
      for (const lb of pickLike(r, 'loadbalancer')) for (const tg of pickLike(r, 'targetgroup')) edges.push({ from: lb, to: tg });
    } else if (k === 'tg_attach') {
      for (const tg of pickLike(r, 'targetgroup')) for (const t of pick(r, ['targetid', 'elb', 'autoscalinggroupname', 'lbtargetgrouparn'])) edges.push({ from: tg, to: t });
    } else if (k === 'record') {
      const zones = pickLike(r, 'zoneid');
      for (const z of zones) for (const [attr, ids] of Object.entries(r.refs)) if (!attr.includes('zoneid')) for (const t of ids) edges.push({ from: z, to: t });
    } else if (k === 'sns_sub') {
      for (const topic of pickLike(r, 'topic')) for (const to of [...pick(r, ['endpoint']), ...pickLike(r, 'queue'), ...pickLike(r, 'function')]) edges.push({ from: topic, to });
    } else if (k === 'event_mapping') {
      for (const src of pickLike(r, 'eventsource')) for (const fn of pickLike(r, 'function')) edges.push({ from: src, to: fn });
    }
  }
  return finalizeModel({ format, resources, edges, warnings });
}
