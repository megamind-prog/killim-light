// Netlify build step: bundle the login library for the browser and copy the map library into /public.
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
await build({ entryPoints: ['src/auth.js'], bundle: true, format: 'iife', target: 'es2019', minify: true, outfile: 'public/assets/auth.js' });
mkdirSync('public/assets/leaflet', { recursive: true });
cpSync('node_modules/leaflet/dist/leaflet.js', 'public/assets/leaflet/leaflet.js');
cpSync('node_modules/leaflet/dist/leaflet.css', 'public/assets/leaflet/leaflet.css');
cpSync('node_modules/leaflet/dist/images', 'public/assets/leaflet/images', { recursive: true });
console.log('built');
