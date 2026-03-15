// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: 'expo',
  ignorePatterns: ['/dist/*'],
  globals: {
    AbortController: 'readonly',
    clearTimeout: 'readonly',
    setTimeout: 'readonly',
  },
  rules: {
    'import/no-unresolved': 'off',
    'react-hooks/set-state-in-effect': 'off',
  },
};
