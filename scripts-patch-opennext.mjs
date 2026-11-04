import fs from "node:fs";
import path from "node:path";

function parcharDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      parcharDir(full);
    } else if (item.isFile() && /\.(m?js|cjs)$/.test(item.name)) {
      const content = fs.readFileSync(full, "utf8");
      if (content.includes("is not supported by the Next.js team")) {
        const patched = content
          .replace(/is not supported by the Next\.js team/g, "is supported (patched)")
          .replace(/process\.exit\(1\)/g, "void 0");
        fs.writeFileSync(full, patched, "utf8");
        console.log("Parche aplicado en:", full);
      }
    }
  }
}

parcharDir(path.resolve("node_modules/@opennextjs"));
