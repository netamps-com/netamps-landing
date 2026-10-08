export async function onRequest({ env }) {
  return new Response(
    JSON.stringify({
      commit: env.CF_PAGES_COMMIT_SHA || null,
      branch: env.CF_PAGES_BRANCH || null,
      bindings: Object.keys(env),
      hasDB: Boolean(env.DB),
      dbHasPrepare: Boolean(env.DB && typeof env.DB.prepare === 'function'),
      hasOTP_KV: Boolean(env.OTP_KV),
      hasRESEND_API_KEY: Boolean(env.RESEND_API_KEY),
      hasQUARANTINE_BUCKET: Boolean(env.QUARANTINE_BUCKET),
      quarantineHasPut: Boolean(env.QUARANTINE_BUCKET && typeof env.QUARANTINE_BUCKET.put === 'function'),
      hasPRODUCTION_BUCKET: Boolean(env.PRODUCTION_BUCKET),
      hasEVIDENCE_BUCKET: Boolean(env.EVIDENCE_BUCKET)
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
