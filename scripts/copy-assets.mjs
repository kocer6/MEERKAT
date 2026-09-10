import { cpSync } from 'node:fs';
cpSync(new URL('../public', import.meta.url), new URL('../dist/public', import.meta.url), { recursive: true });
