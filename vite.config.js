import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/serra-cred/', // já bate com github.com/matheustcw4/serra-cred — não precisa mudar
  server: {
    host: true,
    port: 5173,
  },
});
