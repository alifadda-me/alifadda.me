import type { APIRoute } from "astro";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "node:fs/promises";
import path from "node:path";
import { isAuthorized } from "@/utils/auth";
import { isR2Configured, getR2Client, getBucketName } from "@/utils/r2";
import { getClientIp, isIpBlockedFromAuth, recordFailedAuth } from "@/utils/rateLimiter";

export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
	const ip = getClientIp(request);

	const lockStatus = isIpBlockedFromAuth(ip);
	if (lockStatus.blocked) {
		return new Response(
			JSON.stringify({ error: `Too many attempts. Locked out for ${lockStatus.retryAfterSeconds}s.` }),
			{ status: 429, headers: { "Content-Type": "application/json" } },
		);
	}

	const headerKey = request.headers.get("x-record-key");
	if (!isAuthorized(headerKey)) {
		recordFailedAuth(ip);
		return new Response(
			JSON.stringify({ error: "Unauthorized: Invalid or missing X-Record-Key" }),
			{ status: 401, headers: { "Content-Type": "application/json" } },
		);
	}

	const key = url.searchParams.get("key");
	const videoId = url.searchParams.get("videoId");

	if (!key || !videoId) {
		return new Response(
			JSON.stringify({ error: "Missing key or videoId query parameter" }),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
	}

	// Validate key safety: must be under videos/ or audios/ and only contain safe alphanumeric, dash, and media extension
	const safeKeyPattern = /^(videos|audios)\/[a-zA-Z0-9_-]+\.(webm|mp4|aac|ogg)$/;
	if (!safeKeyPattern.test(key)) {
		return new Response(
			JSON.stringify({ error: "Invalid key format" }),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
	}

	try {
		const arrayBuffer = await request.arrayBuffer();
		if (!arrayBuffer || arrayBuffer.byteLength === 0) {
			return new Response(
				JSON.stringify({ error: "Empty upload payload" }),
				{ status: 400, headers: { "Content-Type": "application/json" } },
			);
		}

		const binaryData = new Uint8Array(arrayBuffer);
		const contentType = request.headers.get("content-type") || "video/webm";

		if (isR2Configured()) {
			// Upload directly to Cloudflare R2 via server-side credentials
			const client = getR2Client();
			await client.send(
				new PutObjectCommand({
					Bucket: getBucketName(),
					Key: key,
					Body: binaryData,
					ContentType: contentType,
				}),
			);
		} else {
			// Local development fallback
			const baseDir = path.resolve(process.cwd(), "public/loom-uploads");
			const targetFilePath = path.resolve(baseDir, key);
			if (!targetFilePath.startsWith(baseDir + path.sep)) {
				return new Response(
					JSON.stringify({ error: "Access Denied" }),
					{ status: 403, headers: { "Content-Type": "application/json" } },
				);
			}

			await fs.mkdir(path.dirname(targetFilePath), { recursive: true });
			await fs.writeFile(targetFilePath, binaryData);
		}

		return new Response(
			JSON.stringify({ success: true, key, videoId }),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	} catch (err) {
		console.error("[Proxy Upload] Error uploading video:", err);
		return new Response(
			JSON.stringify({
				error: "Proxy upload failed: " + (err instanceof Error ? err.message : String(err)),
			}),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);
	}
};
