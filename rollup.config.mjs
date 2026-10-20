import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default {
  input: 'src/plugin.js',
  output: {
    file: 'com.nanqing.apiusage.plugin/backend/plugin.cjs',
    format: 'cjs',
    exports: 'auto'
  },
  plugins: [
    resolve({ preferBuiltins: true }),
    commonjs(),
    json()
  ],
  external: ['fs', 'path', 'os', 'util', /^node:/]
};
