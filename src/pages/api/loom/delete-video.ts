import type { APIRoute } from "astro";
import { getVideo, deleteVideo } from "@/utils/db";
import { deleteVideoFile } from "@/utils/r2";
import { isAuthorized } from "@/utils/auth";
import { getClientIp, isIpBlockedFromAuth, recordFailedAuth } from "@/utils/rateLimiter";

export const prerender = false;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request }) => {
	const ip = getClientIp(request);

	// 1. Rate limiting check
	const lockStatus = isIpBlockedFromAuth(ip);
	if (lockStatus.blocked) {
		return new Response(
			JSON.stringify({ error: `Too many attempts. Locked out for ${lockStatus.retryAfterSeconds}s.` }),
			{ status: 429, headers: { "Content-Type": "application/json" } },
		);
	}

	const headerKey = request.headers.get("x-record-key");

	// 2. Strict authorization (no cookies accepted)
	if (!isAuthorized(headerKey)) {
		recordFailedAuth(ip);
		return new Response(JSON.stringify({ error: "Unauthorized: Invalid or missing X-Record-Key" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const { videoId } = await request.json();
		if (!videoId || typeof videoId !== "string" || !UUID_REGEX.test(videoId)) {
			return new Response(JSON.stringify({ error: "Invalid or missing videoId" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		const video = await getVideo(videoId);
		if (!video) {
			return new Response(JSON.stringify({ error: "Video not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Delete physical file from R2 or local storage
		await deleteVideoFile(video.storage_path);

		// Delete DB records (cascades to comments and metadata)
		await deleteVideo(videoId);

		return new Response(JSON.stringify({ success: true, message: "Video deleted successfully" }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		console.error("Delete video error:", error);
		return new Response(JSON.stringify({ error: "Failed to delete video" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
