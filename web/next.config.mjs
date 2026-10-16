import { fileURLToPath } from 'url';
import path from 'path';
const root = path.dirname(fileURLToPath(import.meta.url));
/** @type {import('next').NextConfig} */
export default { output: 'standalone', poweredByHeader: false, outputFileTracingRoot: root, turbopack: { root } };
