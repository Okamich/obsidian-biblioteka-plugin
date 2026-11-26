import { App, Modal, TFile } from "obsidian";
import { DuplicateMatch } from "../services/duplicate-service";

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
