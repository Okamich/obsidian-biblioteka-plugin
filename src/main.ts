import {
  AbstractInputSuggest,
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  SettingGroup,
  TFile,
  TFolder,
} from "obsidian";
import {
  KinopoiskProvider,
  KinopoiskSearchItem,
  MediaKind,
} from "./providers/kinopoisk";
import { OMDbProvider, OMDbSearchItem } from "./providers/omdb";
import { TMDBProvider, TMDBSearchItem } from "./providers/tmdb";
import { MovieField, MovieRecord, MovieProviderId } from "./models/movie";
import { resolveMovieRecord } from "./providers/movie-resolver";
import { DuplicateWarningModal } from "./ui/duplicate-warning-modal";
import { findDuplicateNotes, normalizeMediaType } from "./services/duplicate-service";
import { renderRatingsTable } from "./services/ratings-renderer";
import { createMovieNote, updateExistingMovieNote } from "./services/note-service";

type MovieFieldSetting = { enabled: boolean; property: string };

const MOVIE_FIELD_DEFAULTS: Record<MovieField, MovieFieldSetting> = {
  title: { enabled: true, property: "title" },
  originalTitle: { enabled: true, property: "originalTitle" },
  year: { enabled: true, property: "year" },
  genres: { enabled: true, property: "genres" },
  countries: { enabled: true, property: "countries" },
  plot: { enabled: true, property: "plot" },
  director: { enabled: true, property: "director" },
  writer: { enabled: true, property: "writer" },
  duration: { enabled: true, property: "duration" },
  studio: { enabled: true, property: "studio" },
  actors: { enabled: true, property: "actors" },
};

const MOVIE_FIELD_LABELS: Record<MovieField, string> = {
  title: "Title",
  originalTitle: "Original title",
  year: "Year",
  genres: "Genres",
  countries: "Production countries",
  plot: "Plot / annotation",
  director: "Director",
  writer: "Writer",
  duration: "Duration",
  studio: "Studio / production company",
  actors: "Cast",
};

const MOVIE_FIELD_ORDER: MovieField[] = [
  "title", "originalTitle", "year", "genres", "countries", "plot",
  "director", "writer", "duration", "studio", "actors",
];

interface BibliotekaSettings {
  defaultMediaFolder: string;
  moviesFolder: string;
  movieFileNameTemplate: string;
  kinopoiskApiKey: string;
  omdbApiKey: string;
  tmdbApiKey: string;
  sfwFilter: boolean;
  enabledProviders: Record<MovieProviderId, boolean>;
  providerOrder: MovieProviderId[];
  movieFields: Record<MovieField, MovieFieldSetting>;
}

const DEFAULT_SETTINGS: BibliotekaSettings = {
  defaultMediaFolder: "Media",
  moviesFolder: "Media/Movies",
  movieFileNameTemplate: "{{title}} {{year}}",
  kinopoiskApiKey: "",
  omdbApiKey: "",
  tmdbApiKey: "",
  sfwFilter: true,
  enabledProviders: { kinopoisk: true, omdb: true, tmdb: true },
  providerOrder: ["kinopoisk", "omdb", "tmdb"],
  movieFields: MOVIE_FIELD_DEFAULTS,
};

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
      callback: () => void this.refreshRatings(),
    });

    this.addSettingTab(new BibliotekaSettingTab(this.app, this));
    console.log("Biblioteka loaded");
  }

  private async refreshRatings(): Promise<void> {
    const providerOrder = this.settings.providerOrder.filter((id) =>
      this.settings.enabledProviders[id] && Boolean(getProviderApiKey(this.settings, id)),
    );
    if (providerOrder.length === 0) {
      new Notice("Enable at least one provider and add its API key in Biblioteka settings.");
      return;
    }

    const titleProperty = getMovieFieldProperty(this.settings, "title");
    const yearProperty = getMovieFieldProperty(this.settings, "year");
    const files = this.app.vault.getMarkdownFiles();
    const targets = files.filter((file) => {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
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
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!fm) continue;
        const ids = (fm.source_ids && typeof fm.source_ids === "object")
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
            kinopoisk: this.settings.kinopoiskApiKey,
            omdb: this.settings.omdbApiKey,
            tmdb: this.settings.tmdbApiKey,
          },
          (provider, error) => console.warn(`Biblioteka: ${provider} ratings refresh failed for ${file.path}`, error),
          getEnabledMovieFields(this.settings),
        );
        if (record.ratings.length === 0) continue;

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
          frontmatter.ratings = record.ratings;
          const existingIds = (frontmatter.source_ids && typeof frontmatter.source_ids === "object")
            ? frontmatter.source_ids as Record<string, string>
            : {};
          frontmatter.source_ids = { ...record.sourceIds, ...existingIds };
          frontmatter.sources = [...new Set([...Object.keys(existingIds), ...Object.keys(record.sourceIds)].map((id) => getProviderDisplayName(id as MovieProviderId)))];
        });

        const current = await this.app.vault.read(file);
        const start = "<!-- biblioteka:ratings:start -->";
        const end = "<!-- biblioteka:ratings:end -->";
        const block = [start, "## Ratings", "", renderRatingsTable(record.ratings), end].join("\n");
        const startIndex = current.indexOf(start);
        const endIndex = current.indexOf(end);
        const next = startIndex >= 0 && endIndex > startIndex
          ? current.slice(0, startIndex) + block + current.slice(endIndex + end.length)
          : `${current.trimEnd()}\n\n${block}\n`;
        await this.app.vault.modify(file, next);
        updated++;
      } catch (error) {
        failed++;
        console.warn(`Biblioteka: could not refresh ratings for ${file.path}`, error);
      }
    }
    new Notice(`Ratings refreshed: ${updated}. Failed: ${failed}.`);
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

