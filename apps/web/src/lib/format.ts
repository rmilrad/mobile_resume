/** Display formatting helpers (pure). */

export function formatUsd(n: number, dp = 2): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

/** Price in (0,1) shown as cents (Polymarket-style), e.g. 0.572 -> "57¢". */
export function formatPriceCents(price: number): string {
  return `${Math.round(price * 100)}¢`;
}

export function formatPct(frac: number, dp = 1): string {
  return `${(frac * 100).toFixed(dp)}%`;
}

export function formatSigned(n: number, dp = 2): string {
  const s = n >= 0 ? "+" : "−";
  return `${s}${formatUsd(Math.abs(n), dp).slice(1)}`;
}

export function shortName(name: string, max = 22): string {
  return name.length > max ? name.slice(0, max - 1) + "…" : name;
}
