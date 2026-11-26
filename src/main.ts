import { Notice, Plugin } from "obsidian";
import { MovieField, MovieProviderId } from "./models/movie";
import { refreshRatings } from "./services/rating-service";
import { MediaSearchModal } from "./ui/media-search-modal";
import { DEFAULT_SETTINGS, BibliotekaSettings, MOVIE_FIELD_DEFAULTS, MOVIE_FIELD_ORDER, MovieFieldSetting } from "./settings";
import { BibliotekaSettingTab } from "./ui/settings-tab";

export default class BibliotekaPlugin extends Plugin {
  settings: BibliotekaSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "add-media",
      name: "Add media",
      callback: () => {
        if (!getEnabledProviderIds(this.settings).some((id) => getProviderApiKey(this.settings, id))) {
          new Notice("Enable at least one provider and add its API key in Biblioteka settings.");
          return;
        }
        new MediaSearchModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "refresh-ratings",
      name: "Refresh Ratings",
      callback: () => void refreshRatings(this.app, this.settings),
    });

    this.addSettingTab(new BibliotekaSettingTab(this.app, this));
    console.log("Biblioteka loaded");
  }

  async loadSettings(): Promise<void> {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    this.settings.enabledProviders = {
      ...DEFAULT_SETTINGS.enabledProviders,
      ...(saved?.enabledProviders ?? {}),
    };
    this.settings.movieFields = Object.fromEntries(
      MOVIE_FIELD_ORDER.map((field) => {
        const savedField = saved?.movieFields?.[field] ?? {};
        return [field, {
          ...MOVIE_FIELD_DEFAULTS[field],
          ...savedField,
          property: typeof savedField.property === "string" && savedField.property.trim()
            ? savedField.property.trim()
            : MOVIE_FIELD_DEFAULTS[field].property,
        }];
      }),
    ) as Record<MovieField, MovieFieldSetting>;
    const savedOrder = Array.isArray(saved?.providerOrder) ? saved.providerOrder : [];
    this.settings.providerOrder = [
      ...savedOrder.filter((id: string) => id === "kinopoisk" || id === "omdb" || id === "tmdb"),
      ...DEFAULT_SETTINGS.providerOrder.filter((id) => !savedOrder.includes(id)),
    ];
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

function getProviderApiKey(settings: BibliotekaSettings, providerId: MovieProviderId): string {
  if (providerId === "kinopoisk") return settings.kinopoiskApiKey.trim();
  if (providerId === "omdb") return settings.omdbApiKey.trim();
  return settings.tmdbApiKey.trim();
}

function getEnabledProviderIds(settings: BibliotekaSettings): MovieProviderId[] {
  return settings.providerOrder.filter((id) => settings.enabledProviders[id] && Boolean(getProviderApiKey(settings, id)));
}

/**
 * Metadata-based SFW filter.
 * This targets erotic/adult productions and explicit sexual descriptions,
 * not ordinary age-restricted movies or incidental mature themes.
 */
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


function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred.";
}
