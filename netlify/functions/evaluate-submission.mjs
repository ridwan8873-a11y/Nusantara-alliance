import { createHmac } from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';

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

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(
    String(dataUrl || '').trim()
  );
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function cleanJsonText(raw) {
  const trimmed = String(raw || '').trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }
  return trimmed;
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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonRes(500, {
        error:
          'GEMINI_API_KEY belum ditambahkan di Environment Variables Netlify. Tambahkan GEMINI_API_KEY di Netlify atau jalankan penilaian AI dari link AI Studio.',
      });
    }

    const body = await req.json();
    const airlineName = String(body?.airlineName || '').trim();
    const alliance = String(body?.alliance || '').trim();
    const totalProfit = Number(body?.totalProfit);
    const codeshareProfit = Number(body?.codeshareProfit);
    const operatingProfit = Number(body?.operatingProfit);
    const revenue = Number(body?.revenue);
    const operatingCost = Number(body?.operatingCost);

    if (
      !airlineName ||
      !alliance ||
      !Number.isFinite(totalProfit) ||
      !Number.isFinite(codeshareProfit) ||
      !Number.isFinite(operatingProfit) ||
      !Number.isFinite(revenue) ||
      !Number.isFinite(operatingCost)
    ) {
      return jsonRes(400, {
        error: 'Data finansial atau identitas maskapai tidak lengkap.',
      });
    }

    const profitImg = parseDataUrl(body?.profitPhotoDataUrl);
    const airlineImg = parseDataUrl(body?.airlinePhotoDataUrl);
    if (!profitImg || !airlineImg) {
      return jsonRes(400, {
        error: 'Kedua foto bukti maskapai harus berupa gambar valid.',
      });
    }

    const marginPctNum = revenue > 0 ? (operatingProfit / revenue) * 100 : 0;
    const marginPct = marginPctNum.toFixed(2);
    const costRatioPct =
      revenue > 0 ? ((operatingCost / revenue) * 100).toFixed(2) : '0.00';

    const peerRank = body?.peerStats?.rankByTotalProfit ?? 1;
    const rankByMargin = body?.peerStats?.rankByMargin ?? 1;
    const totalParticipants = body?.peerStats?.totalParticipants ?? 1;
    const maxTotalProfit = body?.peerStats?.maxTotalProfit ?? totalProfit;
    const maxOperatingProfit =
      body?.peerStats?.maxOperatingProfit ?? operatingProfit;
    const maxMarginPct = body?.peerStats?.maxMarginPct ?? marginPctNum;

    const ai = new GoogleGenAI({ apiKey });
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

    const modelsToTry = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
    let response;
    let lastError;

    for (const modelName of modelsToTry) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [
              { text: 'GAMBAR 1 — Foto profit maskapai:' },
              { inlineData: { mimeType: profitImg.mimeType, data: profitImg.data } },
              { text: 'GAMBAR 2 — Foto maskapai:' },
              { inlineData: { mimeType: airlineImg.mimeType, data: airlineImg.data } },
              { text: promptText },
            ],
          },
          config: {
            systemInstruction:
              'Anda adalah ketua dewan juri resmi kompetisi maskapai penerbangan AOTM Nusantara Alliance. Evaluasi peserta secara objektif berdasarkan 3 kriteria resmi: (1) Keaslian Bukti Visual, (2) Akurasi 5 Angka Keuangan vs Foto, dan (3) Margin & Efisiensi Armada. Kembalikan hanya JSON valid.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                score: {
                  type: Type.NUMBER,
                  description: 'Skor penilaian keseluruhan antara 0 sampai 100.',
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
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!response) {
      throw lastError || new Error('Gagal terhubung ke model Gemini.');
    }

    const parsed = JSON.parse(cleanJsonText(response.text));
    const validStatuses = [
      'Menunggu',
      'Terverifikasi',
      'Juara 1',
      'Juara 2',
      'Juara 3',
      'Diskualifikasi',
    ];
    const recommendedStatus = validStatuses.includes(String(parsed.recommendedStatus))
      ? String(parsed.recommendedStatus)
      : 'Terverifikasi';

    const validPhotoStatuses = ['Sesuai', 'Perlu Cek Manual', 'Tidak Sesuai'];
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

    const summaryNote = String(parsed.summaryNote || '').trim().slice(0, 440);
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

    return jsonRes(200, {
      score,
      recommendedStatus,
      photoMatchStatus,
      top1Eligible,
      summaryNote: finalSummaryNote,
      aiSignature,
    });
  } catch (err) {
    return jsonRes(500, {
      error:
        err instanceof Error
          ? `Gagal menjalankan AI: ${err.message}`
          : 'Gagal menjalankan penilaian otomatis AI.',
    });
  }
};
