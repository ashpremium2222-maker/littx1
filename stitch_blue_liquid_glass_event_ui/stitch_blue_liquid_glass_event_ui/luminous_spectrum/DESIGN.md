---
name: Luminous Spectrum
colors:
  surface: '#0c150f'
  surface-dim: '#0c150f'
  surface-bright: '#323c33'
  surface-container-lowest: '#07100a'
  surface-container-low: '#141e17'
  surface-container: '#18221a'
  surface-container-high: '#232c25'
  surface-container-highest: '#2d372f'
  on-surface: '#dae5da'
  on-surface-variant: '#b9cbbb'
  inverse-surface: '#dae5da'
  inverse-on-surface: '#29332b'
  outline: '#849586'
  outline-variant: '#3b4b3e'
  surface-tint: '#00e383'
  primary: '#f2fff1'
  on-primary: '#00391d'
  primary-container: '#00ff94'
  on-primary-container: '#00713f'
  inverse-primary: '#006d3c'
  secondary: '#c9c6c5'
  on-secondary: '#313030'
  secondary-container: '#474646'
  on-secondary-container: '#b7b4b4'
  tertiary: '#fffbf9'
  on-tertiary: '#3c2f00'
  tertiary-container: '#ffdc71'
  on-tertiary-container: '#775f00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#5bffa1'
  primary-fixed-dim: '#00e383'
  on-primary-fixed: '#00210e'
  on-primary-fixed-variant: '#00522c'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c9c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474646'
  tertiary-fixed: '#ffe085'
  tertiary-fixed-dim: '#e5c45b'
  on-tertiary-fixed: '#231b00'
  on-tertiary-fixed-variant: '#574500'
  background: '#0c150f'
  on-background: '#dae5da'
  surface-variant: '#2d372f'
  electric-green: '#00FF94'
  vibrant-red: '#FF3B30'
  midnight-black: '#050505'
  glass-fill: rgba(255, 255, 255, 0.03)
  glass-border: rgba(255, 255, 255, 0.12)
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
  gutter: 24px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
  stack-xl: 64px
---

## Brand & Style
The design system transitions from a monochromatic blue to a high-intensity, "Luminous Spectrum" aesthetic. It maintains the "Liquid-Glass" material system—a premium evolution of glassmorphism—but shifts the energy from cool serenity to high-end nightlife and cutting-edge technology. The brand personality is cinematic, exclusive, and precise, evoking the atmosphere of a VIP tech-infused venue.

The visual style is defined by:
- **Liquid Glassmorphism:** Surfaces are treated as physical glass panes with deep background blurs (40px+) and internal light refraction.
- **Electric Accents:** The removal of all blue tones makes way for high-contrast Electric Green highlights against a midnight-black foundation.
- **Cinematic Contrast:** A strict "Black & Neon" philosophy that prioritizes visual impact, using light as a functional tool rather than just an aesthetic choice.

## Colors
The palette is centered around absolute darkness to maximize the "Luminous" effect. All traces of blue have been purged to favor a more aggressive, technical green and red spectrum.

- **Primary (Electric Green):** The core action color. Used for success states, active scanning, and primary call-to-actions. It should feel like a laser cutting through the dark.
- **Error (Vibrant Red):** Used exclusively for rejection, duplicates, and critical warnings. 
- **Surface (Midnight Black):** The foundation is `#050505`. This is layered with translucent glass overlays to create depth without introducing blue-ish grays.
- **Glass Overlays:** Neutral white at very low opacities (3-8%) is used for surface fills to ensure color neutrality.

## Typography
The system continues to use **Hanken Grotesk** as its primary voice, offering a sharp, geometric sans-serif quality that feels both premium and technical. **Geist** is used as the supporting monospaced and label font to ground the design in a developer-centric, high-accuracy aesthetic.

Text hierarchy is strictly enforced through contrast:
- **High Contrast:** White (`#FFFFFF`) for primary headers and critical body text.
- **Medium Contrast:** 60-70% opacity white for secondary information.
- **Luminous Tint:** Electric Green may be applied to small labels or "mono-sm" technical data to highlight active states.

## Layout & Spacing
The layout follows a fluid-to-fixed model designed to emphasize the "Cinematic" feel of the content. 

- **Desktop:** 12-column grid centered within a 1280px container.
- **Mobile:** Single column with 20px side margins.
- **Rhythm:** Use a strict 4px baseline. Vertical spacing should be generous (`stack-xl`) between major sections to let the deep background and glass blurs create a sense of vast digital space.
- **Internal Padding:** Glass containers require a minimum of 24px padding to maintain the "liquid" feel—content should never appear to touch the luminous borders.

## Elevation & Depth
Elevation is achieved through optical refraction rather than drop shadows.

1.  **Backdrop:** Midnight Black (`#050505`).
2.  **Luminous Underlays:** Subtle radial gradients of Electric Green at 5-10% opacity placed *behind* glass panels to simulate light leaking from underneath.
3.  **The Glass Material:** 
    - **Blur:** 32px to 80px (Super-Glass).
    - **Reflections:** A 1px border using a linear gradient (Top-Left: White 15% -> Bottom-Right: Transparent).
    - **Inner Glow:** Elements in an active state use an `inset` box-shadow of Electric Green to simulate internal light saturation.
4.  **Z-Axis:** Higher elevation is represented by increased blur intensity and higher border opacity, never by darkening the background.

## Shapes
The shape language is "Rounded" to maintain an organic, fluid feel that balances the sharp typography.

- **Primary Containers:** 1rem (16px) radius for standard glass cards.
- **Interaction Elements:** Buttons and Chips should use a full pill-shape (radius: 9999px) to stand out against the more architectural grid of the glass containers.
- **Focus States:** Roundedness must remain consistent during state changes to avoid breaking the "glass" metaphor.

## Components
- **Primary Action Buttons:** High-contrast Electric Green background with Midnight Black text. Use a soft green "outer glow" (blur: 20px) to make the button appear as a light source.
- **Liquid Glass Cards:** Semi-transparent containers with a 1px luminous top-edge. Ensure the background blur is high enough to keep text readable regardless of what is behind the pane.
- **Luminous Chips:** Dark frames with an Electric Green border (1px) and matching green text. Used for status indicators and high-priority tags.
- **Input Fields:** Glass frames with a subtle "inner-reflection" on the top edge. On focus, the border transitions from neutral white-transparent to solid Electric Green with an internal glow.
- **Scanning Interface:** Uses a constant Electric Green scanning line animation and "Super-Glass" containers (80px blur) for maximum focus on QR/Ticket data.
- **Navigation Dock:** A floating pill-shaped glass container at the bottom of the viewport, featuring "Internal Refractions" that react to the user's scroll position.