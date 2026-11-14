import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  ...compat.extends('next/core-web-vitals'),
  // Accessibility (App Excellence Standard E10): every control a screen reader can
  // name, every image described, nothing clickable that a keyboard cannot reach.
  ...compat.extends('plugin:jsx-a11y/recommended'),
  {
    rules: {
      '@next/next/no-img-element':   'off',
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'dist/**',
      'coverage/**',
    ],
  },
];
