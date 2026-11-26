import { Notice, Plugin } from "obsidian";
import { MovieField, MovieProviderId } from "./models/movie";
import { refreshRatings } from "./services/rating-service";
import { MediaSearchModal, getEnabledProviderIds } from "./ui/media-search-modal";
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

