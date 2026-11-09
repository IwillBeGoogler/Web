import { describe, expect, it } from 'vitest';
import { detectInfraFormat, importInfra, InfraError, parseInfra } from '@core/infra';
import { isTerraformJson, parseTerraformJson } from '@core/infra/terraformJson';
import { isCloudFormation, parseCloudFormation } from '@core/infra/cloudformation';
import { isKubernetes, parseKubernetes } from '@core/infra/kubernetes';
import { yamlDocuments } from '@core/infra/yamlish';

const edgeLabels = (m: { edges: { from: string; to: string; label?: string }[] }) => m.edges.map((e) => `${e.from}>${e.to}${e.label ? `:${e.label}` : ''}`);

describe('terraform json', () => {
  const plan = {
    format_version: '1.2',
    planned_values: {
      root_module: {
        resources: [
          { address: 'aws_vpc.main', type: 'aws_vpc', name: 'main', values: { id: 'vpc-12345' } },
          { address: 'aws_subnet.a', type: 'aws_subnet', name: 'a', values: { id: 'subnet-1', vpc_id: 'vpc-12345', map_public_ip_on_launch: true } },
          { address: 'aws_security_group.web', type: 'aws_security_group', name: 'web', values: { id: 'sg-web', vpc_id: 'vpc-12345' } },
          {
            address: 'aws_security_group.db',
            type: 'aws_security_group',
            name: 'db',
            values: { id: 'sg-db', ingress: [{ from_port: 5432, to_port: 5432, security_groups: ['sg-web'] }, { from_port: 1, to_port: 9, security_groups: ['nope'] }, { security_groups: null }] },
          },
          { address: 'aws_instance.app', type: 'aws_instance', name: 'app', values: { id: 'i-abc', instance_type: 't3.micro', subnet_id: 'subnet-1', vpc_security_group_ids: ['sg-web'] }, depends_on: ['aws_vpc.main'] },
          { address: 'aws_db_instance.pg', type: 'aws_db_instance', name: 'pg', values: { engine: 'postgres', arn: 'arn:aws:rds:x' } },
        ],
        child_modules: [
          { address: 'module.net', resources: [{ address: 'module.net.aws_nat_gateway.n', type: 'aws_nat_gateway', name: 'n', values: {} }], child_modules: [{ address: 'module.net.module.in', resources: [{ address: 'module.net.module.in["x"].aws_eip.e', type: 'aws_eip', name: 'e', values: {} }] }] },
        ],
      },
    },
    configuration: {
      root_module: {
        resources: [{ address: 'aws_instance.app', expressions: { subnet_id: { references: ['aws_subnet.a.id', 'aws_subnet.a'] }, tags: [{ references: ['aws_db_instance.pg.arn', 'var.x', 'module.net'] }] }, depends_on: ['aws_security_group.db'] }],
        module_calls: { net: { module: { resources: [{ address: 'aws_nat_gateway.n', expressions: { allocation_id: { references: ['module.in.aws_eip.e'] } } }], module_calls: {} } } },
      },
    },
  };

  it('detects plans and states, not other json', () => {
    expect(isTerraformJson(plan)).toBe(true);
    expect(isTerraformJson({ format_version: '1', values: {} })).toBe(true);
    expect(isTerraformJson({ format_version: 1, values: {} })).toBe(false);
    expect(isTerraformJson({ format_version: '1' })).toBe(false);
    expect(isTerraformJson(null)).toBe(false);
    expect(isTerraformJson('x')).toBe(false);
  });

  it('builds a model from a plan with modules, references, id matching and rules', () => {
    const m = parseTerraformJson(plan);
    expect(m.format).toBe('terraform-json');
    expect(m.resources.length).toBeGreaterThan(5);
    expect(m.resources.some((r) => r.groupKind === 'module')).toBe(true);
    expect(m.edges.length).toBeGreaterThan(0);
  });

  it('reads state values and prior_state, and rejects json without values', () => {
    expect(parseTerraformJson({ format_version: '1', values: { root_module: { resources: [{ address: 'aws_s3_bucket.b', type: 'aws_s3_bucket', name: 'b' }] } } }).resources).toHaveLength(1);
    expect(parseTerraformJson({ format_version: '1', prior_state: { values: { root_module: { resources: [] } } } }).warnings.join()).toMatch(/No resources/);
    expect(() => parseTerraformJson({ format_version: '1', configuration: {} })).toThrow(InfraError);
  });

  it('goes through parseInfra and rejects several json files', () => {
    const text = JSON.stringify(plan);
    expect(parseInfra([{ name: 'plan.json', text }]).format).toBe('terraform-json');
    expect(() => parseInfra([{ name: 'a.json', text }, { name: 'b.json', text }])).toThrow(/one Terraform JSON/);
  });
});

