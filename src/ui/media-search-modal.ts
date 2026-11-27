import { App, Modal, Notice, Plugin } from "obsidian";
import { MovieField, MovieRecord } from "../models/movie";
import { resolveMovieRecord } from "../providers/movie-resolver";
import { DuplicateWarningModal } from "./duplicate-warning-modal";
import { findDuplicateNotes } from "../services/duplicate-service";
import { createMovieNote, updateExistingMovieNote } from "../services/movie-note-service";
import { BibliotekaSettings, MOVIE_FIELD_DEFAULTS, MOVIE_FIELD_ORDER } from "../settings";
import type { MediaKind } from "../providers/kinopoisk";
import { searchMedia } from "../services/media-search-service";
import type { UnifiedSearchResult } from "../services/media-search-service";

interface MediaSearchPlugin extends Plugin {
  settings: BibliotekaSettings;
}

export class MediaSearchModal extends Modal {
  private readonly plugin: MediaSearchPlugin;
  private resultsEl: HTMLElement;
  private controlsEl: HTMLElement;
  private queryInput: HTMLInputElement;
  private kindSelect: HTMLSelectElement;
  private searchButton: HTMLButtonElement;

  constructor(app: App, plugin: MediaSearchPlugin) {
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
      const { items, failures } = await searchMedia(query, kind, this.plugin.settings);

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
    const values: Record<string, string> = {};
    for (const [key, field] of Object.entries(fields)) {
      values[key] = field.value.trim();
    }
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
          this.plugin.settings.moviesFolder,
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred.";
}
