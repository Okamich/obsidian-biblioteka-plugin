import { App, Plugin, Setting, SettingGroup } from "obsidian";
import { MovieProviderId } from "../models/movie";
import { BibliotekaSettings, MOVIE_FIELD_DEFAULTS, MOVIE_FIELD_LABELS, MOVIE_FIELD_ORDER } from "../settings";

export interface SettingsPlugin extends Plugin {
  settings: BibliotekaSettings;
  saveSettings(): Promise<void>;
}

export function renderMovieSettings(containerEl: HTMLElement, app: App, plugin: SettingsPlugin): void {
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
        .setValue(plugin.settings.moviesFolder)
        .onChange(async (value) => {
          plugin.settings.moviesFolder = value.trim() || "Media/Movies";
          await plugin.saveSettings();
        });
      new FolderSuggest(app, text.inputEl);
    });

  moviesSection.createEl("h4", { text: "File name", cls: "biblioteka-settings-subheading" });
  new Setting(moviesSection)
    .setName("File name format")
    .setDesc("Available variables: {{title}} and {{year}}. Default: {{title}} {{year}}.")
    .addText((text) =>
      text
        .setPlaceholder("{{title}} {{year}}")
        .setValue(plugin.settings.movieFileNameTemplate)
        .onChange(async (value) => {
          plugin.settings.movieFileNameTemplate = value.trim() || "{{title}} {{year}}";
          await plugin.saveSettings();
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
    for (const providerId of plugin.settings.providerOrder) {
      const label = providerId === "kinopoisk" ? "Kinopoisk" : providerId === "omdb" ? "OMDb" : "TMDB";
      const enabled = plugin.settings.enabledProviders[providerId];
      const row = providerRows.createDiv({ cls: "biblioteka-provider-row" });
      row.draggable = true;
      const handle = row.createSpan({ text: "☰", cls: "biblioteka-provider-handle" });
      handle.setAttribute("aria-label", "Drag to reorder");
      row.createSpan({ text: label, cls: "biblioteka-provider-name" });
      const toggle = row.createEl("input", { attr: { type: "checkbox" } });
      toggle.checked = enabled;
      toggle.setAttribute("aria-label", `Enable ${label}`);
      toggle.addEventListener("change", async () => {
        plugin.settings.enabledProviders[providerId] = toggle.checked;
        await plugin.saveSettings();
        renderProviderRows();
      });
      const up = row.createEl("button", { text: "↑", cls: "biblioteka-provider-move" });
      up.setAttribute("aria-label", `Move ${label} up`);
      up.disabled = plugin.settings.providerOrder[0] === providerId;
      up.addEventListener("click", () => void moveProvider(providerId, -1));
      const down = row.createEl("button", { text: "↓", cls: "biblioteka-provider-move" });
      down.setAttribute("aria-label", `Move ${label} down`);
      down.disabled = plugin.settings.providerOrder[plugin.settings.providerOrder.length - 1] === providerId;
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
        const order = [...plugin.settings.providerOrder];
        const from = order.indexOf(dragged);
        const to = order.indexOf(providerId);
        if (from < 0 || to < 0) return;
        order.splice(from, 1);
        order.splice(to, 0, dragged);
        plugin.settings.providerOrder = order;
        void plugin.saveSettings().then(renderProviderRows);
      });
    }
  };
  const moveProvider = async (providerId: MovieProviderId, direction: -1 | 1): Promise<void> => {
    const order = [...plugin.settings.providerOrder];
    const from = order.indexOf(providerId);
    const to = from + direction;
    if (to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    plugin.settings.providerOrder = order;
    await plugin.saveSettings();
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
    const fieldSetting = plugin.settings.movieFields[field];
    new Setting(metadataGroup.listEl)
      .setName(MOVIE_FIELD_LABELS[field])
      .addText((text) => text
        .setPlaceholder(MOVIE_FIELD_DEFAULTS[field].property)
        .setValue(fieldSetting.property)
        .onChange(async (value) => {
          plugin.settings.movieFields[field].property = value.trim() || MOVIE_FIELD_DEFAULTS[field].property;
          await plugin.saveSettings();
        }))
      .addToggle((toggle) => toggle
        .setValue(fieldSetting.enabled)
        .onChange(async (value) => {
          plugin.settings.movieFields[field].enabled = value;
          await plugin.saveSettings();
        }));
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
