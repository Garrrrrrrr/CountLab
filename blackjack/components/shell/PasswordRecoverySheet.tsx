"use client";
import { useState } from "react";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { Button, Sheet, TextField, toast } from "@/components/ui";

/**
 * A password-reset email signs the reader in and fires PASSWORD_RECOVERY. They
 * can land on any page (the link points at an old URL), so the form lives in
 * the shell rather than on one route.
 */
export function PasswordRecoverySheet() {
  const { passwordRecovery, completePasswordReset, cancelPasswordRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    setBusy(true);
    const message = await completePasswordReset(password);
    setBusy(false);
    if (message) setError(message);
    else { setPassword(""); toast("Password updated", "pos"); }
  };
  return (
    <Sheet open={passwordRecovery} onClose={cancelPasswordRecovery} title="Choose a new password" description="You followed a reset link. Set a new password to finish." size="sm">
      <form onSubmit={submit} className="space-y-4">
        <TextField label="New password" type="password" autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(undefined); }} error={error} />
        <Button type="submit" block disabled={busy}>{busy ? "Saving…" : "Save password"}</Button>
      </form>
    </Sheet>
  );
}
