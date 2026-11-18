import { createHmac, timingSafeEqual } from 'node:crypto';

function signAiEvaluation(secret, payload) {
  const canonical = [
    payload.airlineName,
    payload.alliance,
    String(payload.totalProfit),
    String(payload.codeshareProfit),
    String(payload.operatingProfit),
    String(payload.revenue),
    String(payload.operatingCost),
    String(payload.score),
    payload.recommendedStatus,
    payload.photoMatchStatus,
    payload.top1Eligible ? '1' : '0',
    payload.summaryNote,
  ].join('|');

  return createHmac('sha256', `aotm-eval-v1:${secret}`)
    .update(canonical)
    .digest('hex');
}

function jsonRes(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export default async (req) => {
  if (req.method !== 'POST') {
    return jsonRes(405, { error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY || '';
    const signingSecret = process.env.AI_EVAL_SECRET || apiKey;
    if (!signingSecret) {
      return jsonRes(500, {
        error: 'GEMINI_API_KEY belum ditambahkan di Environment Variables Netlify.',
      });
    }

    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items.slice(0, 200) : [];
    const verifiedIds = [];
    const invalidIds = [];

    for (const item of items) {
      const id = String(item?.id || '').trim();
      if (!id) continue;

      const sig = String(item?.aiSignature || '').trim();
      if (!/^[a-f0-9]{64}$/.test(sig)) {
        invalidIds.push(id);
        continue;
      }

      const expected = signAiEvaluation(signingSecret, {
        airlineName: String(item?.airlineName || '').trim(),
        alliance: String(item?.alliance || '').trim(),
        totalProfit: Number(item?.totalProfit),
        codeshareProfit: Number(item?.codeshareProfit),
        operatingProfit: Number(item?.operatingProfit),
        revenue: Number(item?.revenue),
        operatingCost: Number(item?.operatingCost),
        score: Number(item?.aiScore),
        recommendedStatus: String(item?.aiRecommendedStatus || ''),
        photoMatchStatus: String(item?.aiPhotoMatchStatus || ''),
        top1Eligible: item?.aiTop1Eligible === true,
        summaryNote: String(item?.aiSummaryNote || ''),
      });

      const sigBuf = Buffer.from(sig, 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      if (sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)) {
        verifiedIds.push(id);
      } else {
        invalidIds.push(id);
      }
    }

    return jsonRes(200, { verifiedIds, invalidIds });
  } catch (err) {
    return jsonRes(500, {
      error:
        err instanceof Error
          ? err.message
          : 'Gagal memverifikasi hasil penilaian AI.',
    });
  }
};
