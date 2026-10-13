import type { Config } from 'tailwindcss';

// Token mengikuti INV IEG/design-ocs.md v3.1 (IEG Design System Morning & Evening).
// Jangan menulis hex langsung di komponen — selalu lewat token CSS variable.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="evening"]'],
  theme: {
    screens: { sm: '480px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1600px' },
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        'surface-alt': 'var(--bg-surface-alt)',
        sunken: 'var(--bg-sunken)',
        hover: 'var(--bg-hover)',
        selected: 'var(--bg-selected)',
        ink: 'var(--ink)',
        label: 'var(--ink-label)',
        muted: 'var(--ink-muted)',
        primary: {
          DEFAULT: 'var(--primary)',
          solid: 'var(--primary-solid)',
          hover: 'var(--primary-hover)',
          active: 'var(--primary-active)',
          subtle: 'var(--primary-subtle)',
          'subtle-fg': 'var(--primary-subtle-fg)',
          border: 'var(--primary-border)',
        },
        'on-primary': 'var(--on-primary)',
        violet: 'var(--accent-violet)',
        pink: 'var(--accent-pink)',
        positive: { DEFAULT: 'var(--positive)', solid: 'var(--positive-solid)', bg: 'var(--positive-bg)', border: 'var(--positive-border)' },
        critical: { DEFAULT: 'var(--critical)', solid: 'var(--critical-solid)', bg: 'var(--critical-bg)', border: 'var(--critical-border)' },
        negative: { DEFAULT: 'var(--negative)', solid: 'var(--negative-solid)', bg: 'var(--negative-bg)', border: 'var(--negative-border)' },
        informative: { DEFAULT: 'var(--informative)', bg: 'var(--informative-bg)' },
        neutral: { DEFAULT: 'var(--neutral)', bg: 'var(--neutral-bg)' },
        c1: 'var(--c1)', c2: 'var(--c2)', c3: 'var(--c3)', c4: 'var(--c4)', c5: 'var(--c5)', c6: 'var(--c6)', 'c-other': 'var(--c-other)',
      },
      borderColor: { DEFAULT: 'var(--border)', subtle: 'var(--border-subtle)', strong: 'var(--border-strong)' },
      borderRadius: { card: '12px', control: '8px', grid: '4px' },
      boxShadow: { e0: 'var(--shadow-0)', e1: 'var(--shadow-1)', e2: 'var(--shadow-2)' },
      zIndex: { sticky: '10', topbar: '30', sidebar: '40', backdrop: '50', drawer: '60', modal: '70', toast: '80', tooltip: '90' },
      fontFamily: { sans: 'var(--font-sans)', mono: 'var(--font-mono)' },
      backgroundImage: { brand: 'var(--grad-brand)' },
    },
  },
  plugins: [],
};

export default config;
