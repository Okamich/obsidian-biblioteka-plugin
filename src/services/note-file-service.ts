import { App, TFile, requestUrl } from "obsidian";

/** Create each missing folder in a Vault path. */
export async function ensureVaultFolder(app: App, folderPath: string): Promise<void> {
  const parts = folderPath.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
  }
}

/** Download an image into a Vault folder without overwriting an existing file. */
export async function saveRemoteImage(
  app: App,
  url: string,
  folderPath: string,
  fileName: string,
): Promise<string> {
  await ensureVaultFolder(app, folderPath);
  const imagePath = `${folderPath}/${fileName}.${getImageExtension(url)}`;
  if (!app.vault.getAbstractFileByPath(imagePath)) {
    const response = await requestUrl({ url, method: "GET" });
    await app.vault.createBinary(imagePath, response.arrayBuffer);
  }
  return imagePath;
}

/** Create a Markdown note, adding a numeric suffix when its path is already occupied. */
export async function createMarkdownFile(
  app: App,
  folderPath: string,
  baseName: string,
  content: string,
): Promise<{ file: TFile; path: string }> {
  await ensureVaultFolder(app, folderPath);
  let path = `${folderPath}/${baseName}.md`;
  let suffix = 2;
  while (app.vault.getAbstractFileByPath(path)) {
    path = `${folderPath}/${baseName} (${suffix++}).md`;
  }
  const file = await app.vault.create(path, content);
  return { file, path };
}

function getImageExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const match = pathname.match(/\.(jpe?g|png|webp|gif)$/);
    if (match) return match[1] === "jpeg" ? "jpg" : match[1];
  } catch {
    // Fall back to a broadly supported image format.
  }
  return "jpg";
}
