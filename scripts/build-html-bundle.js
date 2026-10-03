import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, '../src/client/index.html');
const bundlePath = path.resolve(__dirname, '../src/client/html-bundle.ts');

const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
const tsContent = `export const CLIENT_HTML = ${JSON.stringify(htmlContent)};\n`;

fs.writeFileSync(bundlePath, tsContent, 'utf-8');
console.log(`Successfully bundled ${htmlPath} -> ${bundlePath} (${htmlContent.length} bytes)`);
