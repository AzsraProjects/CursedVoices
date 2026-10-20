// Renders public/logo.svg into build/icon.png (512) and build/icon.ico (16..256).
// Run with: npx electron scripts/make-icons.cjs
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const root = path.join(__dirname, "..");
const svg = fs.readFileSync(path.join(root, "public", "logo.svg"), "utf-8");

async function render(win, size) {
  const html = `<html><body style="margin:0;background:transparent">
    <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" width="${size}" height="${size}"></body></html>`;
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString("base64")}`);
  await new Promise((r) => setTimeout(r, 150));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  return img.resize({ width: size, height: size, quality: "best" }).toPNG();
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false,
    webPreferences: { offscreen: true } });
  win.webContents.setZoomFactor(1);
  const big = await render(win, 512);
  fs.mkdirSync(path.join(root, "build"), { recursive: true });
  fs.writeFileSync(path.join(root, "build", "icon.png"), big);
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = [];
  for (const s of sizes) pngs.push(await render(win, s));
  const { default: pngToIco } = await import("png-to-ico");
  fs.writeFileSync(path.join(root, "build", "icon.ico"), await pngToIco(pngs));
  console.log("icons written");
  app.quit();
});
