import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
const isProduction = process.env.NODE_ENV === 'production';
// In development, dev server must run on port 3000 per environment constraints
const PORT = isProduction ? Number(process.env.PORT) || 3000 : 3000;

interface EvaluateSubmissionBody {
  airlineName?: string;
  alliance?: string;
  totalProfit?: number;
  codeshareProfit?: number;
  operatingProfit?: number;
  revenue?: number;
  operatingCost?: number;
  profitPhotoDataUrl?: string;
  airlinePhotoDataUrl?: string;
  peerStats?: {
    totalParticipants?: number;
    maxTotalProfit?: number;
    maxOperatingProfit?: number;
    maxMarginPct?: number;
    rankByTotalProfit?: number;
    rankByMargin?: number;
  };
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl.trim()
  );
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientHighDemandError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED')
  );
}

function formatFriendlyAiError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (isTransientHighDemandError(error)) {
    return 'Server AI sedang mengalami lonjakan permintaan sementara (503). Silakan tunggu beberapa detik lalu coba klik lagi.';
  }
  if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED')) {
    return 'Kunci API Gemini tidak valid atau belum aktif. Silakan periksa panel Settings > Secrets.';
  }
  return 'Gagal menjalankan penilaian otomatis AI. Silakan coba lagi beberapa saat.';
}

function cleanJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }
  return trimmed;
}

function isAuthConfigError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED');
}

function signAiEvaluation(
  secret: string,
  payload: {
    airlineName: string;
    alliance: string;
    totalProfit: number;
    codeshareProfit: number;
    operatingProfit: number;
    revenue: number;
    operatingCost: number;
    score: number;
    recommendedStatus: string;
    photoMatchStatus: string;
    top1Eligible: boolean;
    summaryNote: string;
  }
): string {
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

async function generateEvaluationWithRetry(
  ai: GoogleGenAI,
  parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  >
) {
  const modelsToTry = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
  let lastError: unknown;

  for (const modelName of modelsToTry) {
    const delays = [0, 900, 2000];
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt] > 0) {
        await sleep(delays[attempt]);
      }
      try {
        return await ai.models.generateContent({
          model: modelName,
          contents: { parts },
          config: {
            systemInstruction:
              'Anda adalah ketua dewan juri resmi kompetisi maskapai penerbangan AOTM Nusantara Alliance. Evaluasi peserta secara objektif berdasarkan 3 kriteria resmi: (1) Keaslian Bukti Visual, (2) Akurasi 5 Angka Keuangan vs Foto, dan (3) Margin & Efisiensi Armada. Kembalikan hanya JSON valid.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                score: {
                  type: Type.NUMBER,
                  description:
                    'Skor penilaian keseluruhan antara 0 sampai 100.',
                },
                recommendedStatus: {
                  type: Type.STRING,
                  description:
                    'Salah satu dari: Menunggu, Terverifikasi, Juara 1, Juara 2, Juara 3, Diskualifikasi',
                },
                photoMatchStatus: {
                  type: Type.STRING,
                  description:
                    'Salah satu dari: Sesuai, Perlu Cek Manual, Tidak Sesuai',
                },
                top1Eligible: {
                  type: Type.BOOLEAN,
                  description:
                    'True jika peserta memenuhi semua 3 kriteria dan layak menjadi kandidat Juara 1 (Top 1).',
                },
                summaryNote: {
                  type: Type.STRING,
                  description:
                    'Ringkasan penilaian 3 kriteria & kelayakan Top 1 dalam Bahasa Indonesia, maksimal 360 karakter.',
                },
              },
              required: [
                'score',
                'recommendedStatus',
                'photoMatchStatus',
                'top1Eligible',
                'summaryNote',
              ],
            },
          },
        });
      } catch (err) {
        lastError = err;
        if (isAuthConfigError(err)) {
          throw err;
        }
        if (!isTransientHighDemandError(err)) {
          console.warn(`Gemini ${modelName} error, trying fallback if available:`, err);
          break;
        }
        console.warn(
          `Gemini ${modelName} transient busy (attempt ${attempt + 1}/${delays.length})`
        );
      }
    }
  }

  throw lastError;
}

