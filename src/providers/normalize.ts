import {
  createEmptyMovieRecord,
  MovieRecord,
  MovieRating,
  mergeMovieRecord,
} from "../models/movie";
import { KinopoiskProvider, KinopoiskDetails } from "./kinopoisk";
import { OMDbProvider, OMDbDetails } from "./omdb";
import { TMDBProvider, TMDBMovieDetails } from "./tmdb";

export interface KinopoiskStaffItem {
  staffId: number;
  nameRu?: string;
  nameEn?: string;
  description?: string;
  professionKey?: string;
  professionText?: string;
}

function clean(value?: string | null): string {
  return value && value !== "N/A" ? value.trim() : "";
}

function split(value?: string): string[] {
  return [...new Set((value ?? "").split(",").map((part) => part.trim()).filter(Boolean))];
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => clean(value)).filter(Boolean))];
}

function rating(source: string, value?: number, votes?: number, url?: string, scale = "10"): MovieRating[] {
  return typeof value === "number" && Number.isFinite(value)
    ? [{ source, value, scale, ...(typeof votes === "number" ? { votes } : {}), ...(url ? { url } : {}) }]
    : [];
}

function parseRatingDetails(value: string): { value: number; scale?: string } | undefined {
  const parsed = parseRating(value);
  if (parsed == null) return undefined;
  if (value.includes("%")) return { value: parsed, scale: "%" };
  if (/\/100\b/.test(value)) return { value: parsed, scale: "100" };
  if (/\/10\b/.test(value)) return { value: parsed, scale: "10" };
  return { value: parsed };
}

export function normalizeKinopoisk(
  details: KinopoiskDetails,
  staff: KinopoiskStaffItem[] = [],
): MovieRecord {
  const kpType = (details.type ?? "").toUpperCase();
  const record = createEmptyMovieRecord(kpType === "TV_SHOW" ? "ТВ-шоу" : kpType.includes("TV") || kpType.includes("SERIES") ? "Сериал" : "Фильм");
  record.title = clean(details.nameRu) || clean(details.nameEn) || clean(details.nameOriginal);
  record.originalTitle = clean(details.nameOriginal);
  record.year = details.year ?? null;
  record.genres = unique((details.genres ?? []).map((item) => item.genre));
  record.countries = unique((details.countries ?? []).map((item) => item.country));
  record.plot = clean(details.description) || clean(details.shortDescription);
  record.duration = details.filmLength ?? null;
  record.studio = unique((details.productionCompanies ?? []).map((item) => item.name));
  record.director = unique(staff.filter((item) => item.professionKey === "DIRECTOR").map((item) => item.nameRu || item.nameEn));
  record.writer = unique(staff.filter((item) => item.professionKey === "WRITER").map((item) => item.nameRu || item.nameEn));
  record.actors = unique(staff.filter((item) => item.professionKey === "ACTOR").slice(0, 10).map((item) => item.nameRu || item.nameEn));
  record.poster = clean(details.posterUrl);
  if (record.poster) record.posterCandidates.push({ source: "kinopoisk", url: record.poster });
  record.ratings.push(...rating("Kinopoisk", details.ratingKinopoisk, details.ratingKinopoiskVoteCount, details.webUrl));
  record.ratings.push(...rating("IMDb", details.ratingImdb, details.ratingImdbVoteCount,
    details.imdbId ? `https://www.imdb.com/title/${details.imdbId}/` : undefined));
  if (details.kinopoiskId > 0) record.sourceIds.kinopoisk = String(details.kinopoiskId);
  if (details.imdbId) record.externalIds.imdb = details.imdbId;
  return record;
}

