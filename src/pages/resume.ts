import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";

export const prerender = true;

const PDF_NAME = "Ali-Fadda-Resume.pdf";

function pdfHeaders(contentLength?: number): HeadersInit {
	const headers: Record<string, string> = {
		"Content-Type": "application/pdf",
		"Content-Disposition": `inline; filename="${PDF_NAME}"`,
		"Cache-Control": "public, max-age=0, must-revalidate",
	};
	if (typeof contentLength === "number") {
		headers["Content-Length"] = String(contentLength);
	}
	return headers;
}

export const GET: APIRoute = () => {
	const pdfPath = path.join(process.cwd(), "public", PDF_NAME);
	const pdf = fs.readFileSync(pdfPath);

	return new Response(pdf, {
		headers: pdfHeaders(pdf.byteLength),
	});
};

export const HEAD: APIRoute = () => {
	const pdfPath = path.join(process.cwd(), "public", PDF_NAME);
	const { size } = fs.statSync(pdfPath);

	return new Response(null, {
		status: 200,
		headers: pdfHeaders(size),
	});
};