async function createAppServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Real active browser tab presence tracker (tracks real unauthenticated guest sessions with 45s TTL)
  const PRESENCE_TTL_MS = 45_000;
  const activeSessions = new Map<
    string,
    { lastSeenAt: number; isAuthenticated: boolean }
  >();

  const pruneStaleSessions = (now: number) => {
    for (const [id, info] of activeSessions.entries()) {
      if (now - info.lastSeenAt > PRESENCE_TTL_MS) {
        activeSessions.delete(id);
      }
    }
  };

  const countRealGuests = (): number => {
    let guests = 0;
    for (const info of activeSessions.values()) {
      if (!info.isAuthenticated) {
        guests += 1;
      }
    }
    return guests;
  };

  app.post('/api/presence/ping', (req, res) => {
    const now = Date.now();
    pruneStaleSessions(now);
    const body = (req.body || {}) as {
      sessionId?: unknown;
      isAuthenticated?: unknown;
    };
    const sessionId =
      typeof body.sessionId === 'string' ? body.sessionId.trim().slice(0, 64) : '';
    const isAuthenticated = body.isAuthenticated === true;

    if (sessionId && /^[a-zA-Z0-9_-]{6,64}$/.test(sessionId)) {
      activeSessions.set(sessionId, {
        lastSeenAt: now,
        isAuthenticated,
      });
    }

    res.json({
      guestCount: countRealGuests(),
    });
  });

  app.post('/api/presence/leave', express.text({ type: '*/*' }), (req, res) => {
    let sessionId = '';
    if (typeof req.body === 'string') {
      try {
        const parsed = JSON.parse(req.body) as { sessionId?: unknown };
        sessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId.trim() : '';
      } catch {
        sessionId = '';
      }
    } else if (req.body && typeof req.body === 'object') {
      const parsed = req.body as { sessionId?: unknown };
      sessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId.trim() : '';
    }

    if (sessionId) {
      activeSessions.delete(sessionId);
    }
    res.status(204).end();
  });

  app.post('/api/ai/evaluate-submission', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(500).json({
          error:
            'GEMINI_API_KEY belum terkonfigurasi di environment server.',
        });
        return;
      }

      const body = (req.body || {}) as EvaluateSubmissionBody;
      const airlineName = String(body.airlineName || '').trim();
      const alliance = String(body.alliance || '').trim();
      const totalProfit = Number(body.totalProfit);
      const codeshareProfit = Number(body.codeshareProfit);
      const operatingProfit = Number(body.operatingProfit);
      const revenue = Number(body.revenue);
      const operatingCost = Number(body.operatingCost);

      if (
        !airlineName ||
        !alliance ||
        !Number.isFinite(totalProfit) ||
        !Number.isFinite(codeshareProfit) ||
        !Number.isFinite(operatingProfit) ||
        !Number.isFinite(revenue) ||
        !Number.isFinite(operatingCost)
      ) {
        res.status(400).json({
          error: 'Data finansial atau identitas maskapai tidak lengkap.',
        });
        return;
      }

      const profitImg = body.profitPhotoDataUrl
        ? parseDataUrl(body.profitPhotoDataUrl)
        : null;
      const airlineImg = body.airlinePhotoDataUrl
        ? parseDataUrl(body.airlinePhotoDataUrl)
        : null;

      if (!profitImg || !airlineImg) {
        res.status(400).json({
          error: 'Kedua foto bukti maskapai harus berupa gambar valid.',
        });
        return;
      }

      const marginPctNum = revenue > 0 ? (operatingProfit / revenue) * 100 : 0;
      const marginPct = marginPctNum.toFixed(2);
      const costRatioPct = revenue > 0 ? ((operatingCost / revenue) * 100).toFixed(2) : '0.00';

      const peerRank = body.peerStats?.rankByTotalProfit ?? 1;
      const rankByMargin = body.peerStats?.rankByMargin ?? 1;
      const totalParticipants = body.peerStats?.totalParticipants ?? 1;
      const maxTotalProfit = body.peerStats?.maxTotalProfit ?? totalProfit;
      const maxOperatingProfit = body.peerStats?.maxOperatingProfit ?? operatingProfit;
      const maxMarginPct = body.peerStats?.maxMarginPct ?? marginPctNum;

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const promptText = [
        `Evaluasi laporan peserta kompetisi "AOTM Nusantara Alliance" berdasarkan 3 Kriteria Resmi Dewan Juri:`,
        ``,
        `Data yang diinput peserta:`,
        `- Nama maskapai: ${airlineName}`,
        `- Alliance: ${alliance}`,
        `- Total profit: ${totalProfit}`,
        `- Codeshare profit: ${codeshareProfit}`,
        `- Operating profit: ${operatingProfit}`,
        `- Revenue: ${revenue}`,
        `- Operating cost: ${operatingCost}`,
        `- Rasio Margin Efisiensi (Operating Profit / Revenue): ${marginPct}%`,
        `- Rasio Biaya Operasional (Operating Cost / Revenue): ${costRatioPct}%`,
        ``,
        `Perbandingan terhadap seluruh peserta saat ini (${totalParticipants} maskapai):`,
        `- Peringkat Total Profit: #${peerRank} dari ${totalParticipants} (Tertinggi: ${maxTotalProfit})`,
        `- Operating Profit Tertinggi Kompetisi: ${maxOperatingProfit}`,
        `- Peringkat Margin Efisiensi: #${rankByMargin} dari ${totalParticipants} (Tertinggi: ${Number(maxMarginPct).toFixed(2)}%)`,
        ``,
        `3 KRITERIA WAJIB PENILAIAN DEWAN JURI:`,
        `1. [01 · Keaslian Bukti Visual]: Periksa GAMBAR 1 (Foto profit maskapai) dan GAMBAR 2 (Foto profil/armada maskapai). Pastikan keduanya tangkapan layar asli langsung dari game tanpa editan/manipulasi, jelas, dan bukan gambar kosong/asal.`,
        `2. [02 · Akurasi 5 Angka Keuangan]: Periksa apakah Total Profit, Codeshare Profit, Operating Profit, Revenue, dan Operating Cost di formulir cocok/konsisten dengan angka pada GAMBAR 1.`,
        `3. [03 · Margin & Efisiensi Armada]: Nilai performa laba bersih (Total Profit & Operating Profit), efisiensi biaya operasional (Margin % & rasio biaya), serta kontribusi Codeshare Profit dibandingkan peserta lain untuk menentukan kelayakan Top 1–10.`,
        ``,
        `Aturan Output:`,
        `- Berikan nilai objektif 0 sampai 100 (score). Peserta hanya layak mendapat skor tinggi (90–100) & top1Eligible = true jika Foto Sesuai/Asli, 5 Angka Akurat, serta Profit & Margin berada di jajaran teratas.`,
        `- Pilih recommendedStatus tepat satu dari: "Juara 1", "Juara 2", "Juara 3", "Terverifikasi", "Menunggu", atau "Diskualifikasi".`,
        `  * Gunakan "Juara 1" hanya jika top1Eligible = true dan peringkat #1 sangat kuat di 3 kriteria.`,
        `  * Gunakan "Diskualifikasi" jika foto palsu/editan/tidak relevan sama sekali atau angka jelas dimanipulasi.`,
        `  * Gunakan "Menunggu" jika foto buram atau angka tidak terbaca jelas sehingga perlu cek manual admin.`,
        `- Pilih photoMatchStatus dari: "Sesuai", "Perlu Cek Manual", atau "Tidak Sesuai".`,
        `- Tulis summaryNote ringkas dalam Bahasa Indonesia (maksimal 340 karakter) yang menyebut status foto, keakuratan angka, dan alasan layak/tidaknya masuk Top 1.`,
      ].join('\n');

      const response = await generateEvaluationWithRetry(ai, [
        { text: 'GAMBAR 1 — Foto profit maskapai:' },
        {
          inlineData: {
            mimeType: profitImg.mimeType,
            data: profitImg.data,
          },
        },
        { text: 'GAMBAR 2 — Foto maskapai:' },
        {
          inlineData: {
            mimeType: airlineImg.mimeType,
            data: airlineImg.data,
          },
        },
        { text: promptText },
      ]);

      const rawText = cleanJsonText(response.text ?? '');
      if (!rawText) {
        res.status(502).json({
          error: 'Model AI tidak mengembalikan hasil evaluasi.',
        });
        return;
      }

      const parsed = JSON.parse(rawText) as {
        score?: number;
        recommendedStatus?: string;
        photoMatchStatus?: string;
        top1Eligible?: boolean;
        summaryNote?: string;
      };

      const validStatuses = [
        'Menunggu',
        'Terverifikasi',
        'Juara 1',
        'Juara 2',
        'Juara 3',
        'Diskualifikasi',
      ];
      const recommendedStatus = validStatuses.includes(
        String(parsed.recommendedStatus)
      )
        ? String(parsed.recommendedStatus)
        : 'Terverifikasi';

      const validPhotoStatuses = [
        'Sesuai',
        'Perlu Cek Manual',
        'Tidak Sesuai',
      ];
      const photoMatchStatus = validPhotoStatuses.includes(
        String(parsed.photoMatchStatus)
      )
        ? String(parsed.photoMatchStatus)
        : 'Perlu Cek Manual';

      const top1Eligible = parsed.top1Eligible === true && photoMatchStatus === 'Sesuai';
      const rawScore = Number(parsed.score);
      const score = Number.isFinite(rawScore)
        ? Math.max(0, Math.min(100, Math.round(rawScore * 10) / 10))
        : 75;

      const summaryNote = String(parsed.summaryNote || '')
        .trim()
        .slice(0, 440);
      const top1Prefix = top1Eligible ? ' · Layak Top 1' : '';
      const finalSummaryNote = `[AI · Foto: ${photoMatchStatus}${top1Prefix}] ${summaryNote}`.slice(
        0,
        490
      );

      const signingSecret = process.env.AI_EVAL_SECRET || apiKey;
      const aiSignature = signAiEvaluation(signingSecret, {
        airlineName,
        alliance,
        totalProfit,
        codeshareProfit,
        operatingProfit,
        revenue,
        operatingCost,
        score,
        recommendedStatus,
        photoMatchStatus,
        top1Eligible,
        summaryNote: finalSummaryNote,
      });

      res.json({
        score,
        recommendedStatus,
        photoMatchStatus,
        top1Eligible,
        summaryNote: finalSummaryNote,
        aiSignature,
      });
    } catch (error) {
      console.error('AI evaluation error:', error);
      const statusCode = isTransientHighDemandError(error) ? 503 : 500;
      res.status(statusCode).json({ error: formatFriendlyAiError(error) });
    }
  });

  app.post('/api/ai/verify-submission-eval', (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY || '';
    const signingSecret = process.env.AI_EVAL_SECRET || apiKey;
    if (!signingSecret) {
      res.status(500).json({
        error: 'Kunci verifikasi server belum terkonfigurasi.',
      });
      return;
    }

    const body = (req.body || {}) as {
      items?: Array<{
        id?: string;
        airlineName?: string;
        alliance?: string;
        totalProfit?: number;
        codeshareProfit?: number;
        operatingProfit?: number;
        revenue?: number;
        operatingCost?: number;
        aiScore?: number;
        aiRecommendedStatus?: string;
        aiPhotoMatchStatus?: string;
        aiTop1Eligible?: boolean;
        aiSummaryNote?: string;
        aiSignature?: string;
      }>;
    };

    const items = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
    const verifiedIds: string[] = [];
    const invalidIds: string[] = [];

    for (const item of items) {
      const id = String(item.id || '').trim();
      if (!id) continue;

      const sig = String(item.aiSignature || '').trim();
      if (!/^[a-f0-9]{64}$/.test(sig)) {
        invalidIds.push(id);
        continue;
      }

      const expected = signAiEvaluation(signingSecret, {
        airlineName: String(item.airlineName || '').trim(),
        alliance: String(item.alliance || '').trim(),
        totalProfit: Number(item.totalProfit),
        codeshareProfit: Number(item.codeshareProfit),
        operatingProfit: Number(item.operatingProfit),
        revenue: Number(item.revenue),
        operatingCost: Number(item.operatingCost),
        score: Number(item.aiScore),
        recommendedStatus: String(item.aiRecommendedStatus || ''),
        photoMatchStatus: String(item.aiPhotoMatchStatus || ''),
        top1Eligible: item.aiTop1Eligible === true,
        summaryNote: String(item.aiSummaryNote || ''),
      });

      const sigBuf = Buffer.from(sig, 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      if (sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)) {
        verifiedIds.push(id);
      } else {
        invalidIds.push(id);
      }
    }

    res.json({ verifiedIds, invalidIds });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve('dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Akasha Alliance server listening on http://0.0.0.0:${PORT}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error(`Server error on port ${PORT}:`, err);
  });
}

createAppServer();

