const REVISION_PARAMETER = "openview-revision";

export interface PreparedMarkdownImages {
  html: string;
  localImagePaths: string[];
}

export function withAssetRevision(url: string, revision: string): string {
  const hashIndex = url.indexOf("#");
  const hash = hashIndex === -1 ? "" : url.slice(hashIndex);
  const urlWithoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = urlWithoutHash.indexOf("?");
  const base = queryIndex === -1 ? urlWithoutHash : urlWithoutHash.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : urlWithoutHash.slice(queryIndex + 1);
  const parameters = new URLSearchParams(query);
  parameters.set(REVISION_PARAMETER, revision);
  return `${base}?${parameters.toString()}${hash}`;
}

export function prepareMarkdownImages(
  html: string,
  revision: string,
): PreparedMarkdownImages {
  const template = document.createElement("template");
  template.innerHTML = html;
  const localImagePaths = new Set<string>();

  template.content.querySelectorAll("img[src]").forEach((image) => {
    const source = image.getAttribute("src");
    if (!source) return;

    try {
      const url = new URL(source);
      if (url.protocol !== "asset:" || url.hostname !== "localhost") return;
      const localPath = decodeURIComponent(url.pathname).replace(/^\/+/, "/");
      localImagePaths.add(localPath);
      image.setAttribute("src", withAssetRevision(source, revision));
    } catch {}
  });

  return {
    html: template.innerHTML,
    localImagePaths: [...localImagePaths],
  };
}
