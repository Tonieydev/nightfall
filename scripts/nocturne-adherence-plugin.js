import { readFileSync } from 'node:fs';

// oxlint 1.77 does not implement eslint's `no-restricted-syntax`, which is the
// rule design/nocturne/_adherence.oxlintrc.json uses to ban raw hexes, raw px
// values and non-Inter fonts. This plugin runs those same checks as a real AST
// rule. The patterns are read out of the design system's config rather than
// restated here, so styles.css and _adherence.oxlintrc.json stay authoritative.
const ADHERENCE_CONFIG = 'design/nocturne/_adherence.oxlintrc.json';
const SELECTOR = /^Literal\[value=\/(.*)\/([a-z]*)\]$/;

function loadPatterns() {
  const config = JSON.parse(readFileSync(ADHERENCE_CONFIG, 'utf8'));
  // Shape is ["warn", {selector, message}, ...] — severity first, then entries.
  const entries = (config.rules?.['no-restricted-syntax'] ?? []).slice(1);

  return entries.flatMap((entry) => {
    const match = SELECTOR.exec(entry.selector);
    if (match === null) return [];
    const [, source, flags] = match;
    return [{ test: new RegExp(source, flags), message: entry.message }];
  });
}

const patterns = loadPatterns();

export default {
  meta: { name: 'nocturne' },
  rules: {
    'no-raw-design-values': {
      meta: {
        type: 'problem',
        docs: { description: 'Take colors, spacing and fonts from Nocturne tokens.' },
      },
      create(context) {
        return {
          Literal(node) {
            if (typeof node.value !== 'string') return;
            for (const { test, message } of patterns) {
              if (test.test(node.value)) {
                context.report({ node, message });
                return;
              }
            }
          },
        };
      },
    },
  },
};
