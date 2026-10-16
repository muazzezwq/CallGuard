# PART 4 OF 5

Save this text as `design/SPEC_4_LANDING.md`. Do NOT start any work. Parts 1-5 are one task.

## LANDING

(src/marketing Landing, route "/"): rebuild completely, with a 3D hero. Marketing pages HowItWorks, Docs, Providers, Security, About: keep their content and routes, restyle with the same tokens, components, navbar, and footer.

Navbar: logo | Home (active, green underline), Product, Developers, Ecosystem, Docs | right: "Built on Arc" outline pill, "Launch App" solid green button (goes to /app). Link mapping: Home -> "/", Product -> #product, Developers -> #developers, Ecosystem -> #ecosystem (anchors on the landing), Docs -> /docs (existing page). Keep the other marketing pages reachable from the footer.

Sections, in this order, only these:

1. Hero. Left: H1 "Reliable Calls. / On-Chain Trust. / Built for AI Agents." ("AI Agents." in green). Body: "CallGuard is a programmable SLA marketplace for autonomous services. Pay per request, verify with EIP-712 receipts, and get protected by on-chain escrow, slashing and settlement." Buttons: "Launch App" (solid green), "Explore Docs" (outline, -> /docs). Row of 4 icon items: On-chain Escrow, EIP-712 Receipts, SLA Enforcement, x402 Payments. Bottom: "Trusted by developers building the next generation of autonomous services" + grayscale logo wordmarks Arc, Circle, Ethereum, BASE, Polygon. Right: the 3D scene.
2. Product (#product): 4 cards: On-chain Escrow, EIP-712 Receipts, SLA Enforcement, x402 Payments. Card text only from README/docs/existing marketing copy, else TODO-COPY.
3. Transaction Flow: Payment (USDC) -> SLA (Set by provider) -> Receipt (EIP-712 verified) -> Settlement (On-chain); the stepper lights up in sequence on scroll (framer-motion).
4. Developers (#developers): cards "API / MCP", "Webhooks", "Pipeline Hook", "Verify Receipt" + a real code example taken from the existing docs (mono block, copy button).
5. Live stats: Total Calls, Active Providers, Escrowed USDC, SLA Success Rate from real data (same hooks as Overview); graceful fallback when data is unavailable.
6. Ecosystem (#ecosystem): Arc, Circle, Ethereum, BASE, Polygon.
7. CTA: "Launch App" + "Explore Docs".
8. Footer: logo, nav links, existing marketing page links, existing social links.

## 3D HERO SCENE

- Add deps, pinned, compatible with React 18: three, @react-three/fiber v8, @react-three/drei v9, @react-three/postprocessing v2. (R3F v9 needs React 19: do not use it.)
- Load with React.lazy + Suspense; hero text renders immediately; the scene lives in its own component file.
- Scene: large emissive green hexagonal prism (the "C" logo) in the center; 40-60 small hexagon/cube nodes (green and blue) orbiting; thin glowing lines between nodes with light pulses traveling along them; background particles; Bloom. Three label chips (drei Html): "AI Agents", "Providers", "Callers". Colors from tokens.
- Motion: slow auto-rotation, subtle mouse parallax, slight zoom-out on scroll.
- Performance: dpr [1, 1.5], InstancedMesh, pause when off-screen (IntersectionObserver), half the nodes on mobile.
- Fallback: prefers-reduced-motion, no WebGL, or low-end device -> static SVG network visual (reuse NetworkGraph if suitable).
- Other sections: CSS perspective tilt on card hover only. One WebGL canvas on the page, no more.

END OF PART 4.
