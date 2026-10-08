/// <reference types="vite/client" />
import { createRoot } from "react-dom/client";
import { GalleryEditor } from "../app/gallery-editor";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(<GalleryEditor basePath={import.meta.env.BASE_URL} />);
