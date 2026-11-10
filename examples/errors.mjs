// Error handling demo: invalid input throws SpeechLevelInputError with a stable code.
import { check, SpeechLevelInputError } from 'ko-speechlevel';

for (const run of [() => check(42), () => check('가나다라마', { maxLength: 2 }), () => check('안녕하세요.', { expect: 'formal' })]) {
  try {
    run();
  } catch (e) {
    if (e instanceof SpeechLevelInputError) console.log(`${e.code}: ${e.message}`);
    else throw e;
  }
}
