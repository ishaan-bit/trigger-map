/**
 * postinstall script — runs after npm ci / npm install
 *
 * 1. Applies patch-package patches (ESM extensionless imports fix)
 * 2. Fixes the google-signin exports field so Expo can resolve the
 *    config plugin via the extensionless "./app.plugin" subpath
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// 1. Apply patch-package patches
execSync("npx patch-package", { stdio: "inherit" });

// 2. Fix google-signin exports field
const pkgPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "@react-native-google-signin",
  "google-signin",
  "package.json"
);

if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (pkg.exports && !pkg.exports["./app.plugin"]) {
    pkg.exports["./app.plugin"] = "./app.plugin.js";
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    console.log(
      "postinstall: added ./app.plugin export to @react-native-google-signin/google-signin"
    );
  }
}
