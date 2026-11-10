export type SpeechLevelErrorCode = 'ERR_INPUT_TYPE' | 'ERR_INPUT_TOO_LARGE' | 'ERR_OPTION' | 'ERR_STATE';

/** Thrown for invalid input or options. Messages say how to fix the call. */
export class SpeechLevelInputError extends Error {
  readonly code: SpeechLevelErrorCode;

  constructor(code: SpeechLevelErrorCode, message: string) {
    super(message);
    this.name = 'SpeechLevelInputError';
    this.code = code;
  }
}
