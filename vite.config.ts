import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base must match the GitHub Pages repo path: https://<user>.github.io/lera-dashboard/
export default defineConfig({
  base: '/lera-dashboard/',
  plugins: [react(), tailwindcss()],
})
