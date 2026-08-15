"use client";
import { useEffect, useState } from "react";
import { supabase } from "./client";
import { useAuth } from "./AuthProvider";

/** Whether the signed-in user is listed in `admin_users`. Null while checking. */
export function useIsAdmin(): boolean | null {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    setIsAdmin(null);
    supabase.rpc("is_admin").then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error("[countlab] failed to check admin status", error);
        setIsAdmin(false);
        return;
      }
      setIsAdmin(Boolean(data));
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return isAdmin;
}
