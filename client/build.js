const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const isProd = process.env.NODE_ENV === "production";
const BASE_PATH = process.env.BASE_PATH || "/moomoo/";

// Read version from package.json
const version = require("./package.json").version + (isProd ? "" : "-dev");

// Copy public folder to dist
const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

// Copy public files
copyDir(
  path.resolve(__dirname, "public"),
  path.resolve(__dirname, "../dist/client")
);

// Add this for watch mode
const watch = process.argv.includes("--watch");

// Build with esbuild
esbuild
  .context({
    entryPoints: [path.resolve(__dirname, "src/index.js")],
    bundle: true,
    outfile: path.resolve(__dirname, "../dist/client/assets/bundle.js"),
    publicPath: BASE_PATH,
    minify: isProd,
    sourcemap: !isProd,
    target: ["es2015"],
    define: {
      VERSION: JSON.stringify(version)
    }
  })
  .then(async (ctx) => {    
    console.log("Building...");
    await ctx.rebuild();
    console.log("Build complete");

    if (!watch) return ctx.dispose();
    
    await ctx.watch();
    console.log('Watching for changes...');
  });
