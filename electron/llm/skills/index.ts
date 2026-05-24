import { runFormat } from './format';
import { runRamble } from './ramble';
import { runCapture } from './capture';
import { runTag, runTasks, runExplainBack } from './tag';
import { runCategorize } from './categorize';
import { runProjectContext } from './projectContext';
import { runDailyReport, runStalePulse } from './reports';
import { runTemplate } from './template';
import { runCombineGroups } from './combineGroups';
import { runGenerateAppSkill } from './appSkill';

export const skills = {
  format: runFormat,
  ramble: runRamble,
  capture: runCapture,
  tag: runTag,
  tasks: runTasks,
  explainBack: runExplainBack,
  categorize: runCategorize,
  projectContext: runProjectContext,
  dailyReport: runDailyReport,
  stalePulse: runStalePulse,
  template: runTemplate,
  combineGroups: runCombineGroups,
  generateAppSkill: runGenerateAppSkill
};

export type SkillName = keyof typeof skills;
export {
  runFormat,
  runRamble,
  runCapture,
  runTag,
  runTasks,
  runExplainBack,
  runCategorize,
  runProjectContext,
  runDailyReport,
  runStalePulse,
  runTemplate,
  runCombineGroups,
  runGenerateAppSkill
};
