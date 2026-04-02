import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";
import type { Plugin } from "vite";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const env = loadEnv("development", __dirname, "");
const devServerPort = parseInt(env.DEV_SERVER_PORT || "3000", 10);

const ICON_SIZES = [16, 32, 48, 128];

async function renderGreyIcons(destDir: string): Promise<void> {
  const sharp = (await import("sharp")).default;
  const svgBuf = readFileSync(resolve(__dirname, "assets/icon-grey.svg"));

  mkdirSync(destDir, { recursive: true });
  for (const size of ICON_SIZES) {
    const png = await sharp(svgBuf).resize(size, size).png().toBuffer();
    writeFileSync(join(destDir, `${size}.png`), png);
  }
}

/**
 * Vite plugin that generates grey icon PNGs from assets/icon-grey.svg.
 * Uses emitFile for production builds and direct file writes as fallback.
 */
function greyIconPlugin(): Plugin {
  return {
    name: "grey-icon-gen",
    async generateBundle() {
      const sharp = (await import("sharp")).default;
      const svgBuf = readFileSync(resolve(__dirname, "assets/icon-grey.svg"));

      for (const size of ICON_SIZES) {
        const png = await sharp(svgBuf).resize(size, size).png().toBuffer();
        this.emitFile({
          type: "asset",
          fileName: `icons-grey/${size}.png`,
          source: png,
        });
      }
    },
  };
}

export default defineConfig({
  modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
  autoIcons: {
    developmentIndicator: false,
  },
  hooks: {
    async "build:done"(wxt) {
      const dir = join(wxt.config.outDir, "icons-grey");
      if (!existsSync(join(dir, "128.png"))) {
        await renderGreyIcons(dir);
      }
    },
  },
  dev: {
    server: {
      port: devServerPort,
    },
  },
  manifest: ({ browser, command }) => ({
    name: "Emoji Everywhere",
    description:
      "Replaces :custom_emoji: text on any webpage with custom emojis from Slack workspaces and ZIP imports",
    ...(browser === "chrome" && command === "serve" && {
      key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2nd5YG2c2rLU3Z7Sv50Ose4fMJrnwWiMRFyIxXoAu72PEhd7VXUrDGHIT+rw3giMAcLLnpzrM9O+/gD2R7BMDOixBjhYzFv3Xf/vfe/aBv7OEGcFLHnWDeE4YT4EpmXsVeMYCnx12rZoACYw6W77nLznLh82POiQYT67Oi85BxrhdVsQvPq/qVvRowdfRB73BcCwewe+4G1+XRno2qsfUQKTTR/dE+WW5cl5BDdvjsyF19UjFJ5koEE7VdPh1JcpqLXS3sMpND0FykiJPa3rCWlx2qcc8fE+8D7j2CxtHEtbHqzuRtMMwypmdGzb7iuto88rlJ7FE5klF/PB8yCY8wIDAQAB",
    }),
    permissions: ["identity", "storage", "unlimitedStorage", "activeTab", "tabs"],
    host_permissions: [
      "https://slack.com/api/*",
      "https://*.slack-edge.com/*",
      "https://emoji.slack-edge.com/*",
    ],
    browser_specific_settings: {
      gecko: {
        id: "emoji-everywhere@extension",
        data_collection_permissions: {
          required: ["authenticationInfo"],
          optional: [],
        },
      },
    },
  }),
  zip: {
    includeSources: [".env.example"],
  },
  vite: () => ({
    plugins: [tailwindcss(), greyIconPlugin()],
  }),
});
