/**
 * Mobile-First & Desktop Async Video Capture Engine
 * Supports:
 * 1. Camera Only (Mobile-First, front/back camera switch, high-definition direct stream)
 * 2. Screen + Camera PiP (Desktop composited Canvas at 30 FPS)
 * 3. Screen Only
 */

export type CaptureMode = "camera" | "screen_with_camera" | "screen";
export type CameraFacing = "user" | "environment";
export type RecorderState = "inactive" | "recording" | "paused";

export interface LoomCaptureOptions {
	mode?: CaptureMode;
	facingMode?: CameraFacing;
	enableMic?: boolean;
	enableScreenAudio?: boolean;
	existingStream?: MediaStream | null;
	onPreviewStream?: (stream: MediaStream) => void;
}

export interface LoomCaptureResult {
	blob: Blob;
	durationSeconds: number;
	mimeType: string;
	hasAudio: boolean;
}

export class LoomCaptureEngine {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D | null = null;
	private screenVideo: HTMLVideoElement;
	private webcamVideo: HTMLVideoElement;
	private mediaRecorder: MediaRecorder | null = null;
	private recordedChunks: Blob[] = [];
	private animFrameId: number | null = null;
	private screenStream: MediaStream | null = null;
	private webcamStream: MediaStream | null = null;
	private audioCtx: AudioContext | null = null;
	private startTime = 0;
	private totalPausedDuration = 0;
	private pauseStartedAt = 0;
	private state: RecorderState = "inactive";
	private activeMimeType = "video/webm";
	private recordStream: MediaStream | null = null;

	constructor() {
		this.canvas = document.createElement("canvas");
		this.screenVideo = document.createElement("video");
		this.screenVideo.autoplay = true;
		this.screenVideo.muted = true;
		this.screenVideo.playsInline = true;

		this.webcamVideo = document.createElement("video");
		this.webcamVideo.autoplay = true;
		this.webcamVideo.muted = true;
		this.webcamVideo.playsInline = true;
	}

	public getState(): RecorderState {
		return this.state;
	}

	public getDuration(): number {
		if (this.state === "inactive" || this.startTime === 0) return 0;
		const now = this.state === "paused" ? this.pauseStartedAt : Date.now();
		return Math.max(0, Math.floor((now - this.startTime - this.totalPausedDuration) / 1000));
	}

	public hasAudio(): boolean {
		return (this.recordStream?.getAudioTracks().length ?? 0) > 0;
	}

