import { readFileSync, writeFileSync } from 'node:fs';

// design/nocturne/_adherence.oxlintrc.json is the design system's own file and
// stays untouched. Two things in it oxlint 1.77 cannot consume directly:
//   - `x-omelette`, a metadata block oxlint rejects as an unknown field
//   - `no-restricted-syntax`, a rule oxlint does not implement
// The gate lints against a derived copy: the metadata block is dropped, and the
// restricted-syntax patterns are enforced by scripts/nocturne-adherence-plugin.js,
// which reads them back out of the same source file. No rule is restated here.
const SOURCE = 'design/nocturne/_adherence.oxlintrc.json';
const OUTPUT = '.oxlintrc.generated.json';
const PLUGIN = './scripts/nocturne-adherence-plugin.js';

const config = JSON.parse(readFileSync(SOURCE, 'utf8'));

delete config['x-omelette'];
delete config.rules['no-restricted-syntax'];

config.jsPlugins = [PLUGIN];
config.rules['nocturne/no-raw-design-values'] = 'error';

writeFileSync(OUTPUT, `${JSON.stringify(config, null, 2)}\n`);
