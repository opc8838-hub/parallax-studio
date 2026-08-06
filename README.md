# Xian Horizontal Parallax Gallery

A WebGL horizontal parallax gallery built for the hero section of Xian's personal website. The project uses seven original portrait artworks and exposes the shader controls used to tune the final motion.

## Features

- Vertical wheel input mapped to smooth horizontal movement
- Three.js image planes synchronized with DOM measurements
- GLSL texture parallax with adjustable UV buffer
- Runtime controls powered by `lil-gui`
- GSAP interpolation for smooth scrolling
- Responsive 4:3 gallery frames

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

To create a production build:

```bash
npm run build
```

## Shader controls

| Control | Default | Range |
| --- | ---: | ---: |
| Parallax Intensity | `0.4` | `0–1` |
| UV Scale (Buffer) | `0.85` | `0.7–1` |
| Shader Multiplier | `1.0` | `0–2` |

## Credits

The gallery architecture and shader technique are adapted from David Faure's [Horizontal Parallax Gallery](https://github.com/davidfaure/horizontal-parallax-gallery-codrops), created for the Codrops tutorial [Creating a Smooth Horizontal Parallax Gallery: From DOM to WebGL](https://tympanus.net/codrops/2026/02/19/creating-a-smooth-horizontal-parallax-gallery-from-dom-to-webgl/).

The original project is distributed under the MIT License. Its copyright notice is preserved in [LICENSE](./LICENSE).

Portrait artwork and project adaptation © 2026 Xian.