	public async prepare(options: LoomCaptureOptions = {}): Promise<MediaStream> {
		const {
			mode = "camera",
			facingMode = "user",
			enableMic = true,
			enableScreenAudio = true,
			existingStream,
			onPreviewStream,
		} = options;

		let recordStream: MediaStream;

		if (mode === "camera") {
			// Mobile-First Direct Camera Capture
			// Check if we can reuse the already active video track from preview
			const liveVideoTrack = existingStream?.getVideoTracks().find((t) => t.readyState === "live");
			const liveAudioTrack = existingStream?.getAudioTracks().find((t) => t.readyState === "live");

			if (liveVideoTrack) {
				const tracks: MediaStreamTrack[] = [liveVideoTrack];

				if (enableMic) {
					if (liveAudioTrack) {
						liveAudioTrack.enabled = true;
						tracks.push(liveAudioTrack);
					} else {
						try {
							const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
							tracks.push(...micStream.getAudioTracks());
						} catch (audioErr) {
							console.warn("Microphone not accessible, proceeding with video only:", audioErr);
						}
					}
				}

				this.webcamStream = new MediaStream(tracks);
				this.webcamVideo.srcObject = this.webcamStream;
				recordStream = this.webcamStream;
			} else {
				// No existing live video track: acquire fresh camera + mic stream with safe mobile fallbacks
				let stream: MediaStream | null = null;
				// Attempt 1: Safe 720p with facingMode and simple audio
				try {
					stream = await navigator.mediaDevices.getUserMedia({
						video: {
							facingMode: { ideal: facingMode },
							width: { ideal: 1280 },
							height: { ideal: 720 },
						},
						audio: enableMic ? true : false,
					});
				} catch {
					// Attempt 2: Basic facingMode only
					try {
						stream = await navigator.mediaDevices.getUserMedia({
							video: { facingMode: { ideal: facingMode } },
							audio: enableMic ? true : false,
						});
					} catch {
						// Attempt 3: Basic video only
						stream = await navigator.mediaDevices.getUserMedia({
							video: true,
							audio: false,
						});
					}
				}

				this.webcamStream = stream;
				this.webcamVideo.srcObject = this.webcamStream;
				recordStream = this.webcamStream;
			}
		} else if (mode === "screen_with_camera") {
			// Desktop Screen + Circular Camera Canvas Compositing
			if (!navigator.mediaDevices?.getDisplayMedia) {
				throw new Error("Screen recording is not supported on this browser or device. Please switch to Camera mode.");
			}

			this.screenStream = await navigator.mediaDevices.getDisplayMedia({
				video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
				audio: enableScreenAudio,
			});

			if (enableMic) {
				try {
					this.webcamStream = await navigator.mediaDevices.getUserMedia({
						video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
						audio: true,
					});
				} catch (err) {
					console.warn("Could not acquire webcam/microphone:", err);
				}
			}

			this.screenVideo.srcObject = this.screenStream;
			const waitList: Promise<unknown>[] = [
				new Promise((res) => {
					this.screenVideo.onloadedmetadata = res;
				}),
			];

			if (this.webcamStream && this.webcamStream.getVideoTracks().length > 0) {
				this.webcamVideo.srcObject = this.webcamStream;
				waitList.push(
					new Promise((res) => {
						this.webcamVideo.onloadedmetadata = res;
					}),
				);
			}

			await Promise.all(waitList);

			this.ctx = this.canvas.getContext("2d")!;
			this.canvas.width = this.screenVideo.videoWidth || 1920;
			this.canvas.height = this.screenVideo.videoHeight || 1080;
			this.renderLoop();

			const canvasStream = this.canvas.captureStream(30);
			const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

			// Audio mixing
			const hasScreenAudio = (this.screenStream.getAudioTracks().length ?? 0) > 0;
			const hasMicAudio = (this.webcamStream?.getAudioTracks().length ?? 0) > 0;

			if (hasScreenAudio || hasMicAudio) {
				const AudioContextClass =
					window.AudioContext ||
					(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
				this.audioCtx = new AudioContextClass();
				const dest = this.audioCtx.createMediaStreamDestination();

				if (hasScreenAudio && this.screenStream) {
					const s1 = this.audioCtx.createMediaStreamSource(this.screenStream);
					s1.connect(dest);
				}
				if (hasMicAudio && this.webcamStream) {
					const s2 = this.audioCtx.createMediaStreamSource(this.webcamStream);
					s2.connect(dest);
				}

				for (const audioTrack of dest.stream.getAudioTracks()) {
					tracks.push(audioTrack);
				}
			}

			recordStream = new MediaStream(tracks);
		} else {
			// Screen Only
			if (!navigator.mediaDevices?.getDisplayMedia) {
				throw new Error("Screen recording is not supported on this device.");
			}

			this.screenStream = await navigator.mediaDevices.getDisplayMedia({
				video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
				audio: enableScreenAudio,
			});

			const tracks: MediaStreamTrack[] = [...this.screenStream.getVideoTracks()];

			if (enableMic) {
				try {
					const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
					this.webcamStream = micStream;
					const AudioContextClass =
						window.AudioContext ||
						(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
					this.audioCtx = new AudioContextClass();
					const dest = this.audioCtx.createMediaStreamDestination();

					if (this.screenStream.getAudioTracks().length > 0) {
						this.audioCtx.createMediaStreamSource(this.screenStream).connect(dest);
					}
					this.audioCtx.createMediaStreamSource(micStream).connect(dest);

					for (const aTrack of dest.stream.getAudioTracks()) {
						tracks.push(aTrack);
					}
				} catch {
					// screen audio only
					for (const aTrack of this.screenStream.getAudioTracks()) {
						tracks.push(aTrack);
					}
				}
			}

			recordStream = new MediaStream(tracks);
		}

		if (onPreviewStream) {
			onPreviewStream(recordStream);
		}

		// Handle user stopping stream from OS notification or browser button
		recordStream.getVideoTracks()[0]?.addEventListener("ended", () => {
			if (this.state === "recording" || this.state === "paused") {
				this.stop();
			}
		});

		this.recordStream = recordStream;
		return recordStream;
	}

	public beginRecording(): void {
		if (!this.recordStream) {
			throw new Error("No prepared stream found to record.");
		}

		// Select MIME type favoring device capabilities (iOS WebKit prefers video/mp4)
		const candidateMimes = [
			"video/mp4",
			"video/mp4;codecs=avc1,mp4a.40.2",
			"video/webm;codecs=vp9,opus",
			"video/webm;codecs=vp8,opus",
			"video/webm",
		];

		let chosenMime = "";
		if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function") {
			for (const mime of candidateMimes) {
				if (MediaRecorder.isTypeSupported(mime)) {
					chosenMime = mime;
					break;
				}
			}
		}

		// Configure bitrates for fast, reliable upload (1.2 Mbps keeps 20s recording under 3MB)
		const recorderOptions: MediaRecorderOptions = {
			videoBitsPerSecond: 900_000,
			audioBitsPerSecond: 64_000,
		};

		if (chosenMime) {
			recorderOptions.mimeType = chosenMime;
		}

		this.recordedChunks = [];
		try {
			this.mediaRecorder = new MediaRecorder(this.recordStream, recorderOptions);
		} catch (recorderInitErr) {
			console.warn("Failed to initialize MediaRecorder with custom options, attempting fallback:", recorderInitErr);
			this.mediaRecorder = new MediaRecorder(this.recordStream);
		}

		this.activeMimeType = this.mediaRecorder.mimeType || chosenMime || "video/webm";

		this.mediaRecorder.ondataavailable = (e) => {
			if (e.data && e.data.size > 0) {
				this.recordedChunks.push(e.data);
			}
		};

		this.startTime = Date.now();
		this.totalPausedDuration = 0;
		this.state = "recording";
		this.mediaRecorder.start(1000);
	}

	public async start(options: LoomCaptureOptions = {}): Promise<MediaStream> {
		const stream = await this.prepare(options);
		this.beginRecording();
		return stream;
	}

	public pause(): void {
		if (this.mediaRecorder && this.state === "recording") {
			this.mediaRecorder.pause();
			this.pauseStartedAt = Date.now();
			this.state = "paused";
		}
	}

	public resume(): void {
		if (this.mediaRecorder && this.state === "paused") {
			this.totalPausedDuration += Date.now() - this.pauseStartedAt;
			this.mediaRecorder.resume();
			this.state = "recording";
		}
	}

	private renderLoop = (): void => {
		if (!this.ctx) return;
		const { width, height } = this.canvas;
		this.ctx.clearRect(0, 0, width, height);

		if (this.screenVideo.videoWidth > 0) {
			this.ctx.drawImage(this.screenVideo, 0, 0, width, height);
		}

		const hasWebcam =
			this.webcamStream &&
			this.webcamStream.getVideoTracks().length > 0 &&
			this.webcamVideo.videoWidth > 0;

		if (hasWebcam) {
			const radius = width * 0.085;
			const padding = 36;
			const cx = radius + padding;
			const cy = height - radius - padding;

			this.ctx.save();
			this.ctx.beginPath();
			this.ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2, true);
			this.ctx.fillStyle = "rgba(43, 188, 138, 0.9)";
			this.ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
			this.ctx.shadowBlur = 16;
			this.ctx.fill();

			this.ctx.beginPath();
			this.ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
			this.ctx.closePath();
			this.ctx.clip();

			this.ctx.translate(cx, cy);
			this.ctx.scale(-1, 1);

			const vw = this.webcamVideo.videoWidth;
			const vh = this.webcamVideo.videoHeight;
			const minDim = Math.min(vw, vh);
			const sx = (vw - minDim) / 2;
			const sy = (vh - minDim) / 2;

			this.ctx.drawImage(this.webcamVideo, sx, sy, minDim, minDim, -radius, -radius, radius * 2, radius * 2);
			this.ctx.restore();
		}

		this.animFrameId = requestAnimationFrame(this.renderLoop);
	};

