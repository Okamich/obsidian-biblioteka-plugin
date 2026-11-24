import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
} from "obsidian";
import {
  KinopoiskProvider,
  KinopoiskSearchItem,
  MediaKind,
} from "./providers/kinopoisk";

interface BibliotekaSettings {
  defaultMediaFolder: string;
  kinopoiskApiKey: string;
}

const DEFAULT_SETTINGS: BibliotekaSettings = {
  defaultMediaFolder: "Media",
  kinopoiskApiKey: "",
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

    const controls = contentEl.createDiv({ cls: "biblioteka-search-controls" });
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
      const items = (response.films ?? []).filter((item) => matchesKind(item, kind));

      this.resultsEl.empty();
      if (items.length === 0) {
        this.resultsEl.createEl("p", { text: "No matching titles found." });
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
    selectButton.addEventListener("click", () => {
      new Notice(
        `Selected: ${item.nameRu || item.nameEn || "Untitled"} (Kinopoisk ID: ${item.filmId}). Note creation is the next development step.`,
      );
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
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
