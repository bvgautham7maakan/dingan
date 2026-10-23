// Renders docs/guides/*.html to PDF (A4) with the bundled Chromium.
import { chromium } from "@playwright/test";
import path from "path";
import { pathToFileURL } from "url";

const b = await chromium.launch();
for (const [html, pdf] of [["mobile-guide.html", "KEM-Site-Phone-Guide.pdf"], ["office-guide.html", "KEM-Site-Office-Guide.pdf"]]) {
  const p = await b.newPage();
  await p.goto(pathToFileURL(path.resolve("docs/guides", html)).href, { waitUntil: "load" });
  const multi = html === "office-guide.html";
  await p.pdf({
    path: path.join("docs/guides", pdf), format: "A4", printBackground: true, preferCSSPageSize: true,
    // KEM footer: contact block + page number bottom centre
    displayHeaderFooter: multi,
    headerTemplate: "<span></span>",
    footerTemplate: `<div style="width:100%;font-family:Arial;font-size:7px;color:#888;text-align:center;">Kahraba Electromechanical Services LLC · Musaffah, Abu Dhabi, UAE · +971 2 546 9810 · info@kahrabaelectromechanical.com<br>Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
  });
  console.log("wrote", pdf);
}
await b.close();
