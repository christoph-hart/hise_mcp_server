import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sanitizeMarkdown } from '../../src/markdown-sanitizer.js';
import { shouldIncludeWebsiteDoc, websiteDocUrl } from '../../scripts/build-doc-chunks.mjs';


test('selects the agreed website documentation scope', () => {
  assert.equal(shouldIncludeWebsiteDoc('architecture/02.audio-engine.md'), true);
  assert.equal(shouldIncludeWebsiteDoc('reference/audio-modules/03.modulators/time-variant/MacroModulator.md'), true);
  assert.equal(shouldIncludeWebsiteDoc('reference/scriptnodes/fx/reverb.md'), true);
  assert.equal(shouldIncludeWebsiteDoc('reference/ui-components/components/scriptbutton.md'), true);
  assert.equal(shouldIncludeWebsiteDoc('reference/languages/snex.md'), true);
  assert.equal(shouldIncludeWebsiteDoc('reference/languages/hsc.md'), false);
  assert.equal(shouldIncludeWebsiteDoc('reference/preprocessors/audio-processing.md'), false);
});

test('normalizes website source paths to canonical v2 URLs', () => {
  assert.equal(websiteDocUrl('architecture/02.audio-engine.md'), '/v2/architecture/audio-engine');
  assert.equal(
    websiteDocUrl('reference/audio-modules/03.modulators/time-variant/MacroModulator.md'),
    '/v2/reference/audio-modules/modulators/time-variant/macromodulator',
  );
  assert.equal(
    websiteDocUrl('reference/scriptnodes/filters/one_pole.md'),
    '/v2/reference/scriptnodes/filters/one_pole',
  );
  assert.equal(websiteDocUrl('reference/audio-modules/index.md'), '/v2/reference/audio-modules/');
});

test('converts MDC components without damaging fenced CSS pseudo-elements', () => {
  const input = `::warning{title="Audio thread"}\nDo not allocate strings.\n::\n\n::parameter-table\n---\ngroups:\n  - label: Signal\n    params:\n      - { name: Gain, desc: "Output gain.", range: "0 - 1", default: "1" }\n---\n::\n\n::common-mistakes\n---\nmistakes:\n  - title: "Silent callback"\n    wrong: "Only call setValue()"\n    right: "Call changed() too"\n    reason: "setValue does not dispatch callbacks"\n---\n::\n\n::see-also\n---\nlinks:\n  - { label: "ScriptButton", to: "/v2/scripting-api/scriptbutton", desc: "API methods" }\n---\n::\n\n\`\`\`css\nbutton::selection { color: white; }\n\`\`\``;

  const output = sanitizeMarkdown(input);
  assert.match(output, /> \*\*Warning — Audio thread\*\*/);
  assert.match(output, /\| Gain \| Output gain\. \| 0 - 1 \| 1 \|/);
  assert.match(output, /\*\*Problem:\*\* Only call setValue\(\)/);
  assert.match(output, /\[ScriptButton\]\(\/v2\/scripting-api\/scriptbutton\)/);
  assert.match(output, /button::selection/);
  assert.doesNotMatch(output, /^::/m);
  assert.equal(sanitizeMarkdown(output), output);
});

test('unknown MDC directives preserve their meaningful inner content', () => {
  assert.equal(sanitizeMarkdown('::future-widget\nUseful prose.\n::'), 'Useful prose.');
});
