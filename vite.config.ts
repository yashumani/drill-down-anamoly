import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) return 'charts';
          if (
            id.includes('node_modules/react')
            || id.includes('node_modules/react-dom')
            || id.includes('node_modules/scheduler')
          ) return 'react-vendor';
          if (id.includes('node_modules/papaparse')) return 'data-vendor';
          if (id.includes('node_modules')) return 'vendor';
          return undefined;
        },
      },
    },
  },
});
