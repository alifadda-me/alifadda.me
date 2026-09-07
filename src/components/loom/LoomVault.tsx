import React, { useState, useEffect } from "react";
import type { VideoRecord } from "@/utils/db";

interface LoomVaultProps {
	initialKey?: string;
}

export default function LoomVault({ initialKey = "" }: LoomVaultProps) {
	const [key, setKey] = useState<string>(initialKey);
	const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
	const [videos, setVideos] = useState<VideoRecord[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(Boolean(initialKey));
	const [error, setError] = useState<string>("");

	useEffect(() => {
		// Clean up any stale persistent storage as user requested never to save RECORD_SECRET
		if (typeof window !== "undefined") {
			localStorage.removeItem("loom_record_key");
			document.cookie = "loom_admin_key=; path=/; max-age=0";
			if (window.location.search.includes("key=")) {
				window.history.replaceState({}, "", window.location.pathname);
			}
		}

		if (initialKey) {
			loadVideos(initialKey);
		} else {
			setIsLoading(false);
		}
	}, [initialKey]);

	const loadVideos = async (secretKey: string) => {
		setIsLoading(true);
		setError("");

		try {
			const res = await fetch("/api/loom/videos", {
				headers: {
					"X-Record-Key": secretKey.trim(),
				},
			});

			if (!res.ok) {
				setIsUnlocked(false);
				setError("Invalid secret key or unauthorized access.");
				setIsLoading(false);
				return;
			}

			const data = await res.json();
			setVideos(data.videos || []);
			setIsUnlocked(true);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Failed to load video vault.");
			setIsUnlocked(false);
		} finally {
			setIsLoading(false);
		}
	};

	const [copiedId, setCopiedId] = useState<string | null>(null);

	const handleCopyShareLink = (videoId: string, e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/loom/${videoId}` : `/loom/${videoId}`;
		if (typeof navigator !== "undefined" && navigator.clipboard) {
			navigator.clipboard.writeText(shareUrl).then(() => {
				setCopiedId(videoId);
				setTimeout(() => {
					setCopiedId(null);
				}, 2000);
			});
		}
	};

	const handleDeleteVideo = async (videoId: string, e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		let activeKey = key.trim();
		if (!activeKey) {
			const entered = prompt("Enter your RECORD_SECRET to authorize deletion:");
			if (!entered) return;
			activeKey = entered.trim();
		}

		if (!confirm("Are you sure you want to permanently delete this video? This cannot be undone.")) {
			return;
		}

		try {
			const res = await fetch("/api/loom/delete-video", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Record-Key": activeKey,
				},
				body: JSON.stringify({ videoId }),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				alert("Delete failed: " + (data.error || "Unknown error"));
				return;
			}

			setVideos((prev) => prev.filter((v) => v.id !== videoId));
		} catch (err) {
			alert("Failed to delete video: " + (err instanceof Error ? err.message : String(err)));
		}
	};

	const handleEditTitle = async (videoId: string, currentTitle: string, e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		let activeKey = key.trim();
		if (!activeKey) {
			const entered = prompt("Enter your RECORD_SECRET to authorize title edit:");
			if (!entered) return;
			activeKey = entered.trim();
		}

		const newTitle = prompt("Enter new video title:", currentTitle);
		if (!newTitle || !newTitle.trim() || newTitle.trim() === currentTitle) {
			return;
		}

		try {
			const res = await fetch("/api/loom/update-title", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Record-Key": activeKey,
				},
				body: JSON.stringify({ videoId, title: newTitle.trim() }),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				alert("Failed to update title: " + (data.error || "Unknown error"));
				return;
			}

			setVideos((prev) =>
				prev.map((v) => (v.id === videoId ? { ...v, title: newTitle.trim() } : v)),
			);
		} catch (err) {
			alert("Failed to update title: " + (err instanceof Error ? err.message : String(err)));
		}
	};

	const handleUnlock = (e: React.FormEvent) => {
		e.preventDefault();
		if (!key.trim()) {
			setError("Please enter your secret key.");
			return;
		}
		loadVideos(key);
	};

	const formatDuration = (seconds: number) => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	};

	const formatDate = (dateString: string) => {
		try {
			return new Date(dateString).toLocaleDateString("en-GB", {
				day: "numeric",
				month: "short",
				year: "numeric",
			});
		} catch {
			return dateString;
		}
	};

	if (isLoading) {
		return (
			<div className="py-16 text-center text-xs font-mono text-global-text/60">
				Verifying access to private vault...
			</div>
		);
	}

	if (!isUnlocked) {
		return (
			<div className="w-full max-w-md mx-auto rounded-2xl border border-global-text/15 bg-global-bg p-6 text-global-text font-mono shadow-lg my-4">
				<div className="flex items-center gap-2.5 mb-3 border-b border-global-text/10 pb-3">
					<span className="text-base">🔒</span>
					<h2 className="text-sm font-bold text-global-text">Private Video Vault</h2>
				</div>
				<p className="text-xs text-global-text/70 mb-4 leading-relaxed">
					This archive is restricted to the site owner. Enter your <code className="bg-global-text/10 px-1 py-0.5 rounded">RECORD_SECRET</code> to view recorded videos:
				</p>
				<form onSubmit={handleUnlock} className="space-y-3">
					<input
						type="password"
						placeholder="Enter secret key..."
						value={key}
						onChange={(e) => setKey(e.target.value)}
						className="w-full rounded-lg border border-global-text/20 bg-global-bg px-3.5 py-2 text-xs text-global-text placeholder-global-text/40 focus:border-emerald-500 focus:outline-none"
					/>
					{error && <p className="text-xs text-rose-500">{error}</p>}
					<button
						type="submit"
						className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 py-2.5 text-xs font-bold text-neutral-950 transition-colors cursor-pointer"
					>
						Unlock Vault
					</button>
				</form>
			</div>
		);
	}

	return (
		<div className="space-y-5 font-mono text-global-text">
			{/* Vault Controls Bar */}
			<div className="flex items-center justify-between border-b border-global-text/15 pb-3">
				<div>
					<h1 className="text-lg sm:text-xl font-bold text-global-text flex items-center gap-2">
						<span>Video Vault</span>
						<span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
							Admin Only
						</span>
					</h1>
					<p className="text-xs text-global-text/60 mt-0.5">
						Private library ({videos.length} recordings)
					</p>
				</div>

				<div className="flex items-center gap-2">
					<a
						href="/loom/record"
						className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-3.5 py-1.5 text-xs font-bold text-neutral-950 shadow-sm transition-colors"
					>
						<span className="h-2 w-2 rounded-full bg-rose-600 animate-pulse"></span>
						<span>Record</span>
					</a>
				</div>
			</div>

			{/* Videos Grid */}
			{videos.length === 0 ? (
				<div className="rounded-xl border border-dashed border-global-text/20 p-8 text-center space-y-2">
					<p className="text-xs text-global-text/60">No videos recorded yet.</p>
					<a
						href="/loom/record"
						className="inline-block text-xs text-emerald-600 dark:text-emerald-400 font-bold underline"
					>
						Record your first video →
					</a>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
					{videos.map((vid) => (
						<a
							key={vid.id}
							href={`/loom/${vid.id}`}
							className="group flex flex-col justify-between rounded-xl border border-global-text/15 bg-global-bg p-4 hover:border-emerald-500/50 hover:shadow-md transition-all duration-200 shadow-sm"
						>
							<div className="space-y-1.5">
								<div className="flex items-center justify-between text-[11px] text-global-text/60">
									<span>{formatDate(vid.created_at)}</span>
									<span
										className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
											vid.status === "ready"
												? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
												: vid.status === "processing"
													? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
													: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30"
										}`}
									>
										{vid.status}
									</span>
								</div>

								<h2 className="text-sm font-bold text-global-text group-hover:text-accent transition-colors line-clamp-2">
									{vid.title}
								</h2>
							</div>

							<div className="flex items-center justify-between pt-3 mt-3 border-t border-global-text/10 text-xs text-global-text/60">
								<span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
									<span>⏱</span>
									<span>{formatDuration(vid.duration_seconds)}</span>
								</span>
								<div className="flex items-center gap-2.5">
									<button
										type="button"
										onClick={(e) => handleCopyShareLink(vid.id, e)}
										className="inline-flex items-center gap-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 px-2 py-0.5 text-[11px] font-semibold cursor-pointer transition-colors"
										title="Copy public share link"
									>
										<span>{copiedId === vid.id ? "✓ Copied!" : "🔗 Share"}</span>
									</button>
									<button
										type="button"
										onClick={(e) => handleEditTitle(vid.id, vid.title, e)}
										className="inline-flex items-center gap-1 rounded bg-global-text/5 hover:bg-global-text/10 text-global-text/80 border border-global-text/15 px-2 py-0.5 text-[11px] font-semibold cursor-pointer transition-colors"
										title="Rename video"
									>
										<span>✏️ Rename</span>
									</button>
									<button
										type="button"
										onClick={(e) => handleDeleteVideo(vid.id, e)}
										className="text-rose-500/70 hover:text-rose-600 dark:hover:text-rose-400 p-0.5 text-[11px] hover:underline cursor-pointer transition-colors"
										title="Delete video"
									>
										Delete
									</button>
									<span className="text-emerald-600 dark:text-emerald-400 group-hover:translate-x-0.5 transition-transform text-[11px] font-semibold">
										Watch →
									</span>
								</div>
							</div>
						</a>
					))}
				</div>
			)}
		</div>
	);
}
