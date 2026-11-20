export function hostedDemoLoginEnabled() {
  return process.env.VERCEL_ENV === "preview" &&
    process.env.CAMPUS_ENABLE_DEMO_LOGIN === "1" &&
    Boolean(process.env.CAMPUS_AUTH_CONFIG_JSON);
}
