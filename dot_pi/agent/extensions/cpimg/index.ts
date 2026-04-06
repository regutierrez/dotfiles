/**
 * /cpimg - Browser-assisted image composer for Pi
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOST = hostname() || "localhost";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGES = 10;
const SESSION_TTL_MS = 3 * 60 * 1000;
const MAX_UPLOAD_BODY_SIZE = 50 * 1024 * 1024;
const MAX_JSON_BODY_SIZE = 256 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const STATIC_FILES: Record<string, { file: string; type: string }> = {
	"/": { file: "index.html", type: "text/html; charset=utf-8" },
	"/cpimg": { file: "index.html", type: "text/html; charset=utf-8" },
	"/cpimg/app.js": { file: "app.js", type: "application/javascript; charset=utf-8" },
	"/cpimg/styles.css": { file: "styles.css", type: "text/css; charset=utf-8" },
};

type SessionImage = {
	name: string;
	originalName: string;
	mimeType: string;
	data: string;
	size: number;
};

type Session = {
	token: string;
	promptText: string;
	expiresAt: number;
	images: Map<string, SessionImage>;
	timer: NodeJS.Timeout;
};

type ComposerContent =
	| { type: "text"; text: string }
	| { type: "image"; data: string; mimeType: string };

const sessions = new Map<string, Session>();
let server: Server | null = null;
let port: number | null = null;
let piRef: ExtensionAPI | null = null;
let busy = false;
let clearWidget: (() => void) | null = null;

const token = () => randomBytes(16).toString("hex");
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 50);

function json(res: ServerResponse, status: number, body: unknown) {
	res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(body));
}

function dropSession(sessionToken: string) {
	const session = sessions.get(sessionToken);
	if (!session) return;
	clearTimeout(session.timer);
	sessions.delete(sessionToken);
}

function createSession(promptText: string) {
	const sessionToken = token();
	const expiresAt = Date.now() + SESSION_TTL_MS;
	const timer = setTimeout(() => dropSession(sessionToken), SESSION_TTL_MS);
	timer.unref?.();
	const session: Session = { token: sessionToken, promptText, expiresAt, images: new Map(), timer };
	sessions.set(sessionToken, session);
	return session;
}

function getSession(sessionToken?: string) {
	if (!sessionToken) return { status: 404, error: "Missing session token" };
	const session = sessions.get(sessionToken);
	if (!session) return { status: 404, error: "Session not found" };
	if (Date.now() >= session.expiresAt) {
		dropSession(sessionToken);
		return { status: 410, error: "Session expired" };
	}
	return { session };
}

function nextImageName(session: Session) {
	let i = 1;
	while (session.images.has(`img-${i}`)) i++;
	return `img-${i}`;
}

async function readJson(req: IncomingMessage, limit: number) {
	return new Promise<any>((resolve, reject) => {
		const chunks: Buffer[] = [];
		let total = 0;
		req.on("data", (chunk) => {
			const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			total += part.length;
			if (total > limit) {
				reject(new Error("Too large"));
				req.destroy();
				return;
			}
			chunks.push(part);
		});
		req.on("end", () => {
			try {
				const raw = Buffer.concat(chunks).toString("utf8");
				resolve(raw ? JSON.parse(raw) : {});
			} catch {
				reject(new Error("Invalid JSON"));
			}
		});
		req.on("error", reject);
	});
}

function pushText(content: ComposerContent[], text: string) {
	if (!text) return;
	const last = content.at(-1);
	if (last?.type === "text") last.text += text;
	else content.push({ type: "text", text });
}

function buildContent(promptText: string, images: Map<string, SessionImage>) {
	const content: ComposerContent[] = [];
	const inserted = new Set<string>();
	const refRe = /@([a-zA-Z0-9_-]+)/g;
	let last = 0;
	let match: RegExpExecArray | null;

	while ((match = refRe.exec(promptText))) {
		const name = slug(match[1]);
		const image = images.get(name);
		if (!image || inserted.has(name)) continue;
		pushText(content, promptText.slice(last, match.index));
		pushText(content, `[Image: ${image.originalName}]\n`);
		content.push({ type: "image", data: image.data, mimeType: image.mimeType });
		inserted.add(name);
		last = match.index + match[0].length;
	}

	pushText(content, promptText.slice(last));

	const extra = [...images.values()].filter((image) => !inserted.has(image.name));
	if (!extra.length) return content;
	pushText(content, content.length ? "\n\nAdditional uploaded images:\n" : "Additional uploaded images:\n");
	for (const image of extra) {
		pushText(content, `[${image.originalName}]\n`);
		content.push({ type: "image", data: image.data, mimeType: image.mimeType });
		pushText(content, "\n");
	}
	return content;
}

async function serve(req: IncomingMessage, res: ServerResponse) {
	const url = new URL(req.url || "/", `http://${req.headers.host}`);
	const path = url.pathname;
	const staticFile = STATIC_FILES[path];
	if (staticFile) {
		res.writeHead(200, { "Content-Type": staticFile.type });
		res.end(await readFile(join(__dirname, staticFile.file)));
		return;
	}

	if (req.method === "OPTIONS") {
		res.writeHead(200);
		res.end();
		return;
	}

	const parts = path.split("/").filter(Boolean);
	if (parts[0] !== "api" || parts[1] !== "cpimg" || parts[2] !== "session") {
		res.writeHead(404);
		res.end("Not found");
		return;
	}

	const sessionToken = parts[3];
	const lookup = getSession(sessionToken);
	if (!lookup.session) {
		json(res, lookup.status ?? 404, { error: lookup.error ?? "Session not found" });
		return;
	}
	const session = lookup.session;

	if (req.method === "GET" && parts.length === 4) {
		json(res, 200, {
			promptText: session.promptText,
			expiresAt: session.expiresAt,
			images: [...session.images.values()].map(({ name, originalName, mimeType, size }) => ({ name, originalName, mimeType, size })),
		});
		return;
	}

	if (req.method === "POST" && parts.length === 5 && parts[4] === "upload") {
		try {
			const body = await readJson(req, MAX_UPLOAD_BODY_SIZE);
			const mimeType = String(body.mimeType || "");
			const data = String(body.data || "").replace(/^data:[^;]+;base64,/, "");
			if (!data || !ALLOWED_TYPES.has(mimeType)) return json(res, 400, { error: "Invalid image" });
			if (session.images.size >= MAX_IMAGES) return json(res, 413, { error: "Too many images" });
			const size = Buffer.byteLength(data, "base64");
			if (size > MAX_FILE_SIZE) return json(res, 413, { error: "File too large" });
			const name = nextImageName(session);
			const image: SessionImage = {
				name,
				originalName: String(body.originalName || name),
				mimeType,
				data,
				size,
			};
			session.images.set(name, image);
			json(res, 200, { success: true, image: { name, originalName: image.originalName, mimeType, size } });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Upload failed";
			json(res, message === "Too large" ? 413 : 400, { error: message });
		}
		return;
	}

	if (req.method === "DELETE" && parts.length === 6 && parts[4] === "upload") {
		session.images.delete(parts[5]);
		json(res, 200, { success: true });
		return;
	}

	if (req.method === "POST" && parts.length === 5 && parts[4] === "submit") {
		try {
			const body = await readJson(req, MAX_JSON_BODY_SIZE);
			const promptText = String(body.promptText ?? session.promptText ?? "");
			for (const [, ref] of promptText.matchAll(/@([a-zA-Z0-9_-]+)/g)) {
				if (!session.images.has(slug(ref))) return json(res, 400, { error: `Unknown: @${slug(ref)}` });
			}
			if (!piRef) return json(res, 503, { error: "Pi session is no longer available" });
			const content = buildContent(promptText, session.images);
			piRef.sendUserMessage(content, busy ? { deliverAs: "followUp" } : undefined);
			clearWidget?.();
			clearWidget = null;
			dropSession(sessionToken);
			json(res, 200, { success: true });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Submit failed";
			json(res, message === "Too large" ? 413 : 500, { error: message });
		}
		return;
	}

	res.writeHead(404);
	res.end("Not found");
}

async function getServerUrl() {
	if (server && port) return `http://${HOST}:${port}`;
	server = createServer((req, res) => void serve(req, res));
	await new Promise<void>((resolve) => {
		server!.listen(0, "0.0.0.0", () => {
			const address = server!.address();
			if (address && typeof address === "object") port = address.port;
			resolve();
		});
	});
	return `http://${HOST}:${port}`;
}

async function closeServer() {
	if (!server) return;
	const current = server;
	server = null;
	port = null;
	await new Promise<void>((resolve) => current.close(() => resolve()));
}

export default function (pi: ExtensionAPI) {
	piRef = pi;
	pi.on("session_start", () => { busy = false; });
	pi.on("agent_start", () => { busy = true; });
	pi.on("agent_end", () => { busy = false; });

	pi.registerCommand("cpimg", {
		description: "Browser-based image composer",
		handler: async (args, ctx) => {
			const session = createSession(args.trim());
			const url = `${await getServerUrl()}/cpimg?t=${session.token}`;
			if (ctx.hasUI) {
				ctx.ui.setWidget("cpimg", [`Open: ${url}`]);
				clearWidget = () => ctx.ui.setWidget("cpimg", undefined);
			}
		},
	});

	pi.on("session_shutdown", async () => {
		busy = false;
		clearWidget?.();
		clearWidget = null;
		for (const key of [...sessions.keys()]) dropSession(key);
		await closeServer();
		piRef = null;
	});
}
