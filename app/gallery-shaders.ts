export const vertexShader = `
  #define PI 3.1415926535897932384626433832795
  precision highp float;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform vec2 uImageResolution;
  uniform float uParallax;
  uniform float uUvScale;
  uniform float uShaderMultiplier;
  uniform float uTime;
  uniform float uHoverProgress;
  uniform vec2 uMousePosition;
  uniform float uHoverDistortionStrength;
  uniform float uGrainStrength;
  uniform float uEffectRadius;
  uniform float uEffectType;

  vec2 coverUv(vec2 uv, vec2 resolution, vec2 imageResolution) {
    vec2 ratio = vec2(
      min((resolution.x / resolution.y) / (imageResolution.x / imageResolution.y), 1.0),
      min((resolution.y / resolution.x) / (imageResolution.y / imageResolution.x), 1.0)
    );
    return vec2(
      uv.x * ratio.x + (1.0 - ratio.x) * 0.5,
      uv.y * ratio.y + (1.0 - ratio.y) * 0.5
    );
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    // Soft circular mask around the mouse position (aspect-corrected so it stays round)
    vec2 maskUv = vUv - uMousePosition;
    maskUv.x *= uResolution.x / uResolution.y;
    float mask = (1.0 - smoothstep(uEffectRadius * 0.3, uEffectRadius, length(maskUv))) * uHoverProgress;

    vec2 uv = coverUv(vUv, uResolution, uImageResolution);
    uv.x += uParallax * uShaderMultiplier;
    uv -= 0.5;
    uv *= uUvScale;
    uv += 0.5;

    int effectType = int(uEffectType + 0.5);
    float grainAmount = effectType < 0 ? 0.0 : uGrainStrength;
    vec3 col;

    if (effectType < 0) {
      col = texture2D(uTexture, uv).rgb;
    } else if (effectType == 1) {
      // Chromatic aberration radiating from the cursor
      vec2 dir = vUv - uMousePosition;
      float amt = uHoverDistortionStrength * mask * 0.6;
      col.r = texture2D(uTexture, uv + dir * amt).r;
      col.g = texture2D(uTexture, uv).g;
      col.b = texture2D(uTexture, uv - dir * amt).b;
    } else if (effectType == 2) {
      // Sine wave ripple
      uv.x += sin(vUv.y * 30.0 + uTime * 1.6) * uHoverDistortionStrength * 0.35 * mask;
      uv.y += sin(vUv.x * 24.0 - uTime * 1.2) * uHoverDistortionStrength * 0.25 * mask;
      col = texture2D(uTexture, uv).rgb;
    } else if (effectType == 3) {
      // Large soft noise blobs
      vec2 blob = vec2(
        noise(vUv * 2.5 + uTime * 0.15),
        noise(vUv * 2.5 + 50.0 - uTime * 0.12)
      ) - 0.5;
      uv += blob * uHoverDistortionStrength * 2.4 * mask;
      col = texture2D(uTexture, uv).rgb;
    } else if (effectType == 4) {
      // Film grain dominant, barely any distortion
      vec2 distortion = vec2(
        noise(vUv * 6.0 + uTime * 0.4),
        noise(vUv * 6.0 + 100.0 - uTime * 0.3)
      ) - 0.5;
      uv += distortion * uHoverDistortionStrength * 0.3 * mask;
      col = texture2D(uTexture, uv).rgb;
      grainAmount *= 2.6;
    } else if (effectType == 5) {
      // Mosaic pixelation around the cursor
      vec2 px = 14.0 / uResolution;
      vec2 mosaic = (floor(uv / px) + 0.5) * px;
      col = texture2D(uTexture, mix(uv, mosaic, mask)).rgb;
    } else if (effectType == 6) {
      // Magnifying lens centered on the cursor
      vec2 muv = coverUv(uMousePosition, uResolution, uImageResolution);
      muv.x += uParallax * uShaderMultiplier;
      muv -= 0.5;
      muv *= uUvScale;
      muv += 0.5;
      uv = mix(uv, muv + (uv - muv) * 0.65, mask);
      col = texture2D(uTexture, uv).rgb;
    } else {
      // Fine noise ripple distortion (default)
      vec2 distortion = vec2(
        noise(vUv * 6.0 + uTime * 0.4),
        noise(vUv * 6.0 + 100.0 - uTime * 0.3)
      ) - 0.5;
      uv += distortion * uHoverDistortionStrength * mask;
      col = texture2D(uTexture, uv).rgb;
    }

    // Fine animated grain, only where the hover mask is active
    float grain = hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5;
    col += grain * grainAmount * mask;

    gl_FragColor = vec4(col, 1.0);
  }
`;
