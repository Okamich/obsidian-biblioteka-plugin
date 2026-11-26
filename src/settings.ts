import type { MovieField, MovieProviderId } from "./models/movie";

export type MovieFieldSetting = { enabled: boolean; property: string };

export const MOVIE_FIELD_DEFAULTS: Record<MovieField, MovieFieldSetting> = {
  title: { enabled: true, property: "title" },
  originalTitle: { enabled: true, property: "originalTitle" },
  year: { enabled: true, property: "year" },
  genres: { enabled: true, property: "genres" },
  countries: { enabled: true, property: "countries" },
  plot: { enabled: true, property: "plot" },
  director: { enabled: true, property: "director" },
  writer: { enabled: true, property: "writer" },
  duration: { enabled: true, property: "duration" },
  studio: { enabled: true, property: "studio" },
  actors: { enabled: true, property: "actors" },
};

export const MOVIE_FIELD_LABELS: Record<MovieField, string> = {
  title: "Title",
  originalTitle: "Original title",
  year: "Year",
  genres: "Genres",
  countries: "Production countries",
  plot: "Plot / annotation",
  director: "Director",
  writer: "Writer",
  duration: "Duration",
  studio: "Studio / production company",
  actors: "Cast",
};

export const MOVIE_FIELD_ORDER: MovieField[] = [
  "title", "originalTitle", "year", "genres", "countries", "plot",
  "director", "writer", "duration", "studio", "actors",
];

export interface BibliotekaSettings {
  defaultMediaFolder: string;
  moviesFolder: string;
  movieFileNameTemplate: string;
  kinopoiskApiKey: string;
  omdbApiKey: string;
  tmdbApiKey: string;
  sfwFilter: boolean;
  enabledProviders: Record<MovieProviderId, boolean>;
  providerOrder: MovieProviderId[];
  movieFields: Record<MovieField, MovieFieldSetting>;
}

export const DEFAULT_SETTINGS: BibliotekaSettings = {
  defaultMediaFolder: "Media",
  moviesFolder: "Media/Movies",
  movieFileNameTemplate: "{{title}} {{year}}",
  kinopoiskApiKey: "",
  omdbApiKey: "",
  tmdbApiKey: "",
  sfwFilter: true,
  enabledProviders: { kinopoisk: true, omdb: true, tmdb: true },
  providerOrder: ["kinopoisk", "omdb", "tmdb"],
  movieFields: MOVIE_FIELD_DEFAULTS,
};

