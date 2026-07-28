import {useEffect, useState} from "preact/hooks";

interface SignalLike<T> {
  value?: T;
  subscribe?: (listener: (value: T) => void) => void | (() => void);
}

export function signalValue<T>(signal: unknown): T | undefined {
  if (signal && typeof signal === "object" && "value" in signal) {
    return (signal as SignalLike<T>).value;
  }
  return signal as T | undefined;
}

export function useSignalValue<T>(signal: unknown): T | undefined {
  const [value, setValue] = useState<T | undefined>(() => signalValue<T>(signal));
  useEffect(() => {
    setValue(signalValue<T>(signal));
    const subscribe = signal && typeof signal === "object"
      ? (signal as SignalLike<T>).subscribe
      : undefined;
    if (!subscribe) return;
    return subscribe((nextValue: T) => setValue(nextValue));
  }, [signal]);
  return value;
}

export function settingsValue(api: {settings: unknown}): Record<string, unknown> {
  return signalValue<Record<string, unknown>>(api.settings) ?? {};
}

export function translate(
  api: {i18n: {translate: (key: string, replacements?: Record<string, string | number>) => unknown}},
  key: string,
  replacements?: Record<string, string | number>,
): string {
  return String(api.i18n.translate(key, replacements));
}
