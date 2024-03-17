import markdownlint from 'markdownlint';
import matter from 'gray-matter';
import { parse as parseToml } from 'toml';

class FrontMatterParserRule {
  names = ['frontmatter-parser'];

  tags = ['tag'];

  description = 'description';

  constructor() {
    const frontMatters = {};

    function frontmatterParserRuleFunction({ name, frontMatterLines }, onError) {
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
    }

    Object.assign(this, {
      frontMatters,
      function: frontmatterParserRuleFunction,
    });
  }
}

export function parseFrontMatters(strings, prefix = '') {
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
      .map(([docId, frontmatter]) => ({
        _id: prefix + docId,
        hasFrontMatter: Boolean(frontmatter),
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
