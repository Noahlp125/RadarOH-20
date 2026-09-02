import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_RESPONSE_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;
const MAX_ITEMS = 50;

export type RadarConnector = "rss" | "json_api" | "web";

export type MonitorItem = {
  itemKey: string;
  title: string;
  url: string;
  publishedAt: Date | null;
  normalizedText: string;
  rawPayload: Record<string, unknown>;
};

export type MonitorFetchResult = {
  httpStatus: number;
  contentType: string;
  items: MonitorItem[];
};

export class SourceFetchError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = "SourceFetchError";
  }
}

export async function fetchSource(
  connector: RadarConnector,
  endpointUrl: string,
): Promise<MonitorFetchResult> {
  const response = await requestPublicUrl(endpointUrl);
  const body = response.body;
  const contentType = response.contentType;
  const items =
    connector === "rss"
      ? parseRss(body, endpointUrl)
      : connector === "json_api"
        ? parseJsonApi(body, endpointUrl)
        : parseWebPage(body, endpointUrl);

  if (!items.length) {
    throw new SourceFetchError(
      `La fuente respondió ${response.status}, pero no produjo elementos normalizables.`,
      false,
      response.status,
    );
  }

  return { httpStatus: response.status, contentType, items: items.slice(0, MAX_ITEMS) };
}

type SafeResponse = {
  status: number;
  contentType: string;
  body: string;
};

async function requestPublicUrl(input: string): Promise<SafeResponse> {
  let current = input;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const target = await resolvePublicHttpUrl(current);
    const response = await fetchValidated(target.url);
    if (response.status >= 300 && response.status < 400) {
      if (!response.location || redirect === MAX_REDIRECTS) {
        throw new SourceFetchError("La fuente superó el límite de redirecciones.", false, response.status);
      }
      current = new URL(response.location, target.url).toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new SourceFetchError(
        `La fuente respondió con HTTP ${response.status}.`,
        response.status === 408 || response.status === 429 || response.status >= 500,
        response.status,
      );
    }
    return {
      status: response.status,
      contentType: response.contentType,
      body: response.body,
    };
  }
  throw new SourceFetchError("No se pudo resolver la fuente.", false);
}

type ResolvedTarget = {
  url: URL;
  address: string;
  family: 4 | 6;
};

async function resolvePublicHttpUrl(input: string): Promise<ResolvedTarget> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SourceFetchError("El endpoint no es una URL válida.", false);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new SourceFetchError("Solo se permiten endpoints HTTP o HTTPS.", false);
  }
  if (url.username || url.password) {
    throw new SourceFetchError("No se permiten credenciales embebidas en la URL.", false);
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    throw new SourceFetchError("No se permiten endpoints locales.", false);
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) as 4 | 6 }]
    : await lookup(hostname, { all: true }).catch(() => {
        throw new SourceFetchError("No se pudo resolver el dominio de la fuente.", true);
      });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new SourceFetchError("El endpoint resuelve a una red privada o reservada.", false);
  }
  const selected = addresses.find(({ family }) => family === 4) ?? addresses[0];
  return { url, address: selected.address, family: selected.family as 4 | 6 };
}

async function fetchValidated(url: URL): Promise<SafeResponse & { location: string }> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "application/rss+xml, application/atom+xml, application/json, text/html;q=0.9, */*;q=0.5",
        "user-agent": "RadarOH-Monitor/1.0 (+public-source-check)",
      },
    });
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new SourceFetchError("La respuesta supera el límite permitido de 512 KB.", false, response.status);
        }
        chunks.push(value);
      }
    }
    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      location: response.headers.get("location") ?? "",
      body: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8"),
    };
  } catch (error) {
    if (error instanceof SourceFetchError) throw error;
    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new SourceFetchError(
      timedOut ? "La fuente agotó el tiempo de espera." : "No se pudo conectar con la fuente pública.",
      true,
    );
  } finally {
    clearTimeout(deadline);
  }
}

