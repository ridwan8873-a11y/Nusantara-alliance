import 'dotenv/config';
import express from 'express';
import path from 'node:path';
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
    rankByTotalProfit?: number;
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
              'Anda adalah juri profesional kompetisi maskapai penerbangan Akasha Alliance (Airlines of The Moon). Berikan penilaian adil, objektif, dan ringkas dalam format JSON yang diminta.',
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
                summaryNote: {
                  type: Type.STRING,
                  description:
                    'Ringkasan penilaian juri dalam Bahasa Indonesia, maksimal 380 karakter.',
                },
              },
              required: [
                'score',
                'recommendedStatus',
                'photoMatchStatus',
                'summaryNote',
              ],
            },
          },
        });
      } catch (err) {
        lastError = err;
        if (!isTransientHighDemandError(err)) {
          throw err;
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

      const marginPct =
        revenue > 0 ? ((operatingProfit / revenue) * 100).toFixed(2) : '0.00';

      const peerRank = body.peerStats?.rankByTotalProfit ?? 1;
      const totalParticipants = body.peerStats?.totalParticipants ?? 1;
      const maxTotalProfit = body.peerStats?.maxTotalProfit ?? totalProfit;

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const promptText = [
        `Evaluasi laporan peserta kompetisi "Airlines of The Moon" dari Akasha Alliance.`,
        ``,
        `Data yang diinput peserta:`,
        `- Nama maskapai: ${airlineName}`,
        `- Alliance: ${alliance}`,
        `- Total profit: ${totalProfit}`,
        `- Codeshare profit: ${codeshareProfit}`,
        `- Operating profit: ${operatingProfit}`,
        `- Revenue: ${revenue}`,
        `- Operating cost: ${operatingCost}`,
        `- Rasio Margin (Operating Profit / Revenue): ${marginPct}%`,
        ``,
        `Posisi relatif terhadap peserta saat ini:`,
        `- Peringkat Total Profit sementara: #${peerRank} dari ${totalParticipants} peserta`,
        `- Total Profit tertinggi di kompetisi: ${maxTotalProfit}`,
        ``,
        `Tugas penilaian Anda:`,
        `1. Periksa GAMBAR 1 (Foto profit maskapai) dan GAMBAR 2 (Foto maskapai). Cek apakah gambar tersebut benar screenshot/foto game maskapai & halaman profit/keuangan, dan apakah angka di Gambar 1 cocok atau wajar dengan angka yang diinput peserta.`,
        `2. Berikan nilai objektif 0 sampai 100 (score) mempertimbangkan: kekuatan Total Profit & Operating Profit dibandingkan peserta lain, efisiensi Margin Revenue vs Operating Cost, kontribusi Codeshare Profit, serta kejelasan/kesesuaian foto bukti.`,
        `3. Pilih recommendedStatus dari tepat salah satu opsi: "Juara 1", "Juara 2", "Juara 3", "Terverifikasi", "Menunggu", atau "Diskualifikasi". (Gunakan "Juara 1/2/3" hanya jika peringkat & bukti kuat layak podium; gunakan "Terverifikasi" jika valid namun bukan podium; gunakan "Menunggu" jika foto buram/perlu cek manual; gunakan "Diskualifikasi" hanya jika foto jelas palsu/tidak relevan sama sekali).`,
        `4. Pilih photoMatchStatus dari: "Sesuai", "Perlu Cek Manual", atau "Tidak Sesuai".`,
        `5. Tulis summaryNote singkat dalam Bahasa Indonesia (maksimal 380 karakter) yang merangkum hasil cek foto dan performa keuangan untuk catatan juri.`,
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

      const rawText = (response.text ?? '').trim();
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

      const rawScore = Number(parsed.score);
      const score = Number.isFinite(rawScore)
        ? Math.max(0, Math.min(100, Math.round(rawScore * 10) / 10))
        : 75;

      const summaryNote = String(parsed.summaryNote || '')
        .trim()
        .slice(0, 480);

      res.json({
        score,
        recommendedStatus,
        photoMatchStatus,
        summaryNote: `[AI · Foto: ${photoMatchStatus}] ${summaryNote}`.slice(
          0,
          490
        ),
      });
    } catch (error) {
      console.error('AI evaluation error:', error);
      const statusCode = isTransientHighDemandError(error) ? 503 : 500;
      res.status(statusCode).json({ error: formatFriendlyAiError(error) });
    }
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

