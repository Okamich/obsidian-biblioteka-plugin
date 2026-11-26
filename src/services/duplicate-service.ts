import { App, TFile } from "obsidian";
import { MovieProviderId } from "../models/movie";

interface DuplicateMatch {
  file: TFile;
  reason: string;
}

async function findDuplicateNotes(
  app: App,
  sourceIds: Partial<Record<MovieProviderId, string>>,
  title: string,
  year: number,
  mediaType: string,
  titleProperty = "title",
  yearProperty = "year",
): Promise<DuplicateMatch[]> {
  const titleKey = normalizeDuplicateTitle(title);
  const typeKey = normalizeMediaType(mediaType);
  const matches: DuplicateMatch[] = [];

  for (const file of app.vault.getMarkdownFiles()) {
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) continue;

    const existingIds = (frontmatter.source_ids && typeof frontmatter.source_ids === "object")
      ? frontmatter.source_ids as Record<string, string>
      : {};
    const legacyIds: Record<string, string> = {
      ...(frontmatter.kinopoisk_id ? { kinopoisk: String(frontmatter.kinopoisk_id) } : {}),
      ...(frontmatter.imdb_id ? { omdb: String(frontmatter.imdb_id) } : {}),
    };
    const allExistingIds = { ...legacyIds, ...existingIds };
    const matchedSource = (Object.keys(sourceIds) as MovieProviderId[])
      .find((source) => sourceIds[source] && allExistingIds[source] === sourceIds[source]);
    if (matchedSource) {
      const label = matchedSource === "kinopoisk" ? "Kinopoisk" : matchedSource === "omdb" ? "OMDb" : "TMDB";
      matches.push({ file, reason: `Same ${label} ID: ${sourceIds[matchedSource]}` });
      continue;
    }

    const noteContent = await app.vault.cachedRead(file);
    const headingTitle = noteContent.match(/^#\s+(.+)$/m)?.[1];
    const fallbackTitle = headingTitle || file.basename.replace(/\s+\d{4}$/, "");
    const existingTitle = normalizeDuplicateTitle(String(frontmatter[titleProperty] ?? fallbackTitle));
    const existingYear = Number(frontmatter[yearProperty]);
    const existingType = normalizeMediaType(String(frontmatter.type ?? ""));

    if (titleKey && existingTitle === titleKey && year > 0 && existingYear === year
      && typeKey !== "" && existingType === typeKey) {
      matches.push({ file, reason: `Matching title, year (${year}) and media type.` });
    }
  }
  return matches;
}

function normalizeDuplicateTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[’‘']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeMediaType(value: string): string {
  const normalized = value.trim().toLocaleLowerCase();
  if (/movie|film|фильм/.test(normalized)) return "movie";
  if (/series|сериал/.test(normalized)) return "series";
  if (/tv show/.test(normalized)) return "tv show";
  return normalized;
}
