import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const resumePath = path.join(root, "src/content/resume.md");
const publicDir = path.join(root, "public");

const raw = fs.readFileSync(resumePath, "utf8");
const { data, content } = matter(raw);

const name = String(data.name ?? "Ali Fadda");
const title = String(data.title ?? "");
const phone = String(data.phone ?? "");
const email = String(data.email ?? "");
const linkedin = String(data.linkedin ?? "");
const pdfFilename = String(data.pdfFilename ?? "Ali-Fadda-Resume.pdf");
const bodyHtml = marked.parse(content, { async: false });

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${name} — Resume</title>
  <style>
    @page { margin: 16mm 14mm; size: A4; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.45;
      color: #111827;
    }
    h1 {
      margin: 0;
      font-size: 22pt;
      letter-spacing: -0.02em;
    }
    .title {
      margin: 4px 0 0;
      font-size: 11.5pt;
      font-weight: 600;
      color: #0f766e;
    }
    .meta {
      margin: 10px 0 0;
      font-size: 9.5pt;
      color: #4b5563;
    }
    header {
      padding-bottom: 12px;
      border-bottom: 1px solid #d1d5db;
      margin-bottom: 8px;
    }
    h2 {
      margin: 16px 0 6px;
      font-size: 9.5pt;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 3px;
    }
    h3 {
      margin: 12px 0 2px;
      font-size: 11pt;
    }
    p { margin: 4px 0; color: #374151; }
    ul { margin: 4px 0 8px; padding-left: 18px; }
    li { margin: 3px 0; color: #374151; }
    strong { color: #111827; }
    a { color: inherit; text-decoration: none; }
  </style>
</head>
<body>
  <header>
    <h1>${name}</h1>
    <p class="title">${title}</p>
    <p class="meta">${[phone, email, linkedin].filter(Boolean).join(" · ")}</p>
  </header>
  <main>${bodyHtml}</main>
</body>
</html>`;

fs.mkdirSync(publicDir, { recursive: true });
const outPath = path.join(publicDir, pdfFilename);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
await page.pdf({
	path: outPath,
	format: "A4",
	printBackground: true,
	margin: { top: "14mm", right: "12mm", bottom: "14mm", left: "12mm" },
});
await browser.close();

console.log(`Wrote ${path.relative(root, outPath)}`);