class BibliotekaSettingTab extends PluginSettingTab {
  plugin: BibliotekaPlugin;

  constructor(app: App, plugin: BibliotekaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Biblioteka" });
    containerEl.createEl("p", {
      text: "Media Library for Obsidian — development build.",
      cls: "biblioteka-status",
    });

    const generalGroup = new SettingGroup(containerEl);
    const generalSection = generalGroup.listEl;
    new Setting(generalSection)
      .setName("Library folder")
      .setDesc("Root folder for the media library. Default: Media.")
      .addText((text) => {
        text
          .setPlaceholder("Media")
          .setValue(this.plugin.settings.defaultMediaFolder)
          .onChange(async (value) => {
            this.plugin.settings.defaultMediaFolder = value.trim() || "Media";
            await this.plugin.saveSettings();
          });
        new FolderSuggest(this.app, text.inputEl);
      });

    new Setting(generalSection)
      .setName("NSFW filter")
      .setDesc("Hide explicitly pornographic and adult content. Ordinary 18+ movies remain visible.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.sfwFilter)
          .onChange(async (value) => {
            this.plugin.settings.sfwFilter = value;
            await this.plugin.saveSettings();
          }),
      );

    const apiSection = containerEl.createEl("details", { cls: "biblioteka-settings-disclosure" });
    apiSection.createEl("summary", { text: "API" });
    const apiContent = apiSection.createDiv({ cls: "biblioteka-settings-section-content" });
    apiContent.createEl("p", {
      text: "Manage API keys and test connections. Keys are stored in plugin settings, not in media notes.",
      cls: "biblioteka-muted",
    });
    const apiGroup = new SettingGroup(apiContent);
    const apiProviders = apiGroup.listEl;

    const kinopoiskSection = apiProviders.createEl("details", { cls: "biblioteka-provider-disclosure" });
    kinopoiskSection.createEl("summary", { text: "Kinopoisk" });
    const kinopoiskContent = kinopoiskSection.createDiv({ cls: "biblioteka-settings-section-content" });
    const kinopoiskGroup = new SettingGroup(kinopoiskContent);
    new Setting(kinopoiskGroup.listEl)
      .setName("Kinopoisk API key")
      .setDesc("Primary source for Russian-language movie and TV search.")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("Enter API key")
          .setValue(this.plugin.settings.kinopoiskApiKey)
          .onChange(async (value) => {
            this.plugin.settings.kinopoiskApiKey = value.trim();
            await this.plugin.saveSettings();
          });
      })
      .addButton((button) =>
        button.setButtonText("Get API key").onClick(() => {
          window.open("https://kinopoiskapiunofficial.tech/", "_blank");
        }),
      )
      .addButton((button) =>
        button.setButtonText("Test connection").onClick(async () => {
          const key = this.plugin.settings.kinopoiskApiKey.trim();
          if (!key) {
            new Notice("Enter your Kinopoisk API key first.");
            return;
          }
          button.setButtonText("Testing…");
          button.setDisabled(true);
          try {
            await new KinopoiskProvider(key).testConnection();
            new Notice("Kinopoisk API connection successful.");
          } catch (error) {
            new Notice(`Kinopoisk connection failed: ${getErrorMessage(error)}`);
          } finally {
            button.setButtonText("Test connection");
            button.setDisabled(false);
          }
        }),
      );

    const omdbSection = apiProviders.createEl("details", { cls: "biblioteka-provider-disclosure" });
    omdbSection.createEl("summary", { text: "OMDb" });
    const omdbContent = omdbSection.createDiv({ cls: "biblioteka-settings-section-content" });
    const omdbGroup = new SettingGroup(omdbContent);
    new Setting(omdbGroup.listEl)
      .setName("OMDb API key")
      .setDesc("Additional metadata and ratings source.")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("Enter OMDb API key")
          .setValue(this.plugin.settings.omdbApiKey)
          .onChange(async (value) => {
            this.plugin.settings.omdbApiKey = value.trim();
            await this.plugin.saveSettings();
          });
      })
      .addButton((button) =>
        button.setButtonText("Get API key").onClick(() => {
          window.open("https://www.omdbapi.com/apikey.aspx", "_blank");
        }),
      )
      .addButton((button) =>
        button.setButtonText("Test connection").onClick(async () => {
          const key = this.plugin.settings.omdbApiKey.trim();
          if (!key) {
            new Notice("Enter your OMDb API key first.");
            return;
          }
          button.setButtonText("Testing…");
          button.setDisabled(true);
          try {
            await new OMDbProvider(key).testConnection();
            new Notice("OMDb API connection successful.");
          } catch (error) {
            new Notice(`OMDb connection failed: ${getErrorMessage(error)}`);
          } finally {
            button.setButtonText("Test connection");
            button.setDisabled(false);
          }
        }),
      );

    const tmdbSection = apiProviders.createEl("details", { cls: "biblioteka-provider-disclosure" });
    tmdbSection.createEl("summary", { text: "TMDB" });
    const tmdbContent = tmdbSection.createDiv({ cls: "biblioteka-settings-section-content" });
    const tmdbGroup = new SettingGroup(tmdbContent);
    new Setting(tmdbGroup.listEl)
      .setName("TMDB API key")
      .setDesc("Additional movie metadata, credits, images and ratings source.")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder("Enter TMDB API key")
          .setValue(this.plugin.settings.tmdbApiKey)
          .onChange(async (value) => {
            this.plugin.settings.tmdbApiKey = value.trim();
            await this.plugin.saveSettings();
          });
      })
      .addButton((button) =>
        button.setButtonText("Get API key").onClick(() => {
          window.open("https://www.themoviedb.org/settings/api", "_blank");
        }),
      )
      .addButton((button) =>
        button.setButtonText("Test connection").onClick(async () => {
          const key = this.plugin.settings.tmdbApiKey.trim();
          if (!key) {
            new Notice("Enter your TMDB API key first.");
            return;
          }
          button.setButtonText("Testing…");
          button.setDisabled(true);
          try {
            await new TMDBProvider(key).testConnection();
            new Notice("TMDB API connection successful.");
          } catch (error) {
            new Notice(`TMDB connection failed: ${getErrorMessage(error)}`);
          } finally {
            button.setButtonText("Test connection");
            button.setDisabled(false);
          }
        }),
      );

    const moviesGroup = new SettingGroup(containerEl);
    moviesGroup.setHeading("Movies");
    const moviesSection = moviesGroup.listEl;
    moviesSection.createEl("p", {
      text: "Settings for movies and TV series.",
      cls: "biblioteka-muted",
    });

    moviesSection.createEl("h4", { text: "Folders", cls: "biblioteka-settings-subheading" });
    new Setting(moviesSection)
      .setName("Movies folder")
      .setDesc("Destination folder for movie and TV series notes. Default: Media/Movies.")
      .addText((text) => {
        text
          .setPlaceholder("Media/Movies")
          .setValue(this.plugin.settings.moviesFolder)
          .onChange(async (value) => {
            this.plugin.settings.moviesFolder = value.trim() || "Media/Movies";
            await this.plugin.saveSettings();
          });
        new FolderSuggest(this.app, text.inputEl);
      });

    moviesSection.createEl("h4", { text: "File name", cls: "biblioteka-settings-subheading" });
    new Setting(moviesSection)
      .setName("File name format")
      .setDesc("Available variables: {{title}} and {{year}}. Default: {{title}} {{year}}.")
      .addText((text) =>
        text
          .setPlaceholder("{{title}} {{year}}")
          .setValue(this.plugin.settings.movieFileNameTemplate)
          .onChange(async (value) => {
            this.plugin.settings.movieFileNameTemplate = value.trim() || "{{title}} {{year}}";
            await this.plugin.saveSettings();
          }),
      );

    moviesSection.createEl("h4", { text: "API sources", cls: "biblioteka-settings-subheading" });
    moviesSection.createEl("p", {
      text: "Choose search sources and drag them to set the order used for search and metadata priority.",
      cls: "biblioteka-muted",
    });
    const providerRows = moviesSection.createDiv({ cls: "biblioteka-provider-list" });
    const renderProviderRows = (): void => {
      providerRows.empty();
      for (const providerId of this.plugin.settings.providerOrder) {
        const label = providerId === "kinopoisk" ? "Kinopoisk" : providerId === "omdb" ? "OMDb" : "TMDB";
        const enabled = this.plugin.settings.enabledProviders[providerId];
        const row = providerRows.createDiv({ cls: "biblioteka-provider-row" });
        row.draggable = true;
        const handle = row.createSpan({ text: "☰", cls: "biblioteka-provider-handle" });
        handle.setAttribute("aria-label", "Drag to reorder");
        row.createSpan({ text: label, cls: "biblioteka-provider-name" });
        const toggle = row.createEl("input", { attr: { type: "checkbox" } });
        toggle.checked = enabled;
        toggle.setAttribute("aria-label", `Enable ${label}`);
        toggle.addEventListener("change", async () => {
          this.plugin.settings.enabledProviders[providerId] = toggle.checked;
          await this.plugin.saveSettings();
          renderProviderRows();
        });
        const up = row.createEl("button", { text: "↑", cls: "biblioteka-provider-move" });
        up.setAttribute("aria-label", `Move ${label} up`);
        up.disabled = this.plugin.settings.providerOrder[0] === providerId;
        up.addEventListener("click", () => void moveProvider(providerId, -1));
        const down = row.createEl("button", { text: "↓", cls: "biblioteka-provider-move" });
        down.setAttribute("aria-label", `Move ${label} down`);
        down.disabled = this.plugin.settings.providerOrder[this.plugin.settings.providerOrder.length - 1] === providerId;
        down.addEventListener("click", () => void moveProvider(providerId, 1));
        row.addEventListener("dragstart", (event) => {
          event.dataTransfer?.setData("text/plain", providerId);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
          row.addClass("is-dragging");
        });
        row.addEventListener("dragend", () => row.removeClass("is-dragging"));
        row.addEventListener("dragover", (event) => event.preventDefault());
        row.addEventListener("drop", (event) => {
          event.preventDefault();
          const dragged = event.dataTransfer?.getData("text/plain") as MovieProviderId;
          if (!dragged || dragged === providerId) return;
          const order = [...this.plugin.settings.providerOrder];
          const from = order.indexOf(dragged);
          const to = order.indexOf(providerId);
          if (from < 0 || to < 0) return;
          order.splice(from, 1);
          order.splice(to, 0, dragged);
          this.plugin.settings.providerOrder = order;
          void this.plugin.saveSettings().then(renderProviderRows);
        });
      }
    };
    const moveProvider = async (providerId: MovieProviderId, direction: -1 | 1): Promise<void> => {
      const order = [...this.plugin.settings.providerOrder];
      const from = order.indexOf(providerId);
      const to = from + direction;
      if (to < 0 || to >= order.length) return;
      [order[from], order[to]] = [order[to], order[from]];
      this.plugin.settings.providerOrder = order;
      await this.plugin.saveSettings();
      renderProviderRows();
    };
    renderProviderRows();

    const fieldsSection = moviesSection.createEl("details", { cls: "biblioteka-settings-disclosure biblioteka-fields-disclosure" });
    fieldsSection.createEl("summary", { text: "Metadata fields" });
    const fieldsContent = fieldsSection.createDiv({ cls: "biblioteka-settings-section-content" });
    fieldsContent.createEl("p", {
      text: "Choose which movie metadata fields to process and the property name used in note frontmatter.",
      cls: "biblioteka-muted",
    });
    const metadataGroup = new SettingGroup(fieldsContent);
    for (const field of MOVIE_FIELD_ORDER) {
      const fieldSetting = this.plugin.settings.movieFields[field];
      new Setting(metadataGroup.listEl)
        .setName(MOVIE_FIELD_LABELS[field])
        .addText((text) => text
          .setPlaceholder(MOVIE_FIELD_DEFAULTS[field].property)
          .setValue(fieldSetting.property)
          .onChange(async (value) => {
            this.plugin.settings.movieFields[field].property = value.trim() || MOVIE_FIELD_DEFAULTS[field].property;
            await this.plugin.saveSettings();
          }))
        .addToggle((toggle) => toggle
          .setValue(fieldSetting.enabled)
          .onChange(async (value) => {
            this.plugin.settings.movieFields[field].enabled = value;
            await this.plugin.saveSettings();
          }));
    }
  }
}

