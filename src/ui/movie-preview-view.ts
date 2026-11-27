import { MovieRecord } from "../models/movie";
import type { BibliotekaSettings } from "../settings";

export type MoviePreviewFields = Record<
  string,
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
>;

export interface MoviePreviewCallbacks {
  onBack: () => void;
  onCreate: (
    posterUrl: string,
    fields: MoviePreviewFields,
    button: HTMLButtonElement,
  ) => void;
}

export function renderMoviePreview(
  container: HTMLElement,
  record: MovieRecord,
  settings: BibliotekaSettings,
  callbacks: MoviePreviewCallbacks,
): void {
  const preview = container.createDiv({ cls: "biblioteka-preview" });
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
      const providerName = getProviderName(candidate.source);
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

  const fields: MoviePreviewFields = {};
  const addField = (key: string, label: string, value: string, multiline = false): void => {
    const field = preview.createDiv({ cls: "biblioteka-preview-field" });
    const source = record.fieldSources[key as keyof typeof record.fieldSources];
    const sourceLabel = source ? ` · ${getProviderName(source)}` : "";
    field.createEl("label", { text: label + sourceLabel });
    const control = multiline
      ? field.createEl("textarea", { cls: "biblioteka-preview-input" })
      : field.createEl("input", { cls: "biblioteka-preview-input" });
    control.value = value;
    if (multiline) (control as HTMLTextAreaElement).rows = 4;
    fields[key] = control;
  };

  addField("title", "Title", record.title);
  if (settings.movieFields.originalTitle.enabled) addField("originalTitle", "Original title", record.originalTitle);
  if (settings.movieFields.year.enabled) addField("year", "Year", record.year == null ? "" : String(record.year));
  if (settings.movieFields.genres.enabled) addField("genres", "Genres (comma-separated)", record.genres.join(", "));
  if (settings.movieFields.countries.enabled) addField("countries", "Production countries (comma-separated)", record.countries.join(", "));
  if (settings.movieFields.plot.enabled) addField("plot", "Plot", record.plot, true);
  if (settings.movieFields.director.enabled) addField("director", "Director (comma-separated)", record.director.join(", "));
  if (settings.movieFields.writer.enabled) addField("writer", "Writer (comma-separated)", record.writer.join(", "));
  if (settings.movieFields.duration.enabled) addField("duration", "Duration (minutes)", record.duration == null ? "" : String(record.duration));
  if (settings.movieFields.studio.enabled) addField("studio", "Studio (comma-separated)", record.studio.join(", "));
  if (settings.movieFields.actors.enabled) addField("actors", "Starring (comma-separated)", record.actors.join(", "));

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
    .map(([source, id]) => `${getProviderName(source)}: ${id}`);
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
  backButton.addEventListener("click", callbacks.onBack);

  const createButton = actions.createEl("button", { text: "Create note", cls: "mod-cta" });
  createButton.addEventListener("click", () => callbacks.onCreate(selectedPoster, fields, createButton));
}

function getProviderName(source: string): string {
  return source === "kinopoisk" ? "Kinopoisk" : source === "omdb" ? "OMDb" : "TMDB";
}
