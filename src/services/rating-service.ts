import { App, Notice } from "obsidian";
import { MovieField, MovieProviderId } from "../models/movie";
import { resolveMovieRecord } from "../providers/movie-resolver";
import { normalizeMediaType } from "./duplicate-service";
import { renderRatingsTable } from "./ratings-renderer";
import { BibliotekaSettings, MOVIE_FIELD_DEFAULTS, MOVIE_FIELD_ORDER } from "../settings";

export async function refreshRatings(app: App, settings: BibliotekaSettings): Promise<void> {
  const providerOrder = settings.providerOrder.filter((id) =>
    settings.enabledProviders[id] && Boolean(getProviderApiKey(settings, id)),
  );
  if (providerOrder.length === 0) {
    new Notice("Enable at least one provider and add its API key in Biblioteka settings.");
    return;
  }

  const titleProperty = getMovieFieldProperty(settings, "title");
  const yearProperty = getMovieFieldProperty(settings, "year");
  const files = app.vault.getMarkdownFiles();
  const targets = files.filter((file) => {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    return Boolean(fm?.source_ids || fm?.kinopoisk_id || fm?.imdb_id);
  });
  if (targets.length === 0) {
    new Notice("No Biblioteka notes with provider IDs were found.");
    return;
  }

  let updated = 0;
  let failed = 0;
  new Notice(`Refreshing ratings for ${targets.length} note(s)…`);
  for (const file of targets) {
    try {
      const fm = app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm) continue;
      const ids: Partial<Record<MovieProviderId, string>> = (fm.source_ids && typeof fm.source_ids === "object")
        ? { ...(fm.source_ids as Partial<Record<MovieProviderId, string>>) }
        : {};
      if (!ids.kinopoisk && fm.kinopoisk_id) ids.kinopoisk = String(fm.kinopoisk_id);
      if (!ids.omdb && fm.imdb_id) ids.omdb = String(fm.imdb_id);
      const source = providerOrder.find((id) => Boolean(ids[id]));
      if (!source) continue;
      const title = String(fm[titleProperty] ?? file.basename);
      const year = Number(fm[yearProperty]) || 0;
      const mediaType = normalizeMediaType(String(fm.type ?? "")) === "series" ? "series" as const : "movie" as const;
      const record = await resolveMovieRecord(
        { source, id: String(ids[source]), title, year, mediaType },
        providerOrder,
        {
          kinopoisk: settings.kinopoiskApiKey,
          omdb: settings.omdbApiKey,
          tmdb: settings.tmdbApiKey,
        },
        (provider, error) => console.warn(`Biblioteka: ${provider} ratings refresh failed for ${file.path}`, error),
        getEnabledMovieFields(settings),
      );
      if (record.ratings.length === 0) continue;

      await app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter.ratings = record.ratings;
        const existingIds = (frontmatter.source_ids && typeof frontmatter.source_ids === "object")
          ? frontmatter.source_ids as Record<string, string>
          : {};
        frontmatter.source_ids = { ...record.sourceIds, ...existingIds };
        frontmatter.sources = [...new Set([...Object.keys(existingIds), ...Object.keys(record.sourceIds)].map((id) => getProviderDisplayName(id as MovieProviderId)))];
      });

      const current = await app.vault.read(file);
      const start = "<!-- biblioteka:ratings:start -->";
      const end = "<!-- biblioteka:ratings:end -->";
      const block = [start, "## Ratings", "", renderRatingsTable(record.ratings), end].join("\n");
      const startIndex = current.indexOf(start);
      const endIndex = current.indexOf(end);
      const next = startIndex >= 0 && endIndex > startIndex
        ? current.slice(0, startIndex) + block + current.slice(endIndex + end.length)
        : `${current.trimEnd()}\n\n${block}\n`;
      await app.vault.modify(file, next);
      updated++;
    } catch (error) {
      failed++;
      console.warn(`Biblioteka: could not refresh ratings for ${file.path}`, error);
    }
  }
  new Notice(`Ratings refreshed: ${updated}. Failed: ${failed}.`);
}

function getMovieFieldProperty(settings: BibliotekaSettings, field: MovieField): string {
  return settings.movieFields[field]?.property.trim() || MOVIE_FIELD_DEFAULTS[field].property;
}

function getEnabledMovieFields(settings: BibliotekaSettings): MovieField[] {
  return MOVIE_FIELD_ORDER.filter((field) => settings.movieFields[field]?.enabled !== false);
}

function getProviderApiKey(settings: BibliotekaSettings, providerId: MovieProviderId): string {
  if (providerId === "kinopoisk") return settings.kinopoiskApiKey.trim();
  if (providerId === "omdb") return settings.omdbApiKey.trim();
  return settings.tmdbApiKey.trim();
}

function getProviderDisplayName(providerId: MovieProviderId): string {
  return providerId === "kinopoisk" ? "Кинопоиск" : providerId === "omdb" ? "OMDb" : "TMDB";
}
