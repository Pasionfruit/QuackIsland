import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({root:fileURLToPath(new URL('../../..',import.meta.url)),plugins:[react()],build:{outDir:'src/modules/71-me-in-team/preview-dist',emptyOutDir:true,rollupOptions:{input:fileURLToPath(new URL('./preview.html',import.meta.url))}}})
