export type InfraFormat = 'terraform' | 'terraform-json' | 'kubernetes' | 'compose' | 'cloudformation';

export class InfraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InfraError';
  }
}

/** one thing in the infrastructure: a node, or (group: true) a container such as a VPC, subnet or namespace */
export interface InfraRes {
  /** unique key (Terraform address, `Kind/namespace/name`, compose service name ...) */
  id: string;
  /** the original type: aws_instance, AWS::EC2::Instance, Deployment, compose-service ... */
  type: string;
  /** canonical kind used for grouping logic (vpc, subnet, sg, ...); empty when none */
  kind: string;
  name: string;
  subtitle?: string;
  /** catalog ids to try first (before the type rules) */
  icons?: string[];
  /** id of the group resource this one sits in */
  groupOf?: string;
  group?: boolean;
  groupKind?: 'vpc' | 'subnet' | 'subnet-public' | 'namespace' | 'network' | 'module';
  /** contracted away: edges through it connect its neighbours */
  hidden?: boolean;
}
export interface InfraEdgeRaw { from: string; to: string; label?: string }
export interface InfraModel {
  format: InfraFormat;
  resources: InfraRes[];
  edges: InfraEdgeRaw[];
  warnings: string[];
}
export interface InfraFile { name: string; text: string }
