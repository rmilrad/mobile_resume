"use client";

/** Minimal dependency-free SVG sparkline / price chart. */
export function Sparkline({
  data,
  width = 100,
  height = 32,
  stroke,
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
}) {
  if (data.length < 2) {
    return <svg width={width} height={height} />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = data[data.length - 1]! >= data[0]!;
  const color = stroke ?? (up ? "var(--green)" : "var(--red)");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Larger area chart for the market detail screen. */
export function PriceChart({ data }: { data: number[] }) {
  const width = 440;
  const height = 160;
  if (data.length < 2) return <div className="chart muted" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>Awaiting price data…</div>;
  const min = Math.min(...data, 0);
  const max = Math.max(...data, 1);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const up = data[data.length - 1]! >= data[0]!;
  const color = up ? "var(--green)" : "var(--red)";
  const area = `0,${height} ${line} ${width},${height}`;
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polygon points={area} fill={color} opacity={0.12} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
    </svg>
  );
}
