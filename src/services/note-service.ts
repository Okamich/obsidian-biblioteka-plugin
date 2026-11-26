import { App, Notice, TFile, requestUrl } from "obsidian";
import { MovieField, MovieRecord, MovieProviderId } from "../models/movie";
import { renderRatingsTable } from "./ratings-renderer";

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

export async function updateExistingMovieNote(
  app: App,
  file: TFile,
  record: MovieRecord,
  fields: MovieFields,
  movieFields: Record<MovieField, MovieFieldSetting>,
): Promise<void> {
  const read = (key: string): string => fields[key] ?? "";
  const sourceIds = { ...record.sourceIds };
  const tags = splitList(read("tags"));
  if (!tags.includes("Biblioteka")) tags.push("Biblioteka");
  const candidate: Record<string, unknown> = {
    type: record.type,
    watched: read("watched"),
    lastWatched: read("lastWatched"),
    personalRating: read("personalRating") === "" ? undefined : Number(read("personalRating")),
    personalReview: read("personalReview"),
    tags,
    source_ids: sourceIds,
    sources: Object.keys(sourceIds).map((id) => getProviderDisplayName(id as MovieProviderId)),
  };
  const fieldValues: Record<MovieField, unknown> = {
    title: read("title"),
    originalTitle: read("originalTitle"),
    year: Number(read("year")) || undefined,
    genres: splitList(read("genres")),
    countries: splitList(read("countries")),
    plot: read("plot"),
    director: splitList(read("director")),
    writer: splitList(read("writer")),
    duration: read("duration") === "" ? undefined : Number(read("duration")),
    studio: splitList(read("studio")),
    actors: splitList(read("actors")),
  };
  for (const field of MOVIE_FIELD_ORDER) {
    const setting = movieFields[field];
    if (setting.enabled && fields[field]) {
      candidate[setting.property.trim() || MOVIE_FIELD_DEFAULTS[field]] = fieldValues[field];
    }
  }

  await app.fileManager.processFrontMatter(file, (fm) => {
    const existingIds = (fm.source_ids && typeof fm.source_ids === "object") ? fm.source_ids as Record<string, string> : {};
    fm.source_ids = { ...sourceIds, ...existingIds };
    const existingSources = Array.isArray(fm.sources) ? fm.sources as string[] : typeof fm.sources === "string" ? [fm.sources] : [];
    fm.sources = [...new Set([...existingSources, ...Object.keys(sourceIds).map((id) => getProviderDisplayName(id as MovieProviderId))])];
    for (const [key, value] of Object.entries(candidate)) {
      if (key === "source_ids" || key === "sources" || key === "tags" || value === undefined || value === null || value === "") continue;
      if (Array.isArray(value) && value.length === 0) continue;
      const current = fm[key];
      if (current === undefined || current === null || current === "") fm[key] = value;
    }
    const existingTags = Array.isArray(fm.tags) ? fm.tags as string[] : typeof fm.tags === "string" ? [fm.tags] : [];
    fm.tags = [...new Set([...existingTags, ...tags, "Biblioteka"])];
    if (record.ratings.length) fm.ratings = record.ratings;
  });

  const current = await app.vault.read(file);
  let next = current;
  const start = "<!-- biblioteka:ratings:start -->";
  const end = "<!-- biblioteka:ratings:end -->";
  if (record.ratings.length) {
    const block = [start, "## Ratings", "", renderRatingsTable(record.ratings), end].join("\n");
    const startIndex = next.indexOf(start);
    const endIndex = next.indexOf(end);
    if (startIndex >= 0 && endIndex > startIndex) next = next.slice(0, startIndex) + block + next.slice(endIndex + end.length);
    else next = `${next.trimEnd()}\n\n${block}\n`;
  }
  const plot = movieFields.plot.enabled ? read("plot") : "";
  if (plot) {
    const body = next.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
    const withoutManaged = body
      .replace(/^# .*$/m, "")
      .replace(/!\[\[[^\]]+\]\]/g, "")
      .replace(/<!-- biblioteka:ratings:start -->[\s\S]*?<!-- biblioteka:ratings:end -->/g, "")
      .trim();
    if (!withoutManaged) {
      const heading = `# ${read("title")}\n`;
      const headingIndex = next.indexOf(heading);
      if (headingIndex >= 0) {
        const insertAt = headingIndex + heading.length;
        next = `${next.slice(0, insertAt)}\n${plot}\n${next.slice(insertAt)}`;
      } else next = `${next.trimEnd()}\n\n${plot}\n`;
    }
  }
  if (next !== current) await app.vault.modify(file, next);
}

