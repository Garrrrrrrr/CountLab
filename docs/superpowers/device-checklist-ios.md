# iOS device checklist

Do this once on a real iPhone against the deployed site, after adding CountLab
to the home screen through Share → Add to Home Screen.

- [ ] **Safe areas.** The header clears the clock and battery; the bottom tab bar clears the home indicator.
- [ ] **No input zoom.** Open the H17 Chart drill and tab through several cells. The viewport must not zoom or lurch.
- [ ] **App icon.** The home-screen icon has the dark brand background with no black corners or halo.
- [ ] **Offline cold start.** Enable Airplane Mode, force-quit the app, and reopen it. A drill—including an unvisited route—must work.
- [ ] **Offline signed-out start.** Sign out, go offline, and reopen. The sign-in view and Continue as guest must work without a blank screen.
- [ ] **Update flow.** Deploy a change, reopen the installed app, and confirm the new-version toast reloads into the update.
- [ ] **Install prompt targeting.** Mobile Safari shows Share → Add to Home Screen instructions; Chrome on iOS shows nothing; neither shows once installed.
- [ ] **Wake lock.** Leave a Running Count drill untouched past auto-lock. The display stays on and re-acquires after switching away and back.
- [ ] **Badge.** Check whether the streak number appears without a notification-permission prompt. If it does not, remove `lib/pwa/appBadge.ts` and its AppShell call.
- [ ] **Google sign-in from standalone.** Confirm the OAuth return lands back in the app with a working session. If not, use email/password in standalone; guest mode remains a fallback.
