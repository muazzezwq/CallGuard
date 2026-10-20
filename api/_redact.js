// Shared log redaction for serverless API routes.
//
// Error messages from JSON-RPC providers, webhook clients and upstream APIs can
// embed the full request URL, including credentials such as `_rpc_token`.
// Client responses must stay generic; server logs may keep diagnostic value but
// must never record those values. These helpers keep both sides on one policy.

const SECRET_KEY_RE =
  /(?:authorization|api[-_]?key|bearer|token|secret|signature|private[-_]?key|password|passwd|cookie|set-cookie)/i;

const URL_RE = /\bhttps?:\/\/[^\s"'<>]+/gi;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const KEY_VALUE_RE =
  /((?:authorization|api[-_]?key|token|secret|signature|private[-_]?key|password|passwd)\s*[:=]\s*)([^\s,;&]+)/gi;
const CONTROL_RE = /[\u0000-\u001f\u007f]+/g;

function redactUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.username) url.username = "[redacted]";
    if (url.password) url.password = "[redacted]";
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_KEY_RE.test(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

/** Return a single-line, secret-free string suitable for a log entry. */
export function redact(value) {
  let text = value == null ? "" : typeof value === "string" ? value : String(value);
  text = text.replace(URL_RE, redactUrl);
  text = text.replace(BEARER_RE, "Bearer [redacted]");
  text = text.replace(KEY_VALUE_RE, "$1[redacted]");
  text = text.replace(CONTROL_RE, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
}

/** Redact and bound a user-controlled value before logging it. */
export function safeLogValue(value, maxLength = 120) {
  const text = redact(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/** Summarise an error without its stack, URL credentials or upstream body. */
export function errorSummary(error, fallback = "error") {
  if (!error) return fallback;
  const name = typeof error.name === "string" && error.name ? error.name : "Error";
  const code = typeof error.code === "string" && error.code ? ` ${error.code}` : "";
  const message = redact(error.shortMessage || error.reason || error.message || fallback);
  return `${name}${code}: ${message || fallback}`;
}

/** Log a sanitised error summary. */
export function logError(scope, error, fallback = "error") {
  console.error(scope, errorSummary(error, fallback));
}
