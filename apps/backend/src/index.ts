import { Store } from "./store";
import { SimEngine } from "./simEngine";
import { createApi } from "./api";

const PORT = Number(process.env.PORT ?? 4000);
const NUM_FIXTURES = Number(process.env.SIM_FIXTURES ?? 6);
const TICK_MS = Number(process.env.SIM_TICK_MS ?? 1500);

const store = new Store();
const engine = new SimEngine(store, { numFixtures: NUM_FIXTURES, tickMs: TICK_MS });
engine.init();
const stop = engine.start();

const app = createApi(store);
const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`PitchMarket backend (sim mode) listening on http://localhost:${PORT}`);
  console.log(`  fixtures: ${NUM_FIXTURES}, tick: ${TICK_MS}ms`);
});

process.on("SIGINT", () => {
  stop();
  server.close(() => process.exit(0));
});
