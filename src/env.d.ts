interface ImportMetaEnv {
  readonly BASE_URL?: string;
  readonly VITE_API_URL?: string;
  // add other VITE_... env vars used in the app below if needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
