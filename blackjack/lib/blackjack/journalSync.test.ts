import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { journalLibrary } from "./journal";
import { DEFAULT_ADVANTAGE_RULES, RAMPS } from "./advantage";
import { setCurrentUser } from "../supabase/currentUser";
import { accountStorage } from "../supabase/accountStorage";

const remote = vi.hoisted(() => ({ upsert: vi.fn(), update: vi.fn() }));
vi.mock("../supabase/client", () => ({ supabase: { from: () => remote } }));
vi.mock("../analytics", () => ({ observeApiRequest: (_provider: string, _action: string, work: unknown) => work }));
vi.mock("../analytics/track", () => ({ track: vi.fn() }));

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

const input = { date: "2026-09-12", hours: 2, handsPerHour: 100, playerHands: 1, bettingUnit: 25,
  rules: DEFAULT_ADVANTAGE_RULES, ramp: RAMPS["1-8"], netResult: 120, expenses: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("window", new EventTarget());
  remote.upsert.mockReset().mockResolvedValue({ error: null });
  remote.update.mockReset();
  setCurrentUser({ id: "alice" } as User);
});
afterEach(async () => {
  setCurrentUser(null);
  await vi.runAllTimersAsync();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("persists a deleted revision when deletion precedes the first upload", async () => {
  const session = journalLibrary.addSession(input);
  journalLibrary.deleteSession(session.id);
  await vi.runAllTimersAsync();
  const writes = remote.upsert.mock.calls.map(([row]) => row).filter((row) => row.id === session.id);
  expect(writes).toHaveLength(1);
  expect(writes[0].deleted_at).toBeTruthy();
  expect(writes[0].net_result).toBe(120);
  expect(remote.update).not.toHaveBeenCalled();
  expect(journalLibrary.sessions()).toEqual([]);
});

it("retries a failed deletion until the server acknowledges it", async () => {
  const session = journalLibrary.addSession(input);
  await vi.runAllTimersAsync();
  remote.upsert.mockResolvedValueOnce({ error: { message: "Offline" } });
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  journalLibrary.deleteSession(session.id);
  await vi.runAllTimersAsync();
  expect(accountStorage.getItem(`countlab:journal-delete-ack:session:${session.id}`)).toBeNull();
  const replay = journalLibrary.pushAllToRemote();
  await vi.runAllTimersAsync();
  await replay;
  expect(accountStorage.getItem(`countlab:journal-delete-ack:session:${session.id}`)).toBeTruthy();
  const count = remote.upsert.mock.calls.length;
  await journalLibrary.pushAllToRemote();
  expect(remote.upsert).toHaveBeenCalledTimes(count);
  logged.mockRestore();
});

it("cancels queued uploads when their owner signs out", async () => {
  const session = journalLibrary.addSession(input);
  setCurrentUser({ id: "bob" } as User);
  await vi.runAllTimersAsync();
  expect(remote.upsert.mock.calls.some(([row]) => row.id === session.id)).toBe(false);
  expect(journalLibrary.sessions()).toEqual([]);
  setCurrentUser({ id: "alice" } as User);
  expect(journalLibrary.sessions().map((row) => row.id)).toContain(session.id);
});

it("does not acknowledge a deletion cancelled by an account switch", async () => {
  const session = journalLibrary.addSession(input);
  journalLibrary.deleteSession(session.id);
  setCurrentUser({ id: "bob" } as User);
  await vi.runAllTimersAsync();
  setCurrentUser({ id: "alice" } as User);
  expect(accountStorage.getItem(`countlab:journal-delete-ack:session:${session.id}`)).toBeNull();
  const replay = journalLibrary.pushAllToRemote();
  await vi.runAllTimersAsync();
  await replay;
  expect(remote.upsert.mock.calls.some(([row]) => row.id === session.id && row.deleted_at)).toBe(true);
});
