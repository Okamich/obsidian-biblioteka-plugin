import { createEmptyMovieRecord, mergeMovieRecord, MovieProviderId, MovieRecord } from "../models/movie";
import { KinopoiskProvider } from "./kinopoisk";
import { OMDbProvider } from "./omdb";
import { TMDBProvider, TMDBSearchItem } from "./tmdb";
import { fetchKinopoiskRecord, fetchOMDbRecord, fetchTMDBRecord } from "./normalize";

export interface MovieSearchSelection {
  source: MovieProviderId;
  id: string;
  title: string;
  year: number;
  mediaType: "movie" | "series";
}

export interface MovieProviderKeys {
  kinopoisk: string;
  omdb: string;
  tmdb: string;
}

function normalizeTitle(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase()
    .replace(/[’‘']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function sameYear(value: string | number | undefined, year: number): boolean {
  if (!year || !value) return true;
  const match = String(value).match(/\d{4}/);
  return !match || Number(match[0]) === year;
}

function isSameTitle(candidate: string | undefined, title: string): boolean {
  return Boolean(candidate && normalizeTitle(candidate) === normalizeTitle(title));
}

async function loadKinopoisk(
  provider: KinopoiskProvider,
  selection: MovieSearchSelection,
  record: MovieRecord,
): Promise<MovieRecord | undefined> {
  if (selection.source === "kinopoisk") return fetchKinopoiskRecord(provider, Number(selection.id));
  const knownId = record.sourceIds.kinopoisk;
  if (knownId) return fetchKinopoiskRecord(provider, Number(knownId));
  const response = await provider.search(selection.title);
  const matches = (response.films ?? []).filter((item) =>
    [item.nameRu, item.nameEn, item.nameOriginal].some((title) => isSameTitle(title, selection.title))
    && sameYear(item.year, selection.year)
    && (selection.mediaType === "series" ? /TV|SERIES/i.test(item.type ?? "") : !/TV|SERIES/i.test(item.type ?? "")),
  );
  if (matches.length !== 1) return undefined;
  return fetchKinopoiskRecord(provider, matches[0].filmId);
}

async function loadOMDb(
  provider: OMDbProvider,
  selection: MovieSearchSelection,
  record: MovieRecord,
): Promise<MovieRecord | undefined> {
  if (selection.source === "omdb") return fetchOMDbRecord(provider, selection.id);
  const imdbId = record.externalIds.imdb;
  if (imdbId) return fetchOMDbRecord(provider, imdbId);
  const response = await provider.search(selection.title, 1, selection.mediaType);
  const matches = (response.Search ?? []).filter((item) =>
    item.Type === selection.mediaType
    && isSameTitle(item.Title, selection.title)
    && sameYear(item.Year, selection.year),
  );
  if (matches.length !== 1) return undefined;
  return fetchOMDbRecord(provider, matches[0].imdbID);
}

async function loadTMDB(
  provider: TMDBProvider,
  selection: MovieSearchSelection,
  record: MovieRecord,
): Promise<MovieRecord | undefined> {
  if (selection.mediaType === "series") return undefined;
  if (selection.source === "tmdb") return fetchTMDBRecord(provider, Number(selection.id));
  const imdbId = selection.source === "omdb" ? selection.id : record.externalIds.imdb;
  if (imdbId) {
    const found = await provider.findByExternalId(imdbId);
    const matches = found.movie_results ?? [];
    if (matches.length === 1) return fetchTMDBRecord(provider, matches[0].id);
    if (matches.length > 1) {
      const exact = matches.filter((item) => isSameTitle(item.title, selection.title) && sameYear(item.release_date, selection.year));
      if (exact.length === 1) return fetchTMDBRecord(provider, exact[0].id);
    }
    return undefined;
  }
  const response = await provider.search(selection.title);
  const matches = (response.results ?? []).filter((item: TMDBSearchItem) =>
    isSameTitle(item.title, selection.title) && sameYear(item.release_date, selection.year),
  );
  if (matches.length !== 1) return undefined;
  return fetchTMDBRecord(provider, matches[0].id);
}

/**
 * Query providers sequentially in the user's configured order. Each provider
 * only fills fields that are still empty. Ratings and poster candidates are
 * collected from every successfully matched provider.
 */
export async function resolveMovieRecord(
  selection: MovieSearchSelection,
  order: MovieProviderId[],
  keys: MovieProviderKeys,
  onProviderError?: (provider: MovieProviderId, error: unknown) => void,
): Promise<MovieRecord> {
  const record = createEmptyMovieRecord(selection.mediaType === "series" ? "Сериал" : "Фильм");
  let identityRecord: MovieRecord | undefined;

  // Resolve the selected search hit once to obtain stable cross-provider IDs.
  // Its fields are not merged early: the configured provider order still
  // determines which source wins each field.
  try {
    const selectedKey = keys[selection.source]?.trim();
    if (selectedKey) {
      if (selection.source === "kinopoisk") identityRecord = await fetchKinopoiskRecord(new KinopoiskProvider(selectedKey), Number(selection.id));
      else if (selection.source === "omdb") identityRecord = await fetchOMDbRecord(new OMDbProvider(selectedKey), selection.id);
      else identityRecord = await fetchTMDBRecord(new TMDBProvider(selectedKey), Number(selection.id));
    }
  } catch (error) {
    onProviderError?.(selection.source, error);
  }

  for (const providerId of order) {
    const key = keys[providerId]?.trim();
    if (!key) continue;
    try {
      let incoming: MovieRecord | undefined;
      if (providerId === selection.source && identityRecord) incoming = identityRecord;
      else if (providerId === "kinopoisk") incoming = await loadKinopoisk(new KinopoiskProvider(key), selection, identityRecord ?? record);
      else if (providerId === "omdb") incoming = await loadOMDb(new OMDbProvider(key), selection, identityRecord ?? record);
      else incoming = await loadTMDB(new TMDBProvider(key), selection, identityRecord ?? record);
      if (incoming) mergeMovieRecord(record, incoming, providerId);
    } catch (error) {
      onProviderError?.(providerId, error);
    }
  }

  // Preserve the selected source's identifier even if another source failed.
  if (!record.sourceIds[selection.source]) record.sourceIds[selection.source] = selection.id;
  return record;
}
