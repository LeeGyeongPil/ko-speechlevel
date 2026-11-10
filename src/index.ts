export { analyze } from './analyze.js';
export { check } from './check.js';
export { classifyEnding, type EndingResult } from './endings.js';
export { SpeechLevelInputError, type SpeechLevelErrorCode } from './errors.js';
export { createStreamChecker, type StreamChecker, type StreamOptions } from './stream.js';
export {
  DEFAULT_MAX_LENGTH,
  EXPECTS,
  LEVELS,
  type AnalyzeOptions,
  type CheckOptions,
  type CheckResult,
  type Expect,
  type Include,
  type Level,
  type SentenceResult,
  type SkipKind,
} from './types.js';
