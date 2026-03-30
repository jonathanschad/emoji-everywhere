import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

const env = loadEnv("development", __dirname, "");
const devServerPort = parseInt(env.DEV_SERVER_PORT || "3000", 10);

export default defineConfig({
  modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
  autoIcons: {
    developmentIndicator: false,
  },
  dev: {
    server: {
      port: devServerPort,
    },
  },
  manifest: ({ browser }) => ({
    name: "Slack Emoji Everywhere",
    description:
      "Replaces :custom_emoji: text on any webpage with your Slack workspace's custom emojis",
    ...(browser === "chrome" && {
      key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2nd5YG2c2rLU3Z7Sv50Ose4fMJrnwWiMRFyIxXoAu72PEhd7VXUrDGHIT+rw3giMAcLLnpzrM9O+/gD2R7BMDOixBjhYzFv3Xf/vfe/aBv7OEGcFLHnWDeE4YT4EpmXsVeMYCnx12rZoACYw6W77nLznLh82POiQYT67Oi85BxrhdVsQvPq/qVvRowdfRB73BcCwewe+4G1+XRno2qsfUQKTTR/dE+WW5cl5BDdvjsyF19UjFJ5koEE7VdPh1JcpqLXS3sMpND0FykiJPa3rCWlx2qcc8fE+8D7j2CxtHEtbHqzuRtMMwypmdGzb7iuto88rlJ7FE5klF/PB8yCY8wIDAQAB",
    }),
    permissions: ["identity", "alarms", "storage"],
    host_permissions: [
      "https://slack.com/api/*",
      "https://*.slack-edge.com/*",
      "https://emoji.slack-edge.com/*",
    ],
    browser_specific_settings: {
      gecko: {
        id: "slack-emoji-everywhere@extension",
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
    plugins: [tailwindcss()],
  }),
});
