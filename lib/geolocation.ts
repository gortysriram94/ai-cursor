"use client";
// lib/geolocation.ts
// Browser-side geolocation with Nominatim reverse geocoding.
// Caches result in localStorage so the browser permission prompt fires once.

export interface UserLocation {
  lat:       number;
  lng:       number;
  city?:     string;
  state?:    string;
  country?:  string;
  formatted: string;   // "San Francisco, CA, USA"
  cachedAt:  number;
}

const STORAGE_KEY = "tl_user_location";
const CACHE_TTL   = 24 * 60 * 60 * 1000; // 24 h

export function getStoredLocation(): UserLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const loc = JSON.parse(raw) as UserLocation;
    if (Date.now() - loc.cachedAt > CACHE_TTL) { localStorage.removeItem(STORAGE_KEY); return null; }
    return loc;
  } catch { return null; }
}

export function clearStoredLocation(): void {
  if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
}

async function reverseGeocode(lat: number, lng: number): Promise<Omit<UserLocation, "lat"|"lng"|"cachedAt">> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "en", "User-Agent": "TokenLift/1.0" }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) throw new Error("Nominatim error");
    const data = await res.json();
    const a = data.address ?? {};
    const city    = a.city ?? a.town ?? a.village ?? a.county ?? "";
    const state   = a.state ?? a.region ?? "";
    const country = a.country ?? "";
    const parts   = [city, state, country].filter(Boolean);
    return { city, state, country, formatted: parts.join(", ") || data.display_name?.split(",").slice(0,2).join(",").trim() || "Unknown location" };
  } catch {
    return { formatted: `${lat.toFixed(2)}, ${lng.toFixed(2)}` };
  }
}

// Requests geolocation permission and returns the full location object.
// Caches to localStorage on success.
export async function requestLocation(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const geo = await reverseGeocode(lat, lng);
        const loc: UserLocation = { lat, lng, ...geo, cachedAt: Date.now() };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loc)); } catch {}
        resolve(loc);
      },
      err => reject(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: CACHE_TTL },
    );
  });
}

// Formatted location string for injecting into prompts.
// Returns empty string if location is not available.
export function locationContext(loc: UserLocation | null): string {
  if (!loc?.formatted) return "";
  return `User location: ${loc.formatted}.`;
}

// Appends city/state to a search query when it seems location-dependent.
// "restaurants" → "restaurants in San Francisco CA"
// "find jobs" → unchanged (jobs is not typically local)
const LOCAL_KEYWORDS = /\b(restaurant|cafe|coffee|bar|pub|gym|shop|store|mall|near|nearby|local|delivery|takeout|takeaway|movie|theatre|theater|hotel|hostel|park|museum|gallery|pharmacy|doctor|dentist|hospital|school|university|supermarket|grocery|petrol|gas station|laundry|barber|salon|spa)\b/i;

export function localizeQuery(query: string, loc: UserLocation | null): string {
  if (!loc?.city || !LOCAL_KEYWORDS.test(query)) return query;
  // Don't double-add if query already has a location
  if (/\b(in|near|around|at)\b.{2,}/i.test(query)) return query;
  const place = [loc.city, loc.state].filter(Boolean).join(", ");
  return `${query} in ${place}`;
}
