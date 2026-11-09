// Checks the pure logic and markup of the quiz-library UI pieces (no browser).
//   node scripts/test-library-ui.mjs
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
});
const mod = (p) => vite.ssrLoadModule(p);
const Pagination = (await mod('/src/components/Pagination.jsx')).default;
const { default: LibrarySettings, parseTags, validateLibrary } = await mod('/src/components/LibrarySettings.jsx');
const step = (m) => console.log(`✓ ${m}`);

// ---- tags
assert.deepEqual(parseTags('Space, planets,SPACE ,, astronomy\n  Mars '), ['space', 'planets', 'astronomy', 'mars']);
assert.deepEqual(parseTags('   '), []);
step('tags: split on commas/newlines, trimmed, lower-cased, de-duplicated, blanks dropped');

// ---- validation mirrors the server rules
assert.equal(validateLibrary({ tagsText: 'a, b', language: 'en' }), '');
assert.equal(validateLibrary({ tagsText: 'a', language: 'pt-br' }), '');
assert.match(validateLibrary({ tagsText: Array.from({ length: 11 }, (_, i) => `t${i}`).join(','), language: 'en' }), /at most 10 tags/);
assert.match(validateLibrary({ tagsText: 'x'.repeat(31), language: 'en' }), /30 characters/);
assert.match(validateLibrary({ tagsText: '', language: 'English!' }), /Language must be a code/);
assert.match(validateLibrary({ tagsText: '', language: '' }), /Language must be a code/);
step('library settings validation matches the server (max 10 tags, 30 chars each, language code)');

// ---- pagination
const html = (page, totalPages) => renderToStaticMarkup(createElement(Pagination, { page, totalPages, onChange() {} }));
assert.equal(html(1, 1), '', 'no pagination for a single page');
let out = html(1, 10);
assert.ok(out.includes('aria-current="page"') && out.includes('>1<') && out.includes('>5<') && !out.includes('>6<'));
assert.ok(/<button[^>]*disabled[^>]*>← Prev/.test(out), 'Prev is disabled on the first page');
out = html(10, 10);
assert.ok(/<button[^>]*disabled[^>]*>Next →/.test(out), 'Next is disabled on the last page');
assert.ok(out.includes('>10<') && out.includes('>6<') && !out.includes('>5<'));
out = html(5, 10);
assert.ok(out.includes('>3<') && out.includes('>7<') && out.includes('…'), 'window of five pages around the current one, with ellipses');
out = html(2, 3);
assert.ok(out.includes('>1<') && out.includes('>2<') && out.includes('>3<') && !out.includes('…'));
step('pagination: window of pages, disabled Prev/Next at the ends, hidden for one page');

// ---- library settings panel
const panel = (visibility, extra = {}) =>
  renderToStaticMarkup(createElement(LibrarySettings, { values: { visibility, category: 'other', tagsText: 'a', language: 'en' }, onChange() {}, isPublished: false, isNew: false, ...extra }));
assert.ok(panel('private').includes('Private'));
assert.ok(!panel('private').includes('including the correct answers'), 'no warning for private quizzes');
const pub = panel('public');
assert.ok(pub.includes('including the correct answers') && pub.includes('not published yet'), 'public quizzes warn that duplicates include answers and that unpublished quizzes are not listed');
assert.ok(panel('public', { isPublished: true }).includes('including the correct answers') && !panel('public', { isPublished: true }).includes('not published yet'));
assert.ok(panel('public', { isNew: true }).includes('Publish it after saving'));
step('library settings: warns that public quizzes can be duplicated with answers, and about publishing');

await vite.close();
console.log('\nAll checks passed.');
process.exit(0);
