"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { AnalyticsConsent } from "./AnalyticsConsent";
import { InstallPrompt } from "./InstallPrompt";
import { UpdateToast } from "./UpdateToast";

export function NoticeCenter() {
  const [consent, setConsent] = useState(true);
  const [update, setUpdate] = useState(false);
  const path = usePathname();
  const practicing = path.startsWith("/training/") || ["/double-down-madness", "/ultimate-texas-holdem", "/chase-flush"].some((route) => path.startsWith(route));
  return <><AnalyticsConsent onVisibilityChange={setConsent} /><UpdateToast hidden={consent || practicing} onVisibilityChange={setUpdate} /><InstallPrompt hidden={consent || update || practicing} /></>;
}
