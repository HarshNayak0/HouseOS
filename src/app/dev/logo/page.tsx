"use client";

import { useEffect, useState } from "react";

/** Dev-only: renders the 3D logo so scripts/render-logo.cjs can save it. Hidden in production builds. */
export default function LogoDevPage() {
  const [img, setImg] = useState<string | null>(null);
  const enabled = process.env.NEXT_PUBLIC_DEV_PAGES === "1";
  useEffect(() => {
    if (!enabled) return;
    const q = new URLSearchParams(location.search);
    import("@/scene/logo").then(({ renderLogo }) =>
      renderLogo(Number(q.get("size") ?? 1024), q.get("bg")).then((url) => {
        (window as unknown as { __logo: string }).__logo = url;
        setImg(url);
      }),
    );
  }, [enabled]);
  if (!enabled) return <p className="p-4">Not available.</p>;
  // eslint-disable-next-line @next/next/no-img-element -- dev preview of a data URL
  return img ? <img src={img} alt="Veedu logo render" width={512} height={512} /> : <p className="p-4">Rendering…</p>;
}
