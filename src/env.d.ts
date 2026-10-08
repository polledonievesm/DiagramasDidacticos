interface Window {
  GAS_WEB_APP_URL?: string;
}

declare module "*.webp" {
  const source: string;
  export default source;
}
