---
name: Luminous Liquid-Glass
colors:
  surface: '#101415'
  surface-dim: '#101415'
  surface-bright: '#363a3b'
  surface-container-lowest: '#0b0f10'
  surface-container-low: '#191c1e'
  surface-container: '#1d2022'
  surface-container-high: '#272a2c'
  surface-container-highest: '#323537'
  on-surface: '#e0e3e5'
  on-surface-variant: '#c1c6d7'
  inverse-surface: '#e0e3e5'
  inverse-on-surface: '#2d3133'
  outline: '#8b90a0'
  outline-variant: '#414755'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e69'
  primary-container: '#4b8eff'
  on-primary-container: '#00285c'
  inverse-primary: '#005bc1'
  secondary: '#c3c6d7'
  on-secondary: '#2c303d'
  secondary-container: '#454957'
  on-secondary-container: '#b5b8c9'
  tertiary: '#bcc7de'
  on-tertiary: '#263143'
  tertiary-container: '#8691a7'
  on-tertiary-container: '#1f2a3c'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a41'
  on-primary-fixed-variant: '#004493'
  secondary-fixed: '#dfe2f3'
  secondary-fixed-dim: '#c3c6d7'
  on-secondary-fixed: '#171b28'
  on-secondary-fixed-variant: '#434654'
  tertiary-fixed: '#d8e3fb'
  tertiary-fixed-dim: '#bcc7de'
  on-tertiary-fixed: '#111c2d'
  on-tertiary-fixed-variant: '#3c475a'
  background: '#101415'
  on-background: '#e0e3e5'
  surface-variant: '#323537'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.05em
  mono-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-padding-mobile: 20px
  container-padding-desktop: 40px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style
The design system embodies a premium, cinematic atmosphere tailored for high-end event experiences. It leverages a "Liquid-Glass" aesthetic—a sophisticated evolution of glassmorphism that prioritizes depth, translucency, and light refraction. The brand personality is exclusive, futuristic, and immersive, evoking the feeling of a VIP digital concierge.

The visual style is characterized by:
- **Liquid Glassmorphism:** Deep navy translucent panels with high-intensity background blurs (30px+) and subtle iç-glows.
- **Luminous Edges:** Ultra-thin, 1px borders that simulate light catching the edge of a glass pane.
- **Cinematic Depth:** Extensive use of organic gradients and radial light sources to create a 3D stage effect.

## Colors
The palette is strictly restricted to deep nocturnal tones and electric blue accents to maintain a premium, high-contrast environment.

- **Primary (Electric Blue):** Used for interactive states, key call-to-actions, and luminous highlights.
- **Secondary (Midnight Navy):** The core background color for the deepest layer of the UI.
- **Tertiary (Deep Slate):** Used for secondary surfaces and container backgrounds.
- **Accents (Luminous Blue):** High-energy highlights used for "glass-edge" reflections and glowing status indicators.
- **Base (Deep Black):** Absolute `#000000` is used for the outermost backgrounds to maximize the pop of the blue glow.

## Typography
The typography system uses **Hanken Grotesk** for its sharp, contemporary geometry and exceptional legibility against dark backgrounds. **Geist** is utilized for labels and technical data (like ticket numbers or dates) to provide a clean, developer-precise feel.

Headlines should utilize "tight" letter spacing to enhance the premium, editorial look. Body text must maintain a minimum of 400 weight to ensure readability against translucent, blurred backgrounds. High-contrast white (`#FFFFFF`) is the default text color, with 70% opacity used for secondary information.

## Layout & Spacing
The layout follows a **fluid-to-fixed** model. On mobile, elements use a 20px safe margin. On desktop, content is centered within a 1280px container to maintain a cinematic focus.

- **Negative Space:** Use generous vertical spacing (stack-lg) between sections to allow the background gradients to breathe.
- **Glass Padding:** Internal padding for glass cards should be no less than 24px to ensure the "liquid" content doesn't feel cramped.
- **Grid:** Use a 12-column grid for desktop with 24px gutters. Elements should span 4, 6, or 12 columns to maintain a balanced, symmetrical aesthetic.

## Elevation & Depth
Depth is created through "Layered Refraction" rather than traditional shadows.

1.  **Base Layer:** Solid black or deep navy gradients.
2.  **Middle Layer:** Large-scale radial blurs in electric blue (`#007AFF`) at 10-20% opacity to create "pools of light."
3.  **Glass Layer:** 
    - **Backdrop Blur:** 32px to 64px.
    - **Fill:** Midnight Navy at 40% opacity.
    - **Border:** 1px solid linear gradient (Top-Left: White 20% -> Bottom-Right: Transparent).
4.  **Interaction Layer:** Hover states should trigger an "inner glow" (box-shadow: inset 0 0 15px blue) rather than an outer shadow.

## Shapes
The design system uses a "Rounded" language to feel organic and high-end. 

- **Cards & Containers:** Use 1rem (16px) corner radius.
- **Buttons:** Use 2rem (32px) or full-pill shapes to contrast against the rectangular grid.
- **Inputs:** Match the card radius (16px) for a cohesive vertical flow.
Avoid sharp corners entirely; they break the "liquid glass" metaphor which suggests smoothness and flow.

## Components
- **Primary Buttons:** High-gloss white background with dark navy text. Use a 4px blue "drop-glow" behind the button to make it float.
- **Glass Cards:** The primary container. Must feature a 1px top-edge highlight. Content should have high contrast against the blurred background.
- **Luminous Chips:** Dark semi-transparent backgrounds with an electric blue border and blue text. Used for event categories or VIP tags.
- **Input Fields:** Bottom-border only or fully enclosed glass frames. Focus state expands the border thickness slightly and increases the intensity of the blue edge-glow.
- **Ticketing QR:** Housed in a "Super-Glass" container with the highest blur (80px) to ensure the QR code is isolated and easily scannable by hardware.
- **Navigation:** A floating bottom-dock using the "Liquid Glass" style, keeping the main screen real estate free for immersive event imagery.