function isPrivateAddress(address: string): boolean {
  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function parseRss(xml: string, endpointUrl: string): MonitorItem[] {
  const blocks =
    xml.match(/<item\b[\s\S]*?<\/item>/gi) ??
    xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ??
    [];
  return blocks.map((block, index) => {
    const title = extractTag(block, "title");
    const link =
      extractTag(block, "link") ||
      decodeEntities(block.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1] ?? "");
    const summary =
      extractTag(block, "description") ||
      extractTag(block, "summary") ||
      extractTag(block, "content");
    const published =
      extractTag(block, "pubDate") ||
      extractTag(block, "published") ||
      extractTag(block, "updated");
    const guid = extractTag(block, "guid") || extractTag(block, "id");
    const absoluteLink = safeAbsoluteUrl(link, endpointUrl);
    const normalizedText = normalizeText([title, summary].filter(Boolean).join(" "));
    const itemKey = guid || absoluteLink || stableHash(`${title}|${published}|${index}`);
    return {
      itemKey: itemKey.slice(0, 500),
      title: title || "Elemento sin título",
      url: absoluteLink,
      publishedAt: parseDate(published),
      normalizedText,
      rawPayload: { title, link: absoluteLink, summary, published, guid },
    };
  });
}

function parseJsonApi(body: string, endpointUrl: string): MonitorItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new SourceFetchError("La respuesta no contiene JSON válido.", false);
  }
  const root = asRecord(parsed);
  const collection = Array.isArray(parsed)
    ? parsed
    : [root.items, root.results, root.data].find(Array.isArray) ?? [parsed];
  return collection.slice(0, MAX_ITEMS).map((value, index) => {
    const item = asRecord(value);
    const title = firstString(item.title, item.name, item.headline) || `Elemento ${index + 1}`;
    const url = safeAbsoluteUrl(firstString(item.url, item.link), endpointUrl);
    const published = firstString(item.published_at, item.publishedAt, item.date, item.updated_at, item.updatedAt);
    const summary = firstString(item.summary, item.description, item.excerpt, item.content, item.text);
    const itemKey = firstString(item.id, item.guid, item.slug, item.key) || url || stableHash(`${title}|${index}`);
    return {
      itemKey: itemKey.slice(0, 500),
      title,
      url,
      publishedAt: parseDate(published),
      normalizedText: normalizeText([title, summary].filter(Boolean).join(" ")),
      rawPayload: item,
    };
  });
}

function parseWebPage(html: string, endpointUrl: string): MonitorItem[] {
  const title = extractTag(html, "title") || new URL(endpointUrl).hostname;
  const description =
    decodeEntities(
      html.match(/<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)["']/i)?.[1] ??
      html.match(/<meta\b[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["'](?:description|og:description)["']/i)?.[1] ??
      "",
    );
  const normalizedText = normalizeText(html).slice(0, 25_000);
  return [{
    itemKey: `page:${new URL(endpointUrl).origin}${new URL(endpointUrl).pathname}`,
    title,
    url: endpointUrl,
    publishedAt: null,
    normalizedText: normalizeText([title, description, normalizedText].join(" ")),
    rawPayload: {
      title,
      description,
      excerpt: normalizedText.slice(0, 2_000),
    },
  }];
}

function extractTag(input: string, tag: string): string {
  const match = input.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeEntities(stripTags(match?.[1] ?? "")).trim();
}

function stripTags(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function normalizeText(value: string): string {
  return decodeEntities(stripTags(value)).replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity: string) => {
    if (entity.startsWith("#")) {
      const hex = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    return entities[entity.toLowerCase()] ?? "";
  });
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeAbsoluteUrl(value: string, base: string): string {
  if (!value) return "";
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function firstString(...values: unknown[]): string {
  return values.find((value): value is string => typeof value === "string") ?? "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { value };
}