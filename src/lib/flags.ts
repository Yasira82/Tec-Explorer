// Feature flags from day one (Template v2) — no retroactive flag injection.
//
// Flags are read from NEXT_PUBLIC_FLAG_<NAME> env vars ("1"/"true"/"on" = enabled),
// with an optional in-code default. Keep flags here so every app has one flag
// surface from the start. Swap the source (LaunchDarkly, config service) later
// without changing call sites.

export type FlagName = string;

const truthy = (v: string | undefined) =>
  v != null && ['1', 'true', 'on', 'yes'].includes(v.toLowerCase());

const envKey = (name: FlagName) => `NEXT_PUBLIC_FLAG_${name.toUpperCase()}`;

/** Read a flag. `defaultValue` applies when the env var is unset. */
export function isEnabled(name: FlagName, defaultValue = false): boolean {
  const raw = process.env[envKey(name)];
  if (raw == null) return defaultValue;
  return truthy(raw);
}

/** React hook form (no subscription needed — flags are build/runtime constants). */
export function useFlag(name: FlagName, defaultValue = false): boolean {
  return isEnabled(name, defaultValue);
}
