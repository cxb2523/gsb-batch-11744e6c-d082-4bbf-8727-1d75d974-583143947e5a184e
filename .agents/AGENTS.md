# Project-Scoped Rules: OpenSerial Studio

This file contains elite rules curated from open-source repositories (awesome-cursorrules, awesome-clinerules, arduino-mcp-server) specifically for the OpenSerial Studio project.

## 1. Frontend Excellence (React + Vite + Tailwind v4 + Shadcn)
- **Stack**: React 18+, TypeScript, Vite, Tailwind CSS v4, Framer Motion, shadcn/ui.
- **Components**: Use Functional Components with React Hooks. Avoid Class Components.
- **Styling**: Always use Tailwind utility classes. For complex variants, use `cva` (class-variance-authority) and `clsx`/`tailwind-merge` (standard shadcn pattern).
- **State Management**: Use React Context for global state (like Web Serial connection status). Use `useState`/`useReducer` for local UI state. Avoid `useState` for high-frequency data (like charting 60fps data); prefer refs or state outside the React render cycle if necessary, or use lightweight charting libraries (Recharts/Chart.js).
- **Animation**: Use `framer-motion`. Respect `prefers-reduced-motion`. Always use `layout` props for smooth list reordering (e.g., when widgets are dragged/dropped).

## 2. Web Serial API Integration
- Isolate the Web Serial API logic into a custom hook: `useWebSerial`.
- Handle hardware disconnects gracefully (e.g., user unplugs the USB cable abruptly).
- Implement a robust JSON parser that handles incomplete chunks (Serial data often arrives in chunks, not full lines).

## 3. Embedded C/C++ Code Generation (The "Auto Code Generator")
- When generating C/C++ code snippets for users to copy-paste into their hardware:
  - **Arduino**: Provide clean, blocking or non-blocking `Serial.print()` structures. Recommend `ArduinoJson` library for complex payloads.
  - **STM32 (HAL)**: Provide `printf` overrides using `_write` over UART, or raw `HAL_UART_Transmit`.
  - Ensure generated code is memory-safe (avoid `String` class in Arduino if possible, prefer `char` buffers for stability).
  - Include comments explaining the Baudrate matching (e.g., 115200).

## 4. UI/UX Principles (Dark Tech)
- Follow the `design-taste-frontend` skill principles: Anti-slop, no generic purple gradients.
- **Palette**: Zinc/Slate backgrounds (`bg-zinc-950`), subtle borders (`border-white/10`).
- **Typography**: Geist/Inter for UI, JetBrains Mono for data/logs.
- **Widgets**: Cards must have consistent border radii (`rounded-xl` or `rounded-2xl`).

## 5. MCP Integrations (Future-proofing)
- The architecture should be modular enough to eventually connect to `arduino-mcp-server` or `stm32-mcp` if we decide to automate the compilation process directly from the web browser (via a local node agent).
