// scripts/alias-to-relative.cjs
// Convert `@shared/...` to relative imports and append ".js" to all relative ESM imports.
// Run from repo root: `node scripts/alias-to-relative.cjs [--dry]`

const fs = require("fs");
const path = require("path");

// POSIX style for import specifiers
const toPosix = (p) => p.split(path.sep).join("/");

// ensure ./ or ../ prefix for relative specifiers
const withDot = (rel) => (rel.startsWith(".") ? rel : "./" + rel);

// files to touch: only server/**/*.ts (not .d.ts)
function listServerTS(dir) {
  const out = [];
  function walk(d) {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (
        name.endsWith(".ts") &&
        !name.endsWith(".d.ts") &&
        toPosix(p).startsWith(toPosix(path.join(process.cwd(), "server")) + "/")
      ) {
        out.push(p);
      }
    }
  }
  walk(dir);
  return out;
}

const ROOT = process.cwd();
const SHARED_DIR = path.join(ROOT, "shared");
if (!fs.existsSync(SHARED_DIR)) {
  console.error("❌ shared/ directory not found at repo root. Create it or adjust the script.");
  process.exit(1);
}

const files = listServerTS(path.join(ROOT, "server"));
const DRY = process.argv.includes("--dry");

let changed = 0;
for (const file of files) {
  const dirOfFile = path.dirname(file);
  const relToShared = toPosix(path.relative(dirOfFile, SHARED_DIR)) || ".";
  const code = fs.readFileSync(file, "utf8");
  let next = code;

  // 1) Rewrite @shared/... → relative path to shared
  next = next.replace(
    /(from\s+['"])@shared\/([^'"]+)(['"])/g,
    (_m, p1, subpath, p3) => {
      let spec = withDot(`${toPosix(relToShared)}/${subpath}`);
      // append .js if no extension
      if (!/\.(mjs|cjs|js|json|node)$/i.test(spec)) spec += ".js";
      return `${p1}${spec}${p3}`;
    }
  );

  // 2) Append .js to any other relative import missing an extension
  next = next.replace(
    /(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g,
    (_m, p1, spec, p3) => {
      // skip assets just in case
      if (/\.(css|svg|png|jpg|jpeg|gif|webp|avif)$/i.test(spec)) return `${p1}${spec}${p3}`;
      if (!/\.(mjs|cjs|js|json|node)$/i.test(spec)) spec += ".js";
      return `${p1}${spec}${p3}`;
    }
  );

  if (next !== code) {
    changed++;
    if (!DRY) fs.writeFileSync(file, next, "utf8");
    else console.log(`~ would edit: ${toPosix(path.relative(ROOT, file))}`);
  }
}

console.log(DRY ? `✅ Dry run complete.` : `✅ Updated ${changed} file(s).`);
