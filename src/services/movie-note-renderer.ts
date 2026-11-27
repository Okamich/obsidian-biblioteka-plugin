import { MovieRecord } from "../models/movie";
import { renderRatingsTable } from "./ratings-renderer";

interface RenderMovieNoteOptions {
  properties: Record<string, unknown>;
  title: string;
  posterPath: string;
  plot: string;
  ratings: MovieRecord["ratings"];
  fileNameTemplate: string;
  year: string;
  identity: string;
}

export function renderMovieNote(options: RenderMovieNoteOptions): { content: string; baseName: string } {
  const { properties, title, posterPath, plot, ratings, fileNameTemplate, year, identity } = options;
  const frontmatter = Object.entries(properties)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${yamlPropertyKey(key)}: ${yamlValue(value)}`)
    .join("\n");
  const body = [
    `# ${title}`,
    posterPath ? `![[${posterPath}]]` : "",
    plot,
    ratings.length ? ["", "<!-- biblioteka:ratings:start -->", "## Ratings", "", renderRatingsTable(ratings), "<!-- biblioteka:ratings:end -->"].join("\n") : "",
  ].filter(Boolean).join("\n\n");
  const content = `---\n${frontmatter}\n---\n\n${body.trim()}\n`;
  const fileName = renderFileNameTemplate(fileNameTemplate, title, year);
  const baseName = sanitizeFileName(fileName) || `media-${identity}`;
  return { content, baseName };
}

function yamlPropertyKey(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(value) ? value : JSON.stringify(value);
}

function yamlValue(value: unknown): string {
  return JSON.stringify(value) ?? "null";
}

function renderFileNameTemplate(template: string, title: string, year: string): string {
  return template
    .replace(/\{\{\s*title\s*\}\}/gi, title)
    .replace(/\{\{\s*year\s*\}\}/gi, year)
    .replace(/\{\{[^{}]+\}\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[\/:*?"<>|#^\[\]\\]/g, "")
    .replace(/[. ]+$/g, "")
    .replace(/\\s+/g, " ")
    .slice(0, 100);
}
