import { exactStateEv, type ExactEvInput } from "@/lib/ddm/exactEv";

type Request = { id: number; input: ExactEvInput };

self.onmessage = (event: MessageEvent<Request>) => {
  const started = performance.now();
  try {
    const result = exactStateEv(event.data.input);
    self.postMessage({ id: event.data.id, result, durationMs: performance.now() - started });
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : "Exact calculation failed.",
      durationMs: performance.now() - started,
    });
  }
};
