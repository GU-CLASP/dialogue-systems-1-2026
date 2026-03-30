export const KEY = import.meta.env.VITE_AZURE_KEY;
export const NLU_KEY = import.meta.env.VITE_NLU_KEY;
export const azureLanguageCredentials = {
    endpoint: import.meta.env.VITE_AZURE_ENDPOINT,
    key: NLU_KEY,
    projectName: "numbergame",
    deploymentName: "numbergame",
};

