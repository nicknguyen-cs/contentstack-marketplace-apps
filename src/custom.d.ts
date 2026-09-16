declare module "*.svg" {
  const src: string;
  export default src;
}

interface Window {
  iframeRef: HTMLDivElement | null;
  postRobot: unknown;
}
