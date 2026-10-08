/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** mock (по умолчанию) | live — когда появится API */
  readonly VITE_DATA_SOURCE?: 'mock' | 'live';
}
