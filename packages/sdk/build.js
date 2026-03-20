import * as esbuild from 'esbuild';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function build() {
    const packageJsonPath = path.join(__dirname, 'package.json');
    const packageJsonData = await fs.readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonData);

    const isDev = process.argv.includes('--dev');

    const options = {
        entryPoints: ['src/index.js'],
        bundle: true,
        minify: !isDev,
        outfile: isDev ? 'dist/pulsar.dev.js' : 'dist/pulsar.js',
        sourcemap: true,
        format: 'iife',
        define: {
            __VERSION__: JSON.stringify(packageJson.version)
        }
    };

    await esbuild.build(options);
}

build().catch(() => process.exit(1));
