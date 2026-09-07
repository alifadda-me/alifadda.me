import type { APIRoute } from "astro";
import { getComments, createComment, getVideo } from "@/utils/db";
import { getClientIp, checkRateLimit } from "@/utils/rateLimiter";

export const prerender = false;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async ({ url }) => {
	const videoId = url.searchParams.get("videoId");
	if (!videoId || !UUID_REGEX.test(videoId)) {
		return new Response(JSON.stringify({ error: "Invalid or missing videoId parameter" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const comments = await getComments(videoId);
		return new Response(JSON.stringify({ comments }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		console.error("Failed to fetch comments:", error);
		return new Response(JSON.stringify({ error: "Failed to fetch comments" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};

export const POST: APIRoute = async ({ request }) => {
	const ip = getClientIp(request);

	// Rate limit: max 10 comments per minute per IP
	const rateCheck = checkRateLimit(`comment_${ip}`, 10, 60000, 120000);
	if (!rateCheck.allowed) {
		return new Response(
			JSON.stringify({ error: `Posting comments too quickly. Please wait ${rateCheck.retryAfterSeconds}s.` }),
			{ status: 429, headers: { "Content-Type": "application/json" } },
		);
	}

	try {
		const body = await request.json();
		const { videoId, timestampSeconds, authorName, text, emoji } = body;

		if (!videoId || typeof videoId !== "string" || !UUID_REGEX.test(videoId)) {
			return new Response(JSON.stringify({ error: "Invalid videoId" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		if (timestampSeconds === undefined || !text || typeof text !== "string" || !text.trim()) {
			return new Response(
				JSON.stringify({ error: "Missing required fields (timestampSeconds, text)" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// Ensure video actually exists
		const video = await getVideo(videoId);
		if (!video) {
			return new Response(JSON.stringify({ error: "Video not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		const cleanAuthor = typeof authorName === "string" ? authorName.trim().slice(0, 50) : "Anonymous";
		const cleanBody = text.trim().slice(0, 1000);
		const cleanEmoji = typeof emoji === "string" ? emoji.trim().slice(0, 10) : null;

		const comment: {
			id: string;
			video_id: string;
			author_name: string;
			timestamp_seconds: number;
			body: string;
			emoji_reaction?: string;
		} = {
			id: crypto.randomUUID(),
			video_id: videoId,
			author_name: cleanAuthor || "Anonymous",
			timestamp_seconds: Math.max(0, Math.floor(Number(timestampSeconds))),
			body: cleanBody,
		};

		if (cleanEmoji) {
			comment.emoji_reaction = cleanEmoji;
		}

		await createComment(comment);

		return new Response(JSON.stringify({ success: true, comment }), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		console.error("Failed to submit comment:", error);
		return new Response(JSON.stringify({ error: "Failed to submit comment" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
