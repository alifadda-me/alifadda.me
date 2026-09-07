import type { APIRoute } from "astro";
import { getVideo, updateVideoTitle } from "@/utils/db";
import { isAuthorized } from "@/utils/auth";
import { getClientIp, isIpBlockedFromAuth, recordFailedAuth } from "@/utils/rateLimiter";

export const prerender = false;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

	if (!isAuthorized(headerKey)) {
		recordFailedAuth(ip);
		return new Response(JSON.stringify({ error: "Unauthorized: Invalid or missing X-Record-Key" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const { videoId, title } = await request.json();

		if (!videoId || typeof videoId !== "string" || !UUID_REGEX.test(videoId)) {
			return new Response(JSON.stringify({ error: "Invalid or missing videoId" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		if (!title || typeof title !== "string" || !title.trim()) {
			return new Response(JSON.stringify({ error: "Title cannot be empty" }), {
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

		const cleanTitle = title.trim().slice(0, 150);
		await updateVideoTitle(videoId, cleanTitle);

		return new Response(JSON.stringify({ success: true, title: cleanTitle }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		console.error("Update title error:", error);
		return new Response(JSON.stringify({ error: "Failed to update video title" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
