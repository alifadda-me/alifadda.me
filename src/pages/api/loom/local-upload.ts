import type { APIRoute } from "astro";
import fs from "node:fs/promises";
import path from "node:path";
import { isAuthorized } from "@/utils/auth";

export const prerender = false;

export const PUT: APIRoute = async ({ request, url }) => {
	// 1. Authorization check
	const headerKey = request.headers.get("x-record-key");
	if (!isAuthorized(headerKey)) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	const key = url.searchParams.get("key");
	if (!key) {
		return new Response(JSON.stringify({ error: "Missing key" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	// 2. Strict Path Traversal Prevention
	const baseDir = path.resolve(process.cwd(), "public/loom-uploads");
	const sanitizedSubpath = path.normalize(key).replace(/^(\.\.[\/\\])+/, "");
	const targetFilePath = path.resolve(baseDir, sanitizedSubpath);

	if (!targetFilePath.startsWith(baseDir + path.sep)) {
		return new Response(JSON.stringify({ error: "Access Denied: Path traversal detected" }), {
			status: 403,
			headers: { "Content-Type": "application/json" },
		});
	}

	// Only allow media file extensions
	const allowedExtensions = [".webm", ".mp4", ".mov"];
	if (!allowedExtensions.includes(path.extname(targetFilePath).toLowerCase())) {
		return new Response(JSON.stringify({ error: "Invalid file type" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const arrayBuffer = await request.arrayBuffer();
		const targetDir = path.dirname(targetFilePath);
		await fs.mkdir(targetDir, { recursive: true });
		await fs.writeFile(targetFilePath, new Uint8Array(arrayBuffer));

		return new Response(JSON.stringify({ success: true, key }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		console.error("Local upload write error:", err);
		return new Response(JSON.stringify({ error: "Local upload failed" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
