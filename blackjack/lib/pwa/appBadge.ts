/** Best-effort streak badge that never asks the user for notification permission. */
export function setStreakBadge(streak: number): void {
  if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const badged = navigator as Navigator & { setAppBadge(count?: number): Promise<void>; clearAppBadge(): Promise<void> };
  void (streak > 0 ? badged.setAppBadge(streak) : badged.clearAppBadge()).catch(() => {});
}
