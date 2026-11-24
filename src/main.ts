import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  requestUrl,
} from "obsidian";
import {
  KinopoiskProvider,
  KinopoiskSearchItem,
  KinopoiskDetails,
  MediaKind,
} from "./providers/kinopoisk";

interface BibliotekaSettings {
  defaultMediaFolder: string;
  kinopoiskApiKey: string;
  sfwFilter: boolean;
}

const DEFAULT_SETTINGS: BibliotekaSettings = {
  defaultMediaFolder: "Media",
  kinopoiskApiKey: "",
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

    this.addSettingTab(new BibliotekaSettingTab(this.app, this));
    console.log("Biblioteka loaded");
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

    new Setting(containerEl)
      .setName("Default media folder")
      .setDesc("Vault folder used for generated media notes.")
      .addText((text) =>
        text
          .setPlaceholder("Media")
          .setValue(this.plugin.settings.defaultMediaFolder)
          .onChange(async (value) => {
            this.plugin.settings.defaultMediaFolder = value.trim() || "Media";
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl("h3", { text: "Content filtering" });
    new Setting(containerEl)
      .setName("SFW filter")
      .setDesc("Hide explicitly pornographic and adult content. Ordinary 18+ movies remain visible.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.sfwFilter)
          .onChange(async (value) => {
            this.plugin.settings.sfwFilter = value;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl("h3", { text: "Providers" });
    new Setting(containerEl)
      .setName("Kinopoisk API key")
      .setDesc("Your personal API token. It is stored in plugin settings, not in media notes.")
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
        button
          .setButtonText("Get API key")
          .onClick(() => {
            window.open("https://kinopoiskapiunofficial.tech/", "_blank");
          }),
      );

    new Setting(containerEl)
      .setName("Connection")
      .setDesc("Send a small test search request to verify the API key.")
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
      this.showPreview(details);
    } catch (error) {
      new Notice(`Could not load media details: ${getErrorMessage(error)}`);
      selectButton.disabled = false;
      selectButton.setText("Select");
    }
  }

  private showPreview(details: KinopoiskDetails): void {
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

    addField("title", "Title", details.nameRu || details.nameEn || details.nameOriginal || "");
    addField("originalTitle", "Original title", details.nameOriginal || details.nameEn || "");
    addField("year", "Year", details.year ? String(details.year) : "");
    addField("description", "Description", details.description || details.shortDescription || "", true);
    addField("genres", "Genres (comma-separated)", (details.genres ?? []).map((x) => x.genre).filter(Boolean).join(", "));
    addField("countries", "Countries (comma-separated)", (details.countries ?? []).map((x) => x.country).filter(Boolean).join(", "));
    addField("ratingKinopoisk", "Kinopoisk rating", details.ratingKinopoisk == null ? "" : String(details.ratingKinopoisk));
    addField("ratingImdb", "IMDb rating", details.ratingImdb == null ? "" : String(details.ratingImdb));
    addField("kinopoiskId", "Kinopoisk ID", String(details.kinopoiskId));
    addField("imdbId", "IMDb ID", details.imdbId || "");

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
    createButton.addEventListener("click", () => void this.createNote(details, posterUrl, fields, createButton));
  }

  private async createNote(
    details: KinopoiskDetails,
    posterUrl: string,
    fields: Record<string, HTMLInputElement | HTMLTextAreaElement>,
    button: HTMLButtonElement,
  ): Promise<void> {
    const read = (key: string): string => fields[key]?.value.trim() ?? "";
    const title = read("title");
    if (!title) {
      new Notice("A title is required to create a note.");
      fields.title?.focus();
      return;
    }

    button.disabled = true;
    button.setText("Creating…");
    try {
      const folder = this.plugin.settings.defaultMediaFolder.trim().replace(/^\\/+|\\/+$/g, "") || "Media";
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

      const properties: Record<string, string | number | string[]> = {
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
      if (localPosterPath) properties.poster = localPosterPath;

      const frontmatter = Object.entries(properties)
        .map(([key, value]) => `${key}: ${yamlValue(value)}`)
        .join("\\n");
      const body = [
        `# ${title}`,
        localPosterPath ? `![[${localPosterPath}]]` : "",
        read("description"),
        "",
        details.webUrl ? `[Kinopoisk](${details.webUrl})` : "",
      ].filter((line, index, array) => line !== "" || (index > 0 && array[index - 1] !== "")).join("\\n");
      const content = `---\\n${frontmatter}\\n---\\n\\n${body.trim()}\\n`;

      const baseName = sanitizeFileName(title) || `media-${details.kinopoiskId}`;
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

function sanitizeFileName(value: string): string {
  return value
    .replace(/[\\\\/:*?"<>|#^\\[\\]]/g, "")
    .replace(/[. ]+$/g, "")
    .replace(/\\s+/g, " ")
    .slice(0, 100);
}

function splitList(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function yamlValue(value: string | number | string[]): string {
  return JSON.stringify(value);
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
