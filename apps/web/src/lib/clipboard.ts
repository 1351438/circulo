export async function writeTextToClipboard(text: string): Promise<void> {
  const desktop =
    typeof window === "undefined" ? undefined : window.circuloDesktop;
  if (desktop?.writeClipboardText) {
    await desktop.writeClipboardText(text);
    return;
  }

  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard access is not available in this environment.");
  }

  await navigator.clipboard.writeText(text);
}

export async function writeImageToClipboard(dataUrl: string): Promise<void> {
  const desktop =
    typeof window === "undefined" ? undefined : window.circuloDesktop;
  if (desktop?.writeClipboardImage) {
    await desktop.writeClipboardImage(dataUrl);
    return;
  }

  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Image clipboard access is not available in this browser.");
  }

  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("Could not prepare the image to copy.");
  const image = await response.blob();
  await navigator.clipboard.write([
    new ClipboardItem({ [image.type || "image/png"]: image }),
  ]);
}
