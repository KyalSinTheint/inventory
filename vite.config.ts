import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Accept the names Supabase's "Connect" dialog gives (NEXT_PUBLIC_*) as well as VITE_*.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  server: { host: '0.0.0.0', port: 3000 },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], supabase: ['@supabase/supabase-js'] } } },
  },
});
