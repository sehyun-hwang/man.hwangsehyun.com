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
      if (!frontMatterLines.length) {
        frontMatters[name] = null;
        return;
      }
      console.log(name, frontMatterLines);

      const { data } = matter(frontMatterLines.join('\n'), {
        engines: {
          toml: parseToml,
        },
        language: 'toml',
      });

      frontMatters[name] = data;
    }

    Object.assign(this, {
      frontMatters,
      function: frontmatterParserRuleFunction,
    });
  }
}

const frontMatterParserRule = new FrontMatterParserRule();

const options = {
  // "files": ["good.md", "bad.md"],
  strings: {
    'good.string': '# good.string\n\nThis string passes all rules.\n',
    'bad.string': '#bad.string\n\n#This string fails\tsome rules.',
    frontmatter: `---
title = "foo"
---

## Frontmatter file
`,
  },
  customRules: [frontMatterParserRule],
};

markdownlint(options, (error, result) => {
  console.log(error, result);
  console.log(frontMatterParserRule.frontMatters);
});
