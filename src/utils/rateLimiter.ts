interface RateLimitRecord {
	count: number;
	firstRequestAt: number;
	blockedUntil: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

// Clean up stale entries periodically
setInterval(() => {
	const now = Date.now();
	for (const [ip, record] of rateLimitMap.entries()) {
		if (now > record.blockedUntil && now - record.firstRequestAt > 600000) {
			rateLimitMap.delete(ip);
		}
	}
}, 120000).unref?.();

export function getClientIp(request: Request): string {
	const cfIp = request.headers.get("cf-connecting-ip");
	if (cfIp) return cfIp.trim();

	const realIp = request.headers.get("x-real-ip");
	if (realIp) return realIp.trim();

	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded) {
		const first = forwarded.split(",")[0];
		if (first) return first.trim();
	}

	return "127.0.0.1";
}

/**
 * Checks if a client IP is allowed or rate limited.
 * @param ip Client IP
 * @param maxAttempts Max attempts in window
 * @param windowMs Time window in milliseconds
 * @param blockDurationMs How long to block if limit exceeded
 */
export function checkRateLimit(
	ip: string,
	maxAttempts = 10,
	windowMs = 60000,
	blockDurationMs = 300000,
): { allowed: boolean; retryAfterSeconds?: number } {
	const now = Date.now();
	const record = rateLimitMap.get(ip);

	if (!record) {
		rateLimitMap.set(ip, {
			count: 1,
			firstRequestAt: now,
			blockedUntil: 0,
		});
		return { allowed: true };
	}

	// Check if currently blocked
	if (now < record.blockedUntil) {
		const retryAfter = Math.ceil((record.blockedUntil - now) / 1000);
		return { allowed: false, retryAfterSeconds: retryAfter };
	}

	// Check if window has expired
	if (now - record.firstRequestAt > windowMs) {
		record.count = 1;
		record.firstRequestAt = now;
		record.blockedUntil = 0;
		return { allowed: true };
	}

	record.count += 1;

	if (record.count > maxAttempts) {
		record.blockedUntil = now + blockDurationMs;
		const retryAfter = Math.ceil(blockDurationMs / 1000);
		return { allowed: false, retryAfterSeconds: retryAfter };
	}

	return { allowed: true };
}

/**
 * Record a failed sensitive attempt (e.g. wrong password).
 * Stricter limit: 5 failed attempts locks IP for 15 minutes.
 */
export function recordFailedAuth(ip: string): void {
	const now = Date.now();
	const key = `failed_auth:${ip}`;
	const record = rateLimitMap.get(key);

	if (!record) {
		rateLimitMap.set(key, {
			count: 1,
			firstRequestAt: now,
			blockedUntil: 0,
		});
		return;
	}

	record.count += 1;
	if (record.count >= 5) {
		record.blockedUntil = now + 900000; // 15 minutes lockout
	}
}

export function isIpBlockedFromAuth(ip: string): { blocked: boolean; retryAfterSeconds?: number } {
	const now = Date.now();
	const key = `failed_auth:${ip}`;
	const record = rateLimitMap.get(key);

	if (record && now < record.blockedUntil) {
		return {
			blocked: true,
			retryAfterSeconds: Math.ceil((record.blockedUntil - now) / 1000),
		};
	}
	return { blocked: false };
}
