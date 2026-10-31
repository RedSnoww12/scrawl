import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // NEXT_PUBLIC_* lets the variables the Supabase ↔ Vercel integration creates reach the browser build.
  // Only public values use these prefixes; the service role key and database URL never do.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
});
