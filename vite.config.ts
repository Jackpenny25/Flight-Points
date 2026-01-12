import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Use a relative base so built assets use relative URLs.
  // Keeps GitHub Pages deployments working and avoids absolute `/Flight-Points/`
  // paths which cause 404s when previewing or serving from a different root.
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
