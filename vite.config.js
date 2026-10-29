import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` runs `vercel dev`, which starts Vite itself (vercel.json -> devCommand) on the port it
// passes in PORT and serves /api. `npm run dev:web` is UI only and proxies /api to a vercel dev on 3000.
export default defineConfig({
  plugins: [react()],
  server: { port: Number(process.env.PORT) || 5173, proxy: { '/api': 'http://localhost:3000' } },
});
