interface ImportMetaEnv {
  readonly VITE_SLACK_CLIENT_ID: string;
}

declare module "*?raw" {
  const content: string;
  export default content;
}
