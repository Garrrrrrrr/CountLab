import { describe, expect, it } from "vitest";
import { accountGeneration, migrateLegacyData, scopedStorage, selectAccountScope, guestBackup, hasLegacyBackup, legacyBackup, type KeyStorage } from "./accountStorage";

class MemoryStorage implements KeyStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

describe("account ownership", () => {
  it("isolates accounts and guests while preserving pending data for the original account", () => {
    const disk = new MemoryStorage();
    const alice = scopedStorage("alice", disk), bob = scopedStorage("bob", disk), guest = scopedStorage("guest", disk);
    alice.setItem("countlab:journal-sessions:v1", "pending Alice history");
    expect(bob.getItem("countlab:journal-sessions:v1")).toBeNull();
    expect(guest.getItem("countlab:journal-sessions:v1")).toBeNull();
    bob.setItem("countlab:journal-sessions:v1", "Bob history");
    // A delayed acknowledgement uses its captured owner even after a switch.
    alice.setItem("countlab:journal-ack:session:1", "uploaded");
    expect(bob.getItem("countlab:journal-ack:session:1")).toBeNull();
    expect(scopedStorage("alice", disk).getItem("countlab:journal-sessions:v1")).toBe("pending Alice history");
  });

  it("invalidates work on identity changes but not token refreshes", () => {
    selectAccountScope("alice");
    const initial = accountGeneration();
    selectAccountScope("alice");
    expect(accountGeneration()).toBe(initial);
    selectAccountScope(null);
    expect(accountGeneration()).toBeGreaterThan(initial);
  });

  it("quarantines unattributed legacy data instead of giving it to the next account", () => {
    const disk = new MemoryStorage();
    disk.setItem("hilo:sessions", "old history");
    disk.setItem("countlab:analytics:consent", "denied");
    migrateLegacyData(disk);
    migrateLegacyData(disk);
    expect(scopedStorage("bob", disk).getItem("hilo:sessions")).toBeNull();
    expect(scopedStorage("guest", disk).getItem("hilo:sessions")).toBeNull();
    expect(scopedStorage("legacy-unclaimed", disk).getItem("hilo:sessions")).toBe("old history");
    expect(disk.getItem("countlab:analytics:consent")).toBe("denied");
  });

  it("quarantines shared history without changing an existing account cache", () => {
    const disk = new MemoryStorage();
    disk.setItem("hilo:sessions", "old history");
    scopedStorage("alice", disk).setItem("hilo:sessions", "new history");
    migrateLegacyData(disk);
    expect(scopedStorage("alice", disk).getItem("hilo:sessions")).toBe("new history");
    expect(disk.getItem("hilo:sessions")).toBeNull();
    expect(scopedStorage("legacy-unclaimed", disk).getItem("hilo:sessions")).toBe("old history");
  });

  it("exports only guest product history for deliberate migration", () => {
    const disk = new MemoryStorage();
    scopedStorage("guest", disk).setItem("hilo:sessions", '[{"id":"guest-session"}]');
    scopedStorage("alice", disk).setItem("hilo:sessions", '[{"id":"alice-session"}]');
    scopedStorage("guest", disk).setItem("countlab:journal-ack:session:1", "ack");
    const backup = JSON.parse(guestBackup(disk));
    expect(backup.sessions).toEqual([{ id: "guest-session" }]);
    expect(backup.local).toEqual({});
  });

  it("keeps original history recoverable when there is no room to copy it", () => {
    const disk = new MemoryStorage();
    disk.setItem("hilo:sessions", '[{"id":"old-session"}]');
    disk.setItem = () => { throw new Error("Storage full"); };
    expect(() => migrateLegacyData(disk)).toThrow("Storage full");
    expect(hasLegacyBackup(disk)).toBe(true);
    expect(JSON.parse(legacyBackup(disk)).sessions).toEqual([{ id: "old-session" }]);
    expect(disk.getItem("hilo:sessions")).not.toBeNull();
  });
});
