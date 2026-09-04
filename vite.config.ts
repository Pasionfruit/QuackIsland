import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Listen on the LAN so friends can open the host's address and join.
    host: true,
    open: true,
  },
})
