"use client";
import { useEffect, useMemo, useRef } from "react";

export const CALCULATION_ERROR = "Calculation stopped unexpectedly. Try again.";

/** Start workers on demand, discard late messages, and recover after failure. */
export function useCalculationWorker<T>(
  create: () => Worker,
  onMessage: (event: MessageEvent<T>) => void,
  onError: (message: string) => void,
) {
  const callbacks = useRef({ create, onMessage, onError });
  const instance = useRef<Worker | undefined>(undefined);
  useEffect(() => { callbacks.current = { create, onMessage, onError }; }, [create, onMessage, onError]);
  const controller = useMemo(() => {
    let lastMessage: unknown;
    const terminate = () => {
      const previous = instance.current;
      instance.current = undefined;
      previous?.terminate();
    };
    const postMessage = (message: unknown) => {
      lastMessage = message;
      try {
        if (!instance.current) {
          const worker = callbacks.current.create();
          instance.current = worker;
          worker.onmessage = (event: MessageEvent<T>) => { if (instance.current === worker) callbacks.current.onMessage(event); };
          const fail = (event: Event) => {
            if (instance.current !== worker) return;
            event.preventDefault();
            terminate();
            callbacks.current.onError(CALCULATION_ERROR);
          };
          worker.onerror = fail;
          worker.onmessageerror = fail;
        }
        instance.current.postMessage(message);
      } catch {
        terminate();
        callbacks.current.onError(CALCULATION_ERROR);
      }
    };
    return { postMessage, terminate, retry: () => { if (lastMessage !== undefined) postMessage(lastMessage); } };
  }, []);
  useEffect(() => () => controller.terminate(), [controller]);
  return controller;
}
