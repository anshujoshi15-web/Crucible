import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

const outdir = 'public/wallet-kit';
await rm(outdir, { recursive: true, force: true });
await build({
  entryPoints: { wallet: 'wallet/picker.jsx' },
  bundle: true,
  splitting: true,
  format: 'esm',
  outdir,
  minify: true,
  target: ['es2022', 'safari16'],
  define: { 'process.env.NODE_ENV': '"production"' }
});
