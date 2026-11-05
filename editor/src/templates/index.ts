import type { Diagram } from '../types';
import { TEMPLATES as MONITORING } from './monitoringStack';
import { TEMPLATES as MEDIUM } from './monitoringMedium';
import { TEMPLATES as CLOUD } from './cloudTemplates';
import { TEMPLATES as ER } from './erTemplates';
import { TEMPLATES as UML } from './umlTemplates';
import { TEMPLATES as UML2 } from './uml2Templates';
import { TEMPLATES as BOARD } from './boardTemplates';
import { TEMPLATES as SDBOARD } from './systemDesignBoard';

export interface Template {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  build: () => Diagram;
}

/** All built-in templates (cloud / devops templates register here as packs land). */
export const ALL_TEMPLATES: Template[] = [...CLOUD, ...MONITORING, ...MEDIUM, ...ER, ...UML, ...UML2, ...BOARD, ...SDBOARD];
export const registerTemplates = (t: Template[]): void => {
  for (const x of t) if (!ALL_TEMPLATES.some((y) => y.id === x.id)) ALL_TEMPLATES.push(x);
};
