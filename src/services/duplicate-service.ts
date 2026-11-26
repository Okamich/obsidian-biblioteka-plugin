import { App, TFile, TFolder } from "obsidian";

export interface DuplicateMatch {
  file: TFile;
  reason: string;
}

export async function findDuplicateNotes(
  app: App,
  folderPath: string,
  sourceIds: Record<string, string>,
  title: string,
  year: number,
  mediaType: string,
  titleProperty = "title",
  yearProperty = "year",
): Promise<DuplicateMatch[]> {
  const normalizedFolderPath = folderPath.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalizedFolderPath) return [];

  const folder = app.vault.getAbstractFileByPath(normalizedFolderPath);
  if (!(folder instanceof TFolder)) return [];

  const titleKey = normalizeDuplicateTitle(title);
  const typeKey = normalizeMediaType(mediaType);
  const matches: DuplicateMatch[] = [];
  const files: TFile[] = [];
  collectMarkdownFiles(folder, files);

  for (const file of files) {
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) continue;

    const existingIds = (frontmatter.source_ids && typeof frontmatter.source_ids === "object")
      ? frontmatter.source_ids as Record<string, unknown>
      : {};
    const legacyIds: Record<string, string> = {
      ...(frontmatter.kinopoisk_id ? { kinopoisk: String(frontmatter.kinopoisk_id) } : {}),
      ...(frontmatter.imdb_id ? { omdb: String(frontmatter.imdb_id) } : {}),
    };
    const allExistingIds = { ...legacyIds, ...existingIds };
    const matchedSource = Object.entries(sourceIds)
      .find(([source, id]) => Boolean(source && id) && String(allExistingIds[source] ?? "") === String(id));
    if (matchedSource) {
      const [source, id] = matchedSource;
      const label = source === "kinopoisk" ? "Kinopoisk"
        : source === "omdb" ? "OMDb"
          : source === "tmdb" ? "TMDB"
            : source;
      matches.push({ file, reason: "Same " + label + " ID: " + id });
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
      matches.push({ file, reason: "Matching title, year (" + year + ") and media type." });
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

export function normalizeMediaType(value: string): string {
  const normalized = value.trim().toLocaleLowerCase();
  if (/movie|film|фильм/.test(normalized)) return "movie";
  if (/series|сериал/.test(normalized)) return "series";
  if (/tv show/.test(normalized)) return "tv show";
  return normalized;
}


function collectMarkdownFiles(folder: TFolder, files: TFile[]): void {
  for (const child of folder.children) {
    if (child instanceof TFolder) {
      collectMarkdownFiles(child, files);
    } else if (child instanceof TFile && child.extension.toLocaleLowerCase() === "md") {
      files.push(child);
    }
  }
}
