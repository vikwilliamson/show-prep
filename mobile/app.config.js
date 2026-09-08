// Dynamic config layer over app.json. Injects the per-deployment serverUrl
// and apiKey into `extra` from EAS environment variables at build time,
// instead of hardcoding them into a git-committed file — see this repo's
// README ("EAS environment variables") for the exact `eas env:set` setup.
//
// Secret-visibility EAS env vars are NOT available during config resolution
// (only plaintext/sensitive are) — INGEST_API_KEY must be created with
// --visibility sensitive, or it silently resolves to "" below.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    serverUrl: process.env.SERVER_URL ?? "",
    apiKey: process.env.INGEST_API_KEY ?? "",
  },
});
