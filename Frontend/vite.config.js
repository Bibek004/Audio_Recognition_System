// Import Vite's config helper and the React plugin
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Lets Vite understand React and JSX
  plugins: [react()],
  server: { port: 5173 },
});
