import {existsSync, readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
const roadmap = readFileSync(resolve(root, 'ROADMAP.md'), 'utf8');
const requiredPublicDocs = [
  'ROADMAP.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'docs/PRODUCT.md',
  'docs/ANALYSIS.md',
  'docs/ARCHITECTURE.md',
  'docs/LOCAL-SETUP.md',
  'docs/TOKEN.md',
];

test('public GitHub documentation is present and linked from the README', () => {
  for (const path of requiredPublicDocs) {
    assert.ok(existsSync(resolve(root, path)), `missing public document: ${path}`);
    assert.match(readme, new RegExp(`\\(${path.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\)`), `README does not link ${path}`);
  }
  assert.match(readme, /<img[^>]+public\/assets\/meerkat-banner-v2\.png/i, 'README is missing the wide MEERKAT hero');
  assert.match(readme, /docs\/assets\/terminal-overview\.png/i, 'README is missing the product screenshot');
  assert.match(roadmap, /docs\/assets\/relationship-map\.png/i, 'ROADMAP is missing the relationship evidence screenshot');
  for (const image of ['docs/assets/terminal-overview.png', 'docs/assets/relationship-map.png']) {
    assert.ok(existsSync(resolve(root, image)), `missing documentation image: ${image}`);
  }
});

test('every relative Markdown link in the README points to a repository file', () => {
  const links = [...readme.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]!);
  const localLinks = links.filter((link) => !/^(?:https?:|mailto:|#)/i.test(link));
  for (const link of localLinks) {
    const path = decodeURIComponent(link.split('#')[0]!);
    assert.ok(existsSync(resolve(root, path)), `broken README link: ${link}`);
  }
});
