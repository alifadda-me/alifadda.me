import type { APIRoute } from "astro";
import { isAuthorized } from "@/utils/auth";
import { getClientIp, isIpBlockedFromAuth, recordFailedAuth } from "@/utils/rateLimiter";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	const ip = getClientIp(request);

	// 1. Check brute-force lockout
	const lockStatus = isIpBlockedFromAuth(ip);
	if (lockStatus.blocked) {
		return new Response(
			JSON.stringify({
				valid: false,
				error: `Too many failed attempts. Please try again in ${lockStatus.retryAfterSeconds} seconds.`,
			}),
			{
				status: 429,
				headers: {
					"Content-Type": "application/json",
					"Retry-After": String(lockStatus.retryAfterSeconds || 60),
				},
			},
		);
	}

	const headerKey = request.headers.get("x-record-key");
	let bodyKey: string | null = null;

	try {
		const body = await request.json();
		bodyKey = body?.key || null;
	} catch {
		// body might be empty
	}

	const key = headerKey || bodyKey;

	// 2. Validate key
	if (!isAuthorized(key)) {
		recordFailedAuth(ip);
		return new Response(
			JSON.stringify({
				valid: false,
				error: "Unauthorized: Invalid RECORD_SECRET",
			}),
			{
				status: 401,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	return new Response(
		JSON.stringify({
			valid: true,
			message: "Authorized",
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		},
	);
};
