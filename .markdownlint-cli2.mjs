import { resolve } from 'path';

import relativeLinksRule from 'markdownlint-rule-relative-links';
import { STATIC_FRONTEND_PARSER_RULE } from './src/markdownlint.js';

export default {
  customRules: [
    relativeLinksRule,
    STATIC_FRONTEND_PARSER_RULE,
  ],
  config: {
    default: false,
    'no-hard-tabs': false,
    'relative-links': {
      // eslint-disable-next-line prefer-template
      base: resolve('public') + '/',
    },
  },
  outputFormatters: [
    ['markdownlint-cli2-formatter-default', {}],
    ['markdownlint-cli2-formatter-junit', {}],
  ],
};