class FolderSuggest extends AbstractInputSuggest<string> {
  private readonly folders: string[];
  private readonly folderInput: HTMLInputElement;

  constructor(app: App, inputEl: HTMLInputElement) {
    super(app, inputEl);
    this.folderInput = inputEl;
    this.folders = app.vault
      .getAllLoadedFiles()
      .filter((file) => file instanceof TFolder)
      .map((folder) => folder.path)
      .sort((a, b) => a.localeCompare(b));
  }

  getSuggestions(inputStr: string): string[] {
    const query = inputStr.trim().toLocaleLowerCase();
    if (!query) return this.folders.slice(0, 50);
    return this.folders
      .filter((folder) => folder.toLocaleLowerCase().includes(query))
      .slice(0, 50);
  }

  renderSuggestion(folder: string, el: HTMLElement): void {
    el.setText(folder);
  }

  selectSuggestion(folder: string): void {
    this.setValue(folder);
    this.folderInput.dispatchEvent(new Event("input", { bubbles: true }));
    this.close();
  }
}

interface UnifiedSearchResult {
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

class MediaSearchModal extends Modal {
  private readonly plugin: BibliotekaPlugin;
  private resultsEl: HTMLElement;
  private controlsEl: HTMLElement;
  private queryInput: HTMLInputElement;
  private kindSelect: HTMLSelectElement;
  private searchButton: HTMLButtonElement;

