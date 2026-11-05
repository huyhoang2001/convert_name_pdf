import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ base: './', plugins: [react()], build: { target: 'esnext' }, optimizeDeps: { exclude: ['@docx-editor.dev/core', '@docx-editor.dev/react', 'harfbuzzjs'], esbuildOptions: { target: 'esnext' } }, server: { port: 5175, strictPort: true, watch: { ignored: ['**/src-tauri/target/**', '**/wordcraft-upstream/**'] } } });
