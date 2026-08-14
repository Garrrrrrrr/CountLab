/// <reference lib="webworker" />

import {
  ShoeSimulationCancelled,
  ShoeSimulationConfig,
  simulateShoeSession,
} from "@/lib/blackjack/shoeSimulation";

type WorkerRequest =
  | { kind: "start"; id: number; config: ShoeSimulationConfig }
  | { kind: "cancel"; id: number };

let activeId: number | undefined;
let cancelled = false;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.kind === "cancel") {
    if (request.id === activeId) cancelled = true;
    return;
  }
  activeId = request.id;
  cancelled = false;
  try {
    const result = await simulateShoeSession(request.config, {
      isCancelled: () => cancelled || activeId !== request.id,
      onProgress: (completed, total) => self.postMessage({ kind: "progress", id: request.id, completed, total }),
      yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0)),
    });
    if (!cancelled && activeId === request.id) self.postMessage({ kind: "result", id: request.id, result });
  } catch (error) {
    if (error instanceof ShoeSimulationCancelled) self.postMessage({ kind: "cancelled", id: request.id });
    else self.postMessage({ kind: "error", id: request.id, error: error instanceof Error ? error.message : String(error) });
  } finally {
    if (activeId === request.id) activeId = undefined;
  }
};

export {};
