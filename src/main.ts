import {
  AbstractInputSuggest,
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  requestUrl,
} from "obsidian";
import {
  KinopoiskProvider,
  KinopoiskSearchItem,
  KinopoiskDetails,
  MediaKind,
} from "./providers/kinopoisk";
import { OMDbProvider, OMDbDetails } from "./providers/omdb";

interface BibliotekaSettings {
  defaultMediaFolder: string;
  moviesFolder: string;
  movieFileNameTemplate: string;
  kinopoiskApiKey: string;
  omdbApiKey: string;
  sfwFilter: boolean;
}

const DEFAULT_SETTINGS: BibliotekaSettings = {
  defaultMediaFolder: "Media",
  moviesFolder: "Media/Movies",
  movieFileNameTemplate: "{{title}} {{year}}",
  kinopoiskApiKey: "",
  omdbApiKey: "",
  sfwFilter: true,
};

export default class BibliotekaPlugin extends Plugin {
  settings: BibliotekaSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "add-media",
      name: "Add media",
      callback: () => {
        if (!this.settings.kinopoiskApiKey.trim()) {
          new Notice("Add your Kinopoisk API key in Biblioteka settings first.");
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
    if (!this.settings.kinopoiskApiKey.trim()) {
      new Notice("Add your Kinopoisk API key in Biblioteka settings first.");
      return;
    }

    const files = this.app.vault.getMarkdownFiles();
    const targets = files.filter((file) => {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      return Number(frontmatter?.kinopoisk_id) > 0;
    });

    if (targets.length === 0) {
      new Notice("No Biblioteka notes with a Kinopoisk ID were found.");
      return;
    }

    const provider = new KinopoiskProvider(this.settings.kinopoiskApiKey);
    let updated = 0;
    let failed = 0;

    new Notice(`Refreshing ratings for ${targets.length} note(s)…`);
    for (const file of targets) {
      try {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const id = Number(frontmatter?.kinopoisk_id);
        if (!Number.isInteger(id) || id <= 0) continue;

        const details = await provider.getDetails(id);
        const ratings = buildRatings(details);
        if (ratings.length === 0) continue;

        await this.app.fileManager.processFrontMatter(file, (fm) => {
          fm.ratings = ratings;
        });

        const current = await this.app.vault.read(file);
        const table = renderRatingsTable(ratings);
        const start = "<!-- biblioteka:ratings:start -->";
        const end = "<!-- biblioteka:ratings:end -->";
        const block = [start, "## Ratings", "", table, end].join("\n");
        const startIndex = current.indexOf(start);
        const endIndex = current.indexOf(end);
        let next: string;
        if (startIndex >= 0 && endIndex > startIndex) {
          next = current.slice(0, startIndex) + block + current.slice(endIndex + end.length);
        } else {
          next = `${current.trimEnd()}\n\n${block}\n`;
        }
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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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

    containerEl.createEl("h3", { text: "General" });
    new Setting(containerEl)
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

    new Setting(containerEl)
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

    containerEl.createEl("h3", { text: "API" });
    containerEl.createEl("p", {
      text: "Manage API keys and test connections. Keys are stored in plugin settings, not in media notes.",
      cls: "biblioteka-muted",
    });

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    containerEl.createEl("h3", { text: "Movies" });
    containerEl.createEl("p", {
      text: "Settings for movies and TV series.",
      cls: "biblioteka-muted",
    });

    new Setting(containerEl)
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

    new Setting(containerEl)
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
      text: "Search movies and TV series on Kinopoisk.",
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
    this.resultsEl.createEl("p", { text: "Searching Kinopoisk…" });

    try {
      const provider = new KinopoiskProvider(this.plugin.settings.kinopoiskApiKey);
      const response = await provider.search(query);
      const kind = this.kindSelect.value as MediaKind;
      const kindMatches = (response.films ?? []).filter((item) => matchesKind(item, kind));
      const items = this.plugin.settings.sfwFilter
        ? kindMatches.filter((item) => !isExplicitAdultContent(item))
        : kindMatches;
      const hiddenCount = kindMatches.length - items.length;

      this.resultsEl.empty();
      if (items.length === 0) {
        this.resultsEl.createEl("p", {
          text: hiddenCount > 0
            ? `No matching titles found. SFW filter hid ${hiddenCount} explicit adult result(s).`
            : "No matching titles found.",
        });
        return;
      }

      this.resultsEl.createEl("p", {
        text: `Found ${items.length} result(s).`,
        cls: "biblioteka-muted",
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

  private renderResult(item: KinopoiskSearchItem): void {
    const row = this.resultsEl.createDiv({ cls: "biblioteka-result" });
    const posterUrl = item.posterUrlPreview || item.posterUrl;
    if (posterUrl) {
      row.createEl("img", {
        attr: {
          src: posterUrl,
          alt: item.nameRu || item.nameEn || "Poster",
          loading: "lazy",
        },
        cls: "biblioteka-result-poster",
      });
    }

    const info = row.createDiv({ cls: "biblioteka-result-info" });
    info.createEl("strong", {
      text: item.nameRu || item.nameEn || item.nameOriginal || "Untitled",
    });
    const details = [
      item.year ? String(item.year) : "",
      formatMediaType(item.type),
      item.rating ? `★ ${item.rating}` : "",
      item.filmLength ? `${item.filmLength} min` : "",
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
    item: KinopoiskSearchItem,
    selectButton: HTMLButtonElement,
  ): Promise<void> {
    selectButton.disabled = true;
    selectButton.setText("Loading…");

    try {
      const provider = new KinopoiskProvider(this.plugin.settings.kinopoiskApiKey);
      const details = await provider.getDetails(item.filmId);
      let omdbDetails: OMDbDetails | undefined;

      const omdbKey = this.plugin.settings.omdbApiKey.trim();
      if (omdbKey && details.imdbId) {
        try {
          omdbDetails = await new OMDbProvider(omdbKey).getDetails(details.imdbId);
        } catch (error) {
          console.warn("Biblioteka: OMDb enrichment failed; continuing with Kinopoisk data.", error);
          new Notice("OMDb could not be reached. Continuing with Kinopoisk data.");
        }
      }

      this.showPreview(details, omdbDetails);
    } catch (error) {
      new Notice(`Could not load media details: ${getErrorMessage(error)}`);
      selectButton.disabled = false;
      selectButton.setText("Select");
    }
  }

  private showPreview(details: KinopoiskDetails, omdbDetails?: OMDbDetails): void {
    this.controlsEl.hide();
    this.resultsEl.hide();

    const preview = this.contentEl.createDiv({ cls: "biblioteka-preview" });
    preview.createEl("h2", { text: "Preview" });
    preview.createEl("p", {
      text: "Review and edit the information before creating a note. Changes here are saved to the new note.",
      cls: "biblioteka-muted",
    });

    const posterUrl = details.posterUrl || details.posterUrlPreview || "";
    if (posterUrl) {
      preview.createEl("img", {
        attr: { src: posterUrl, alt: details.nameRu || details.nameEn || "Poster" },
        cls: "biblioteka-preview-poster",
      });
    }

    const fields: Record<string, HTMLInputElement | HTMLTextAreaElement> = {};
    const addField = (key: string, label: string, value: string, multiline = false): void => {
      const field = preview.createDiv({ cls: "biblioteka-preview-field" });
      field.createEl("label", { text: label });
      const control = multiline
        ? field.createEl("textarea", { cls: "biblioteka-preview-input" })
        : field.createEl("input", { cls: "biblioteka-preview-input" });
      control.value = value;
      if (multiline) (control as HTMLTextAreaElement).rows = 5;
      fields[key] = control;
    };

    const kpGenres = (details.genres ?? []).map((x) => x.genre).filter(Boolean);
    const kpCountries = (details.countries ?? []).map((x) => x.country).filter(Boolean);
    const omdbGenres = splitList(omdbDetails?.Genre ?? "");
    const omdbCountries = splitList(omdbDetails?.Country ?? "");
    const omdbYear = omdbDetails?.Year?.match(/\d{4}/)?.[0] ?? "";
    const sourceLabel = (label: string, fromOmdb: boolean): string =>
      fromOmdb ? `${label} · OMDb` : `${label} · Kinopoisk`;

    const title = details.nameRu || details.nameEn || details.nameOriginal || omdbDetails?.Title || "";
    const originalTitle = details.nameOriginal || details.nameEn || omdbDetails?.Title || "";
    const year = details.year ? String(details.year) : omdbYear;
    const description = details.description || details.shortDescription || omdbDetails?.Plot || "";
    const genres = kpGenres.length ? kpGenres : omdbGenres;
    const countries = kpCountries.length ? kpCountries : omdbCountries;
    const imdbRating = details.ratingImdb ?? parseRatingNumber(omdbDetails?.imdbRating);

    addField("title", "Title", title);
    addField("originalTitle", sourceLabel("Original title", !details.nameOriginal && !details.nameEn && Boolean(omdbDetails?.Title)), originalTitle);
    addField("year", sourceLabel("Year", !details.year && Boolean(omdbYear)), year);
    addField("description", sourceLabel("Description", !details.description && !details.shortDescription && Boolean(omdbDetails?.Plot)), description, true);
    addField("genres", sourceLabel("Genres (comma-separated)", kpGenres.length === 0 && omdbGenres.length > 0), genres.join(", "));
    addField("countries", sourceLabel("Countries (comma-separated)", kpCountries.length === 0 && omdbCountries.length > 0), countries.join(", "));
    addField("ratingKinopoisk", "Kinopoisk rating", details.ratingKinopoisk == null ? "" : String(details.ratingKinopoisk));
    addField("ratingImdb", sourceLabel("IMDb rating", details.ratingImdb == null && imdbRating != null), imdbRating == null ? "" : String(imdbRating));
    addField("director", "Director · OMDb", omdbDetails?.Director && omdbDetails.Director !== "N/A" ? omdbDetails.Director : "");
    addField("writer", "Writer · OMDb", omdbDetails?.Writer && omdbDetails.Writer !== "N/A" ? omdbDetails.Writer : "");
    addField("actors", "Actors · OMDb", omdbDetails?.Actors && omdbDetails.Actors !== "N/A" ? omdbDetails.Actors : "");
    addField("runtime", "Runtime · OMDb", omdbDetails?.Runtime && omdbDetails.Runtime !== "N/A" ? omdbDetails.Runtime : "");
    addField("language", "Language · OMDb", omdbDetails?.Language && omdbDetails.Language !== "N/A" ? omdbDetails.Language : "");
    addField("awards", "Awards · OMDb", omdbDetails?.Awards && omdbDetails.Awards !== "N/A" ? omdbDetails.Awards : "");
    addField("rated", "Age rating · OMDb", omdbDetails?.Rated && omdbDetails.Rated !== "N/A" ? omdbDetails.Rated : "");
    addField("metascore", "Metascore · OMDb", omdbDetails?.Metascore && omdbDetails.Metascore !== "N/A" ? omdbDetails.Metascore : "");
    addField("kinopoiskId", "Kinopoisk ID", String(details.kinopoiskId));
    addField("imdbId", "IMDb ID", details.imdbId || omdbDetails?.imdbID || "");

    const actions = preview.createDiv({ cls: "biblioteka-preview-actions" });
    const backButton = actions.createEl("button", { text: "Back to results" });
    backButton.addEventListener("click", () => {
      preview.remove();
      this.controlsEl.show();
      this.resultsEl.show();
    });

    const createButton = actions.createEl("button", {
      text: "Create note",
      cls: "mod-cta",
    });
    createButton.addEventListener("click", () => void this.createNote(details, posterUrl, fields, createButton, omdbDetails));
  }

  private async createNote(
    details: KinopoiskDetails,
    posterUrl: string,
    fields: Record<string, HTMLInputElement | HTMLTextAreaElement>,
    button: HTMLButtonElement,
    omdbDetails?: OMDbDetails,
    skipDuplicateCheck = false,
  ): Promise<void> {
    const read = (key: string): string => fields[key]?.value.trim() ?? "";
    const title = read("title");
    if (!title) {
      new Notice("A title is required to create a note.");
      fields.title?.focus();
      return;
    }

    button.disabled = true;
    button.setText(skipDuplicateCheck ? "Creating…" : "Checking duplicates…");
    try {
      if (!skipDuplicateCheck) {
        const candidateId = Number(read("kinopoiskId")) || details.kinopoiskId;
        const candidateYear = Number(read("year")) || details.year || 0;
        const candidateType = formatMediaType(details.type);
        const duplicates = await findDuplicateNotes(this.app, candidateId, title, candidateYear, candidateType);
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
                await updateExistingNote(this.app, file, details, fields, omdbDetails);
                new Notice(`Updated: ${file.path}`);
                this.close();
              } catch (error) {
                new Notice(`Could not update note: ${getErrorMessage(error)}`);
                button.disabled = false;
                button.setText("Create note");
              }
            },
            () => void this.createNote(details, posterUrl, fields, button, omdbDetails, true),
            () => {
              button.disabled = false;
              button.setText("Create note");
            },
          ).open();
          return;
        }
      }

      button.setText("Creating…");
      const folder = this.plugin.settings.moviesFolder.trim().replace(/^\/+|\/+$/g, "") || "Media/Movies";
      await ensureVaultFolder(this.app, folder);

      let localPosterPath = "";
      if (posterUrl) {
        try {
          const extension = getImageExtension(posterUrl);
          const posterFolder = `${folder}/_posters`;
          await ensureVaultFolder(this.app, posterFolder);
          const posterName = `kinopoisk-${details.kinopoiskId}.${extension}`;
          const posterPath = `${posterFolder}/${posterName}`;
          if (!this.app.vault.getAbstractFileByPath(posterPath)) {
            const response = await requestUrl({ url: posterUrl, method: "GET" });
            await this.app.vault.createBinary(posterPath, response.arrayBuffer);
          }
          localPosterPath = posterPath;
        } catch (error) {
          console.warn("Biblioteka: poster download failed", error);
          new Notice("The note will be created, but the poster could not be downloaded.");
        }
      }

      const ratings = buildRatings(details, omdbDetails);
      const properties: Record<string, string | number | string[] | Array<{ source: string; value: number; votes?: number; url?: string }>> = {
        type: formatMediaType(details.type),
        kinopoisk_id: Number(read("kinopoiskId")) || details.kinopoiskId,
      };
      const originalTitle = read("originalTitle");
      const year = Number(read("year"));
      const genres = splitList(read("genres"));
      const countries = splitList(read("countries"));
      const kpRating = Number(read("ratingKinopoisk"));
      const imdbRating = Number(read("ratingImdb"));
      const imdbId = read("imdbId");

      if (originalTitle) properties.original_title = originalTitle;
      if (Number.isFinite(year) && year > 0) properties.year = year;
      if (genres.length) properties.genres = genres;
      if (countries.length) properties.countries = countries;
      if (Number.isFinite(kpRating) && read("ratingKinopoisk") !== "") properties.rating_kinopoisk = kpRating;
      if (Number.isFinite(imdbRating) && read("ratingImdb") !== "") properties.rating_imdb = imdbRating;
      if (imdbId) properties.imdb_id = imdbId;
      const director = read("director");
      const writer = read("writer");
      const actors = read("actors");
      const runtime = read("runtime");
      const language = read("language");
      const awards = read("awards");
      const rated = read("rated");
      const metascore = read("metascore");
      if (director) properties.director = director;
      if (writer) properties.writer = writer;
      if (actors) properties.actors = actors;
      if (runtime) properties.runtime = runtime;
      if (language) properties.language = language;
      if (awards) properties.awards = awards;
      if (rated) properties.rated = rated;
      if (metascore) properties.metascore = metascore;
      if (ratings.length) properties.ratings = ratings;
      if (localPosterPath) properties.poster = localPosterPath;

      const frontmatter = Object.entries(properties)
        .map(([key, value]) => `${key}: ${yamlValue(value)}`)
        .join("\n");
      const body = [
        `# ${title}`,
        localPosterPath ? `![[${localPosterPath}]]` : "",
        read("description"),
        "",
        details.webUrl ? `[Kinopoisk](${details.webUrl})` : "",
        ratings.length ? [ "", "<!-- biblioteka:ratings:start -->", "## Ratings", "", renderRatingsTable(ratings), "<!-- biblioteka:ratings:end -->" ].join("\n") : "",
      ].filter((line, index, array) => line !== "" || (index > 0 && array[index - 1] !== "")).join("\n");
      const content = `---\n${frontmatter}\n---\n\n${body.trim()}\n`;

      const yearText = read("year");
      const fileName = renderFileNameTemplate(
        this.plugin.settings.movieFileNameTemplate,
        title,
        yearText,
      );
      const baseName = sanitizeFileName(fileName) || `media-${details.kinopoiskId}`;
      let notePath = `${folder}/${baseName}.md`;
      let suffix = 2;
      while (this.app.vault.getAbstractFileByPath(notePath)) {
        notePath = `${folder}/${baseName} (${suffix++}).md`;
      }

      const file = await this.app.vault.create(notePath, content);
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




interface MediaRating {
  source: string;
  value: number;
  votes?: number;
  url?: string;
}

function buildRatings(details: KinopoiskDetails, omdbDetails?: OMDbDetails): MediaRating[] {
  const ratings: MediaRating[] = [];
  if (typeof details.ratingKinopoisk === "number") {
    ratings.push({
      source: "Kinopoisk",
      value: details.ratingKinopoisk,
      ...(typeof details.ratingKinopoiskVoteCount === "number"
        ? { votes: details.ratingKinopoiskVoteCount }
        : {}),
      ...(details.webUrl ? { url: details.webUrl } : {}),
    });
  }
  const imdbValue = typeof details.ratingImdb === "number"
    ? details.ratingImdb
    : parseRatingNumber(omdbDetails?.imdbRating);
  if (typeof imdbValue === "number") {
    ratings.push({
      source: "IMDb",
      value: imdbValue,
      ...(typeof details.ratingImdbVoteCount === "number"
        ? { votes: details.ratingImdbVoteCount }
        : parseVoteCount(omdbDetails?.imdbVotes) != null
          ? { votes: parseVoteCount(omdbDetails?.imdbVotes) as number }
          : {}),
      ...((details.imdbId || omdbDetails?.imdbID)
        ? { url: `https://www.imdb.com/title/${details.imdbId || omdbDetails?.imdbID}/` }
        : {}),
    });
  }

  for (const rating of omdbDetails?.Ratings ?? []) {
    const source = rating.Source.trim();
    if (/internet movie database/i.test(source)) continue;
    const value = parseRatingNumber(rating.Value);
    if (value == null) continue;
    if (ratings.some((existing) => existing.source.toLowerCase() === source.toLowerCase())) continue;
    ratings.push({ source, value });
  }
  return ratings;
}

function parseRatingNumber(value?: string): number | undefined {
  if (!value || value === "N/A") return undefined;
  const match = value.match(/\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseVoteCount(value?: string): number | undefined {
  if (!value || value === "N/A") return undefined;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function renderRatingsTable(ratings: MediaRating[]): string {
  const rows = ratings.map((rating) => {
    const source = rating.url
      ? `[${escapeMarkdownTable(rating.source)}](${rating.url})`
      : escapeMarkdownTable(rating.source);
    const votes = typeof rating.votes === "number"
      ? rating.votes.toLocaleString("en-US")
      : "—";
    return `| ${source} | ${rating.value} | ${votes} |`;
  });
  return [
    "| Source | Rating | Votes |",
    "|---|---:|---:|",
    ...rows,
  ].join("\n");
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

interface DuplicateMatch {
  file: TFile;
  reason: string;
}

class DuplicateWarningModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly matches: DuplicateMatch[],
    private readonly onOpenFile: (file: TFile) => void | Promise<void>,
    private readonly onUpdateFile: (file: TFile) => void | Promise<void>,
    private readonly onContinue: () => void,
    private readonly onCancel: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "Possible duplicate found" });
    this.contentEl.createEl("p", {
      text: "Biblioteka found an existing note that may describe this movie or series. You can open it, update it with missing information, or create a separate copy.",
    });

    for (const match of this.matches.slice(0, 8)) {
      const row = this.contentEl.createDiv({ cls: "biblioteka-duplicate-match" });
      row.createEl("strong", { text: match.file.basename });
      row.createEl("p", { text: match.reason, cls: "biblioteka-muted" });
      const rowActions = row.createDiv({ cls: "biblioteka-preview-actions" });
      const openButton = rowActions.createEl("button", { text: "Open this note" });
      openButton.addEventListener("click", () => {
        this.resolved = true;
        void this.onOpenFile(match.file);
        this.close();
      });
      const updateButton = rowActions.createEl("button", { text: "Update existing note" });
      updateButton.addEventListener("click", () => {
        this.resolved = true;
        this.close();
        void this.onUpdateFile(match.file);
      });
    }

    if (this.matches.length > 8) {
      this.contentEl.createEl("p", {
        text: `And ${this.matches.length - 8} more possible match(es).`,
        cls: "biblioteka-muted",
      });
    }

    const actions = this.contentEl.createDiv({ cls: "biblioteka-preview-actions" });
    const continueButton = actions.createEl("button", { text: "Create copy", cls: "mod-cta" });
    continueButton.addEventListener("click", () => {
      this.resolved = true;
      this.close();
      this.onContinue();
    });
    const cancelButton = actions.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.resolved = true;
      this.close();
      this.onCancel();
    });
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.resolved) this.onCancel();
  }
}

async function updateExistingNote(
  app: App,
  file: TFile,
  details: KinopoiskDetails,
  fields: Record<string, HTMLInputElement | HTMLTextAreaElement>,
  omdbDetails?: OMDbDetails,
): Promise<void> {
  const read = (key: string): string => fields[key]?.value.trim() ?? "";
  const ratings = buildRatings(details, omdbDetails);
  const candidateProperties: Record<string, unknown> = {
    type: formatMediaType(details.type),
    kinopoisk_id: Number(read("kinopoiskId")) || details.kinopoiskId,
  };

  const originalTitle = read("originalTitle");
  const year = Number(read("year"));
  const genres = splitList(read("genres"));
  const countries = splitList(read("countries"));
  const kpRating = Number(read("ratingKinopoisk"));
  const imdbRating = Number(read("ratingImdb"));
  const imdbId = read("imdbId");
  const optionalFields: Record<string, unknown> = {
    original_title: originalTitle,
    ...(Number.isFinite(year) && year > 0 ? { year } : {}),
    ...(genres.length ? { genres } : {}),
    ...(countries.length ? { countries } : {}),
    ...(read("ratingKinopoisk") !== "" && Number.isFinite(kpRating) ? { rating_kinopoisk: kpRating } : {}),
    ...(read("ratingImdb") !== "" && Number.isFinite(imdbRating) ? { rating_imdb: imdbRating } : {}),
    imdb_id: imdbId,
    director: read("director"),
    writer: read("writer"),
    actors: read("actors"),
    runtime: read("runtime"),
    language: read("language"),
    awards: read("awards"),
    rated: read("rated"),
    metascore: read("metascore"),
  };
  for (const [key, value] of Object.entries(optionalFields)) {
    if (value !== "" && value !== undefined) candidateProperties[key] = value;
  }

  await app.fileManager.processFrontMatter(file, (fm) => {
    for (const [key, value] of Object.entries(candidateProperties)) {
      const current = fm[key];
      const isMissing = current === undefined || current === null || current === "";
      if (isMissing) fm[key] = value;
    }
    // Ratings are the one intentional exception: always refresh them from the current providers.
    if (ratings.length) fm.ratings = ratings;
  });

  const current = await app.vault.read(file);
  let next = current;
  const start = "<!-- biblioteka:ratings:start -->";
  const end = "<!-- biblioteka:ratings:end -->";
  if (ratings.length) {
    const block = [start, "## Ratings", "", renderRatingsTable(ratings), end].join("\n");
    const startIndex = next.indexOf(start);
    const endIndex = next.indexOf(end);
    if (startIndex >= 0 && endIndex > startIndex) {
      next = next.slice(0, startIndex) + block + next.slice(endIndex + end.length);
    } else {
      next = `${next.trimEnd()}\n\n${block}\n`;
    }
  }

  const description = read("description");
  if (description) {
    const body = next.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
    const meaningfulBody = body
      .replace(/^# .*$/m, "")
      .replace(/!\[\[[^\]]+\]\]/g, "")
      .replace(/\[Kinopoisk\]\([^\)]+\)/g, "")
      .replace(/<!-- biblioteka:ratings:start -->[\s\S]*?<!-- biblioteka:ratings:end -->/g, "")
      .trim();
    if (!meaningfulBody) {
      const heading = `# ${read("title")}\n`;
      const headingIndex = next.indexOf(heading);
      if (headingIndex >= 0) {
        const insertAt = headingIndex + heading.length;
        next = `${next.slice(0, insertAt)}\n${description}\n${next.slice(insertAt)}`;
      } else {
        next = `${next.trimEnd()}\n\n${description}\n`;
      }
    }
  }

  if (next !== current) await app.vault.modify(file, next);
}

async function findDuplicateNotes(
  app: App,
  kinopoiskId: number,
  title: string,
  year: number,
  mediaType: string,
): Promise<DuplicateMatch[]> {
  const titleKey = normalizeDuplicateTitle(title);
  const typeKey = normalizeMediaType(mediaType);
  const matches: DuplicateMatch[] = [];

  for (const file of app.vault.getMarkdownFiles()) {
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) continue;

    const existingId = String(frontmatter.kinopoisk_id ?? "").trim();
    if (existingId && existingId === String(kinopoiskId)) {
      matches.push({ file, reason: `Same Kinopoisk ID: ${kinopoiskId}` });
      continue;
    }

    const existingTitle = normalizeDuplicateTitle(String(frontmatter.title ?? file.basename));
    const existingYear = Number(frontmatter.year);
    const existingType = normalizeMediaType(String(frontmatter.type ?? ""));

    if (
      titleKey &&
      existingTitle === titleKey &&
      year > 0 &&
      existingYear === year &&
      typeKey !== "" &&
      existingType === typeKey
    ) {
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
  if (/movie|film/.test(normalized)) return "movie";
  if (/series/.test(normalized)) return "series";
  if (/tv show/.test(normalized)) return "tv show";
  return normalized;
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


async function ensureVaultFolder(app: App, folderPath: string): Promise<void> {
  const parts = folderPath.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

function renderFileNameTemplate(template: string, title: string, year: string): string {
  return template
    .replace(/{{\\s*title\\s*}}/gi, title)
    .replace(/{{\\s*year\\s*}}/gi, year)
    .replace(/{{[^{}]+}}/g, "")
    .replace(/\\s+/g, " ")
    .trim();
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[\/:*?"<>|#^\[\]\\]/g, "")
    .replace(/[. ]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 100);
}

function splitList(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function yamlValue(value: unknown): string {
  return JSON.stringify(value) ?? "null";
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred.";
}
