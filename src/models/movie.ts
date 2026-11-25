export type MovieProviderId = "kinopoisk" | "omdb" | "tmdb";

export type MovieField =
  | "title"
  | "originalTitle"
  | "year"
  | "genres"
  | "countries"
  | "plot"
  | "director"
  | "writer"
  | "duration"
  | "studio"
  | "actors";

export interface MovieRating {
  source: string;
  value: number;
  votes?: number;
  url?: string;
}

export interface PosterCandidate {
  source: MovieProviderId;
  url: string;
  width?: number;
  height?: number;
  language?: string | null;
}

export interface MovieRecord {
  type: "Фильм" | "Сериал" | "ТВ-шоу";
  title: string;
  originalTitle: string;
  year: number | null;
  genres: string[];
  countries: string[];
  plot: string;
  director: string[];
  writer: string[];
  duration: number | null;
  studio: string[];
  actors: string[];
  poster: string;
  posterCandidates: PosterCandidate[];
  ratings: MovieRating[];
  sourceIds: Partial<Record<MovieProviderId, string>>;
  externalIds: { imdb?: string };
  fieldSources: Partial<Record<MovieField | "poster", MovieProviderId>>;
  watched: "" | "Просмотрен" | "Собираюсь посмотреть";
  lastWatched: string;
  personalRating: number | null;
  personalReview: string;
  tags: string[];
}

export function createEmptyMovieRecord(type: MovieRecord["type"] = "Фильм"): MovieRecord {
  return {
    type,
    title: "",
    originalTitle: "",
    year: null,
    genres: [],
    countries: [],
    plot: "",
    director: [],
    writer: [],
    duration: null,
    studio: [],
    actors: [],
    poster: "",
    posterCandidates: [],
    ratings: [],
    sourceIds: {},
    externalIds: {},
    fieldSources: {},
    watched: "",
    lastWatched: "",
    personalRating: null,
    personalReview: "",
    tags: ["Biblioteka"],
  };
}

function isMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * First valid provider value wins for ordinary fields. Ratings and poster
 * candidates are collected independently; the selected poster remains the
 * first available candidate until the user chooses another one.
 */
export function mergeMovieRecord(
  target: MovieRecord,
  incoming: Partial<MovieRecord>,
  provider: MovieProviderId,
): MovieRecord {
  const fields: MovieField[] = [
    "title", "originalTitle", "year", "genres", "countries", "plot",
    "director", "writer", "duration", "studio", "actors",
  ];

  for (const field of fields) {
    const value = incoming[field];
    if (isMissing(target[field]) && !isMissing(value)) {
      (target as unknown as Record<string, unknown>)[field] = value;
      target.fieldSources[field] = provider;
    }
  }

  if (isMissing(target.poster) && incoming.poster) {
    target.poster = incoming.poster;
    target.fieldSources.poster = provider;
  }

  for (const candidate of incoming.posterCandidates ?? []) {
    if (!target.posterCandidates.some((item) => item.source === candidate.source && item.url === candidate.url)) {
      target.posterCandidates.push(candidate);
    }
  }

  for (const rating of incoming.ratings ?? []) {
    const exists = target.ratings.some((item) =>
      item.source.toLocaleLowerCase() === rating.source.toLocaleLowerCase(),
    );
    if (!exists) target.ratings.push(rating);
  }

  if (incoming.sourceIds?.[provider]) target.sourceIds[provider] = incoming.sourceIds[provider];
  return target;
}

export function hasMissingMovieFields(record: MovieRecord): boolean {
  return [
    record.title, record.originalTitle, record.year, record.genres, record.countries,
    record.plot, record.director, record.writer, record.duration, record.studio,
    record.actors, record.poster,
  ].some(isMissing);
}
