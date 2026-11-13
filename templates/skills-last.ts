import { type Resume } from '../src/resume';
import { renderPage } from './ats';

export const render = (resume: Resume) => renderPage(resume, false);
