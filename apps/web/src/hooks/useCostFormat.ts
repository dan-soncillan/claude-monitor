import { useCallback, useEffect, useState } from "react";
import { useSettingsStore } from "../stores/settingsStore";

const RATE_CACHE_KEY = "claude-monitor-usd-jpy-rate";
const RATE_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function getCachedRate(): number | null {
  try {
    const cached = localStorage.getItem(RATE_CACHE_KEY);
    if (cached) {
      const { rate, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < RATE_CACHE_TTL) return rate;
    }
  } catch { /* ignore */ }
  return null;
}

let fetchPromise: Promise<number> | null = null;

function fetchRate(): Promise<number> {
  if (!fetchPromise) {
    fetchPromise = fetch("https://api.exchangerate-api.com/v4/latest/USD")
      .then((r) => r.json())
      .then((data) => {
        const rate = data.rates?.JPY ?? 150;
        localStorage.setItem(
          RATE_CACHE_KEY,
          JSON.stringify({ rate, timestamp: Date.now() })
        );
        return rate;
      })
      .catch(() => 150);
  }
  return fetchPromise;
}

/**
 * Returns a cost formatter that respects the currency setting.
 * - "compact": 2 decimal places for USD, integer for JPY (e.g. $4.64 / ¥697)
 * - "detail": 4 decimal places for USD, integer for JPY (e.g. $4.7483 / ¥713)
 */
export function useCostFormat() {
  const currency = useSettingsStore((s) => s.currency);
  const [rate, setRate] = useState<number>(getCachedRate() ?? 150);

  useEffect(() => {
    fetchRate().then(setRate);
  }, []);

  return useCallback(
    (usd: number, precision: "compact" | "detail" = "compact") => {
      if (currency === "jpy") {
        const jpy = Math.round(usd * rate);
        return `¥${jpy.toLocaleString()}`;
      }
      return `$${usd.toFixed(precision === "detail" ? 4 : 2)}`;
    },
    [currency, rate]
  );
}
