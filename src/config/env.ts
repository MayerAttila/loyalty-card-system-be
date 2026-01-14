export const env = {
  PORT: Number(process.env.PORT ?? 3000),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:3000",
};
