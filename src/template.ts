import type { Resume } from './resume';

export type Template = {
  ats: boolean;
  screenshot: { width: number; scale: number };
  render: (resume: Resume) => Promise<string>;
};
