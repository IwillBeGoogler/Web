import { describe, expect, it } from 'vitest';
import { parseHcl } from '@core/infra/hcl';
import { parseTerraform, referencedIds } from '@core/infra/terraform';
import { InfraError } from '@core/infra';

describe('parseHcl', () => {
  it('reads blocks, labels, attrs, nested blocks and comments', () => {
    const f = parseHcl('# c\n// c2\n/* multi\nline */\nresource "aws_vpc" main {\n  cidr = "10.0.0.0/16" # trailing\n  tags = { a = 1 }\n  list = [1, (2), "x}"]\n  nested { x = "${var.a}" }\n}\r\n');
    expect(f.blocks).toHaveLength(1);
    const b = f.blocks[0];
    expect(b.type).toBe('resource');
    expect(b.labels).toEqual(['aws_vpc', 'main']);
    expect(b.attrs.cidr).toBe('"10.0.0.0/16"');
    expect(b.attrs.tags).toBe('{ a = 1 }');
    expect(b.blocks[0].attrs.x).toBe('"${var.a}"');
    expect(b.line).toBe(5);
  });
  it('quoted attribute names, heredocs, block comments inside expr', () => {
    const f = parseHcl('x {\n  "quoted" = 1\n  h = <<-EOT\n  a } b\n  EOT\n  g = 1 /* c */ + 2\n  e = "a\\"b"\n  y = 1 == 2\n}\n');
    expect(f.blocks[0].attrs.quoted).toBe('1');
    expect(f.blocks[0].attrs.y).toBe('1 == 2');
  });
  it('heredoc ok and attr == not treated as assignment', () => {
    const f = parseHcl('x {\n  h = <<EOT\nbody\nEOT\n  z = "a"\n  q = 1 // c\n  r = 2 /* c */\n}\n');
    expect(f.blocks[0].attrs.h).toContain('body');
    expect(f.blocks[0].attrs.z).toBe('"a"');
    expect(f.blocks[0].attrs.q).toBe('1');
  });
  it('bad heredoc opener is skipped', () => {
    expect(() => parseHcl('x {\n  a = <<\n}\n')).not.toThrow();
  });
  it('throws on malformed input', () => {
    expect(() => parseHcl('/* open')).toThrow(/unterminated comment/);
    expect(() => parseHcl('a = "abc')).toThrow(/unterminated string/);
    expect(() => parseHcl('a = "abc\ndef"')).toThrow(/unterminated string/);
    expect(() => parseHcl('a = "${abc"')).toThrow(/unclosed interpolation|unterminated/);
    expect(() => parseHcl('a = [1, 2')).toThrow(/unclosed/);
    expect(() => parseHcl('a = <<EOT\nnever')).toThrow(/unterminated heredoc/);
    expect(() => parseHcl('a {')).toThrow(/unclosed "\{"/);
    expect(() => parseHcl('}')).toThrow(/unexpected "\}"/);
    expect(() => parseHcl('@')).toThrow(/unexpected "@"/);
    expect(() => parseHcl('a b c')).toThrow(/expected "=" or "\{"/);
  });
});

describe('referencedIds', () => {
  it('finds known resource and module refs, skips data sources and unknown', () => {
    const known = new Set(['aws_vpc.main', 'module.net']);
    expect(referencedIds('aws_vpc.main.id + data.aws_vpc.main.id + module.net.out + aws_x.y + module.zzz', known)).toEqual(['aws_vpc.main', 'module.net']);
  });
});

describe('parseTerraform', () => {
  const tf = `
resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16" }
resource "aws_subnet" "a" {
  vpc_id = aws_vpc.main.id
  map_public_ip_on_launch = true
}
resource "aws_security_group" "web" {
  vpc_id = aws_vpc.main.id
  ingress { from_port = 80
 to_port = 80 }
  egress { cidr_blocks = ["0.0.0.0/0"] }
}
resource "aws_security_group" "db" {
  vpc_id = aws_vpc.main.id
  ingress {
    from_port = 5432
    to_port = 5440
    security_groups = [aws_security_group.web.id]
  }
}
resource "aws_security_group_rule" "r" {
  type = "ingress"
  security_group_id = aws_security_group.web.id
  source_security_group_id = aws_security_group.db.id
  from_port = 22
}
resource "aws_security_group_rule" "out" {
  type = "egress"
  security_group_id = aws_security_group.web.id
}
resource "aws_instance" "app" {
  instance_type = "t3.micro"
  subnet_id = aws_subnet.a.id
  vpc_security_group_ids = [aws_security_group.web.id, aws_instance.app.id]
  depends_on = [aws_vpc.main]
  root_block_device { x = aws_vpc.main.id }
}
resource "aws_instance" "app" { instance_type = "t3.large" }
resource "aws_foo" { }
module "net" { source = "./net" }
module "x" { source = "./x"
 net = module.net.id }
`;
  it('builds a model with dup warning', () => {
    const m = parseTerraform([{ name: 'main.tf', text: tf }]);
    expect(m.warnings.join()).toMatch(/declared twice/);
    expect(m.resources.length).toBeGreaterThan(4);
  });
  it('warns on empty, wraps parse errors with file name', () => {
    expect(parseTerraform([{ name: 'a.tf', text: '' }]).warnings.join()).toMatch(/No resources/);
    expect(() => parseTerraform([{ name: 'bad.tf', text: 'a {' }])).toThrow(/bad\.tf: HCL/);
    expect(() => parseTerraform([{ name: 'bad.tf', text: 'a {' }])).toThrow(InfraError);
  });
});
