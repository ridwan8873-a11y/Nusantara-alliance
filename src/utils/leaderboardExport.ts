import type { MoonEventSubmission } from '../types/moonEvent';

function formatNum(val: number): string {
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 2,
  }).format(val);
}

function loadLogoImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function exportLeaderboardPng(
  rows: MoonEventSubmission[],
  sortLabel: string
): Promise<void> {
  const width = 1280;
  const headerHeight = 148;
  const tableHeaderHeight = 48;
  const rowHeight = 56;
  const footerHeight = 56;
  const displayRows = rows.slice(0, 25);
  const height =
    headerHeight +
    tableHeaderHeight +
    Math.max(1, displayRows.length) * rowHeight +
    footerHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#0C1728');
  grad.addColorStop(1, '#08101C');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Outer hairline gold frame
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, width - 32, height - 32);

  // Logo
  const logo = await loadLogoImage('/assets/alliance-emblem.jpg');
  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(44, 42, 68, 68, 8);
    ctx.clip();
    ctx.drawImage(logo, 44, 42, 68, 68);
    ctx.restore();
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(44, 42, 68, 68);
  }

  // Header Typography
  ctx.fillStyle = '#E5C158';
  ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('NUSANTARA ALLIANCE · OFFICIAL LEADERBOARD', 130, 62);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 28px "Outfit", system-ui, sans-serif';
  ctx.fillText('AOTM Nusantara Alliance', 130, 96);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '400 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    `Urutan: ${sortLabel}  ·  Total Peserta: ${rows.length}  ·  Dicetak: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'medium' })}`,
    130,
    120
  );

  // Table header bar
  const tableTop = headerHeight;
  ctx.fillStyle = '#122238';
  ctx.fillRect(36, tableTop, width - 72, tableHeaderHeight);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(36, tableTop + tableHeaderHeight);
  ctx.lineTo(width - 36, tableTop + tableHeaderHeight);
  ctx.stroke();

  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('RANK', 52, tableTop + 29);
  ctx.fillText('MASKAPAI / ALLIANCE', 112, tableTop + 29);
  ctx.textAlign = 'right';
  ctx.fillText('TOTAL PROFIT', 590, tableTop + 29);
  ctx.fillText('OPERATING PROFIT', 755, tableTop + 29);
  ctx.fillText('CODESHARE PROFIT', 925, tableTop + 29);
  ctx.fillText('REVENUE', 1055, tableTop + 29);
  ctx.fillText('POIN AKHIR / STATUS', width - 52, tableTop + 29);

  // Rows
  displayRows.forEach((item, index) => {
    const y = tableTop + tableHeaderHeight + index * rowHeight;
    if (index % 2 === 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.fillRect(36, y, width - 72, rowHeight);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(36, y + rowHeight);
    ctx.lineTo(width - 36, y + rowHeight);
    ctx.stroke();

    // Rank
    ctx.textAlign = 'left';
    ctx.fillStyle = index < 3 ? '#E5C158' : '#CBD5E1';
    ctx.font = '700 16px "JetBrains Mono", monospace';
    ctx.fillText(`#${index + 1}`, 52, y + 34);

    // Airline & Alliance
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '600 15px "Plus Jakarta Sans", system-ui, sans-serif';
    const airlineLabel =
      item.airlineName.length > 26
        ? `${item.airlineName.slice(0, 25)}…`
        : item.airlineName;
    ctx.fillText(airlineLabel, 112, y + 26);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '400 12px "Plus Jakarta Sans", system-ui, sans-serif';
    const allianceLabel =
      item.alliance.length > 28
        ? `${item.alliance.slice(0, 27)}…`
        : item.alliance;
    ctx.fillText(allianceLabel, 112, y + 44);

    // Metrics
    ctx.textAlign = 'right';
    ctx.fillStyle = '#E5C158';
    ctx.font = '600 14px "JetBrains Mono", monospace';
    ctx.fillText(formatNum(item.totalProfit), 590, y + 34);

    ctx.fillStyle = '#E2E8F0';
    ctx.font = '500 13px "JetBrains Mono", monospace';
    ctx.fillText(formatNum(item.operatingProfit), 755, y + 34);
    ctx.fillText(formatNum(item.codeshareProfit), 925, y + 34);

    ctx.fillStyle = '#6EE7B7';
    ctx.fillText(formatNum(item.revenue), 1055, y + 34);

    // Poin Akhir / Status
    const statusText = item.judgeStatus || 'Menunggu';
    const scoreText =
      typeof item.adminScore === 'number' ? `${item.adminScore} poin · ` : '';
    ctx.fillStyle =
      statusText.startsWith('Juara')
        ? '#F3D77A'
        : statusText === 'Terverifikasi'
          ? '#6EE7B7'
          : statusText === 'Diskualifikasi'
            ? '#FDA4AF'
            : '#CBD5E1';
    ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(`${scoreText}${statusText}`, width - 52, y + 34);
  });

  // Footer
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748B';
  ctx.font = '400 12px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    'Nusantara Alliance · AOTM Nusantara Alliance Official Evaluation Board',
    44,
    height - 26
  );

  const link = document.createElement('a');
  link.download = `aotm-nusantara-alliance-klasemen-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
