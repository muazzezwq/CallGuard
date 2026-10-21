/* The Register form pre-fills this value, so a provider that never edited the
   field stores it verbatim. It is a placeholder, not an endpoint that can be
   called, and it is never linked or pinged. */
const ENDPOINT_PLACEHOLDER_HOST = "your-provider-endpoint.com";

export type EndpointView =
  | { kind: "empty" }
  | { kind: "placeholder"; value: string }
  | { kind: "invalid"; value: string }
  | { kind: "usable"; value: string };

/** Classifies the string returned by ServiceRegistry.getEndpoint. A returned
    value is only useful if it is an http(s) URL that is not the placeholder. */
export function classifyEndpoint(raw: unknown): EndpointView {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "") return { kind: "empty" };
  let host: string;
  let protocol: string;
  try {
    const url = new URL(value);
    host = url.hostname.toLowerCase();
    protocol = url.protocol;
  } catch {
    return { kind: "invalid", value };
  }
  if (protocol !== "http:" && protocol !== "https:") return { kind: "invalid", value };
  if (host === ENDPOINT_PLACEHOLDER_HOST || host.endsWith(`.${ENDPOINT_PLACEHOLDER_HOST}`)) {
    return { kind: "placeholder", value };
  }
  return { kind: "usable", value };
}

/** Everything the panels need to render one endpoint read: the two states of a
    contract read that has no value yet, plus the four value states above. */
export type EndpointState = { kind: "loading" } | { kind: "error" } | EndpointView;

/** Single place that decides which state an endpoint read is in, so the
    Providers and Provider details panels cannot disagree. */
export function endpointState(query: {
  isLoading?: boolean;
  isError?: boolean;
  data?: unknown;
}): EndpointState {
  if (query.isError) return { kind: "error" };
  if (query.isLoading) return { kind: "loading" };
  return classifyEndpoint(query.data);
}

/** The only state that may be rendered as a link. A placeholder, free text or
    an empty value is never linkable, so it can never be pinged by accident. */
export function endpointHref(state: EndpointState): string | null {
  return state.kind === "usable" ? state.value : null;
}
