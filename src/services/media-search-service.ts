import { KinopoiskProvider, KinopoiskSearchItem, MediaKind } from "../providers/kinopoisk";
import { OMDbProvider, OMDbSearchItem } from "../providers/omdb";
import { TMDBProvider, TMDBSearchItem } from "../providers/tmdb";
import { MovieProviderId } from "../models/movie";
import { BibliotekaSettings } from "../settings";

export interface UnifiedSearchResult {
  source: MovieProviderId;
  id: string;
  title: string;
  year: number;
  type: string;
  posterUrl: string;
  rating?: string | number;
  kinopoiskItem?: KinopoiskSearchItem;
  omdbItem?: OMDbSearchItem;
  tmdbItem?: TMDBSearchItem;
}

export interface MediaSearchResponse {
  items: UnifiedSearchResult[];
  failures: string[];
}

export async function searchMedia(
  query: string,
  kind: MediaKind,
  settings: BibliotekaSettings,
): Promise<MediaSearchResponse> {
  const items: UnifiedSearchResult[] = [];
  const failures: string[] = [];
  const providerIds = getEnabledProviderIds(settings);
  for (const providerId of providerIds) {
    try {
      if (providerId === "kinopoisk") {
        const key = settings.kinopoiskApiKey.trim();
        if (!key) { failures.push("Kinopoisk: API key missing"); continue; }
        const response = await new KinopoiskProvider(key).search(query);
        const matches = (response.films ?? []).filter((item) => matchesKind(item, kind));
        const filtered = settings.sfwFilter
          ? matches.filter((item) => !isExplicitAdultContent(item))
          : matches;
        for (const item of filtered) items.push({
          source: "kinopoisk",
          id: String(item.filmId),
          title: item.nameRu || item.nameEn || item.nameOriginal || "Untitled",
          year: item.year ?? 0,
          type: formatMediaType(item.type),
          posterUrl: item.posterUrlPreview || item.posterUrl || "",
          rating: item.rating,
          kinopoiskItem: item,
        });
      } else if (providerId === "omdb") {
        const key = settings.omdbApiKey.trim();
        if (!key) { failures.push("OMDb: API key missing"); continue; }
        const omdbType = kind === "movie" ? "movie" : kind === "series" ? "series" : undefined;
        const response = await new OMDbProvider(key).search(query, 1, omdbType);
        for (const item of response.Search ?? []) {
          if (item.Type === "episode") continue;
          if (kind === "movie" && item.Type !== "movie") continue;
          if (kind === "series" && item.Type !== "series") continue;
          if (settings.sfwFilter && isExplicitAdultContent({ filmId: 0, nameRu: item.Title })) continue;
          const year = Number(item.Year.match(/\d{4}/)?.[0] ?? 0);
          items.push({
            source: "omdb",
            id: item.imdbID,
            title: item.Title,
            year,
            type: item.Type === "series" ? "TV series" : "Movie",
            posterUrl: item.Poster !== "N/A" ? item.Poster : "",
            omdbItem: item,
          });
        }
      } else {
        if (kind === "series") continue;
        const key = settings.tmdbApiKey.trim();
        if (!key) { failures.push("TMDB: API key missing"); continue; }
        const response = await new TMDBProvider(key).search(query);
        for (const item of response.results ?? []) {
          if (settings.sfwFilter && isExplicitAdultContent({ filmId: 0, nameRu: item.title })) continue;
          items.push({
            source: "tmdb",
            id: String(item.id),
            title: item.title || item.original_title || "Untitled",
            year: Number(item.release_date?.slice(0, 4) ?? 0),
            type: "Movie",
            posterUrl: new TMDBProvider(key).posterUrl(item.poster_path),
            rating: item.vote_average,
            tmdbItem: item,
          });
        }
      }
    } catch (error) {
      failures.push(`${providerId === "kinopoisk" ? "Kinopoisk" : providerId === "omdb" ? "OMDb" : "TMDB"}: ${getErrorMessage(error)}`);
    }
  }
  return { items, failures };
}

function getProviderApiKey(settings: BibliotekaSettings, providerId: MovieProviderId): string {
  if (providerId === "kinopoisk") return settings.kinopoiskApiKey.trim();
  if (providerId === "omdb") return settings.omdbApiKey.trim();
  return settings.tmdbApiKey.trim();
}

export function getEnabledProviderIds(settings: BibliotekaSettings): MovieProviderId[] {
  return settings.providerOrder.filter((id) => settings.enabledProviders[id] && Boolean(getProviderApiKey(settings, id)));
}


function isExplicitAdultContent(item: KinopoiskSearchItem): boolean {
  const genreNames = (item.genres ?? []).map((genre) =>
    typeof genre === "string" ? genre : genre.genre ?? "",
  );

  const metadata = [
    item.nameRu,
    item.nameEn,
    item.nameOriginal,
    item.description,
    ...genreNames,
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase();

  // Kinopoisk does not consistently expose a dedicated "erotica" genre.
  // Check titles, descriptions and any genre labels that are available.
  const explicitTerms =
    /(?:^|[^\p{L}\p{N}])(?:порно(?:граф\p{L}*)?|эротик\p{L}*|нимфоман\p{L}*|для\s+взрослых|xxx|хентай|hentai|porn(?:ography)?|erotic\p{L}*|nymphomaniac|nymphomania|sexploitation|softcore|hardcore|adult\s+(?:film|content))(?:$|[^\p{L}\p{N}])/iu;

  const explicitPhrases =
    /(?:откровенн\p{L}*\s+(?:сексуальн\p{L}*\s+)?сцен\p{L}*|сцен\p{L}*\s+(?:откровенного\s+)?секс\p{L}*|explicit\s+(?:sexual\s+)?content|graphic\s+sex(?:ual)?)/iu;

  return explicitTerms.test(metadata) || explicitPhrases.test(metadata);
}


function matchesKind(item: KinopoiskSearchItem, kind: MediaKind): boolean {
  if (kind === "all") return true;
  const type = (item.type ?? "").toUpperCase();
  const isSeries = type.includes("TV") || type.includes("SERIES");
  return kind === "series" ? isSeries : !isSeries;
}

function formatMediaType(type?: string): string {
  switch ((type ?? "").toUpperCase()) {
    case "FILM":
      return "Movie";
    case "TV_SERIES":
    case "MINI_SERIES":
      return "TV series";
    case "TV_SHOW":
      return "TV show";
    default:
      return type ?? "";
  }
}

