import fs from "fs";
const url = new URL("./firebase-applet-config.json", import.meta.url);
console.log(url.pathname);
console.log(fs.readFileSync(url, "utf8").substring(0, 50));
