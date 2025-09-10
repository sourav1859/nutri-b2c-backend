// scripts/add-esm-extensions.cjs
const { Project } = require("ts-morph");

const project = new Project({ tsConfigFilePath: "tsconfig.json" });
// load only server TS files (skip d.ts)
project.addSourceFilesAtPaths(["server/**/*.ts", "!server/**/*.d.ts"]);

let edits = 0;
for (const sf of project.getSourceFiles()) {
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    const isRelative = spec.startsWith("./") || spec.startsWith("../");
    const hasExt = /\.(mjs|cjs|js|json|node)$/.test(spec);
    if (isRelative && !hasExt) {
      imp.setModuleSpecifier(`${spec}.js`);
      edits++;
    }
  }
}
project.saveSync();
console.log(`✅ Updated ${edits} import(s).`);
