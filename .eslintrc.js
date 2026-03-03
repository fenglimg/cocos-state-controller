module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    es2021: true,
  },
  rules: {
    // TypeScript 特定规则
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-non-null-assertion': 'warn',
    
    // 通用规则
    'no-console': 'off',
    'no-debugger': 'warn',
    'prefer-const': 'warn',
    'no-var': 'error',
  },
  overrides: [
    {
      // Cocos Creator 扩展 JS 文件 - CommonJS 模块
      files: ['packages/**/*.js'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        'no-undef': 'off',
      },
    },
    {
      // Cocos Creator 特定文件
      files: ['assets/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};
