import React, { useState } from "react";
import type { CommentRecord } from "@/utils/db";

interface CommentsSectionProps {
	videoId: string;
	initialComments: CommentRecord[];
	currentVideoTime: number;
	onSeekToTime: (timeInSeconds: number) => void;
}

const EMOJI_OPTIONS = ["🚀", "🔥", "💡", "👏", "❤️", "🤔", "👀"];

export default function CommentsSection({
	videoId,
	initialComments = [],
	currentVideoTime,
	onSeekToTime,
}: CommentsSectionProps) {
	const [comments, setComments] = useState<CommentRecord[]>(initialComments);
	const [authorName, setAuthorName] = useState<string>("");
	const [commentText, setCommentText] = useState<string>("");
	const [selectedEmoji, setSelectedEmoji] = useState<string>("");
	const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
	const [error, setError] = useState<string>("");
	const [pinnedTime, setPinnedTime] = useState<number | null>(null);

	const activeTimestamp = pinnedTime !== null ? pinnedTime : Math.floor(currentVideoTime);

	const formatTime = (timeInSeconds: number) => {
		const mins = Math.floor(timeInSeconds / 60);
		const secs = timeInSeconds % 60;
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!commentText.trim()) return;

		setIsSubmitting(true);
		setError("");

		try {
			const res = await fetch("/api/loom/comments", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					videoId,
					timestampSeconds: activeTimestamp,
					authorName: authorName.trim() || "Anonymous",
					text: commentText.trim(),
					emoji: selectedEmoji || undefined,
				}),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || "Failed to post comment.");
			}

			const data = await res.json();
			setComments((prev) => [...prev, data.comment].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds));
			setCommentText("");
			setSelectedEmoji("");
			setPinnedTime(null);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Failed to post comment.");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="w-full space-y-5 font-mono text-global-text">
			{/* Form: Add Timestamped Comment */}
			<div className="rounded-xl border border-global-text/15 bg-global-bg p-4 sm:p-5 shadow-sm">
				<div className="flex items-center justify-between mb-3 border-b border-global-text/10 pb-2">
					<h3 className="text-xs font-bold uppercase tracking-wider text-global-text">Leave a Time-Stamped Comment</h3>
					<button
						type="button"
						onClick={() => setPinnedTime(Math.floor(currentVideoTime))}
						className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors cursor-pointer"
					>
						<span>⏱ Timestamp:</span>
						<span className="font-bold underline">{formatTime(activeTimestamp)}</span>
					</button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-3">
					<div className="flex flex-col sm:flex-row gap-2.5">
						<input
							type="text"
							placeholder="Your Name (optional)"
							value={authorName}
							onChange={(e) => setAuthorName(e.target.value)}
							className="w-full sm:w-1/3 rounded-lg border border-global-text/20 bg-global-bg px-3 py-2 text-xs text-global-text placeholder-global-text/40 focus:border-emerald-500 focus:outline-none"
						/>

						{/* Emoji Reaction Selector */}
						<div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
							{EMOJI_OPTIONS.map((emoji) => (
								<button
									key={emoji}
									type="button"
									onClick={() => setSelectedEmoji(selectedEmoji === emoji ? "" : emoji)}
									className={`text-sm p-1.5 rounded border transition-all cursor-pointer ${
										selectedEmoji === emoji
											? "border-emerald-500 bg-emerald-500/20 scale-110"
											: "border-global-text/15 bg-global-text/5 hover:bg-global-text/10"
									}`}
								>
									{emoji}
								</button>
							))}
						</div>
					</div>

					<div>
						<textarea
							rows={2}
							placeholder={`Write your note or question for ${formatTime(activeTimestamp)}...`}
							value={commentText}
							onChange={(e) => setCommentText(e.target.value)}
							className="w-full rounded-lg border border-global-text/20 bg-global-bg px-3 py-2 text-xs text-global-text placeholder-global-text/40 focus:border-emerald-500 focus:outline-none resize-none"
							required
						/>
					</div>

					{error && <p className="text-xs text-rose-500 font-mono">{error}</p>}

					<div className="flex justify-end">
						<button
							type="submit"
							disabled={isSubmitting || !commentText.trim()}
							className="rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 px-4 py-2 text-xs font-bold text-neutral-950 shadow transition-colors cursor-pointer"
						>
							{isSubmitting ? "Posting..." : `Post at ${formatTime(activeTimestamp)}`}
						</button>
					</div>
				</form>
			</div>

			{/* Comments Stream */}
			<div className="space-y-2.5">
				<div className="flex items-center justify-between text-xs text-global-text/60 px-1">
					<span>Discussion ({comments.length})</span>
					<span>Click timestamp to jump</span>
				</div>

				{comments.length === 0 ? (
					<div className="rounded-xl border border-dashed border-global-text/15 p-6 text-center text-xs text-global-text/50">
						No comments yet. Pause the video or click timestamp above to comment.
					</div>
				) : (
					<div className="space-y-2">
						{comments.map((c) => (
							<div
								key={c.id}
								className="flex items-start justify-between gap-3 p-3 rounded-lg border border-global-text/15 bg-global-bg hover:border-global-text/30 transition-colors shadow-sm"
							>
								<div className="space-y-1">
									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() => onSeekToTime(c.timestamp_seconds)}
											className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/30 transition-colors cursor-pointer"
											title="Jump video to this timestamp"
										>
											<span>▶</span>
											<span>{formatTime(c.timestamp_seconds)}</span>
										</button>
										<span className="text-xs font-semibold text-global-text">{c.author_name}</span>
										{c.emoji_reaction && (
											<span className="text-xs">{c.emoji_reaction}</span>
										)}
									</div>
									<p className="text-xs text-global-text/90 leading-relaxed pl-1">{c.body}</p>
								</div>

								<span className="text-[10px] text-global-text/50 shrink-0">
									{new Date(c.created_at).toLocaleDateString("en-GB", {
										month: "short",
										day: "numeric",
									})}
								</span>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
