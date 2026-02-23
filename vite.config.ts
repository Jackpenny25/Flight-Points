import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Use a relative base so built assets use relative URLs.
  // Keeps local/server deployments portable and avoids absolute paths
  // which can cause 404s when serving from a different root.
  // If you prefer an explicit base for deployment, set the VITE_BASE env var
  // and it will be picked up during the build (e.g. VITE_BASE="/Flight-Points/").
  base: process.env.VITE_BASE ?? './',
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
})
