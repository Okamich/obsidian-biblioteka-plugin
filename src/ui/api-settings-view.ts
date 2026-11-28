import { Notice, Setting, SettingGroup } from "obsidian";
import { KinopoiskProvider } from "../providers/kinopoisk";
import { OMDbProvider } from "../providers/omdb";
import { TMDBProvider } from "../providers/tmdb";
import { SettingsPlugin } from "./settings-tab";

export function renderApiSettings(containerEl: HTMLElement, plugin: SettingsPlugin): void {
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
            .setValue(plugin.settings.kinopoiskApiKey)
            .onChange(async (value) => {
              plugin.settings.kinopoiskApiKey = value.trim();
              await plugin.saveSettings();
            });
        })
        .addButton((button) =>
          button.setButtonText("Get API key").onClick(() => {
            window.open("https://kinopoiskapiunofficial.tech/", "_blank");
          }),
        )
        .addButton((button) =>
          button.setButtonText("Test connection").onClick(async () => {
            const key = plugin.settings.kinopoiskApiKey.trim();
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
              new Notice(`Kinopoisk connection failed: ${error instanceof Error ? error.message : "An unexpected error occurred."}`);
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
            .setValue(plugin.settings.omdbApiKey)
            .onChange(async (value) => {
              plugin.settings.omdbApiKey = value.trim();
              await plugin.saveSettings();
            });
        })
        .addButton((button) =>
          button.setButtonText("Get API key").onClick(() => {
            window.open("https://www.omdbapi.com/apikey.aspx", "_blank");
          }),
        )
        .addButton((button) =>
          button.setButtonText("Test connection").onClick(async () => {
            const key = plugin.settings.omdbApiKey.trim();
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
              new Notice(`OMDb connection failed: ${error instanceof Error ? error.message : "An unexpected error occurred."}`);
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
            .setValue(plugin.settings.tmdbApiKey)
            .onChange(async (value) => {
              plugin.settings.tmdbApiKey = value.trim();
              await plugin.saveSettings();
            });
        })
        .addButton((button) =>
          button.setButtonText("Get API key").onClick(() => {
            window.open("https://www.themoviedb.org/settings/api", "_blank");
          }),
        )
        .addButton((button) =>
          button.setButtonText("Test connection").onClick(async () => {
            const key = plugin.settings.tmdbApiKey.trim();
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
              new Notice(`TMDB connection failed: ${error instanceof Error ? error.message : "An unexpected error occurred."}`);
            } finally {
              button.setButtonText("Test connection");
              button.setDisabled(false);
            }
          }),
        );
}
