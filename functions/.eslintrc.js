
module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json'], // Path relative to this .eslintrc.js file
    sourceType: 'module',
    ecmaVersion: 2021, // Or your target ECMAScript version
  },
  plugins: [
    '@typescript-eslint',
  ],
  ignorePatterns: [
    '/lib/**/*', // Built files
    '/node_modules/**/*',
    '.eslintrc.js', // Ignore this file itself
  ],
  rules: {
    'quotes': ['error', 'single', { 'avoidEscape': true }],
    'indent': ['error', 2],
    'object-curly-spacing': ['error', 'always'],
    'require-jsdoc': 'off', // Turned off for simplicity
    'valid-jsdoc': 'off',   // Turned off for simplicity
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
    'import/no-unresolved': 0, // Can be helpful with TypeScript paths, though eslint-plugin-import is not explicitly used now
    'max-len': ['warn', {'code': 120, 'ignoreComments': true, 'ignoreUrls': true}],
    'operator-linebreak': ['error', 'after'],
    'no-prototype-builtins': 'warn', // Firebase often uses this
    'spaced-comment': ['error', 'always', { 'markers': ['/'] }], // Allow triple slash directives
  },
};
