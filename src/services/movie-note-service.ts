import { App, Notice } from "obsidian";
import { MovieField, MovieRecord, MovieProviderId } from "../models/movie";
import { createMarkdownFile, saveRemoteImage } from "./note-file-service";
import { renderMovieNote } from "./movie-note-renderer";

type MovieFieldSetting = { enabled: boolean; property: string };

type MovieFields = Record<string, string>;

const MOVIE_FIELD_DEFAULTS: Record<MovieField, string> = {
  title: "title",
  originalTitle: "originalTitle",
  year: "year",
  genres: "genres",
  countries: "countries",
  plot: "plot",
  director: "director",
  writer: "writer",
  duration: "duration",
  studio: "studio",
  actors: "actors",
};

const MOVIE_FIELD_ORDER: MovieField[] = [
  "title", "originalTitle", "year", "genres", "countries", "plot",
  "director", "writer", "duration", "studio", "actors",
];

export interface CreateMovieNoteOptions {
  moviesFolder: string;
  fileNameTemplate: string;
  movieFields: Record<MovieField, MovieFieldSetting>;
}

export async function createMovieNote(
  app: App,
  record: MovieRecord,
  fields: MovieFields,
  posterUrl: string,
  options: CreateMovieNoteOptions,
): Promise<{ file: TFile; notePath: string }> {
  const read = (key: string): string => fields[key] ?? "";
  const title = read("title");
  const year = Number(read("year")) || 0;
  const genres = splitList(read("genres"));
  const countries = splitList(read("countries"));
  const sourceIds = { ...record.sourceIds };
  const tags = splitList(read("tags"));
  if (!tags.includes("Biblioteka")) tags.push("Biblioteka");
  const ratings = record.ratings;

  const folder = options.moviesFolder.trim().replace(/^\/+|\/+$/g, "") || "Media/Movies";
  let localPosterPath = "";
  if (posterUrl) {
    try {
      const identity = sourceIds.kinopoisk
        ? `kinopoisk-${sourceIds.kinopoisk}`
        : sourceIds.omdb ? `imdb-${sourceIds.omdb}`
          : `tmdb-${sourceIds.tmdb ?? "unknown"}`;
      localPosterPath = await saveRemoteImage(app, posterUrl, `${folder}/_posters`, identity);
    } catch (error) {
      console.warn("Biblioteka: poster download failed", error);
      new Notice("The note will be created, but the poster could not be downloaded.");
    }
  }

  const duration = Number(read("duration"));
  const personalRating = Number(read("personalRating"));
  const properties: Record<string, unknown> = {
    type: record.type,
    sources: Object.keys(sourceIds).map((id) => getProviderDisplayName(id as MovieProviderId)),
    source_ids: sourceIds,
    tags,
  };
  const fieldValues: Record<MovieField, unknown> = {
    title,
    originalTitle: read("originalTitle"),
    year: year > 0 ? year : undefined,
    genres,
    countries,
    plot: read("plot"),
    director: splitList(read("director")),
    writer: splitList(read("writer")),
    duration: Number.isFinite(duration) && read("duration") !== "" ? duration : undefined,
    studio: splitList(read("studio")),
    actors: splitList(read("actors")),
  };
  for (const field of MOVIE_FIELD_ORDER) {
    const setting = options.movieFields[field];
    const value = fieldValues[field];
    if (setting.enabled && !isEmptyFieldValue(value)) {
      properties[setting.property.trim() || MOVIE_FIELD_DEFAULTS[field]] = value;
    }
  }
  if (ratings.length) properties.ratings = ratings;
  if (read("watched")) properties.watched = read("watched");
  if (read("lastWatched")) properties.lastWatched = read("lastWatched");
  if (read("personalRating") !== "" && Number.isFinite(personalRating)) properties.personalRating = personalRating;
  if (read("personalReview")) properties.personalReview = read("personalReview");
  if (localPosterPath) properties.poster = localPosterPath;

  const { content, baseName } = renderMovieNote({
    properties,
    title,
    posterPath: localPosterPath,
    plot: read("plot"),
    ratings,
    fileNameTemplate: options.fileNameTemplate,
    year: read("year"),
    identity: sourceIds.kinopoisk || sourceIds.omdb || sourceIds.tmdb || "untitled",
  });
  const { file, path: notePath } = await createMarkdownFile(app, folder, baseName, content);
  return { file, notePath };
}

function isEmptyFieldValue(value: unknown): boolean {
  return value === undefined || value === null || value === ""
    || (Array.isArray(value) && value.length === 0);
}
