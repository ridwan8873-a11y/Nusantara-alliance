import { MOON_EVENT_LIMITS } from '../types/moonEvent';

export interface CompressedImageResult {
  dataUrl: string;
  width: number;
  height: number;
  sizeKB: number;
  originalName: string;
}

const TARGET_MAX_CHARS = 320000;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('File gambar tidak dapat dibaca. Gunakan format JPG, PNG, atau WebP.'));
    img.src = src;
  });
}

export async function compressImageFile(
  file: File
): Promise<CompressedImageResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File yang dipilih harus berupa foto/gambar (JPG, PNG, atau WebP).');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;

    if (!naturalW || !naturalH) {
      throw new Error('Dimensi gambar tidak valid.');
    }

    const attempts: Array<{ maxDim: number; quality: number }> = [
      { maxDim: 1080, quality: 0.8 },
      { maxDim: 920, quality: 0.72 },
      { maxDim: 760, quality: 0.62 },
      { maxDim: 600, quality: 0.5 },
      { maxDim: 480, quality: 0.42 },
    ];

    for (const { maxDim, quality } of attempts) {
      const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
      const targetW = Math.max(1, Math.round(naturalW * scale));
      const targetH = Math.max(1, Math.round(naturalH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Browser tidak mendukung pemrosesan gambar.');
      }

      ctx.fillStyle = '#0F1B2D';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (
        dataUrl.startsWith('data:image/') &&
        dataUrl.length <= TARGET_MAX_CHARS &&
        dataUrl.length <= MOON_EVENT_LIMITS.maxPhotoDataUrlLength
      ) {
        return {
          dataUrl,
          width: targetW,
          height: targetH,
          sizeKB: Math.round((dataUrl.length * 0.75) / 1024),
          originalName: file.name,
        };
      }
    }

    throw new Error(
      'Ukuran foto terlalu besar setelah dikompresi. Silakan pilih foto lain yang lebih ringan.'
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
