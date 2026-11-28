import { App, TFile } from "obsidian";
import { MovieField, MovieRecord } from "../models/movie";
import { BibliotekaSettings, MOVIE_FIELD_DEFAULTS } from "../settings";
import { findDuplicateNotes, DuplicateMatch } from "./duplicate-service";
import { createMovieNote } from "./movie-note-service";
import { updateExistingMovieNote } from "./movie-note-update-service";

export type MovieNoteValues = Record<string, string>;

export function collectMovieNoteValues(fields: Record<string, { value: string }>): MovieNoteValues {
  const values: MovieNoteValues = {};
  for (const [key, field] of Object.entries(fields)) values[key] = field.value.trim();
  return values;
}

export async function findMovieNoteDuplicates(
  app: App,
  settings: BibliotekaSettings,
  record: MovieRecord,
  values: MovieNoteValues,
): Promise<DuplicateMatch[]> {
  return findDuplicateNotes(
    app,
    settings.moviesFolder,
    { ...record.sourceIds },
    values.title ?? "",
    Number(values.year) || 0,
    record.type,
    getMovieFieldProperty(settings, "title"),
    getMovieFieldProperty(settings, "year"),
  );
}

export async function updateMovieNoteFromPreview(
  app: App,
  file: TFile,
  record: MovieRecord,
  values: MovieNoteValues,
  settings: BibliotekaSettings,
): Promise<void> {
  await updateExistingMovieNote(app, file, record, values, settings.movieFields);
}

export async function createMovieNoteFromPreview(
  app: App,
  record: MovieRecord,
  values: MovieNoteValues,
  posterUrl: string,
  settings: BibliotekaSettings,
): Promise<{ file: TFile; notePath: string }> {
  return createMovieNote(app, record, values, posterUrl, {
    moviesFolder: settings.moviesFolder,
    fileNameTemplate: settings.movieFileNameTemplate,
    movieFields: settings.movieFields,
  });
}

function getMovieFieldProperty(settings: BibliotekaSettings, field: MovieField): string {
  return settings.movieFields[field]?.property.trim() || MOVIE_FIELD_DEFAULTS[field].property;
}
