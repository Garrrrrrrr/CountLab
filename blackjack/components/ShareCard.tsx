"use client";

import { useEffect, useRef, useState } from "react";
import type { JournalSession } from "@/lib/blackjack/journal";
import type { TheoreticalOutcome } from "@/lib/blackjack/journalAnalysis";
import { renderSessionCard } from "@/lib/share/renderCard";
import { ConfirmModal } from "./ConfirmModal";
import { GhostButton } from "./ui";

export function ShareCard({ session, outcome, bankrollName, onClose }: { session: JournalSession; outcome: TheoreticalOutcome; bankrollName?: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    renderSessionCard(canvas, session, outcome, bankrollName).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [session, outcome, bankrollName]);

  const toBlob = () =>
    new Promise<Blob | null>((resolve) => canvasRef.current?.toBlob((blob) => resolve(blob), "image/png"));

  const download = async () => {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `countlab-session-${session.date}.png`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const share = async () => {
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], `countlab-session-${session.date}.png`, { type: "image/png" });
    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "CountLab session" });
        return;
      } catch {
        // user cancelled or share failed — fall through to download
      }
    }
    await download();
    setNotice("Web Share isn't available here, so the image downloaded instead.");
  };

  return (
    <ConfirmModal
      open
      title="Share this session"
      confirmLabel="Download image"
      confirmDisabled={!ready}
      cancelLabel="Close"
      onCancel={onClose}
      onConfirm={() => void download()}
    >
      <div className="mt-3">
        <canvas ref={canvasRef} className="w-full rounded-xl border border-white/10" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <GhostButton onClick={() => void share()} disabled={!ready}>
            <i className="fa-solid fa-share-nodes mr-2" />Share
          </GhostButton>
          {notice && <span role="status" className="text-xs text-zinc-400">{notice}</span>}
        </div>
      </div>
    </ConfirmModal>
  );
}
