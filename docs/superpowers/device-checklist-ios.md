# iOS device checklist

Do this once on a real iPhone against the deployed site, after adding CountLab
to the home screen through Share → Add to Home Screen.

- [ ] **Safe areas.** The header clears the clock and battery; the bottom tab bar clears the home indicator.
- [ ] **H17 chart rail and keyboard.** Open H17 Chart, choose Pair splitting, then swipe from dealer 2 through A. Each selected dealer cell must settle immediately to the right of the persistent Hand/pair label; no dealer header or answer cell may sit underneath it. Tap an action in the bottom dock repeatedly: the highlighted cell advances, but the iOS keyboard never reopens. Hardware Tab/Enter must still focus and select the next input.
- [ ] **No input zoom.** Open the H17 Chart drill and tab through several cells. The viewport must not zoom or lurch.
- [ ] **App icon.** The home-screen icon has the dark brand background with no black corners or halo.
- [ ] **Offline cold start.** Enable Airplane Mode, force-quit the app, and reopen it. A drill—including an unvisited route—must work.
- [ ] **Offline signed-out start.** Sign out, go offline, and reopen. The sign-in view and Continue as guest must work without a blank screen.
- [ ] **Update flow.** Deploy a change, reopen the installed app, and confirm the new-version toast reloads into the update.
- [ ] **Install prompt targeting.** Mobile Safari shows Share → Add to Home Screen instructions; Chrome on iOS shows nothing; neither shows once installed.
- [ ] **Wake lock.** Leave a Running Count drill untouched past auto-lock. The display stays on and re-acquires after switching away and back.
- [ ] **Badge.** Check whether the streak number appears without a notification-permission prompt. If it does not, remove `lib/pwa/appBadge.ts` and its AppShell call.
- [ ] **Google sign-in from standalone.** Confirm the OAuth return lands back in the app with a working session. If not, use email/password in standalone; guest mode remains a fallback.
