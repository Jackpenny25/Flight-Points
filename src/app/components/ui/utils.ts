import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper to display flight names consistently (e.g., "1 Flight")
export function formatFlight(f?: string | null) {
  if (!f) return f || '';
  const trimmed = String(f).trim();
  if (trimmed.toLowerCase().endsWith('flight')) return trimmed;
  return `${trimmed} Flight`;
}
