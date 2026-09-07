import type { APIRoute } from "astro";
import { getVideo, updateVideoStatus } from "@/utils/db";
import { getVideoPublicUrl } from "@/utils/r2";
import { processVideoAI } from "@/utils/aiPipeline";
import { isAuthorized } from "@/utils/auth";
import { getClientIp, isIpBlockedFromAuth, recordFailedAuth } from "@/utils/rateLimiter";

export const prerender = false;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
			{
				status: 401,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	try {
		const body = await request.json();
		const { videoId, durationSeconds, title } = body;

		if (!videoId || typeof videoId !== "string" || !UUID_REGEX.test(videoId)) {
			return new Response(JSON.stringify({ error: "Invalid or missing videoId parameter" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		const video = await getVideo(videoId);
		if (!video) {
			return new Response(JSON.stringify({ error: "Video record not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		const cleanTitle = typeof title === "string" ? title.trim().slice(0, 150) : video.title;
		const cleanDuration = typeof durationSeconds === "number" ? Math.max(0, Math.floor(durationSeconds)) : video.duration_seconds;

		// Update initial title & duration if provided
		await updateVideoStatus(
			videoId,
			"processing",
			cleanTitle || video.title,
			cleanDuration,
		);

		let videoFileUrl = await getVideoPublicUrl(video.storage_path);

		// If the url is relative (e.g. local fallback), prepend origin
		if (videoFileUrl.startsWith("/")) {
			videoFileUrl = `${url.origin}${videoFileUrl}`;
		}

		// Non-blocking AI execution
		void processVideoAI(videoId, videoFileUrl, cleanTitle || video.title).catch((err) => {
			console.error(`AI background pipeline error for ${videoId}:`, err);
		});

		return new Response(
			JSON.stringify({
				success: true,
				message: "AI enrichment pipeline scheduled",
				videoId,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			},
		);
	} catch (error) {
		console.error("Failed to initiate AI processing:", error);
		return new Response(JSON.stringify({ error: "Internal server error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
