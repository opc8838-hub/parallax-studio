import type { Metadata } from "next";
import { HorizontalGallery } from "./horizontal-gallery";

export const metadata: Metadata = {
  title: "Xian — Seven Studies",
  description: "A horizontal WebGL portrait gallery.",
};

const photographs = [
  "/gallery/01.png",
  "/gallery/02.png",
  "/gallery/03.png",
  "/gallery/04.png",
  "/gallery/05.png",
  "/gallery/06.png",
  "/gallery/07.png",
];

export default function Home() {
  return <HorizontalGallery images={photographs} />;
}
