/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_API_URL: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_DEFAULT_LOCALE: 'ar' | 'en';
  readonly VITE_DEFAULT_THEME: 'light' | 'dark' | 'system';
  readonly VITE_DEFAULT_CURRENCY: string;
  readonly VITE_ENABLE_DEVTOOLS: 'true' | 'false';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
