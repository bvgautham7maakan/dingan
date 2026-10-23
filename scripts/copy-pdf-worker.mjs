// Copies the pdf.js worker next to the app so the viewer can load it (also offline).
import { copyFileSync, existsSync } from "fs";
const src = "node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
if (existsSync(src)) copyFileSync(src, "public/pdf.worker.min.mjs");
