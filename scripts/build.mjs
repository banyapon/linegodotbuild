import './build-pages.mjs';
import { build } from 'esbuild';
await build({ entryPoints: ['game/main.ts'], outdir: 'public/assets', bundle: true, splitting: true, format: 'esm', target: 'es2022', minify: true, sourcemap: false, chunkNames: '[name]-[hash]', legalComments: 'eof', metafile: true }).then(result => console.log('Browser game bundles:', Object.keys(result.metafile.outputs).join(', ')));
