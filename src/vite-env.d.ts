/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_AUTH_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
