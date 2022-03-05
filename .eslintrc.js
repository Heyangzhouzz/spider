module.exports = {
  'env': {
    'browser': true,
    'es2021': true,
  },
  'extends': [
    './eslint-ts.js',
  ],
  'parser': '@typescript-eslint/parser',
  'parserOptions': {
    'ecmaVersion': 'latest',
    'sourceType': 'module',
  },
  'plugins': [
    '@typescript-eslint',
  ],
  'rules': {
  },
};
