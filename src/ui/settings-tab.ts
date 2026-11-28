import { App, Plugin, PluginSettingTab, Setting, SettingGroup } from "obsidian";
import { FolderSuggest } from "./folder-suggest";
import { BibliotekaSettings } from "../settings";
import { renderApiSettings } from "./api-settings-view";
import { renderMovieSettings, SettingsPlugin } from "./movie-settings-view";

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
    renderMovieSe
