import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // NEXT_PUBLIC_* lets the variables the Supabase ↔ Vercel integration creates reach the browser build.
  // Only public values use these prefixes; the service role key and database URL never do.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
});
