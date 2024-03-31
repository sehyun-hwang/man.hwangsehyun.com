import globals from 'globals';

export default [{
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
}];
