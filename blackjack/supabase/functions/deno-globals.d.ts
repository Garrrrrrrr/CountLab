/**
 * Minimal bridge for the app TypeScript project. Edge functions are executed
 * and dependency-checked by Deno/Supabase; this declaration lets the primary
 * strict project include their source so it cannot silently rot.
 */
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

declare module "npm:@supabase/supabase-js@2" {
  interface EdgeError { code: string }
  interface EdgeClient {
    auth: { getUser(token: string): Promise<{ data: { user: { id: string } | null } }> };
    rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: EdgeError | null }>;
    from(name: string): { select(columns: string): { in(column: string, values: string[]): Promise<{ data: unknown[] | null }> } };
  }
  export function createClient(...args: unknown[]): EdgeClient;
}
