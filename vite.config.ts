import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import tsConfigPaths from 'vite-tsconfig-paths';
import { nitro } from 'nitro/vite';

export default defineConfig({
  server: { port: 3000 },
  plugins: [
    tsConfigPaths({ projects: ['./tsconfig.json'] }),
    // tanstackStart() must come before viteReact(). nitro() produces the
    // server output that Vercel deploys (and lets `pnpm start` run locally).
    tanstackStart(),
    nitro(),
    viteReact(),
  ],
});