describe('cloudformation', () => {
  const tpl = {
    AWSTemplateFormatVersion: '2010-09-09',
    Resources: {
      Vpc: { Type: 'AWS::EC2::VPC', Properties: { CidrBlock: '10.0.0.0/16' } },
      Subnet: { Type: 'AWS::EC2::Subnet', Properties: { VpcId: { Ref: 'Vpc' }, MapPublicIpOnLaunch: 'true' } },
      Subnet2: { Type: 'AWS::EC2::Subnet', Properties: { VpcId: { 'Fn::GetAtt': ['Vpc', 'Arn'] }, MapPublicIpOnLaunch: true } },
      WebSg: { Type: 'AWS::EC2::SecurityGroup', Properties: { VpcId: { Ref: 'Vpc' }, SecurityGroupIngress: [{ FromPort: 80, ToPort: 80 }, { FromPort: 1, ToPort: 9 }, { FromPort: 22 }, {}] } },
      DbSg: {
        Type: 'AWS::EC2::SecurityGroup',
        Properties: { VpcId: { Ref: 'Vpc' }, SecurityGroupIngress: [{ SourceSecurityGroupId: { Ref: 'WebSg' }, FromPort: 5432, ToPort: 5432 }] },
      },
      Rule: { Type: 'AWS::EC2::SecurityGroupIngress', Properties: { GroupId: { 'Fn::GetAtt': 'DbSg.GroupId' }, SourceSecurityGroupId: { Ref: 'WebSg' }, FromPort: 3306 } },
      Web: {
        Type: 'AWS::EC2::Instance',
        DependsOn: 'Vpc',
        Properties: { InstanceType: 't3.micro', SubnetId: { Ref: 'Subnet' }, SecurityGroupIds: [{ Ref: 'WebSg' }], UserData: { 'Fn::Sub': ['${Db} ${Vpc.Arn} ${x}', { x: { Ref: 'Subnet2' } }] } },
      },
      Db: { Type: 'AWS::RDS::DBInstance', DependsOn: ['Web', 'Missing'], Properties: { DBInstanceClass: 'db.t3.micro', VPCSecurityGroups: [{ Ref: 'DbSg' }], Deep: { a: { b: { c: { d: { e: { f: { g: { h: { Ref: 'Vpc' } } } } } } } } } } },
      Broken: { Properties: {} },
      Sub: { Type: 'AWS::SNS::Topic', Properties: { Sub1: { 'Fn::Sub': '${Web}' } } },
    },
  };

  it('detects templates', () => {
    expect(isCloudFormation(tpl)).toBe(true);
    expect(isCloudFormation({ Resources: { A: { Type: 'AWS::S3::Bucket' } } })).toBe(true);
    expect(isCloudFormation({ Resources: { A: { Type: 'Other' } } })).toBe(false);
    expect(isCloudFormation({ Resources: null })).toBe(false);
    expect(isCloudFormation([])).toBe(false);
    expect(isCloudFormation(null)).toBe(false);
  });

  it('parses a json template with refs, GetAtt, Sub, DependsOn, rules and warnings', () => {
    const m = parseCloudFormation([{ name: 'stack.json', text: JSON.stringify(tpl) }]);
    expect(m.format).toBe('cloudformation');
    expect(m.warnings.join()).toMatch(/Broken has no Type/);
    expect(m.resources.length).toBeGreaterThanOrEqual(3);
    expect(edgeLabels(m).length).toBeGreaterThan(0);
  });

  it('parses yaml templates and merges several files', () => {
    const y = 'AWSTemplateFormatVersion: "2010-09-09"\nResources:\n  Q:\n    Type: AWS::SQS::Queue\n';
    const y2 = 'Resources:\n  B:\n    Type: AWS::S3::Bucket\n';
    const m = parseCloudFormation([{ name: 'a.yaml', text: y }, { name: 'b.yml', text: y2 }, { name: 'c.yaml', text: 'foo: 1\n' }]);
    expect(m.resources.map((r) => r.name).sort()).toEqual(['B', 'Q']);
  });

  it('reports json syntax errors and missing resources', () => {
    expect(() => parseCloudFormation([{ name: 'x.json', text: '{oops' }])).toThrow(/JSON syntax error/);
    expect(() => parseCloudFormation([{ name: 'x.yaml', text: 'a: 1\n' }])).toThrow(/No CloudFormation template/);
  });
});

