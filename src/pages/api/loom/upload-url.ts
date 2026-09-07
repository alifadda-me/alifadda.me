import type { APIRoute } from "astro";
import { createVideo } from "@/utils/db";
import { createPresignedUploadUrl } from "@/utils/r2";
import { isAuthorized } from "@/utils/auth";
import { getClientIp, isIpBlockedFromAuth, recordFailedAuth } from "@/utils/rateLimiter";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	const ip = getClientIp(request);

	const lockStatus = isIpBlockedFromAuth(ip);
	if (lockStatus.blocked) {
		return new Response(
			JSON.stringify({ error: `Too many attempts. Locked out for ${lockStatus.retryAfterSeconds}s.` }),
			{ status: 429, headers: { "Content-Type": "application/json" } },
		);
	}

	const headerKey = request.headers.get("x-record-key");

	// Strictly validate admin key from headers
	if (!isAuthorized(headerKey)) {
		recordFailedAuth(ip);
		return new Response(
			JSON.stringify({ error: "Unauthorized: Invalid or missing X-Record-Key" }),
			{
				status: 401,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	try {
		let customTitle = "Recorded Video";
		let clientMime = "video/webm";
		try {
			const body = await request.json();
			if (body?.title && typeof body.title === "string" && body.title.trim()) {
				// Sanitize and limit title length
				customTitle = body.title.trim().slice(0, 150);
			}
			if (body?.mimeType && typeof body.mimeType === "string" && body.mimeType.trim()) {
				clientMime = body.mimeType.trim();
			}
		} catch {
			// No JSON body provided, fallback to defaults
		}

		const isMp4 = clientMime.toLowerCase().includes("mp4");
		const ext = isMp4 ? "mp4" : "webm";
		const standardMime = isMp4 ? "video/mp4" : "video/webm";
		const videoId = crypto.randomUUID();
		const key = `videos/${videoId}.${ext}`;

		// Create record in database in "processing" state with user-provided title
		await createVideo({
			id: videoId,
			title: customTitle,
			storage_path: key,
			duration_seconds: 0,
			status: "processing",
		});

		// Generate presigned PUT upload URL (30 minutes expiry)
		const uploadUrl = await createPresignedUploadUrl(key, standardMime);

		return new Response(
			JSON.stringify({
				videoId,
				uploadUrl,
				key,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			},
		);
	} catch (error) {
		console.error("Error creating upload URL:", error);
		return new Response(JSON.stringify({ error: "Failed to generate upload URL" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
