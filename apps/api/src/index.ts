import { createApp } from "./app.ts";
import { loadConfig, readVersion } from "./config.ts";
import { loadManifest } from "./services/media.ts";

const config = loadConfig(process.env);
// A bad manifest stops startup, so a broken deploy fails loudly.
await loadManifest(config.MEDIA_DIR);

const app = createApp({ config, version: readVersion(import.meta.dirname) });
app.listen(config.PORT, () => {
  console.info(`api listening on ${config.PORT}`);
});
