import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';

function isValidUrl(val: string): boolean {
  if (!val || val === 'admin@test.com' || val.includes('@')) return false;
  try {
    const url = new URL(val);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidKey(val: string): boolean {
  if (!val || val === 'admin@test' || val.length < 10) return false;
  return true;
}

function getEnvValue(keys: string[]): string {
  // Check .env.local first, then .env, then process.env
  const files = ['.env.local', '.env'];
  for (const file of files) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const eqIdx = trimmed.indexOf('=');
          const k = trimmed.slice(0, eqIdx).trim();
          const v = trimmed.slice(eqIdx + 1).trim().replace(/^['"](.*)['"]$/, '$1');
          if (keys.includes(k) && v) {
            return v;
          }
        }
      }
    }
  }

  for (const k of keys) {
    const val = process.env[k];
    if (val) return val;
  }

  return '';
}

export default defineConfig(() => {
  let supabaseUrl = getEnvValue(['NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_URL']);
  if (!isValidUrl(supabaseUrl)) {
    supabaseUrl = 'https://rcvetyahocznanvbggqf.supabase.co';
  }

  let supabaseAnonKey = getEnvValue([
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY'
  ]);
  if (!isValidKey(supabaseAnonKey)) {
    supabaseAnonKey = 'sb_publishable_t1pbOZMnOqshN1IPLfOPKw_OFJFZQeM';
  }

  process.env.VITE_SUPABASE_URL = supabaseUrl;
  process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
  process.env.VITE_SUPABASE_ANON_KEY = supabaseAnonKey;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = supabaseAnonKey;

  return {
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
      'import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(supabaseAnonKey),
      'import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
