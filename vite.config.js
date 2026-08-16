import { defineConfig } from 'vite';

export default defineConfig({
  // Library assets must resolve relative to the importing module so consumers
  // can host Cue at any origin or subpath (for example, /cue/).
  base: './',
  worker: {
    format: 'es',
  },
  build: {
    lib: {
      entry: {
        cue: 'src/index.js',
        models: 'src/models/index.js',
        'models/moonshine': 'src/models/moonshine.js',
      },
      formats: ['es'],
      fileName: (_, entryName) => `${entryName}.js`,
    },
  },
});
