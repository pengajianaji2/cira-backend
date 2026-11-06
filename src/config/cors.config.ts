export const getAllowedOrigins = (nodeEnv: string, frontendUrl: string): string[] =>
  nodeEnv === "production"
    ? [frontendUrl]
    : [frontendUrl, "http://localhost:3000", "http://127.0.0.1:3000"];