  constructor(app: App, plugin: BibliotekaPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("biblioteka-search-modal");

    contentEl.createEl("h2", { text: "Add media" });
    contentEl.createEl("p", {
      text: "Search movies and TV series across enabled providers.",
      cls: "biblioteka-muted",
    });

    this.controlsEl = contentEl.createDiv({ cls: "biblioteka-search-controls" });
    const controls = this.controlsEl;
    this.queryInput = controls.createEl("input", {
      attr: { type: "search", placeholder: "Enter a title…" },
    });
    this.queryInput.setAttribute("aria-label", "Media title");

    this.kindSelect = controls.createEl("select", {
      attr: { "aria-label": "Media type" },
    });
    this.kindSelect.createEl("option", { text: "All types", attr: { value: "all" } });
    this.kindSelect.createEl("option", { text: "Movies", attr: { value: "movie" } });
    this.kindSelect.createEl("option", { text: "TV series", attr: { value: "series" } });

    this.searchButton = controls.createEl("button", {
      text: "Search",
      cls: "mod-cta",
    });
    this.searchButton.addEventListener("click", () => void this.runSearch());
    this.queryInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void this.runSearch();
    });

    this.resultsEl = contentEl.createDiv({ cls: "biblioteka-search-results" });
    this.queryInput.focus();
  }

  private async runSearch(): Promise<void> {
    const query = this.queryInput.value.trim();
    if (!query) {
      new Notice("Enter a title to search.");
      return;
    }

    this.searchButton.disabled = true;
    this.searchButton.setText("Searching…");
    this.resultsEl.empty();
    this.resultsEl.createEl("p", { text: "Searching enabled providers…" });

    try {
      const kind = this.kindSelect.value as MediaKind;
      const items: UnifiedSearchResult[] = [];
      const failures: string[] = [];
      const providerIds = getEnabledProviderIds(this.plugin.settings);
      for (const providerId of providerIds) {
        try {
          if (providerId === "kinopoisk") {
            const key = this.plugin.settings.kinopoiskApiKey.trim();
            if (!key) { failures.push("Kinopoisk: API key missing"); continue; }
            const response = await new KinopoiskProvider(key).search(query);
            const matches = (response.films ?? []).filter((item) => matchesKind(item, kind));
            const filtered = this.plugin.settings.sfwFilter
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
            const key = this.plugin.settings.omdbApiKey.trim();
            if (!key) { failures.push("OMDb: API key missing"); continue; }
            const omdbType = kind === "movie" ? "movie" : kind === "series" ? "series" : undefined;
            const response = await new OMDbProvider(key).search(query, 1, omdbType);
            for (const item of response.Search ?? []) {
              if (item.Type === "episode") continue;
              if (kind === "movie" && item.Type !== "movie") continue;
              if (kind === "series" && item.Type !== "series") continue;
              if (this.plugin.settings.sfwFilter && isExplicitAdultContent({ filmId: 0, nameRu: item.Title })) continue;
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
            const key = this.plugin.settings.tmdbApiKey.trim();
            if (!key) { failures.push("TMDB: API key missing"); continue; }
            const response = await new TMDBProvider(key).search(query);
            for (const item of response.results ?? []) {
              if (this.plugin.settings.sfwFilter && isExplicitAdultContent({ filmId: 0, nameRu: item.title })) continue;
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

      this.resultsEl.empty();
      if (items.length === 0) {
        this.resultsEl.createEl("p", {
          text: failures.length ? `No results. ${failures.join(" · ")}` : "No matching titles found.",
          cls: failures.length ? "biblioteka-error" : "biblioteka-muted",
        });
        return;
      }

      this.resultsEl.createEl("p", {
        text: `Found ${items.length} result(s).${failures.length ? " Some providers could not be searched: " + failures.join(" · ") : ""}`,
        cls: failures.length ? "biblioteka-error" : "biblioteka-muted",
      });
      for (const item of items) this.renderResult(item);
    } catch (error) {
      this.resultsEl.empty();
      this.resultsEl.createEl("p", {
        text: getErrorMessage(error),
        cls: "biblioteka-error",
      });
    } finally {
      this.searchButton.disabled = false;
      this.searchButton.setText("Search");
    }
  }

  private renderResult(item: UnifiedSearchResult): void {
    const row = this.resultsEl.createDiv({ cls: "biblioteka-result" });
    const posterUrl = item.posterUrl;
    if (posterUrl) {
      row.createEl("img", {
        attr: {
          src: posterUrl,
          alt: item.title || "Poster",
          loading: "lazy",
        },
        cls: "biblioteka-result-poster",
      });
    }

    const info = row.createDiv({ cls: "biblioteka-result-info" });
    info.createEl("strong", {
      text: item.title,
    });
    const details = [
      item.year ? String(item.year) : "",
      item.type,
      item.rating ? `★ ${item.rating}` : "",
      item.source === "kinopoisk" ? "Kinopoisk" : item.source === "omdb" ? "OMDb" : "TMDB",
    ].filter(Boolean);
    info.createEl("div", {
      text: details.join(" · ") || "Details unavailable",
      cls: "biblioteka-muted",
    });

    const selectButton = info.createEl("button", {
      text: "Select",
      cls: "biblioteka-result-select",
    });
    selectButton.addEventListener("click", () => void this.openPreview(item, selectButton));
  }

  private async openPreview(
    item: UnifiedSearchResult,
    selectButton: HTMLButtonElement,
  ): Promise<void> {
    selectButton.disabled = true;
    selectButton.setText("Loading and combining sources…");
    try {
      const selection = {
        source: item.source,
        id: item.id,
        title: item.title,
        year: item.year,
        mediaType: item.type === "TV series" ? "series" as const : "movie" as const,
      };
      const failures: string[] = [];
      const record = await resolveMovieRecord(
        selection,
        this.plugin.settings.providerOrder.filter((id) => this.plugin.settings.enabledProviders[id]),
        {
          kinopoisk: this.plugin.settings.kinopoiskApiKey,
          omdb: this.plugin.settings.omdbApiKey,
          tmdb: this.plugin.settings.tmdbApiKey,
        },
        (provider, error) => failures.push(`${provider}: ${getErrorMessage(error)}`),
        getEnabledMovieFields(this.plugin.settings),
      );
      if (!record.title) record.title = item.title;
      if (!record.year && item.year) record.year = item.year;
      if (record.posterCandidates.length === 0 && item.posterUrl) {
        record.poster = item.posterUrl;
        record.posterCandidates.push({ source: item.source, url: item.posterUrl });
      }
      if (failures.length) new Notice(`Some providers could not enrich this title: ${failures.join(" · ")}`);
      this.showPreview(record);
    } catch (error) {
      new Notice(`Could not load media details: ${getErrorMessage(error)}`);
      selectButton.disabled = false;
      selectButton.setText("Select");
    }
  }

  private showPreview(record: MovieRecord): void {
    this.controlsEl.hide();
    this.resultsEl.hide();

    const preview = this.contentEl.createDiv({ cls: "biblioteka-preview" });
    preview.createEl("h2", { text: "Preview" });
    preview.createEl("p", {
      text: "Fields are filled in provider order. Later providers only fill missing values; ratings and poster options are collected separately.",
      cls: "biblioteka-muted",
    });

    let selectedPoster = record.poster;
    const posterPreview = preview.createEl("img", {
      attr: { src: selectedPoster, alt: record.title || "Poster" },
      cls: "biblioteka-preview-poster",
    });
    if (!selectedPoster) posterPreview.hide();

    if (record.posterCandidates.length > 1) {
      const posterSetting = preview.createDiv({ cls: "biblioteka-preview-field" });
      posterSetting.createEl("label", { text: "Poster — choose an available version" });
      const select = posterSetting.createEl("select", { cls: "biblioteka-preview-input" });
      record.posterCandidates.forEach((candidate, index) => {
        const providerName = candidate.source === "kinopoisk" ? "Kinopoisk" : candidate.source === "omdb" ? "OMDb" : "TMDB";
        const dimensions = candidate.width && candidate.height ? ` · ${candidate.width}×${candidate.height}` : "";
        const language = candidate.language ? ` · ${candidate.language}` : "";
        select.createEl("option", {
          text: `${providerName}${language}${dimensions}`,
          attr: { value: String(index) },
        });
        if (candidate.url === selectedPoster && select.options.length === 1) select.selectedIndex = 0;
      });
      select.addEventListener("change", () => {
        const candidate = record.posterCandidates[Number(select.value)];
        selectedPoster = candidate?.url ?? "";
        if (selectedPoster) {
          posterPreview.src = selectedPoster;
          posterPreview.show();
        } else posterPreview.hide();
      });
    }

    const fields: Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> = {};
    const addField = (key: string, label: string, value: string, multiline = false): void => {
      const field = preview.createDiv({ cls: "biblioteka-preview-field" });
      const source = record.fieldSources[key as keyof typeof record.fieldSources];
      const sourceLabel = source ? ` · ${source === "kinopoisk" ? "Kinopoisk" : source === "omdb" ? "OMDb" : "TMDB"}` : "";
      field.createEl("label", { text: label + sourceLabel });
      const control = multiline
        ? field.createEl("textarea", { cls: "biblioteka-preview-input" })
        : field.createEl("input", { cls: "biblioteka-preview-input" });
      control.value = value;
      if (multiline) (control as HTMLTextAreaElement).rows = 4;
      fields[key] = control;
    };

    addField("title", "Title", record.title);
    if (this.plugin.settings.movieFields.originalTitle.enabled) addField("originalTitle", "Original title", record.originalTitle);
    if (this.plugin.settings.movieFields.year.enabled) addField("year", "Year", record.year == null ? "" : String(record.year));
    if (this.plugin.settings.movieFields.genres.enabled) addField("genres", "Genres (comma-separated)", record.genres.join(", "));
    if (this.plugin.settings.movieFields.countries.enabled) addField("countries", "Production countries (comma-separated)", record.countries.join(", "));
    if (this.plugin.settings.movieFields.plot.enabled) addField("plot", "Plot", record.plot, true);
    if (this.plugin.settings.movieFields.director.enabled) addField("director", "Director (comma-separated)", record.director.join(", "));
    if (this.plugin.settings.movieFields.writer.enabled) addField("writer", "Writer (comma-separated)", record.writer.join(", "));
    if (this.plugin.settings.movieFields.duration.enabled) addField("duration", "Duration (minutes)", record.duration == null ? "" : String(record.duration));
    if (this.plugin.settings.movieFields.studio.enabled) addField("studio", "Studio (comma-separated)", record.studio.join(", "));
    if (this.plugin.settings.movieFields.actors.enabled) addField("actors", "Starring (comma-separated)", record.actors.join(", "));

    const watchedWrap = preview.createDiv({ cls: "biblioteka-preview-field" });
    watchedWrap.createEl("label", { text: "Watch status" });
    const watched = watchedWrap.createEl("select", { cls: "biblioteka-preview-input" });
    watched.createEl("option", { text: "Not set", attr: { value: "" } });
    watched.createEl("option", { text: "Watched", attr: { value: "Просмотрен" } });
    watched.createEl("option", { text: "Plan to watch", attr: { value: "Собираюсь посмотреть" } });
    watched.value = record.watched;
    fields.watched = watched;

    addField("lastWatched", "Last watched (YYYY-MM-DD)", record.lastWatched);
    addField("personalRating", "Personal rating", record.personalRating == null ? "" : String(record.personalRating));
    addField("personalReview", "Personal review", record.personalReview, true);
    addField("tags", "Tags (comma-separated)", record.tags.join(", "));

    const sourceIds = Object.entries(record.sourceIds)
      .map(([source, id]) => `${source === "kinopoisk" ? "Kinopoisk" : source === "omdb" ? "OMDb" : "TMDB"}: ${id}`);
    if (sourceIds.length) {
      const ids = preview.createDiv({ cls: "biblioteka-preview-field" });
      ids.createEl("label", { text: "Source IDs" });
      ids.createEl("div", { text: sourceIds.join(" · "), cls: "biblioteka-muted" });
    }

    if (record.ratings.length) {
      const ratings = preview.createDiv({ cls: "biblioteka-preview-field" });
      ratings.createEl("label", { text: "Ratings collected from all matched sources" });
      ratings.createEl("div", { text: record.ratings.map((item) =>
        `${item.source}: ${item.value}${item.scale ? `/${item.scale}` : ""}${item.votes != null ? ` (${item.votes.toLocaleString()} votes)` : ""}`,
      ).join(" · "), cls: "biblioteka-muted" });
    }

    const actions = preview.createDiv({ cls: "biblioteka-preview-actions" });
    const backButton = actions.createEl("button", { text: "Back to results" });
    backButton.addEventListener("click", () => {
      preview.remove();
      this.controlsEl.show();
      this.resultsEl.show();
    });

    const createButton = actions.createEl("button", { text: "Create note", cls: "mod-cta" });
    createButton.addEventListener("click", () => void this.createNote(record, selectedPoster, fields, createButton));
  }

  private async createNote(
    record: MovieRecord,
    posterUrl: string,
    fields: Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    button: HTMLButtonElement,
    skipDuplicateCheck = false,
  ): Promise<void> {
    const values = Object.fromEntries(
      Object.entries(fields).map(([key, field]) => [key, field.value.trim()]),
    );
    const title = values.title ?? "";
    if (!title) {
      new Notice("A title is required to create a note.");
      fields.title?.focus();
      return;
    }

    button.disabled = true;
    button.setText(skipDuplicateCheck ? "Creating…" : "Checking duplicates…");
    try {
      const year = Number(values.year) || 0;
      const sourceIds = { ...record.sourceIds };

      if (!skipDuplicateCheck) {
        const duplicates = await findDuplicateNotes(
          this.app,
          sourceIds,
          title,
          year,
          record.type,
          getMovieFieldProperty(this.plugin.settings, "title"),
          getMovieFieldProperty(this.plugin.settings, "year"),
        );
        if (duplicates.length > 0) {
          new DuplicateWarningModal(
            this.app,
            duplicates,
            async (file) => {
              await this.app.workspace.getLeaf(false).openFile(file);
              this.close();
            },
            async (file) => {
              button.setText("Updating…");
              try {
                await updateExistingMovieNote(this.app, file, record, values, this.plugin.settings.movieFields);
                new Notice(`Updated: ${file.path}`);
                this.close();
              } catch (error) {
                new Notice(`Could not update note: ${getErrorMessage(error)}`);
                button.disabled = false;
                button.setText("Create note");
              }
            },
            () => void this.createNote(record, posterUrl, fields, button, true),
            () => {
              button.disabled = false;
              button.setText("Create note");
            },
          ).open();
          return;
        }
      }

      button.setText("Creating…");
      const { file, notePath } = await createMovieNote(
        this.app,
        record,
        values,
        posterUrl,
        {
          moviesFolder: this.plugin.settings.moviesFolder,
          fileNameTemplate: this.plugin.settings.movieFileNameTemplate,
          movieFields: this.plugin.settings.movieFields,
        },
      );
      await this.app.workspace.getLeaf(false).openFile(file);
      new Notice(`Created: ${notePath}`);
      this.close();
    } catch (error) {
      new Notice(`Could not create note: ${getErrorMessage(error)}`);
      button.disabled = false;
      button.setText("Create note");
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
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
