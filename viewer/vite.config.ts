import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves project sites under /<repo>/; CI passes VITE_BASE=/<repo>/.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
});
