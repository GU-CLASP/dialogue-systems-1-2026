interface ImportMetaEnv {
    readonly VITE_AZURE_KEY: string;
    readonly VITE_NLU_KEY: string;
    readonly VITE_AZURE_ENDPOINT: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}