	public async stop(): Promise<LoomCaptureResult> {
		return new Promise((resolve) => {
			const duration = this.getDuration();
			const audioActive = this.hasAudio();
			this.state = "inactive";

			if (!this.mediaRecorder) {
				this.cleanup();
				resolve({
					blob: new Blob(this.recordedChunks, { type: this.activeMimeType }),
					durationSeconds: duration,
					mimeType: this.activeMimeType,
					hasAudio: audioActive,
				});
				return;
			}

			this.mediaRecorder.onstop = () => {
				const blob = new Blob(this.recordedChunks, { type: this.activeMimeType });
				this.cleanup();
				resolve({
					blob,
					durationSeconds: Math.max(1, duration),
					mimeType: this.activeMimeType,
					hasAudio: audioActive,
				});
			};

			if (this.mediaRecorder.state !== "inactive") {
				try {
					if (typeof this.mediaRecorder.requestData === "function") {
						this.mediaRecorder.requestData();
					}
				} catch {
					// ignore if not supported in current recorder state
				}
				this.mediaRecorder.stop();
			} else {
				this.cleanup();
				resolve({
					blob: new Blob(this.recordedChunks, { type: this.activeMimeType }),
					durationSeconds: duration,
					mimeType: this.activeMimeType,
					hasAudio: audioActive,
				});
			}
		});
	}

	public cancel(): void {
		this.state = "inactive";
		if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
			try {
				this.mediaRecorder.stop();
			} catch {
				// ignore
			}
		}
		this.cleanup();
	}

	private cleanup(): void {
		if (this.animFrameId) {
			cancelAnimationFrame(this.animFrameId);
			this.animFrameId = null;
		}

		if (this.screenStream) {
			for (const track of this.screenStream.getTracks()) {
				track.stop();
			}
			this.screenStream = null;
		}

		if (this.webcamStream) {
			for (const track of this.webcamStream.getTracks()) {
				track.stop();
			}
			this.webcamStream = null;
		}

		if (this.recordStream) {
			for (const track of this.recordStream.getTracks()) {
				track.stop();
			}
			this.recordStream = null;
		}

		if (this.audioCtx) {
			try {
				this.audioCtx.close();
			} catch {
				// ignore
			}
			this.audioCtx = null;
		}
	}
}
