import globals from 'globals';

export default [{
  files: ['src/*.js'],
  languageOptions: {
    globals: {
      ...globals.node,
    },
  },
  rules: {
    'no-param-reassign': 'off',
    'no-underscore-dangle': [
      'error',
      {
        allow: [
          '_id',
          '_attachments',
        ],
      },
    ],
  },
}, {
  files: ['browser/**/*.js', 'eslint.config.mjs'],
  languageOptions: {
    globals: {
      ...globals.node,
    },
  },
  rules: {
    'no-console': 'error',
  },
}, {
  files: ['assets/js/*.js'],
  languageOptions: {
    globals: {
      ...globals.browser,
    },
  },
  rules: {},
}];