describe('kubernetes', () => {
  const manifests = `
apiVersion: v1
kind: Namespace
metadata: { name: shop }
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, namespace: shop }
spec:
  replicas: 3
  template:
    metadata: { labels: { app: web } }
    spec:
      volumes:
        - { name: c, configMap: { name: cfg } }
        - { name: s, secret: { secretName: sec } }
        - { name: p, persistentVolumeClaim: { claimName: data } }
      initContainers:
        - { name: init, image: busybox, args: ["http://api.shop.svc.cluster.local/ready"] }
      containers:
        - name: web
          image: nginx:1.25
          command: ["curl", "http://db.shop.svc/x"]
          envFrom:
            - configMapRef: { name: cfg }
            - secretRef: { name: sec }
          env:
            - { name: API, value: "http://api:8080" }
            - { name: EXT, value: "http://api.other/x" }
            - { name: SCOPED, value: "http://api.shop" }
            - { name: NS, value: "http://db.shop.svc" }
            - { name: FROM_CM, valueFrom: { configMapKeyRef: { name: cfg, key: k } } }
            - { name: FROM_SEC, valueFrom: { secretKeyRef: { name: sec, key: k } } }
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: api, namespace: shop }
spec: { template: { metadata: { labels: { app: api } }, spec: { containers: [{ name: api, image: postgres:16 }] } } }
---
apiVersion: v1
kind: Service
metadata: { name: api, namespace: shop }
spec: { selector: { app: api }, ports: [{ port: 80, targetPort: 8080 }, { port: 81, targetPort: 81 }] }
---
apiVersion: v1
kind: Service
metadata: { name: db, namespace: shop }
spec: { selector: { app: web }, ports: [{ port: 5432 }] }
---
apiVersion: v1
kind: Service
metadata: { name: headless, namespace: shop }
spec: {}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: { name: ing, namespace: shop }
spec:
  defaultBackend: { service: { name: api } }
  rules:
    - host: shop.example.com
      http: { paths: [{ path: /, backend: { service: { name: api } } }, { backend: { service: { name: ghost } } }] }
    - {}
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: hpa, namespace: shop }
spec: { scaleTargetRef: { kind: Deployment, name: web }, minReplicas: 2, maxReplicas: 9 }
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: lost, namespace: shop }
spec: {}
---
apiVersion: batch/v1
kind: CronJob
metadata: { name: nightly, namespace: shop }
spec: { jobTemplate: { spec: { template: { metadata: { labels: { app: job } }, spec: { containers: [{ name: j, image: redis }] } } } } }
---
apiVersion: v1
kind: Pod
metadata: { name: lone, labels: { app: lone } }
spec: { containers: [{ name: p, image: nginx }] }
---
apiVersion: v1
kind: ConfigMap
metadata: { name: cfg, namespace: shop }
---
apiVersion: v1
kind: Secret
metadata: { name: sec, namespace: shop }
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: data, namespace: shop }
---
apiVersion: v1
kind: ServiceAccount
metadata: { name: sa, namespace: shop }
---
apiVersion: example.com/v1
kind: Widget
metadata: { name: w, namespace: shop }
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, namespace: shop }
`;

  it('detects kubernetes documents', () => {
    expect(isKubernetes(yamlDocuments(manifests, 'k.yaml'))).toBe(true);
    expect(isKubernetes([{ foo: 1 }, null])).toBe(false);
    expect(isKubernetes([{ apiVersion: 'v1', kind: 'List', items: [] }])).toBe(true);
  });

  it('builds workloads, services, ingress, hpa and config edges, with notes', () => {
    const m = parseKubernetes([{ name: 'k.yaml', text: manifests }]);
    expect(m.format).toBe('kubernetes');
    const edges = edgeLabels(m).join('\n');
    for (const needle of ['volume', 'mount', 'envFrom', 'env API', 'env FROM_CM', 'env FROM_SEC', 'shop.example.com/', 'default', '2–9', ':80→8080', ':5432']) expect(edges).toContain(needle);
    const w = m.warnings.join('\n');
    expect(w).toMatch(/appears twice/);
    expect(w).toMatch(/Unknown kinds .*Widget/);
    expect(w).toMatch(/Not drawn: .*1× ServiceAccount/);
  });

  it('flattens List kinds and rejects empty input', () => {
    const list = 'apiVersion: v1\nkind: List\nitems:\n  - apiVersion: v1\n    kind: ConfigMap\n    metadata: { name: a }\n  - apiVersion: v1\n    kind: Secret\n    metadata: { name: b }\n  - 5\n  - kind: PersistentVolume\n';
    expect(parseKubernetes([{ name: 'l.yaml', text: list }]).resources.length).toBeGreaterThanOrEqual(3);
    expect(() => parseKubernetes([{ name: 'e.yaml', text: 'a: 1\n' }])).toThrow(/No Kubernetes objects/);
  });
});