export function normalizeOMDb(details: OMDbDetails): MovieRecord {
  const record = createEmptyMovieRecord(details.Type === "series" ? "Сериал" : "Фильм");
  record.title = clean(details.Title);
  // OMDb Title is not guaranteed to be the original title; do not populate originalTitle from it.
  record.year = Number(details.Year.match(/\d{4}/)?.[0] ?? 0) || null;
  record.genres = split(details.Genre);
  record.countries = split(details.Country);
  record.studio = split(details.Production);
  record.plot = clean(details.Plot);
  record.director = split(details.Director);
  record.writer = split(details.Writer);
  record.actors = split(details.Actors);
  record.duration = Number(details.Runtime?.match(/\d+/)?.[0] ?? 0) || null;
  record.poster = clean(details.Poster);
  if (record.poster) record.posterCandidates.push({ source: "omdb", url: record.poster });
  record.ratings.push(...rating("IMDb", parseRating(details.imdbRating), parseVotes(details.imdbVotes),
    details.imdbID ? `https://www.imdb.com/title/${details.imdbID}/` : undefined));
  const metascore = parseRating(details.Metascore);
  if (metascore != null) record.ratings.push({ source: "Metascore", value: metascore, scale: "100" });
  for (const item of details.Ratings ?? []) {
    if (/internet movie database/i.test(item.Source)) continue;
    const parsed = parseRatingDetails(item.Value);
    if (parsed) record.ratings.push({ source: item.Source, ...parsed });
  }
  if (details.imdbID) { record.sourceIds.omdb = details.imdbID; record.externalIds.imdb = details.imdbID; }
  return record;
}

export function normalizeTMDB(details: TMDBMovieDetails, provider: TMDBProvider): MovieRecord {
  const record = createEmptyMovieRecord("Фильм");
  record.title = clean(details.title);
  record.originalTitle = clean(details.original_title);
  record.year = Number(details.release_date?.slice(0, 4) ?? 0) || null;
  record.genres = unique((details.genres ?? []).map((item) => item.name));
  record.countries = unique((details.production_countries ?? []).map((item) => item.name));
  record.plot = clean(details.overview);
  record.duration = details.runtime ?? null;
  record.studio = unique((details.production_companies ?? []).map((item) => item.name));
  record.director = unique((details.credits?.crew ?? []).filter((item) => item.job === "Director").map((item) => item.name));
  record.writer = unique((details.credits?.crew ?? []).filter((item) => /writer|screenplay|story/i.test(item.job)).map((item) => item.name));
  record.actors = unique((details.credits?.cast ?? []).sort((a, b) => a.order - b.order).slice(0, 10).map((item) => item.name));
  record.poster = provider.posterUrl(details.poster_path);
  if (record.poster) record.posterCandidates.push({ source: "tmdb", url: record.poster });
  if ((details.vote_count ?? 0) > 0) record.ratings.push(...rating("TMDB", details.vote_average, details.vote_count,
    `https://www.themoviedb.org/movie/${details.id}`));
  if (details.external_ids?.imdb_id) record.externalIds.imdb = details.external_ids.imdb_id;
  record.sourceIds.tmdb = String(details.id);
  for (const poster of [...(details.images?.posters ?? [])].sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 20)) {
    const url = provider.posterUrl(poster.file_path);
    if (url) record.posterCandidates.push({
      source: "tmdb", url, width: poster.width, height: poster.height, language: poster.iso_639_1,
    });
  }
  return record;
}

function parseRating(value?: string): number | undefined {
  if (!value || value === "N/A") return undefined;
  const match = value.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function parseVotes(value?: string): number | undefined {
  if (!value || value === "N/A") return undefined;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function fetchKinopoiskRecord(provider: KinopoiskProvider, id: number): Promise<MovieRecord> {
  const details = await provider.getDetails(id);
  let staff: KinopoiskStaffItem[] = [];
  try { staff = await provider.getStaff(id); } catch { /* Staff is supplemental; retain the core record. */ }
  return normalizeKinopoisk(details, staff);
}

export async function fetchOMDbRecord(provider: OMDbProvider, id: string): Promise<MovieRecord> {
  return normalizeOMDb(await provider.getDetails(id));
}

export async function fetchTMDBRecord(provider: TMDBProvider, id: number): Promise<MovieRecord> {
  return normalizeTMDB(await provider.getDetails(id), provider);
}

export function mergeProviderRecord(target: MovieRecord, incoming: MovieRecord, provider: "kinopoisk" | "omdb" | "tmdb"): MovieRecord {
  return mergeMovieRecord(target, incoming, provider);
}
