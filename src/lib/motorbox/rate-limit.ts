// Rate limit en memoria, por instancia. Mismo criterio (y misma limitación) que
// el de /api/forms/[slug]/submit: alcanza para frenar un bucle accidental o un
// bot simple. No es un límite global — con varias instancias de Vercel cada una
// lleva su propia cuenta. Si algún día hace falta de verdad, va a KV/Redis.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    // Barrido perezoso: sin esto el Map crece para siempre en una instancia
    // de larga vida (Fluid Compute reusa la instancia entre requests).
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
    }
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}
