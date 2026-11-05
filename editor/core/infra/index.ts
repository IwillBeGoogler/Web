import { isCloudFormation, parseCloudFormation } from './cloudformation';
import { isCompose, parseCompose } from './compose';
import { isKubernetes, parseKubernetes } from './kubernetes';
import { parseTerraform } from './terraform';
import { isTerraformJson, parseTerraformJson } from './terraformJson';
import { infraToPage } from './toPage';
import { InfraError, type InfraFile, type InfraFormat, type InfraModel } from './types';
import { yamlDocuments } from './yamlish';
import type { CPage } from '../types';

export { parseHcl } from './hcl';
export { InfraError } from './types';
export type { InfraFile, InfraFormat, InfraModel } from './types';
export { infraToPage } from './toPage';

const looksHcl = (text: string) => /(^|\n)\s*(resource|module|provider|terraform|variable|locals|data|output)\s+("[^"\n]*"\s*)*\{/.test(text);

/** which importer a file is for, or null when it is none of them (content first, the file name only breaks ties) */
export function detectInfraFormat(text: string, name = ''): InfraFormat | null {
  const t = text.trimStart();
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const j = JSON.parse(text) as unknown;
      if (isTerraformJson(j)) return 'terraform-json';
      if (isCloudFormation(j)) return 'cloudformation';
    } catch {
      /* not JSON */
    }
    return null;
  }
  if (/\.tf$/i.test(name) || looksHcl(text)) return looksHcl(text) ? 'terraform' : null;
  try {
    const docs = yamlDocuments(text, name || 'input');
    if (docs.some(isCloudFormation)) return 'cloudformation';
    if (docs.some(isCompose)) return 'compose';
    if (isKubernetes(docs)) return 'kubernetes';
  } catch (e) {
    if (/\.ya?ml$/i.test(name)) throw e;
  }
  return null;
}

export interface InfraImport { model: InfraModel; page: CPage; warnings: string[]; format: InfraFormat }

/** parse one or more files of ONE kind (several .tf files, several manifests) into a model */
export function parseInfra(files: InfraFile[]): InfraModel {
  if (!files.length) throw new InfraError('No files to import');
  const formats = files.map((f) => ({ f, format: detectInfraFormat(f.text, f.name) }));
  const unknown = formats.find((x) => !x.format);
  if (unknown) throw new InfraError(`${unknown.f.name}: not recognised as Terraform (.tf or \`terraform show -json\`), Kubernetes YAML, docker-compose or CloudFormation`);
  const kinds = new Set(formats.map((x) => x.format));
  if (kinds.size > 1) {
    // several kinds at once: a plan json next to .tf files is fine, anything else is ambiguous
    throw new InfraError(`The files are of different kinds (${[...kinds].join(', ')}); import one kind at a time`);
  }
  const format = formats[0].format!;
  if (format === 'terraform') return parseTerraform(files);
  if (format === 'terraform-json') {
    if (files.length > 1) throw new InfraError('Import one Terraform JSON file at a time');
    return parseTerraformJson(JSON.parse(files[0].text));
  }
  if (format === 'kubernetes') return parseKubernetes(files);
  if (format === 'compose') return parseCompose(files);
  return parseCloudFormation(files);
}

/** files -> model -> laid-out page (also what the import dialog previews) */
export function importInfra(files: InfraFile[], opts: { name?: string } = {}): InfraImport {
  const model = parseInfra(files);
  const page = infraToPage(model, { name: opts.name ?? 'Imported infrastructure' });
  return { model, page, warnings: model.warnings, format: model.format };
}
