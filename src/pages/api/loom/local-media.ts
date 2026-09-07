import type { APIRoute } from "astro";
import fs from "node:fs/promises";
import path from "node:path";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
	const key = url.searchParams.get("key");
	if (!key) {
		return new Response("Missing key", { status: 400 });
	}

	// Strict Path Traversal Prevention
	const baseDir = path.resolve(process.cwd(), "public/loom-uploads");
	const sanitizedSubpath = path.normalize(key).replace(/^(\.\.[\/\\])+/, "");
	const filePath = path.resolve(baseDir, sanitizedSubpath);

	if (!filePath.startsWith(baseDir + path.sep)) {
		return new Response("Forbidden", { status: 403 });
	}

	try {
		const stat = await fs.stat(filePath);
		if (!stat.isFile()) {
			return new Response("Not found", { status: 404 });
		}

		const fileBuffer = await fs.readFile(filePath);
		const ext = path.extname(filePath).toLowerCase();
		const contentType = ext === ".mp4" ? "video/mp4" : "video/webm";

		return new Response(fileBuffer, {
			status: 200,
			headers: {
				"Content-Type": contentType,
				"Accept-Ranges": "bytes",
				"Content-Length": String(fileBuffer.length),
				"Cache-Control": "public, max-age=31536000, immutable",
			},
		});
	} catch {
		return new Response("Media not found", { status: 404 });
	}
};
