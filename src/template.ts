import type { Resume } from './resume';

export type Template = { render: (resume: Resume) => Promise<string> };
