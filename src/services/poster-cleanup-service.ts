import { Plugin, TFile } from "obsidian";

/**
 * Remove a Biblioteka-managed poster after its note is deleted,
 * but only when no remaining Markdown note references the same file.
 */
export function registerPosterCleanup(plugin: Plugin): void {
  plugin.registerEvent(
    plugin.app.metadataCache.on("deleted", (file, previousCache) => {
      if (!(file instanceof TFile) || file.extension !== "md") return;

      const posterValue = previousCache?.frontmatter?.poster;
      if (typeof posterValue !== "string" || !posterValue.trim()) return;

      void removePosterIfUnused(plugin, file.path, posterValue).catch((error) => {
        console.warn("Biblioteka: could not clean up deleted note poster", error);
      });
    }),
  );
}

async function removePosterIfUnused(
  plugin: Plugin,
  deletedNotePath: string,
  posterValue: string,
): Promise<void> {
  const posterPath = normalizeVaultPath(posterValue);

  // Only manage files stored in a folder explicitly named "_posters".
  if (!posterPath.split("/").includes("_posters")) return;

  const posterFile = plugin.app.vault.getAbstractFileByPath(posterPath);
  if (!(posterFile instanceof TFile)) return;

  for (const note of plugin.app.vault.getMarkdownFiles()) {
    if (note.path === deletedNotePath) continue;

    const cache = plugin.app.metadataCache.getFileCache(note);
    // If any note has no metadata cache yet, prefer leaving an orphan over
    // deleting an image that may still be in use.
    if (!cache) return;

    const referencedPoster = cache.frontmatter?.poster;
    if (
      typeof referencedPoster === "string" &&
      normalizeVaultPath(referencedPoster) === posterPath
    ) {
      return;
    }
  }

  await plugin.app.vault.delete(posterFile);
}

function normalizeVaultPath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}
