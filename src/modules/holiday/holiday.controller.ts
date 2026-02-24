import type { Request, Response } from "express";

type HolidayCountryCode = string;

type PublicHolidayRecord = {
  date: string;
  localName: string;
  name: string;
  countryCode: HolidayCountryCode;
  global: boolean;
  counties: string[] | null;
  launchYear: number | null;
  types: string[];
};

type NagerHoliday = {
  date?: unknown;
  localName?: unknown;
  name?: unknown;
  countryCode?: unknown;
  global?: unknown;
  counties?: unknown;
  launchYear?: unknown;
  types?: unknown;
};

type CacheEntry = {
  expiresAt: number;
  data: PublicHolidayRecord[];
};

const HOLIDAY_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const HOLIDAY_FETCH_TIMEOUT_MS = 8000;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;

const holidayCache = new Map<string, CacheEntry>();

const isString = (value: unknown): value is string => typeof value === "string";

const toHolidayCacheKey = (countryCode: HolidayCountryCode, year: number) =>
  `${countryCode}:${year}`;

function parseCountryCode(value: unknown): HolidayCountryCode | null {
  if (!isString(value)) return null;
  const normalized = value.trim().toUpperCase();
  if (!ISO_COUNTRY_CODE_REGEX.test(normalized)) {
    return null;
  }
  return normalized;
}

function parseYear(value: unknown): number | null {
  if (!isString(value)) return null;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > 2100) {
    return null;
  }
  return parsed;
}

function normalizeHolidayRecord(
  input: NagerHoliday,
  fallbackCountryCode: HolidayCountryCode
): PublicHolidayRecord | null {
  const date = isString(input.date) && ISO_DATE_REGEX.test(input.date)
    ? input.date
    : null;
  const localName = isString(input.localName) ? input.localName.trim() : "";
  const name = isString(input.name) ? input.name.trim() : "";
  const countryCode = parseCountryCode(input.countryCode) ?? fallbackCountryCode;

  if (!date || !localName || !name) {
    return null;
  }

  const counties = Array.isArray(input.counties)
    ? input.counties.filter(isString)
    : null;
  const launchYear =
    typeof input.launchYear === "number" && Number.isFinite(input.launchYear)
      ? input.launchYear
      : null;
  const types = Array.isArray(input.types) ? input.types.filter(isString) : [];

  return {
    date,
    localName,
    name,
    countryCode,
    global: input.global === true,
    counties: counties && counties.length > 0 ? counties : null,
    launchYear,
    types,
  };
}

async function loadPublicHolidays(
  countryCode: HolidayCountryCode,
  year: number
): Promise<PublicHolidayRecord[]> {
  const cacheKey = toHolidayCacheKey(countryCode, year);
  const cached = holidayCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HOLIDAY_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://date.nager.at/api/v3/publicholidays/${year}/${countryCode}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`Nager.Date responded with ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      throw new Error("Unexpected holiday response payload");
    }

    const normalized = payload
      .map((item) =>
        normalizeHolidayRecord(item as NagerHoliday, countryCode)
      )
      .filter((item): item is PublicHolidayRecord => item !== null)
      .sort((a, b) => a.date.localeCompare(b.date));

    holidayCache.set(cacheKey, {
      expiresAt: Date.now() + HOLIDAY_CACHE_TTL_MS,
      data: normalized,
    });

    return normalized;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const getPublicHolidays = async (req: Request, res: Response) => {
  const countryCode = parseCountryCode(req.query.countryCode);
  const year = parseYear(req.query.year);

  if (!countryCode) {
    return res.status(400).json({
      message: "countryCode must be a 2-letter ISO country code (e.g. HU, SK)",
    });
  }

  if (!year) {
    return res.status(400).json({
      message: "year must be a valid number between 2000 and 2100",
    });
  }

  try {
    const holidays = await loadPublicHolidays(countryCode, year);
    return res.status(200).json(holidays);
  } catch (error) {
    console.error("[holiday] getPublicHolidays failed", error);
    return res.status(502).json({
      message: "Unable to load holidays from provider.",
    });
  }
};

export const holidayController = {
  getPublicHolidays,
};
