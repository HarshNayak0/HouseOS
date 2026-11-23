import { HouseApp } from "@/components/house/HouseApp";

/**
 * The house lives in this layout so it stays mounted (and the 3D scene isn't rebuilt)
 * while the URL moves between /, /kitchen, /office, …
 */
export default function HouseLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <HouseApp />
      {children}
    </>
  );
}
