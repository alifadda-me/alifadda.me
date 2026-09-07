import type { APIRoute } from "astro";
import { listVideos } from "@/utils/db";
import { isAuthorized } from "@/utils/auth";
import { getClientIp, isIpBlockedFromAuth, recordFailedAuth } from "@/utils/rateLimiter";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
	const ip = getClientIp(request);

	const lockStatus = isIpBlockedFromAuth(ip);
	if (lockStatus.blocked) {
		return new Response(
			JSON.stringify({ error: `Too many attempts. Locked out for ${lockStatus.retryAfterSeconds}s.` }),
			{ status: 429, headers: { "Content-Type": "application/json" } },
		);
	}

	const keyFromHeader = request.headers.get("x-record-key");
	const keyFromQuery = url.searchParams.get("key");
	const key = keyFromHeader || keyFromQuery;

	if (!isAuthorized(key)) {
		recordFailedAuth(ip);
		return new Response(JSON.stringify({ error: "Unauthorized: Invalid or missing secret key" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const videos = await listVideos(100);
		return new Response(JSON.stringify({ videos }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		console.error("Failed to fetch videos:", error);
		return new Response(JSON.stringify({ error: "Failed to fetch videos" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