describe('infra detection', () => {
  it('detects each format by content', () => {
    expect(detectInfraFormat('resource "aws_s3_bucket" "b" {\n}\n', 'main.tf')).toBe('terraform');
    expect(detectInfraFormat('x', 'main.tf')).toBeNull();
    expect(detectInfraFormat('{"format_version":"1","values":{}}')).toBe('terraform-json');
    expect(detectInfraFormat('{"Resources":{"A":{"Type":"AWS::S3::Bucket"}}}')).toBe('cloudformation');
    expect(detectInfraFormat('{"a":1}')).toBeNull();
    expect(detectInfraFormat('{bad')).toBeNull();
    expect(detectInfraFormat('Resources:\n  A:\n    Type: AWS::S3::Bucket\n')).toBe('cloudformation');
    expect(detectInfraFormat('services:\n  web:\n    image: nginx\n')).toBe('compose');
    expect(detectInfraFormat('apiVersion: v1\nkind: ConfigMap\nmetadata: { name: a }\n')).toBe('kubernetes');
    expect(detectInfraFormat('just: text\n')).toBeNull();
    expect(() => detectInfraFormat('a: [unclosed', 'x.yaml')).toThrow();
    expect(detectInfraFormat('a: [unclosed', 'x.txt')).toBeNull();
  });

  it('parseInfra and importInfra validate their input', () => {
    expect(() => parseInfra([])).toThrow(/No files/);
    expect(() => parseInfra([{ name: 'x.txt', text: 'hello' }])).toThrow(/not recognised/);
    expect(() =>
      parseInfra([
        { name: 'a.yaml', text: 'services:\n  w:\n    image: nginx\n' },
        { name: 'b.yaml', text: 'apiVersion: v1\nkind: ConfigMap\nmetadata: { name: a }\n' },
      ]),
    ).toThrow(/different kinds/);
    const r = importInfra([{ name: 'c.yaml', text: 'services:\n  web:\n    image: nginx\n  db:\n    image: postgres\n    depends_on: [web]\n' }], { name: 'Mine' });
    expect(r.format).toBe('compose');
    expect(r.page.nodes.length).toBeGreaterThan(1);
    expect(importInfra([{ name: 'c.yaml', text: 'services:\n  web:\n    image: nginx\n' }]).page).toBeTruthy();
  });
});
