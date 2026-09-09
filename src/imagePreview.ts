const REVISION_PARAMETER = "openview-revision";

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