function splitList(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function getProviderDisplayName(providerId: MovieProviderId): string {
  return providerId === "kinopoisk" ? "Кинопоиск" : providerId === "omdb" ? "OMDb" : "TMDB";
}


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

  const folder = options.moviesFolder.trim().replace(/^\\/+|\\/+$/g, "") || "Media/Movies";
  await ensureVaultFolder(app, folder);

  let localPosterPath = "";
  if (posterUrl) {
    try {
      const posterFolder = `${folder}/_posters`;
      await ensureVaultFolder(app, posterFolder);
      const identity = sourceIds.kinopoisk
        ? `kinopoisk-${sourceIds.kinopoisk}`
        : sourceIds.omdb ? `imdb-${sourceIds.omdb}`
          : `tmdb-${sourceIds.tmdb ?? "unknown"}`;
      const posterPath = `${posterFolder}/${identity}.${getImageExtension(posterUrl)}`;
      if (!app.vault.getAbstractFileByPath(posterPath)) {
        const response = await requestUrl({ url: posterUrl, method: "GET" });
        await app.vault.createBinary(posterPath, response.arrayBuffer);
      }
      localPosterPath = posterPath;
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

  const frontmatter = Object.entries(properties)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${yamlPropertyKey(key)}: ${yamlValue(value)}`)
    .join("\\n");
  const body = [
    `# ${title}`,
    localPosterPath ? `![[${localPosterPath}]]` : "",
    read("plot"),
    ratings.length ? ["", "<!-- biblioteka:ratings:start -->", "## Ratings", "", renderRatingsTable(ratings), "<!-- biblioteka:ratings:end -->"].join("\\n") : "",
  ].filter(Boolean).join("\\n\\n");
  const content = `---\\n${frontmatter}\\n---\\n\\n${body.trim()}\\n`;

  const fileName = renderFileNameTemplate(options.fileNameTemplate, title, read("year"));
  const identity = sourceIds.kinopoisk || sourceIds.omdb || sourceIds.tmdb || "untitled";
  const baseName = sanitizeFileName(fileName) || `media-${identity}`;
  let notePath = `${folder}/${baseName}.md`;
  let suffix = 2;
  while (app.vault.getAbstractFileByPath(notePath)) notePath = `${folder}/${baseName} (${suffix++}).md`;

  const file = await app.vault.create(notePath, content);
  return { file, notePath };
}

function isEmptyFieldValue(value: unknown): boolean {
  return value === undefined || value === null || value === ""
    || (Array.isArray(value) && value.length === 0);
}

function yamlPropertyKey(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(value) ? value : JSON.stringify(value);
}

function yamlValue(value: unknown): string {
  return JSON.stringify(value) ?? "null";
}

async function ensureVaultFolder(app: App, folderPath: string): Promise<void> {
  const parts = folderPath.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
  }
}

function renderFileNameTemplate(template: string, title: string, year: string): string {
  return template
    .replace(/\\{\\{\\s*title\\s*\\}\\}/gi, title)
    .replace(/\\{\\{\\s*year\\s*\\}\\}/gi, year)
    .replace(/\\{\\{[^{}]+\\}\\}/g, "")
    .replace(/\\s+/g, " ")
    .trim();
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|#^\\[\\]\\\\]/g, "")
    .replace(/[. ]+$/g, "")
    .replace(/\\s+/g, " ")
    .slice(0, 100);
}

function getImageExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const match = pathname.match(/\\.(jpe?g|png|webp|gif)$/);
    if (match) return match[1] === "jpeg" ? "jpg" : match[1];
  } catch {
    // Fall back to a broadly supported image format.
  }
  return "jpg";
}
