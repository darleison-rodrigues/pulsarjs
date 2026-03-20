import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const pkgPath = path.resolve(process.cwd(), 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

esbuild.build({
  entryPoints: ['src/index.js'],
  bundle: true,
  minify: process.argv.includes('--minify'),
  outfile: process.argv.includes('--minify') ? 'dist/pulsar.js' : 'dist/pulsar.dev.js',
  sourcemap: true,
  format: 'iife',
  define: {
    '__VERSION__': JSON.stringify(pkg.version),
  },
}).catch(() => process.exit(1));
