import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { marked } from "marked";
await mkdir("dist/public", { recursive: true });
await cp("public", "dist/public", { recursive: true });
await cp("docs/architecture.svg", "dist/public/architecture.svg");
const shell = await readFile("public/index.html", "utf8");
for (const name of ["guide", "architecture"]) {
  const markdown = await readFile(`docs/${name}.md`, "utf8");
  const body = marked
    .parse(markdown)
    .replaceAll('href="guide.md"', 'href="/guide"')
    .replaceAll('href="architecture.md"', 'href="/architecture"')
    .replace(
      /<table>([\s\S]*?)<\/table>/g,
      '<div class="table-scroll"><table>$1</table></div>',
    );
  const page = shell
    .replace(/<script type="module" src="\/app.js"><\/script>/, "")
    .replace(
      /<main id="inspector">[\s\S]*?<\/main>/,
      `<main id="inspector" class="document"><article>${body}</article></main>`,
    )
    .replace('aria-current="page"', "")
    .replace(`href="/${name}"`, `href="/${name}" aria-current="page"`)
    .replace(
      "<title>txray | Solana Transaction Autopsy</title>",
      `<title>${name === "guide" ? "Guide" : "Architecture"} | txray</title>`,
    );
  await writeFile(`dist/public/${name}.html`, page);
}
await build({
  entryPoints: ["src/web/app.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  outfile: "dist/public/app.js",
  target: "es2022",
});
