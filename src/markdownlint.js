import markdownlint from 'markdownlint';

const rule = {
  names: ['test'],
  tags: ['d'],
  description: 'd',
  function: function MD025({ frontMatterLines }, onError) {
    frontMatterLines.length && console.log(frontMatterLines);
  },
};

const options = {
  // "files": ["good.md", "bad.md"],
  strings: {
    'good.string': '# good.string\n\nThis string passes all rules.\n',
    'bad.string': '#bad.string\n\n#This string fails\tsome rules.',
    frontmatter: `---
title = foo
---

## Frontmatter file
`,
  },
  customRules: [rule],
};

markdownlint(options, (error, result) => {
  console.log(error, result);
});
