interface ImportMetaEnv {
  readonly BASE_URL?: string;
  readonly VITE_ADMIN_PIN?: string;
  // add other VITE_... env vars used in the app below if needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
