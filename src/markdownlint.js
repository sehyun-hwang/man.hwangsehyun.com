// @ts-check

import markdownlint from 'markdownlint';
import matter from 'gray-matter';
import { parse as parseToml } from 'toml';

import { FRONTMATTER_PREFIX } from './cloudant.js';

class FrontMatterParserRule {
  names = ['frontmatter-parser'];

  tags = ['tag'];

  description = 'description';

  /** @type {import('markdownlint').RuleFunction} */
  function;

  /** @type {{[key: string]: any}} */
  frontMatters = {};

  constructor() {
    const { frontMatters } = this;

    this.function = function frontmatterParserRuleFunction({ name, frontMatterLines }, onError) {
      let data = null;
      if (!frontMatterLines.length) {
        frontMatters[name] = data;
        return;
      }

      try {
        data = matter(frontMatterLines.join('\n'), {
          engines: {
            toml: parseToml,
          },
          language: 'toml',
        }).data;
        console.log(name, frontMatterLines, data);
      } catch (error) {
        /**
         * @link https://github.com/BinaryMuse/toml-node/blob/4bad34e1dc81586e799e269e5d2c78662b6657b2/lib/parser.js#L14
         */
        const { name: errorName, expected, found } = error;
        if (errorName !== 'SyntaxError')
          throw error;

        onError({
          lineNumber: error.line,
          detail: error.message,
          context: JSON.stringify({ expected, found }),
          range: [error.offset, error.column], // @TODO
        });
      }

      frontMatters[name] = data;
    };
  }
}

/**
 * @typedef {{
 *  _id: string,
 *  hash: number,
 *  has: boolean,
 *  _attachments: {
 *    [key: string]: {
 *      data: '',
 *    },
 *  },
 *  [key: string]: any,
 * }} FrontMatterDoc
 */

/**
 * @param {Object.<string, string>} strings
 * @returns {Promise<FrontMatterDoc[]>}
 */
export function parseFrontMatters(strings) {
  const frontMatterParserRule = new FrontMatterParserRule();

  return new Promise((resolve, reject) => markdownlint({
    strings,
    customRules: [frontMatterParserRule],
    config: {
      default: false,
    },
  }, (error, result) => {
    console.log(error || result.toString());
    error ? reject(error) : resolve(frontMatterParserRule.frontMatters);
  }))

    .then(frontMatters => Object.entries(frontMatters)
      .map(([hash, frontmatter]) => ({
        _id: FRONTMATTER_PREFIX + hash,
        hash: Number(hash),
        has: Boolean(frontmatter),
        ...frontmatter,
      })));
}

const STATIC_FRONTEND_PARSER_RULE = new FrontMatterParserRule();

export function runMarkdownLint(markdown) {
  const strings = typeof markdown === 'string' ? { default: markdown } : markdown;
  return new Promise((resolve, reject) => markdownlint({
    strings,
    customRules: [STATIC_FRONTEND_PARSER_RULE],
  }, (error, result) => {
    if (error)
      return reject(error);
    console.log(result.toString());
    Promise.resolve(result);
    return undefined;
  }));
}

// console.log(await parseFrontMatters([`+++
// foo = "bar"
// +++
// `]));
