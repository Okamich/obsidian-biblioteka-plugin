import { AbstractInputSuggest, App, Plugin, PluginSettingTab, Setting, SettingGroup, TFolder } from "obsidian";
import { MovieField, MovieProviderId } from "../models/movie";
import { BibliotekaSettings, MOVIE_FIELD_DEFAULTS, MOVIE_FIELD_LABELS, MOVIE_FIELD_ORDER } from "../settings";
import { renderApiSettings } from "./api-settings-view";

export interface SettingsPlugin extends Plugin {
  settings: BibliotekaSettings;
  saveSettings(): Promise<void>;
}

export class BibliotekaSettingTab extends PluginSettingTab {
  plugin: SettingsPlugin;

  constructor(app: App, plugin: SettingsPlugin) {
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

    renderApiSettings(containerEl, this.plugin);

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

