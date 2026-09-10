import { runDemo } from './demo.js';
import { encode } from './types.js';

if (process.argv[2] === 'demo') {
  console.log(encode(await runDemo()));
} else {
  console.error('Usage: meerkat demo');
  process.exitCode = 1;
}
