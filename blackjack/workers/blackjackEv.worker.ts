/// <reference lib="webworker" />
import { computeLiveEv, type LiveEvRequest, type LiveEvResult } from "@/lib/blackjack/liveEv";

type Request = { id: number; request: LiveEvRequest };

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, request } = event.data;
  try {
    const result: LiveEvResult = computeLiveEv(request);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
export {};
