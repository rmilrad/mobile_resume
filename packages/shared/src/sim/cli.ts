/**
 * Simulation CLI — models games and price fluctuations with fake data.
 * Usage: pnpm --filter @pitchmarket/shared sim [games]
 */
import { simulateMatch, makeRoster } from "./gameSim";
import { simulatePlayerMarket } from "./marketSim";
import { computePS } from "../ps/computePS";
import { makeRng } from "./rng";

const games = Number(process.argv[2] ?? 50);

function buildPlayers(seed: number) {
  const rng = makeRng(seed);
  return [...makeRoster(1, 1, rng), ...makeRoster(2, 100, rng)];
}

let totalMarkets = 0;
let totalTrades = 0;
let gapSum = 0;
const psBuckets = new Array(11).fill(0);

const t0 = Date.now();
for (let g = 0; g < games; g++) {
  const players = buildPlayers(g * 3 + 1);
  const match = simulateMatch(players, g * 7 + 2);
  for (const p of players) {
    const finalPS = computePS(match.final.get(p.id)!).ps;
    psBuckets[Math.min(10, Math.floor(finalPS / 10))]++;
    const r = simulatePlayerMarket(p.id, match, g * 31 + p.id, { tradersPerMinute: 5 });
    totalMarkets++;
    totalTrades += r.trades;
    gapSum += r.convergenceGap;
  }
}
const ms = Date.now() - t0;

console.log(`\nPitchMarket simulation — ${games} games`);
console.log("=".repeat(48));
console.log(`markets simulated : ${totalMarkets}`);
console.log(`trades executed   : ${totalTrades.toLocaleString()}`);
console.log(`avg convergence   : ${(gapSum / totalMarkets).toFixed(4)} (|finalPrice - PS/100|)`);
console.log(`elapsed           : ${ms} ms`);
console.log(`\nfinal PS distribution (bucket of 10):`);
psBuckets.forEach((c, i) => {
  const label = `${i * 10}-${i === 10 ? 100 : i * 10 + 9}`.padStart(7);
  const bar = "#".repeat(Math.round((c / totalMarkets) * 200));
  console.log(`  ${label}: ${bar} ${c}`);
});

// Print one example price path
const players = buildPlayers(1);
const match = simulateMatch(players, 9);
const fwd = players.find((p) => p.position === "FWD")!;
const r = simulatePlayerMarket(fwd.id, match, 9, { tradersPerMinute: 10 });
console.log(`\nexample live price path for ${fwd.name} (finalPS=${r.finalPS}):`);
const step = Math.max(1, Math.floor(r.history.length / 12));
for (let i = 0; i < r.history.length; i += step) {
  const pt = r.history[i]!;
  const bar = "=".repeat(Math.round(pt.priceLong * 40));
  console.log(`  ${String(pt.minute).padStart(2)}'  ${bar.padEnd(40)} ${pt.priceLong.toFixed(3)} (PS=${pt.livePS})`);
}
