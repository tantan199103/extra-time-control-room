import { defineConfig } from 'vite'

/**
 * Keep the public storefront entry focused on application code. These modules
 * are shared by several routes and stable across deploys, so putting them in
 * named chunks lets browsers cache them independently of route changes.
 */
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (id.includes('/react/') || id.includes('react-dom') || id.includes('scheduler')) {
            return 'vendor-react'
          }
          if (id.includes('/@supabase/')) {
            return 'vendor-supabase'
          }
          if (id.includes('/lucide-react/')) {
            return 'vendor-icons'
          }
          if (id.includes('/three/')) {
            return 'vendor-three'
          }

          return undefined
        },
      },
    },
  },
})
