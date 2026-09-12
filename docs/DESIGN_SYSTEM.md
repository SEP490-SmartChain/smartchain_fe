# SmartChain Design System

The SmartChain interface adapts the layout language of the local SaaSable free template and the publicly visible SaaSable Pro demo to this React and Tailwind codebase. Its color system comes from the SmartChain landing page so the public site and admin product share one brand.

## Coverage

The shared system covers the responsive application shell, grouped navigation, top-bar search and menus, Light/Dark/System modes, split authentication screens, analytics cards and charts, tables and filters, forms, status feedback, popovers, modals, loading states, and page transitions. Existing SmartChain pages consume the same shell and tokens so future feature views inherit the system automatically.

## Foundations

- **Typeface:** Archivo 400/500/600/700, loaded locally with `@fontsource/archivo` exactly as in the SaaSable source. Headings use the source's fixed size and line-height scale with zero letter spacing.
- **Primary:** SmartChain teal `#0F766E`, emerald accent `#10B981`, and light container `#D1FAE5`.
- **Surface:** the canvas uses slate `#F8FAFC`, cards use white, and `#E2E8F0` defines standard dividers.
- **Text:** slate `#0F172A` for primary text and `#475569` for supporting copy.
- **Shape:** 8px controls, 12px secondary containers, and 16px cards.
- **Elevation:** subtle 1px section shadows; stronger two-layer shadows are reserved for menus, modals, and raised cards.

All canonical values live in `src/styles/tokens.css`. Light and dark values share the same semantic names; dark mode is selected with `data-theme="dark"` on the document root. Use the `--sc-*` variables in component styles instead of adding raw brand colors.

## Layout

The admin shell uses a 254px desktop drawer, a 76px icon rail when collapsed, a 76px desktop top bar, and a 1200px content container. The breadcrumb stays in the desktop header and moves below it on narrow screens. Below 1200px the sidebar becomes a temporary drawer with a dismissible backdrop and a mobile-only menu button.

## Components

Shared controls are under `src/components/Common`. Buttons and inputs are 36px, 42px, or 48px high. Cards use the shared section border and shadow. Status feedback uses the success, warning, error, and info token families. The reusable dropzone handles dragging, browsing, size validation, duplicate removal, and file removal.

Build feature views from these components before adding local UI primitives. Keep feature-specific composition inside its feature folder.

## Motion

- Fast interactions: 140ms for hover, press, and color changes.
- Standard transitions: 220ms for controls, popovers, and modal entrances.
- Layout transitions: 320ms for page entrances and sidebar movement.
- Dashboard cards use a short stagger through `--sc-delay`.

Motion helpers live in `src/styles/globals.css`: `sc-page-enter`, `sc-card-enter`, `sc-popover-enter`, and `sc-modal-enter`. All animations respect `prefers-reduced-motion`.

## Accessibility

Interactive elements need visible focus, an accessible name, and native keyboard behavior. Drawers and modals must expose their state, tables need an accessible label, and icon-only buttons require `aria-label`.
