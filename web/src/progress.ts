import { useEffect } from "react";
import NProgress from "nprogress";

NProgress.configure({
  showSpinner: false,
  trickleSpeed: 140,
  minimum: 0.08,
  easing: "ease",
  speed: 280,
});

let pending = 0;

export function startPageProgress() {
  pending += 1;
  NProgress.start();
}

export function stopPageProgress() {
  pending = Math.max(0, pending - 1);
  if (pending === 0) NProgress.done();
}

export function usePageProgress(active: boolean) {
  useEffect(() => {
    if (!active) return;
    startPageProgress();
    return () => {
      stopPageProgress();
    };
  }, [active]);
}
