// receiptCard.ts — a finding rendered as a hand-set card the owner is proud
// to post. Pure canvas (no dependencies): Counsel's paper, the serif
// finding, the method receipt, and the standing line. 1080×1350 (4:5) so
// it sits full-bleed in a feed.

const W = 1080, H = 1350, M = 96;

const strip = (html: string) => html.replace(/<[^>]+>/g, "");

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (ctx.measureText(probe).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export interface ReceiptCardOpts {
  kicker: string;    // "what changed — the drivers"
  headline: string;  // may contain <b>/<em> (stripped)
  sub?: string;      // supporting line
  cite: string;      // the method receipt
  business?: string;
}

export async function shareReceiptCard(opts: ReceiptCardOpts): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load("600 66px Fraunces"),
      document.fonts.load("400 30px Inter"),
      document.fonts.load("500 22px 'JetBrains Mono'"),
    ]);
  } catch { /* system fallbacks still compose fine */ }

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // paper + frame
  ctx.fillStyle = "#f4f1e9";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#d9d4c5";
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  // masthead
  ctx.fillStyle = "#8a6a33";
  ctx.font = "500 26px 'JetBrains Mono', monospace";
  ctx.fillText("◆ COUNSEL", M, 150);
  ctx.fillStyle = "#6b7a70";
  const kick = opts.kicker.toUpperCase();
  ctx.font = "500 22px 'JetBrains Mono', monospace";
  ctx.fillText(kick, M, 192);
  ctx.strokeStyle = "#cdae7e";
  ctx.beginPath(); ctx.moveTo(M, 222); ctx.lineTo(W - M, 222); ctx.stroke();

  // the finding (serif, oldstyle feel)
  ctx.fillStyle = "#1f2a23";
  ctx.font = "600 66px Fraunces, Georgia, serif";
  const headLines = wrap(ctx, strip(opts.headline), W - 2 * M).slice(0, 6);
  let y = 330;
  for (const l of headLines) { ctx.fillText(l, M, y); y += 84; }

  // the supporting line
  if (opts.sub) {
    y += 20;
    ctx.fillStyle = "#3d4a42";
    ctx.font = "400 30px Inter, sans-serif";
    for (const l of wrap(ctx, strip(opts.sub), W - 2 * M).slice(0, 4)) { ctx.fillText(l, M, y); y += 44; }
  }

  // the receipt block (anchored low)
  const ry = H - 300;
  ctx.strokeStyle = "#d9d4c5";
  ctx.beginPath(); ctx.moveTo(M, ry); ctx.lineTo(W - M, ry); ctx.stroke();
  ctx.fillStyle = "#8a6a33";
  ctx.font = "500 20px 'JetBrains Mono', monospace";
  ctx.fillText("THE RECEIPT", M, ry + 44);
  ctx.fillStyle = "#6b7a70";
  ctx.font = "400 22px 'JetBrains Mono', monospace";
  let cy = ry + 84;
  for (const l of wrap(ctx, opts.cite, W - 2 * M).slice(0, 3)) { ctx.fillText(l, M, cy); cy += 32; }

  // standing line
  ctx.fillStyle = "#1c4b3a";
  ctx.font = "500 22px 'JetBrains Mono', monospace";
  ctx.fillText(`fabricated numbers: 0 · ${opts.business ?? "counsel"} · counsel-demo.pages.dev`, M, H - 96);

  // out: native share if available, else download
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
  const file = new File([blob], "counsel-receipt.png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: "A finding from Counsel" });
      return;
    } catch { /* user cancelled — fall through to download */ }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "counsel-receipt.png";
  a.click();
  URL.revokeObjectURL(a.href);
}
