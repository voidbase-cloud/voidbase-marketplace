// PocketBase as the marketplace's own server code sees it: through voidbase's adapter, never the package root
// (everything under src/server/ is compiled into pb_hooks by the adapter and type-checked without Bun's globals).
import { authOf, pb } from "@voidbase-cloud/voidbase/adapter";

export { authOf, pb };
export type HookRecord = NonNullable<ReturnType<typeof authOf>>;

/** one environment value: the request's bindings (flags resolved), else the process environment on Bun */
export const env = (k: string, d = ""): string => {
  let v = "";
  try { v = String(pb.$os.getenv(k) ?? ""); } catch { /* outside a request */ }
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  if (!v && proc !== undefined) v = String(proc.env?.[k] ?? "");
  return v || d;
};
export const on = (k: string, d = false): boolean => { const v = env(k); return v ? ["1", "true", "yes", "on"].includes(v.toLowerCase()) : d; };
/** PocketBase writes datetimes with a space where ISO has its `T` */
export const pbDate = (d: Date) => d.toISOString().replace("T", " ");
