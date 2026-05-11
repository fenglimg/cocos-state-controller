

// panel/index.js, this filename needs to match the one registered in package.json

// 引入国际化支持
const { t } = require('../i18n-helper');
// 引入数据管理器
const dataManager = require('../data-manager');
// 引入日志管理器
const logger = require('../logger');
// SVG icon paths (from design-tokens.json, 16x16 viewBox)
const ICONS = {
  pin: '<svg class="icon" viewBox="0 0 16 16"><path d="M4.456 2.048A.75.75 0 0 1 5.052 1.5h5.896a.75.75 0 0 1 .596.548l1.2 4.5a.75.75 0 0 1-.122.66L10.5 9.966V13.5a.75.75 0 0 1-1.28.53L8 12.81l-1.22 1.22A.75.75 0 0 1 5.5 13.5V9.966L3.378 7.208a.75.75 0 0 1-.122-.66l1.2-4.5ZM5.56 3l-.934 3.5L6.5 8.876V11.19l.97-.97a.75.75 0 0 1 1.06 0l.97.97V8.876L11.374 6.5 10.44 3H5.56Z" fill="currentColor"/></svg>',
  chart: '<svg class="icon" viewBox="0 0 16 16"><path d="M1.75 14.5a.75.75 0 0 1 0-1.5h12.5a.75.75 0 0 1 0 1.5H1.75ZM3.5 11.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1h-1Zm3.5 0a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1H7Zm3.5 0a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-1Z" fill="currentColor"/></svg>',
  link: '<svg class="icon" viewBox="0 0 16 16"><path d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm-.025 9.45a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 1 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25Z" fill="currentColor"/></svg>',
  keyboard: '<svg class="icon" viewBox="0 0 16 16"><path d="M1 4.25A2.25 2.25 0 0 1 3.25 2h9.5A2.25 2.25 0 0 1 15 4.25v6.5A2.25 2.25 0 0 1 12.75 13h-9.5A2.25 2.25 0 0 1 1 10.75v-6.5Zm2.25-.75a.75.75 0 0 0-.75.75v6.5c0 .414.336.75.75.75h9.5a.75.75 0 0 0 .75-.75v-6.5a.75.75 0 0 0-.75-.75h-9.5ZM4 6.25a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 4 6.25Zm3.5 0A.75.75 0 0 1 8.25 5.5h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1-.75-.75Zm3.5 0a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1-.75-.75ZM4.75 9a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" fill="currentColor"/></svg>',
  note: '<svg class="icon" viewBox="0 0 16 16"><path d="M0 3.75C0 2.784.784 2 1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25v-8.5Zm1.75-.25a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25H1.75ZM3.5 6.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z" fill="currentColor"/></svg>',
  speech: '<svg class="icon" viewBox="0 0 16 16"><path d="M1 3.75C1 2.784 1.784 2 2.75 2h10.5c.966 0 1.75.784 1.75 1.75v6.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A.75.75 0 0 1 5.21 14.5V12H2.75A1.75 1.75 0 0 1 1 10.25v-6.5Zm1.75-.25a.25.25 0 0 0-.25.25v6.5c0 .138.112.25.25.25h3.21a.75.75 0 0 1 .75.75v1.44l1.96-1.96a.75.75 0 0 1 .53-.22h4.05a.25.25 0 0 0 .25-.25v-6.5a.25.25 0 0 0-.25-.25H2.75Z" fill="currentColor"/></svg>',
  trash: '<svg class="icon" viewBox="0 0 16 16"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM6.5 1.75v1.25h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25ZM3.613 5.5l.7 8.394A1.75 1.75 0 0 0 6.06 15.5h3.88a1.75 1.75 0 0 0 1.747-1.606l.7-8.394H3.613Z" fill="currentColor"/></svg>',
  star: '<svg class="icon" viewBox="0 0 16 16"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" fill="currentColor"/></svg>',
  fire: '<svg class="icon" viewBox="0 0 16 16"><path d="M7.998 14.5c-3.309 0-6-2.468-6-5.5 0-1.966 1.06-3.5 2.5-4.5.31-.215.69.02.66.39-.08.94.14 1.86.66 2.61.06-.53.35-1.36 1.18-2.5C8.498 3 9.498 1 7.998.5c-.16-.053.13-.277.29-.22C11.078 1.27 13.998 4 13.998 7.5c0 3.866-2.691 7-6 7Zm-.75-3c.65 1.1 2.5 1.5 3.25.5.86-1.15.5-2.7-.5-3.5-.43-.34-.51.04-.56.28-.1.47-.36.89-.76 1.22-.55-.77-.35-1.7.06-2.5-1.28.8-2.04 2.17-1.49 4Z" fill="currentColor"/></svg>',
};

Editor.Panel.extend({
  // css style for panel - 现代化设计
  style: `
    /* === Design Token CSS Variables === */
    /* Default theme: vibrant-dark */
    :host {
      /* Accent / Primary - bright electric blue */
      --primary-color: #5ba8ff;
      --primary-hover: #74b8ff;
      --primary-active: #3d8ee6;

      /* Semantic Status */
      --success-color: #50e3a4;
      --warning-color: #e8b83d;
      --error-color: #f45b6b;
      --info-color: #5cc4ff;

      /* Background - deep blue-gray tones */
      --bg-primary: #12141a;
      --bg-secondary: #171a22;
      --bg-tertiary: #1e2230;
      --bg-elevated: #252a3a;
      --bg-overlay: rgba(8, 10, 18, 0.6);
      --bg-hover: #1e2436;
      --bg-active: #283048;
      --bg-card: #171a22;

      /* Text - cool blue-tinted whites */
      --text-primary: #e2e8f4;
      --text-secondary: #a0aec4;
      --text-muted: #5c6a82;
      --text-inverse: #12141a;
      --text-link: #5cc4ff;

      /* Border */
      --border-default: #2a3042;
      --border-subtle: #1e2230;
      --border-strong: #3a4460;
      --border-focus: #5ba8ff;
      --border-color: #2a3042;
      --border-hover: #3a4460;

      /* Component: favorite - golden orange */
      --favorite-text: #ffb347;
      --favorite-bg: rgba(255, 179, 71, 0.10);
      --favorite-bg-hover: rgba(255, 179, 71, 0.18);
      --favorite-border: rgba(255, 179, 71, 0.25);

      /* Component: frequent - emerald green */
      --frequent-text: #50e3a4;
      --frequent-bg: rgba(80, 227, 164, 0.10);
      --frequent-bg-hover: rgba(80, 227, 164, 0.18);
      --frequent-border: rgba(80, 227, 164, 0.25);

      /* Component: normal - soft blue-gray */
      --normal-text: #8896b0;
      --normal-bg: rgba(136, 150, 176, 0.06);
      --normal-bg-hover: rgba(136, 150, 176, 0.12);
      --normal-border: rgba(136, 150, 176, 0.15);

      /* Primary transparent variants (for animations/interactions) */
      --primary-bg-12: var(--primary-bg-12);
      --primary-bg-15: var(--primary-bg-15);
      --primary-bg-25: var(--primary-bg-25);
      --warning-bg-05: var(--warning-bg-05);

      /* Interactive states */
      --disabled-bg: #1a1e28;
      --disabled-text: #3e4860;
      --disabled-border: #252a3a;
      --disabled-opacity: 0.5;

      /* Shadows */
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.35);
      --shadow-md: 0 2px 6px -1px rgba(0, 0, 0, 0.45), 0 1px 3px -1px rgba(0, 0, 0, 0.35);
      --shadow-lg: 0 6px 14px -3px rgba(0, 0, 0, 0.55), 0 3px 6px -2px rgba(0, 0, 0, 0.4);
      --shadow-inset: inset 0 1px 2px 0 rgba(0, 0, 0, 0.35);

      /* Radii */
      --radius-none: 0;
      --radius-sm: 3px;
      --radius-md: 5px;
      --radius-lg: 8px;
      --radius-xl: 12px;
      --radius-full: 9999px;

      /* Spacing */
      --spacing-0: 0px;
      --spacing-0-5: 2px;
      --spacing-1: 4px;
      --spacing-1-5: 6px;
      --spacing-2: 8px;
      --spacing-3: 12px;
      --spacing-4: 16px;
      --spacing-5: 20px;
      --spacing-6: 24px;
      --spacing-8: 32px;

      /* Typography */
      --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      --font-mono: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
      --font-size-xs: 10px;
      --font-size-sm: 11px;
      --font-size-base: 12px;
      --font-size-md: 13px;
      --font-size-lg: 14px;
      --font-size-xl: 16px;

      /* Transitions */
      --transition-fast: 100ms cubic-bezier(0.4, 0, 0.2, 1);
      --transition-normal: 150ms cubic-bezier(0.4, 0, 0.2, 1);
      --transition-slow: 250ms cubic-bezier(0.4, 0, 0.2, 1);
      --easing-default: cubic-bezier(0.4, 0, 0.2, 1);
      --easing-ease-in: cubic-bezier(0.4, 0, 1, 1);
      --easing-ease-out: cubic-bezier(0, 0, 0.2, 1);
      --easing-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

      /* Host layout */
      height: 100%;
      display: flex;
      flex-direction: column;
      position: relative;
      font-family: var(--font-ui);
      font-size: var(--font-size-base);
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    /* ============================================================
       Theme Overrides
       ============================================================ */

    /* === Theme: warm-dark === */
    :host([data-theme="warm-dark"]) {
      --primary-color: #e8a64b;
      --primary-hover: #f0b55a;
      --primary-active: #d4943e;

      --success-color: #6dbd8a;
      --warning-color: #e8a64b;
      --error-color: #e06060;
      --info-color: #7cb8d4;

      --bg-primary: #1c1816;
      --bg-secondary: #221d1a;
      --bg-tertiary: #2a2420;
      --bg-elevated: #342d27;
      --bg-overlay: rgba(16, 12, 10, 0.6);
      --bg-hover: #2e2722;
      --bg-active: #3a322b;
      --bg-card: #221d1a;

      --text-primary: #e8ddd0;
      --text-secondary: #b8a898;
      --text-muted: #7a6e62;
      --text-inverse: #1c1816;
      --text-link: #e8a64b;

      --border-default: #3a332c;
      --border-subtle: #2a2420;
      --border-strong: #4e453c;
      --border-focus: #e8a64b;
      --border-color: #3a332c;
      --border-hover: #4e453c;

      --favorite-text: #e8a0a0;
      --favorite-bg: rgba(232, 160, 160, 0.10);
      --favorite-bg-hover: rgba(232, 160, 160, 0.18);
      --favorite-border: rgba(232, 160, 160, 0.25);

      --frequent-text: #6dbd8a;
      --frequent-bg: rgba(109, 189, 138, 0.10);
      --frequent-bg-hover: rgba(109, 189, 138, 0.18);
      --frequent-border: rgba(109, 189, 138, 0.25);

      --normal-text: #a89888;
      --normal-bg: rgba(168, 152, 136, 0.06);
      --normal-bg-hover: rgba(168, 152, 136, 0.12);
      --normal-border: rgba(168, 152, 136, 0.15);

      --disabled-bg: #241f1b;
      --disabled-text: #5a5048;
      --disabled-border: #342d27;

      --shadow-sm: 0 1px 2px 0 rgba(10, 6, 4, 0.3);
      --shadow-md: 0 2px 6px -1px rgba(10, 6, 4, 0.4), 0 1px 3px -1px rgba(10, 6, 4, 0.3);
      --shadow-lg: 0 6px 14px -3px rgba(10, 6, 4, 0.5), 0 3px 6px -2px rgba(10, 6, 4, 0.35);
      --shadow-inset: inset 0 1px 2px 0 rgba(10, 6, 4, 0.3);
      --primary-bg-12: rgba(232, 166, 75, 0.12);
      --primary-bg-15: rgba(232, 166, 75, 0.15);
      --primary-bg-25: rgba(232, 166, 75, 0.25);
      --warning-bg-05: rgba(232, 166, 75, 0.05);
    }

    /* === Theme: cyberpunk === */
    :host([data-theme="cyberpunk"]) {
      --primary-color: #bf5af2;
      --primary-hover: #d07af8;
      --primary-active: #a040d8;

      --success-color: #00f5d4;
      --warning-color: #f0e030;
      --error-color: #ff2d78;
      --info-color: #00d4ff;

      --bg-primary: #0a0a0f;
      --bg-secondary: #0f0f18;
      --bg-tertiary: #161622;
      --bg-elevated: #1e1e30;
      --bg-overlay: rgba(4, 4, 8, 0.7);
      --bg-hover: #1a1a2e;
      --bg-active: #24243c;
      --bg-card: #0f0f18;

      --text-primary: #e0e0e8;
      --text-secondary: #a0a0b8;
      --text-muted: #5a5a72;
      --text-inverse: #0a0a0f;
      --text-link: #bf5af2;

      --border-default: #2a2a42;
      --border-subtle: #1a1a2c;
      --border-strong: #3c3c5e;
      --border-focus: #bf5af2;
      --border-color: #2a2a42;
      --border-hover: #3c3c5e;

      --favorite-text: #f0e030;
      --favorite-bg: rgba(240, 224, 48, 0.10);
      --favorite-bg-hover: rgba(240, 224, 48, 0.18);
      --favorite-border: rgba(240, 224, 48, 0.25);

      --frequent-text: #00f5d4;
      --frequent-bg: rgba(0, 245, 212, 0.10);
      --frequent-bg-hover: rgba(0, 245, 212, 0.18);
      --frequent-border: rgba(0, 245, 212, 0.25);

      --normal-text: #7070a0;
      --normal-bg: rgba(112, 112, 160, 0.06);
      --normal-bg-hover: rgba(112, 112, 160, 0.12);
      --normal-border: rgba(112, 112, 160, 0.15);

      --disabled-bg: #12121e;
      --disabled-text: #404060;
      --disabled-border: #1e1e30;

      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.4);
      --shadow-md: 0 2px 6px -1px rgba(0, 0, 0, 0.5), 0 1px 3px -1px rgba(0, 0, 0, 0.4);
      --shadow-lg: 0 6px 14px -3px rgba(0, 0, 0, 0.6), 0 3px 6px -2px rgba(0, 0, 0, 0.45);
      --shadow-inset: inset 0 1px 2px 0 rgba(0, 0, 0, 0.4);
      --primary-bg-12: rgba(191, 90, 242, 0.12);
      --primary-bg-15: rgba(191, 90, 242, 0.15);
      --primary-bg-25: rgba(191, 90, 242, 0.25);
      --warning-bg-05: rgba(240, 224, 48, 0.05);

      /* Cyberpunk glow */
      --shadow-glow: 0 0 8px rgba(191, 90, 242, 0.3);
    }

    /* === Theme: forest === */
    :host([data-theme="forest"]) {
      --primary-color: #3fb68b;
      --primary-hover: #4fcc9a;
      --primary-active: #32a07a;

      --success-color: #7dd87d;
      --warning-color: #e8c84a;
      --error-color: #e06060;
      --info-color: #58b8d8;

      --bg-primary: #141c17;
      --bg-secondary: #18221c;
      --bg-tertiary: #1e2a23;
      --bg-elevated: #26342b;
      --bg-overlay: rgba(10, 16, 12, 0.6);
      --bg-hover: #1e2e24;
      --bg-active: #263a2d;
      --bg-card: #18221c;

      --text-primary: #d4e8dc;
      --text-secondary: #98b8a6;
      --text-muted: #587868;
      --text-inverse: #141c17;
      --text-link: #4fcc9a;

      --border-default: #2a3c30;
      --border-subtle: #1e2a23;
      --border-strong: #3a5244;
      --border-focus: #3fb68b;
      --border-color: #2a3c30;
      --border-hover: #3a5244;

      --favorite-text: #e8c84a;
      --favorite-bg: rgba(232, 200, 74, 0.10);
      --favorite-bg-hover: rgba(232, 200, 74, 0.18);
      --favorite-border: rgba(232, 200, 74, 0.25);

      --frequent-text: #7dd87d;
      --frequent-bg: rgba(125, 216, 125, 0.10);
      --frequent-bg-hover: rgba(125, 216, 125, 0.18);
      --frequent-border: rgba(125, 216, 125, 0.25);

      --normal-text: #7a9888;
      --normal-bg: rgba(122, 152, 136, 0.06);
      --normal-bg-hover: rgba(122, 152, 136, 0.12);
      --normal-border: rgba(122, 152, 136, 0.15);

      --disabled-bg: #1a241e;
      --disabled-text: #3e5848;
      --disabled-border: #26342b;

      --shadow-sm: 0 1px 2px 0 rgba(6, 10, 8, 0.3);
      --shadow-md: 0 2px 6px -1px rgba(6, 10, 8, 0.4), 0 1px 3px -1px rgba(6, 10, 8, 0.3);
      --shadow-lg: 0 6px 14px -3px rgba(6, 10, 8, 0.5), 0 3px 6px -2px rgba(6, 10, 8, 0.35);
      --shadow-inset: inset 0 1px 2px 0 rgba(6, 10, 8, 0.3);
      --primary-bg-12: rgba(63, 182, 139, 0.12);
      --primary-bg-15: rgba(63, 182, 139, 0.15);
      --primary-bg-25: rgba(63, 182, 139, 0.25);
      --warning-bg-05: rgba(232, 200, 74, 0.05);
    }

    /* === Theme: sunset === */
    :host([data-theme="sunset"]) {
      --primary-color: #f06449;
      --primary-hover: #f47a64;
      --primary-active: #e85d3a;

      --success-color: #6dbd8a;
      --warning-color: #d4a837;
      --error-color: #e84a6f;
      --info-color: #68b0d8;

      --bg-primary: #181416;
      --bg-secondary: #1e1a1c;
      --bg-tertiary: #282224;
      --bg-elevated: #322a2c;
      --bg-overlay: rgba(12, 8, 10, 0.6);
      --bg-hover: #2c2226;
      --bg-active: #3a2e32;
      --bg-card: #1e1a1c;

      --text-primary: #ede4db;
      --text-secondary: #b8a8a0;
      --text-muted: #786860;
      --text-inverse: #181416;
      --text-link: #f06449;

      --border-default: #3a2e32;
      --border-subtle: #282224;
      --border-strong: #50404a;
      --border-focus: #f06449;
      --border-color: #3a2e32;
      --border-hover: #50404a;

      --favorite-text: #e84a6f;
      --favorite-bg: rgba(232, 74, 111, 0.10);
      --favorite-bg-hover: rgba(232, 74, 111, 0.18);
      --favorite-border: rgba(232, 74, 111, 0.25);

      --frequent-text: #d4a837;
      --frequent-bg: rgba(212, 168, 55, 0.10);
      --frequent-bg-hover: rgba(212, 168, 55, 0.18);
      --frequent-border: rgba(212, 168, 55, 0.25);

      --normal-text: #a89090;
      --normal-bg: rgba(168, 144, 144, 0.06);
      --normal-bg-hover: rgba(168, 144, 144, 0.12);
      --normal-border: rgba(168, 144, 144, 0.15);

      --disabled-bg: #201a1c;
      --disabled-text: #584848;
      --disabled-border: #322a2c;

      --shadow-sm: 0 1px 2px 0 rgba(10, 6, 8, 0.3);
      --shadow-md: 0 2px 6px -1px rgba(10, 6, 8, 0.4), 0 1px 3px -1px rgba(10, 6, 8, 0.3);
      --shadow-lg: 0 6px 14px -3px rgba(10, 6, 8, 0.5), 0 3px 6px -2px rgba(10, 6, 8, 0.35);
      --shadow-inset: inset 0 1px 2px 0 rgba(10, 6, 8, 0.3);
      --primary-bg-12: rgba(240, 100, 73, 0.12);
      --primary-bg-15: rgba(240, 100, 73, 0.15);
      --primary-bg-25: rgba(240, 100, 73, 0.25);
      --warning-bg-05: rgba(212, 168, 55, 0.05);
    }

    /* === Theme: ocean === */
    :host([data-theme="ocean"]) {
      --primary-color: #20c9b0;
      --primary-hover: #2bd4ba;
      --primary-active: #18b8a0;

      --success-color: #4dd0a0;
      --warning-color: #e0b040;
      --error-color: #f06070;
      --info-color: #48b8e8;

      --bg-primary: #101820;
      --bg-secondary: #141e28;
      --bg-tertiary: #1a2838;
      --bg-elevated: #223248;
      --bg-overlay: rgba(6, 10, 16, 0.6);
      --bg-hover: #1a2c40;
      --bg-active: #223850;
      --bg-card: #141e28;

      --text-primary: #d0e4ed;
      --text-secondary: #90b0c8;
      --text-muted: #507088;
      --text-inverse: #101820;
      --text-link: #2bd4ba;

      --border-default: #243848;
      --border-subtle: #1a2838;
      --border-strong: #324c62;
      --border-focus: #20c9b0;
      --border-color: #243848;
      --border-hover: #324c62;

      --favorite-text: #ff8a80;
      --favorite-bg: rgba(255, 138, 128, 0.10);
      --favorite-bg-hover: rgba(255, 138, 128, 0.18);
      --favorite-border: rgba(255, 138, 128, 0.25);

      --frequent-text: #4dd0a0;
      --frequent-bg: rgba(77, 208, 160, 0.10);
      --frequent-bg-hover: rgba(77, 208, 160, 0.18);
      --frequent-border: rgba(77, 208, 160, 0.25);

      --normal-text: #7898b0;
      --normal-bg: rgba(120, 152, 176, 0.06);
      --normal-bg-hover: rgba(120, 152, 176, 0.12);
      --normal-border: rgba(120, 152, 176, 0.15);

      --disabled-bg: #142028;
      --disabled-text: #385060;
      --disabled-border: #223248;

      --shadow-sm: 0 1px 2px 0 rgba(4, 8, 14, 0.35);
      --shadow-md: 0 2px 6px -1px rgba(4, 8, 14, 0.45), 0 1px 3px -1px rgba(4, 8, 14, 0.35);
      --shadow-lg: 0 6px 14px -3px rgba(4, 8, 14, 0.55), 0 3px 6px -2px rgba(4, 8, 14, 0.4);
      --shadow-inset: inset 0 1px 2px 0 rgba(4, 8, 14, 0.35);
      --primary-bg-12: rgba(32, 201, 176, 0.12);
      --primary-bg-15: rgba(32, 201, 176, 0.15);
      --primary-bg-25: rgba(32, 201, 176, 0.25);
      --warning-bg-05: rgba(224, 176, 64, 0.05);
    }

    /* === Cyberpunk glow effects === */
    :host([data-theme="cyberpunk"]) *:focus-visible {
      box-shadow: var(--shadow-glow);
    }

    /* === Icon base styles === */
    .icon {
      width: 14px;
      height: 14px;
      fill: currentColor;
      vertical-align: middle;
      flex-shrink: 0;
    }

    .icon-sm {
      width: 12px;
      height: 12px;
    }

    .icon-lg {
      width: 16px;
      height: 16px;
    }

    /* === Layout === */
    .container {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: var(--spacing-4);
      box-sizing: border-box;
      gap: var(--spacing-3);
    }

    .row {
      width: 100%;
      display: flex;
      flex-shrink: 0;
      gap: var(--spacing-2);
      align-items: center;
    }

    /* === Current Components Bar (#coms) === */
    #coms {
      max-height: 120px;
      overflow-x: auto;
      overflow-y: hidden;
      display: flex;
      gap: var(--spacing-2);
      padding: var(--spacing-2);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      scrollbar-width: thin;
      scrollbar-color: var(--bg-tertiary) var(--bg-secondary);
      transition: border-color var(--transition-fast);
    }

    #coms:hover {
      border-color: var(--border-strong);
    }

    #coms::-webkit-scrollbar {
      height: 4px;
    }

    #coms::-webkit-scrollbar-track {
      background: transparent;
      border-radius: var(--radius-sm);
    }

    #coms::-webkit-scrollbar-thumb {
      background: var(--bg-tertiary);
      border-radius: var(--radius-sm);
    }

    #coms::-webkit-scrollbar-thumb:hover {
      background: var(--border-strong);
    }

    /* Component tags in #coms - tag style from design tokens */
    #coms ui-button {
      flex-shrink: 0;
      min-width: auto;
      white-space: nowrap;
      background: var(--bg-elevated) !important;
      border: 1px solid var(--border-default) !important;
      border-radius: var(--radius-sm) !important;
      color: var(--text-secondary) !important;
      font-size: var(--font-size-sm) !important;
      font-weight: 500 !important;
      padding: var(--spacing-0-5) var(--spacing-2) !important;
      line-height: 1.2 !important;
      transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast) !important;
      cursor: pointer !important;
      position: relative !important;
      overflow: hidden !important;
    }

    #coms ui-button:hover {
      background: var(--bg-hover) !important;
      border-color: var(--border-strong) !important;
      color: var(--text-primary) !important;
    }

    #coms ui-button:active {
      background: var(--bg-active) !important;
    }

    /* Keyboard-operable component style */
    #coms ui-button.keyboard-operable {
      position: relative;
      transition: all var(--transition-normal);
    }

    #coms ui-button.keyboard-operable::after {
      content: "A \\2190 \\2192 D";
      position: absolute;
      top: -28px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-elevated);
      color: var(--text-secondary);
      padding: var(--spacing-0-5) var(--spacing-1-5);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
      font-weight: 500;
      white-space: nowrap;
      opacity: 0;
      transition: opacity var(--transition-normal);
      pointer-events: none;
      z-index: 1000;
      box-shadow: var(--shadow-md);
    }

    #coms ui-button.keyboard-operable:hover::after {
      opacity: 1;
    }

    #coms ui-button.hover-active {
      border: 1px solid var(--primary-color) !important;
      background: var(--primary-bg-12) !important;
      box-shadow: 0 0 0 2px var(--primary-bg-15) !important;
      animation: activePulse 2s infinite;
    }

    @keyframes activePulse {
      0%, 100% {
        box-shadow: 0 0 0 2px var(--primary-bg-15);
      }
      50% {
        box-shadow: 0 0 0 4px var(--primary-bg-25);
      }
    }

    #coms ui-button.moving-left {
      animation: moveLeft 0.4s var(--easing-default);
      border: 1px solid var(--primary-color) !important;
      background: var(--primary-bg-12) !important;
      z-index: 10;
      position: relative;
    }

    #coms ui-button.moving-right {
      animation: moveRight 0.4s var(--easing-default);
      border: 1px solid var(--primary-color) !important;
      background: var(--primary-bg-12) !important;
      z-index: 10;
      position: relative;
    }

    @keyframes moveLeft {
      0% { transform: translateX(0); }
      50% { transform: translateX(-16px); }
      100% { transform: translateX(0); }
    }

    @keyframes moveRight {
      0% { transform: translateX(0); }
      50% { transform: translateX(16px); }
      100% { transform: translateX(0); }
    }

    /* Drag hint */
    .drag-hint {
      position: absolute;
      background: var(--bg-elevated);
      color: var(--text-primary);
      padding: var(--spacing-1) var(--spacing-2);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-sm);
      font-weight: 500;
      pointer-events: none;
      z-index: 1000;
      white-space: nowrap;
      box-shadow: var(--shadow-md);
    }

    /* Scrollable indicator */
    #coms.scrollable {
      border: 1px dashed var(--warning-color);
      background: var(--warning-bg-05);
    }

    /* === Search Input (#com_name) - Input component style === */
    #com_name {
      flex: 1 !important;
      height: 28px !important;
      padding: var(--spacing-1) var(--spacing-2) !important;
      background: var(--bg-elevated) !important;
      border: 1px solid var(--border-default) !important;
      border-radius: var(--radius-sm) !important;
      color: var(--text-primary) !important;
      font-size: var(--font-size-base) !important;
      font-family: var(--font-ui) !important;
      line-height: 1.4 !important;
      transition: border-color var(--transition-fast), background var(--transition-fast) !important;
      outline: none !important;
    }

    #com_name:hover {
      border-color: var(--border-strong) !important;
    }

    #com_name:focus {
      border-color: var(--primary-color) !important;
      outline: none !important;
    }

    #com_name::placeholder {
      color: var(--text-muted) !important;
      font-style: normal !important;
    }

    /* === Action Buttons (row buttons) - Button component styles === */
    .row ui-button {
      height: 28px !important;
      min-width: 28px !important;
      padding: 0 var(--spacing-2) !important;
      background: var(--bg-elevated) !important;
      border: 1px solid var(--border-default) !important;
      border-radius: var(--radius-md) !important;
      color: var(--text-secondary) !important;
      font-size: var(--font-size-base) !important;
      font-weight: 500 !important;
      transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast) !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    .row ui-button:hover {
      background: var(--bg-hover) !important;
      border-color: var(--border-strong) !important;
      color: var(--text-primary) !important;
    }

    .row ui-button:active {
      background: var(--bg-active) !important;
      border-color: var(--primary-color) !important;
    }

    /* Primary action button (#btn - add component) */
    #btn {
      background: var(--primary-color) !important;
      border-color: transparent !important;
      color: #ffffff !important;
    }

    #btn:hover {
      background: var(--primary-hover) !important;
      border-color: transparent !important;
      color: #ffffff !important;
    }

    #btn:active {
      background: var(--primary-active) !important;
    }

    /* === Search Results (#list) === */
    #list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
      flex: 1;
      overflow-y: auto;
      min-height: 0;
      align-content: start;
      padding: var(--spacing-1);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      scrollbar-width: thin;
      scrollbar-color: var(--bg-tertiary) var(--bg-secondary);
    }

    #list::-webkit-scrollbar {
      width: 4px;
    }

    #list::-webkit-scrollbar-track {
      background: transparent;
      border-radius: var(--radius-sm);
    }

    #list::-webkit-scrollbar-thumb {
      background: var(--bg-tertiary);
      border-radius: var(--radius-sm);
    }

    #list::-webkit-scrollbar-thumb:hover {
      background: var(--border-strong);
    }

    /* Component count badge */
    .ctex {
      font-weight: 600;
      font-size: var(--font-size-xs);
      color: var(--info-color);
      background: rgba(92, 196, 255, 0.15);
      padding: 2px 6px;
      border-radius: var(--radius-full);
      margin-right: var(--spacing-1);
      line-height: 1;
    }

    /* === Search Result Cards - Card component style === */
    .search-result {
      padding: var(--spacing-2) var(--spacing-3);
      background: var(--bg-secondary);
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      transition: background var(--transition-fast), border-color var(--transition-fast);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      min-height: 32px;
      font-size: var(--font-size-md);
      font-weight: 400;
      color: var(--text-primary);
      position: relative;
    }

    .search-result:hover {
      background: var(--bg-hover);
      border-color: var(--border-default);
    }

    .search-result:active {
      background: var(--bg-active);
      border-color: var(--primary-color);
    }

    /* Match type indicators */
    .exact-match {
      color: var(--success-color);
      font-weight: 600;
    }

    .prefix-match {
      color: var(--info-color);
      font-weight: 600;
    }

    /* Normal component result */
    .search-result.normal {
      background: var(--normal-bg);
    }

    .search-result.normal:hover {
      background: var(--normal-bg-hover);
    }

    /* Favorite component result */
    .search-result.favorite {
      background: var(--favorite-bg) !important;
      border: 1px solid var(--favorite-border) !important;
      color: var(--text-primary) !important;
    }

    .search-result.favorite:hover {
      background: var(--favorite-bg-hover) !important;
      border-color: var(--favorite-text) !important;
    }

    /* Frequent component result */
    .search-result.frequent {
      background: var(--frequent-bg) !important;
      border: 1px solid var(--frequent-border) !important;
      color: var(--text-primary) !important;
    }

    .search-result.frequent:hover {
      background: var(--frequent-bg-hover) !important;
      border-color: var(--frequent-text) !important;
    }

    /* Favorite + frequent combo */
    .search-result.favorite.frequent {
      background: var(--favorite-bg) !important;
      border: 1px solid var(--favorite-border) !important;
    }

    .search-result.favorite.frequent:hover {
      background: var(--favorite-bg-hover) !important;
    }

    /* Component name */
    .component-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--font-mono);
      font-size: var(--font-size-md);
      line-height: 1.4;
    }

    /* Component badges container */
    .component-badges {
      margin-left: auto;
      display: flex;
      gap: var(--spacing-1);
      flex-shrink: 0;
    }

    /* Badge - from design tokens badge component */
    .badge {
      font-size: var(--font-size-xs);
      font-weight: 600;
      line-height: 1;
      border-radius: var(--radius-full);
      padding: 2px 6px;
      display: inline-flex;
      align-items: center;
    }

    .badge.favorite {
      background: var(--favorite-bg-hover);
      color: var(--favorite-text);
    }

    .badge.frequent {
      background: var(--frequent-bg-hover);
      color: var(--frequent-text);
    }

    .badge.normal {
      background: var(--bg-elevated);
      color: var(--text-secondary);
    }

    /* === Settings Page === */
    #settings-page {
      background: var(--bg-primary);
    }

    .settings-header-bar {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      padding: var(--spacing-3);
      flex-shrink: 0;
    }

    .settings-header-bar ui-button {
      height: 28px !important;
      min-width: 28px !important;
      padding: 0 var(--spacing-2) !important;
      background: var(--bg-elevated) !important;
      border: 1px solid var(--border-default) !important;
      border-radius: var(--radius-md) !important;
      color: var(--text-secondary) !important;
      font-size: var(--font-size-base) !important;
      transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast) !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    .settings-header-bar ui-button:hover {
      background: var(--bg-hover) !important;
      border-color: var(--border-strong) !important;
      color: var(--text-primary) !important;
    }

    .settings-header-bar ui-button:active {
      background: var(--bg-active) !important;
      border-color: var(--primary-color) !important;
    }

    .settings-page-title {
      flex: 1;
      display: flex;
      align-items: center;
      color: var(--text-primary);
      font-weight: 600;
      font-size: var(--font-size-lg);
      gap: var(--spacing-2);
    }

    #settings-content-page {
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      padding: var(--spacing-4);
      flex: 1;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: var(--bg-tertiary) transparent;
    }

    #settings-content-page::-webkit-scrollbar {
      width: 4px;
    }

    #settings-content-page::-webkit-scrollbar-track {
      background: transparent;
    }

    #settings-content-page::-webkit-scrollbar-thumb {
      background: var(--bg-tertiary);
      border-radius: var(--radius-sm);
    }

    /* === Page Transition === */
    .page-view {
      transition: opacity 150ms cubic-bezier(0.4, 0, 0.2, 1),
                  transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .page-active {
      opacity: 1;
      transform: translateX(0);
      pointer-events: auto;
    }

    .page-hidden {
      opacity: 0;
      transform: translateX(-10px);
      pointer-events: none;
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
    }

    /* Settings section - card style */
    .settings-section {
      margin-bottom: var(--spacing-6);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      padding: var(--spacing-4);
      transition: border-color var(--transition-fast);
    }

    .settings-section:hover {
      border-color: var(--border-strong);
    }

    .settings-section:last-child {
      margin-bottom: 0;
    }

    /* Section header - from design tokens sectionHeader */
    .settings-section-title {
      color: var(--text-secondary);
      font-weight: 600;
      font-size: var(--font-size-sm);
      letter-spacing: 0.02em;
      text-transform: uppercase;
      margin-bottom: var(--spacing-3);
      display: flex;
      align-items: center;
      gap: var(--spacing-1-5);
      padding-bottom: var(--spacing-2);
      border-bottom: 1px solid var(--border-subtle);
    }

    .settings-section-title .icon {
      opacity: 0.7;
    }

    /* Favorites list */
    .favorites-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
      margin-bottom: var(--spacing-3);
      min-height: 80px;
      max-height: 240px;
      height: auto;
      overflow-y: auto;
      padding: var(--spacing-2);
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      flex-shrink: 0;
      scrollbar-width: thin;
      scrollbar-color: var(--bg-tertiary) transparent;
    }

    .favorites-list::-webkit-scrollbar {
      width: 4px;
    }

    .favorites-list::-webkit-scrollbar-track {
      background: transparent;
    }

    .favorites-list::-webkit-scrollbar-thumb {
      background: var(--border-default);
      border-radius: var(--radius-sm);
    }

    .favorite-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--bg-elevated);
      padding: var(--spacing-2) var(--spacing-3);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-md);
      color: var(--text-primary);
      cursor: pointer;
      min-height: 32px;
      transition: background var(--transition-fast), border-color var(--transition-fast);
    }

    .favorite-item:hover {
      background: var(--bg-hover);
      border-color: var(--border-strong);
    }

    .favorite-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--font-mono);
      font-weight: 500;
    }

    .favorite-item .remove-btn {
      margin-left: var(--spacing-3);
      color: var(--error-color);
      cursor: pointer;
      font-weight: 600;
      padding: var(--spacing-0-5) var(--spacing-1);
      border-radius: var(--radius-sm);
      transition: background var(--transition-fast), color var(--transition-fast);
      font-size: var(--font-size-sm);
    }

    .favorite-item .remove-btn:hover {
      background: rgba(244, 91, 107, 0.15);
      color: var(--error-color);
    }

    /* Stats list */
    .stats-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: var(--spacing-2);
    }

    .stat-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--spacing-3);
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      transition: border-color var(--transition-fast);
    }

    .stat-item:hover {
      border-color: var(--border-strong);
    }

    .stat-label {
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
      font-weight: 500;
    }

    .stat-value {
      font-size: var(--font-size-xl);
      font-weight: 700;
      color: var(--primary-color);
      font-family: var(--font-mono);
    }

    /* Form group */
    .form-group {
      margin-bottom: var(--spacing-3);
      display: flex;
      align-items: center;
      min-height: 32px;
      gap: var(--spacing-3);
    }

    .form-group label {
      color: var(--text-primary);
      flex: 1;
      line-height: 1.4;
      font-size: var(--font-size-md);
      font-weight: 400;
      order: 1;
      cursor: pointer;
      transition: color var(--transition-fast);
    }

    .form-group label:hover {
      color: var(--info-color);
    }

    .form-group input[type="checkbox"] {
      width: 16px;
      height: 16px;
      margin: 0;
      flex-shrink: 0;
      order: 2;
      accent-color: var(--primary-color);
      cursor: pointer;
    }

    .form-group select {
      padding: var(--spacing-1) var(--spacing-2);
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      color: var(--text-primary);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-md);
      font-weight: 400;
      transition: border-color var(--transition-fast);
      cursor: pointer;
    }

    .form-group select:hover {
      border-color: var(--border-strong);
    }

    .form-group select:focus {
      border-color: var(--primary-color);
      outline: none;
    }

    .form-group input[type="text"] {
      padding: var(--spacing-1) var(--spacing-2);
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      color: var(--text-primary);
      border-radius: var(--radius-sm);
      flex: 1;
      font-size: var(--font-size-md);
      font-weight: 400;
      transition: border-color var(--transition-fast);
    }

    .form-group input[type="text"]:hover {
      border-color: var(--border-strong);
    }

    .form-group input[type="text"]:focus {
      border-color: var(--primary-color);
      outline: none;
    }

    /* Auto-mount options */
    .auto-mount-options {
      margin-left: var(--spacing-6);
      margin-top: var(--spacing-3);
      padding: var(--spacing-3);
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      border-left: 2px solid var(--primary-color);
    }

    /* Button group */
    .button-group {
      display: flex;
      gap: var(--spacing-2);
      margin-top: var(--spacing-3);
      flex-wrap: wrap;
    }

    /* Button group - primary button variant */
    .button-group ui-button {
      padding: var(--spacing-1) var(--spacing-3) !important;
      background: var(--primary-color) !important;
      border: 1px solid transparent !important;
      border-radius: var(--radius-md) !important;
      color: #ffffff !important;
      font-size: var(--font-size-base) !important;
      font-weight: 500 !important;
      transition: background var(--transition-fast), color var(--transition-fast) !important;
      cursor: pointer !important;
      min-height: 28px !important;
    }

    .button-group ui-button:hover {
      background: var(--primary-hover) !important;
    }

    .button-group ui-button:active {
      background: var(--primary-active) !important;
    }

    /* Button group - secondary variant */
    .button-group ui-button.btn-secondary {
      background: var(--bg-elevated) !important;
      border: 1px solid var(--border-default) !important;
      color: var(--text-primary) !important;
    }

    .button-group ui-button.btn-secondary:hover {
      background: var(--bg-hover) !important;
      border-color: var(--border-strong) !important;
    }

    /* Compact form */
    .compact-form {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      margin-bottom: var(--spacing-3);
      padding: var(--spacing-3);
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
    }

    .compact-form label {
      margin: 0;
      white-space: nowrap;
      font-size: var(--font-size-md);
      font-weight: 500;
      color: var(--text-primary);
    }

    /* Auto-mount options form-group overrides */
    .auto-mount-options .form-group {
      margin-bottom: var(--spacing-2);
    }

    .auto-mount-options .form-group:last-child {
      margin-bottom: 0;
    }

    /* Main settings item */
    .settings-section > .form-group {
      font-weight: 600;
      padding-bottom: var(--spacing-2);
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: var(--spacing-3);
    }

    /* Button container */
    .button-container {
      display: flex;
      align-items: center;
      margin-left: var(--spacing-6);
      margin-top: var(--spacing-3);
      min-height: 32px;
    }

    /* === Theme Selection === */
    .theme-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--spacing-2);
      padding: var(--spacing-1) 0;
    }

    .theme-card {
      cursor: pointer;
      text-align: center;
      padding: var(--spacing-1-5);
      border-radius: var(--radius-md);
      transition: background var(--transition-fast);
    }

    .theme-card:hover {
      background: var(--bg-hover);
    }

    .theme-card.active {
      background: var(--bg-active);
    }

    .theme-preview {
      width: 100%;
      height: 36px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-1);
      padding: var(--spacing-1);
      transition: border-color var(--transition-fast);
    }

    .theme-preview-accent {
      width: 10px;
      height: 10px;
      border-radius: var(--radius-full);
      flex-shrink: 0;
    }

    .theme-preview-text {
      font-size: var(--font-size-sm);
      font-weight: 600;
      font-family: var(--font-mono);
    }

    .theme-card-label {
      font-size: var(--font-size-xs);
      color: var(--text-secondary);
      margin-top: var(--spacing-1);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .theme-card.active .theme-card-label {
      color: var(--text-primary);
      font-weight: 500;
    }

    /* === Responsive Design === */
    @media (max-height: 600px) {
      .favorites-list {
        max-height: 120px;
        min-height: 60px;
      }

      .settings-section {
        padding: var(--spacing-3);
        margin-bottom: var(--spacing-3);
      }

      .stats-list {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 600px) {
      .stats-list {
        grid-template-columns: 1fr;
      }

      .compact-form {
        flex-direction: column;
        align-items: stretch;
      }

      .button-group {
        flex-direction: column;
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }

    /* Focus visibility */
    *:focus-visible {
      outline: 1px solid var(--primary-color);
      outline-offset: -1px;
    }

  `,

  // html template for panel
  template: `
    <!-- Main page -->
    <div id="main" class="container page-view page-active">
      <div class="row" id="coms"></div>
      <div class="row">
        <input id="com_name" placeholder="" type="">
        <ui-button id="btn" title="添加组件">
          <svg class="icon" viewBox="0 0 16 16"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z" fill="currentColor"/></svg>
        </ui-button>
        <ui-button id="refresh-btn" title="刷新组件列表">
          <svg class="icon" viewBox="0 0 16 16"><path d="M8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.001 7.001 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.501 5.501 0 0 0 8 2.5ZM1.705 8.005a.75.75 0 0 1 .834.656 5.501 5.501 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.001 7.001 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834Z" fill="currentColor"/></svg>
        </ui-button>
        <ui-button id="settings-btn" title="设置">
          <svg class="icon" viewBox="0 0 16 16"><path d="M8 1a.75.75 0 0 1 .75.75v.3c.78.12 1.5.44 2.1.9l.21-.21a.75.75 0 0 1 1.06 1.06l-.21.21c.46.6.78 1.32.9 2.1h.3a.75.75 0 0 1 0 1.5h-.3c-.12.78-.44 1.5-.9 2.1l.21.21a.75.75 0 0 1-1.06 1.06l-.21-.21c-.6.46-1.32.78-2.1.9v.3a.75.75 0 0 1-1.5 0v-.3c-.78-.12-1.5-.44-2.1-.9l-.21.21a.75.75 0 0 1-1.06-1.06l.21-.21a4.49 4.49 0 0 1-.9-2.1h-.3a.75.75 0 0 1 0-1.5h.3c.12-.78.44-1.5.9-2.1l-.21-.21a.75.75 0 0 1 1.06-1.06l.21.21c.6-.46 1.32-.78 2.1-.9v-.3A.75.75 0 0 1 8 1ZM6 8a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" fill="currentColor"/></svg>
        </ui-button>
      </div>
      <div id="list"></div>
    </div>

    <!-- Settings page -->
    <div id="settings-page" class="container page-view page-hidden">
      <div class="settings-header-bar">
        <ui-button id="back-btn" title="返回">
          <svg class="icon" viewBox="0 0 16 16"><path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L4.56 7.25h7.69a.75.75 0 0 1 0 1.5H4.56l3.22 3.22a.75.75 0 0 1 0 1.06Z" fill="currentColor"/></svg>
        </ui-button>
        <div class="settings-page-title">
          <svg class="icon-lg" viewBox="0 0 16 16"><path d="M8 1a.75.75 0 0 1 .75.75v.3c.78.12 1.5.44 2.1.9l.21-.21a.75.75 0 0 1 1.06 1.06l-.21.21c.46.6.78 1.32.9 2.1h.3a.75.75 0 0 1 0 1.5h-.3c-.12.78-.44 1.5-.9 2.1l.21.21a.75.75 0 0 1-1.06 1.06l-.21-.21c-.6.46-1.32.78-2.1.9v.3a.75.75 0 0 1-1.5 0v-.3c-.78-.12-1.5-.44-2.1-.9l-.21.21a.75.75 0 0 1-1.06-1.06l.21-.21a4.49 4.49 0 0 1-.9-2.1h-.3a.75.75 0 0 1 0-1.5h.3c.12-.78.44-1.5.9-2.1l-.21-.21a.75.75 0 0 1 1.06-1.06l.21.21c.6-.46 1.32-.78 2.1-.9v-.3A.75.75 0 0 1 8 1ZM6 8a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" fill="currentColor"/></svg>
          智能组件管理器设置
        </div>
      </div>
      <div id="settings-content-page">
        <!-- Settings content dynamically generated -->
      </div>
    </div>

    <div id="tip"></div>

  `,

  // element and variable binding
  $: {
    btn: '#btn',
    refreshBtn: '#refresh-btn',
    eb: "#com_name",
    list: "#list",
    main: "#main",
    tip: "#tip",
    curComs: "#coms",
    // 设置按钮和页面
    settingsBtn: '#settings-btn',
    settingsPage: '#settings-page',
    backBtn: '#back-btn',
    settingsContentPage: '#settings-content-page',
    // 弹窗元素已移除，现在使用页面切换
    // 收藏管理
    favoritesList: '#favorites-list',
    clearFavoritesBtn: '#clear-favorites-btn',
    // 统计信息
    totalComponents: '#total-components',
    favoritesCount: '#favorites-count',
    totalUsage: '#total-usage',
    selectedNodes: '#selected-nodes',
    // 自动挂载设置
    autoMountEnabled: '#auto-mount-enabled',
    autoMountOptions: '#auto-mount-options',
    ignoreCase: '#ignore-case',
    flexibleMatching: '#flexible-matching',
    showMountLog: '#show-mount-log',
    applyMountSettingsBtn: '#apply-mount-settings-btn',
    // 日志设置
    logLevelSelect: '#log-level-select',
    applyLogLevelBtn: '#apply-log-level-btn',
    // 确认对话框设置
    deleteComponentConfirm: '#delete-component-confirm',
    favoriteToggleConfirm: '#favorite-toggle-confirm',
    applyConfirmationSettingsBtn: '#apply-confirmation-settings-btn'
  },

  curMatchs: [],
  // 键盘操作状态管理
  hoveredComponentButton: null,
  hoveredComponentName: null,
  componentButtons: [],

  // method executed when template and styles are successfully loaded and initialized
  ready() {
    // 初始化防抖控制
    this.addComponentDebounce = {};
    this.lastClickTime = {};

    // 初始化组件移动锁定状态
    this.isComponentMoveLocked = false;
    this.unlockTimer = null;

    // 初始化鼠标位置跟踪
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // 添加全局鼠标移动监听器
    document.addEventListener('mousemove', (e) => {
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    // 设置国际化文本
    this.$eb.placeholder = t('PANEL.placeholder');
    this.$tip.textContent = t('PANEL.no_selection');

    this.$eb.oninput = this.onInput2.bind(this);
    this.$eb.onkeydown = (e) => {
      // 回车
      if (e.keyCode == 13) {
        if (this.curMatchs.length > 0) {
          this.addCom(this.curMatchs[0].origin);
        }
      }
    };

    // 延迟设置快捷键，确保数据管理器完全初始化
    setTimeout(() => {
      this.setupGlobalKeyboardShortcuts();
      this.setupComponentMoveKeyboard();
    }, 600); // 比数据管理器的延迟稍长一些

    // 为已有组件区域添加鼠标滚轮支持
    this.setupComponentsScrolling();

    this.$btn.addEventListener('confirm', () => {
      if (this.curMatchs.length > 0) {
        this.addCom(this.curMatchs[0].origin);
      }
    });
    this.$refreshBtn.addEventListener('confirm', () => {
      this.refreshCurComs();
      logger.info('已手动刷新组件列表');
    });

    // 设置按钮事件监听
    this.$settingsBtn.addEventListener('confirm', () => {
      this.showSettingsPage();
    });

    // 返回按钮
    this.$backBtn.addEventListener('confirm', () => {
      this.showMainPage();
    });


    this.refresh();

    // 恢复用户主题
    this.applyTheme(dataManager.getTheme());

    // 初始化收藏组件显示（空输入时显示收藏组件）
    setTimeout(() => {
      this.onInput2();
    }, 100);

    logger.info(t('PANEL.init_complete'));
  },

  // 设置全局快捷键
  setupGlobalKeyboardShortcuts() {
    // 移除旧的监听器（如果存在）
    if (this.globalKeydownHandler) {
      document.removeEventListener('keydown', this.globalKeydownHandler);
    }

    // 获取用户配置的快捷键
    const shortcutSettings = dataManager.getShortcutSettings();
    const focusShortcut = shortcutSettings.focusSearchInput;

    // 调试信息
    logger.info(`快捷键设置: 聚焦搜索框 = ${focusShortcut}`);

    // 创建键盘事件处理器
    this.globalKeydownHandler = (e) => {
      // 检查是否匹配聚焦搜索框的快捷键
      if (focusShortcut && this.matchesShortcut(e, focusShortcut)) {
        e.preventDefault(); // 阻止浏览器默认行为
        this.focusSearchInput();
        return;
      }
      // Escape 键清空搜索框（固定快捷键）
      if (e.key === 'Escape') {
        this.clearSearchInput();
        return;
      }
    };

    // 监听整个面板的键盘事件
    document.addEventListener('keydown', this.globalKeydownHandler);
  },

  // 检查键盘事件是否匹配指定的快捷键
  matchesShortcut(event, shortcut) {
    if (!shortcut) return false;

    // 解析快捷键字符串
    const parts = shortcut.split('+');
    const key = parts[parts.length - 1].toLowerCase();
    const modifiers = parts.slice(0, -1).map(m => m.toLowerCase());

    // 调试信息
    const eventInfo = {
      key: event.key.toLowerCase(),
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey
    };

    // 检查主键
    let keyMatches = false;
    if (key.startsWith('f') && /^f\d{1,2}$/.test(key)) {
      // F键
      keyMatches = event.key.toLowerCase() === key;
    } else {
      // 字母键
      keyMatches = event.key.toLowerCase() === key;
    }

    if (!keyMatches) {
      // 调试：键不匹配时的信息
      if (event.ctrlKey || event.metaKey) {
        logger.debug(`快捷键不匹配: 期望键 '${key}', 实际键 '${event.key.toLowerCase()}'`);
      }
      return false;
    }

    // 检查修饰键
    const hasCtrl = event.ctrlKey || event.metaKey; // Cmd在Mac上对应metaKey
    const hasAlt = event.altKey;
    const hasShift = event.shiftKey;

    const needsCtrl = modifiers.includes('cmdorctrl') || modifiers.includes('ctrl');
    const needsAlt = modifiers.includes('alt');
    const needsShift = modifiers.includes('shift');

    const matches = hasCtrl === needsCtrl && hasAlt === needsAlt && hasShift === needsShift;

    // 调试信息
    if (keyMatches) {
      logger.debug(`快捷键匹配检查: ${shortcut}`);
      logger.debug(`  解析结果: 键='${key}', 修饰键=[${modifiers.join(', ')}]`);
      logger.debug(`  事件状态: ${JSON.stringify(eventInfo)}`);
      logger.debug(`  修饰键检查: hasCtrl=${hasCtrl}, needsCtrl=${needsCtrl}, hasAlt=${hasAlt}, needsAlt=${needsAlt}, hasShift=${hasShift}, needsShift=${needsShift}`);
      logger.debug(`  最终匹配结果: ${matches}`);
    }

    return matches;
  },

  // 设置已有组件区域的滚轮滚动支持
  setupComponentsScrolling() {
    if (!this.$curComs) return;

    // 滚动动画相关变量
    let isScrolling = false;
    let scrollAnimationId = null;
    let targetScrollLeft = 0;

    // 平滑滚动动画函数
    const smoothScrollTo = (target) => {
      const start = this.$curComs.scrollLeft;
      const distance = target - start;
      const duration = 200; // 动画持续时间（毫秒）
      let startTime = null;

      const animateScroll = (currentTime) => {
        if (!startTime) startTime = currentTime;
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // 使用缓动函数，让滚动更自然
        const easeOutCubic = 1 - Math.pow(1 - progress, 3);

        this.$curComs.scrollLeft = start + distance * easeOutCubic;

        if (progress < 1) {
          scrollAnimationId = requestAnimationFrame(animateScroll);
        } else {
          isScrolling = false;
          scrollAnimationId = null;
        }
      };

      if (scrollAnimationId) {
        cancelAnimationFrame(scrollAnimationId);
      }

      isScrolling = true;
      scrollAnimationId = requestAnimationFrame(animateScroll);
    };

    // 添加鼠标滚轮事件监听
    this.$curComs.addEventListener('wheel', (e) => {
      // 只有当内容超出容器宽度时才处理滚轮事件
      if (this.$curComs.scrollWidth <= this.$curComs.clientWidth) {
        return; // 让事件继续传播，进行正常的垂直滚动
      }

      // 检查是否是水平滚动（触摸板）
      const isHorizontalScroll = Math.abs(e.deltaX) > Math.abs(e.deltaY);

      if (isHorizontalScroll) {
        // 触摸板水平滚动，使用原生滚动
        return;
      }

      // 阻止默认的垂直滚动行为
      e.preventDefault();

      // 根据滚轮速度动态调整滚动距离，让滚动更精细
      const wheelDelta = e.deltaY;
      let scrollSpeed;

      // 根据滚轮速度分级调整
      if (Math.abs(wheelDelta) > 120) {
        scrollSpeed = 100; // 快速滚动
      } else if (Math.abs(wheelDelta) > 40) {
        scrollSpeed = 60;  // 中等速度
      } else {
        scrollSpeed = 30;  // 慢速滚动，更精细
      }

      const scrollDirection = wheelDelta > 0 ? 1 : -1;
      const scrollAmount = scrollSpeed * scrollDirection;

      // 计算目标滚动位置
      targetScrollLeft = Math.max(0, Math.min(
        this.$curComs.scrollLeft + scrollAmount,
        this.$curComs.scrollWidth - this.$curComs.clientWidth
      ));

      // 执行平滑滚动
      smoothScrollTo(targetScrollLeft);
    }, { passive: false }); // passive: false 允许preventDefault

    // 添加键盘导航支持
    this.$curComs.addEventListener('keydown', (e) => {
      if (this.$curComs.scrollWidth <= this.$curComs.clientWidth) {
        return;
      }

      let scrollAmount = 0;

      switch (e.key) {
        case 'ArrowLeft':
          scrollAmount = -60;
          break;
        case 'ArrowRight':
          scrollAmount = 60;
          break;
        case 'Home':
          targetScrollLeft = 0;
          smoothScrollTo(targetScrollLeft);
          e.preventDefault();
          return;
        case 'End':
          targetScrollLeft = this.$curComs.scrollWidth - this.$curComs.clientWidth;
          smoothScrollTo(targetScrollLeft);
          e.preventDefault();
          return;
        default:
          return;
      }

      if (scrollAmount !== 0) {
        e.preventDefault();
        targetScrollLeft = Math.max(0, Math.min(
          this.$curComs.scrollLeft + scrollAmount,
          this.$curComs.scrollWidth - this.$curComs.clientWidth
        ));
        smoothScrollTo(targetScrollLeft);
      }
    });

    // 让组件区域可以获得焦点以支持键盘导航
    this.$curComs.setAttribute('tabindex', '0');

    // 检查并更新滚动状态的函数
    const updateScrollState = () => {
      const hasOverflow = this.$curComs.scrollWidth > this.$curComs.clientWidth;

      if (hasOverflow) {
        this.$curComs.classList.add('scrollable');
      } else {
        this.$curComs.classList.remove('scrollable');
      }
    };

    // 添加鼠标进入/离开时的视觉提示
    this.$curComs.addEventListener('mouseenter', () => {
      updateScrollState();
      if (this.$curComs.classList.contains('scrollable')) {
        this.$curComs.setAttribute('title', '使用鼠标滚轮可以水平滚动查看更多组件');
      }
    });

    this.$curComs.addEventListener('mouseleave', () => {
      this.$curComs.removeAttribute('title');
    });

    // 监听内容变化，更新滚动状态
    const observer = new MutationObserver(() => {
      // 延迟检查，确保DOM更新完成
      setTimeout(updateScrollState, 100);
    });

    observer.observe(this.$curComs, {
      childList: true,
      subtree: true
    });

    // 初始检查
    setTimeout(updateScrollState, 100);
  },

  // 聚焦到搜索输入框
  focusSearchInput() {
    if (this.$eb) {
      this.$eb.focus();
      this.$eb.select(); // 选中所有文本，方便用户直接输入新内容
      const currentShortcut = dataManager.getFocusSearchInputShortcut();
      logger.success(`搜索框已获得焦点 (快捷键: ${currentShortcut || '无'})`);
    } else {
      logger.error('无法聚焦搜索框：搜索框元素未找到');
    }
  },

  // 清空搜索输入框
  clearSearchInput() {
    if (this.$eb) {
      this.$eb.value = '';
      this.$eb.focus();
      // 触发搜索更新，显示收藏组件
      this.onInput2();
      logger.info('搜索框已清空 (快捷键: Escape)');
    }
  },

  onInput2() {
    try {
      this.curMatchs = [];
      let comName = this.$eb.value;
      let handle = {
        comName: comName,
        res: null
      };

      // 添加防抖机制，避免频繁调用
      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
      }

      this.searchTimeout = setTimeout(() => {
        Editor.Scene.callSceneScript('ccc-smart-component-manager', 'input-query', handle, (err) => {
          if (err) {
            // 使用日志管理器处理IPC错误
            logger.ipcError('input-query', err);
            return;
          }
        });
      }, 200);
    } catch (error) {
      logger.error(`搜索处理出错: ${error.message}`);
      this.$list.innerHTML = "";
      this.curMatchs = [];
    }
  },

  addCom(comName) {
    // 防抖处理，防止快速重复点击
    const now = Date.now();
    const lastTime = this.lastClickTime[comName] || 0;
    const debounceTime = 500; // 500ms 防抖

    if (now - lastTime < debounceTime) {
      logger.warn(`组件 [${comName}] 添加过于频繁，请稍后再试`);
      return;
    }

    this.lastClickTime[comName] = now;

    // 检查选中节点数量，防止误操作
    const selectedNodes = Editor.Selection.curSelection("node");
    if (selectedNodes.length > 10) {
      const { remote } = require('electron');
      const result = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'warning',
        buttons: ['确定', '取消'],
        defaultId: 1,
        message: `批量操作确认`,
        detail: `您选中了 ${selectedNodes.length} 个节点，确定要为所有节点添加组件 [${comName}] 吗？`
      });

      if (result !== 0) {
        return;
      }
    }

    Editor.Scene.callSceneScript('ccc-smart-component-manager', 'add-component', comName, (err) => {
      if (err) {
        logger.error(`添加组件失败: ${err.message || err}`);
        return;
      }
      // 使用次数记录移到scene-accessor.js中的成功回调里
    });
  },

  showContextMenu(event, componentName) {
    const { remote } = require('electron');
    const isFavorite = dataManager.isFavorite(componentName);

    const template = [
      {
        label: '添加组件',
        click: () => {
          this.addCom(componentName);
        }
      },
      {
        label: isFavorite ? '取消收藏' : '添加到收藏',
        click: () => {
          if (isFavorite) {
            dataManager.removeFromFavorites(componentName);
            logger.success(`已从收藏夹移除: ${componentName}`);
          } else {
            dataManager.addToFavorites(componentName);
            logger.success(`已添加到收藏夹: ${componentName}`);
          }
          // 重新搜索以更新显示
          this.onInput2();
        }
      }
    ];

    const menu = remote.Menu.buildFromTemplate(template);
    menu.popup({ window: remote.getCurrentWindow() });
  },

  // 切换收藏状态的便捷方法（基于已有的dataManager函数）
  toggleFavorite(componentName) {
    const isFavorite = dataManager.isFavorite(componentName);
    const showConfirm = dataManager.getFavoriteToggleConfirm();

    if (showConfirm) {
      // 显示确认对话框
      const { remote } = require('electron');
      const action = isFavorite ? '取消收藏' : '添加到收藏';
      const message = isFavorite ? '取消收藏确认' : '添加收藏确认';
      const detail = `确定要${action}组件 [${componentName}] 吗？`;

      const result = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'question',
        buttons: ['确定', '取消'],
        defaultId: 0,
        message: message,
        detail: detail
      });

      if (result !== 0) {
        return; // 用户取消了操作
      }
    }

    if (isFavorite) {
      dataManager.removeFromFavorites(componentName);
      logger.success(`已从收藏夹移除: ${componentName}`);
    } else {
      dataManager.addToFavorites(componentName);
      logger.success(`已添加到收藏夹: ${componentName}`);
    }

    // 重新搜索以更新显示
    this.onInput2();
  },

  // 直接删除单个组件的便捷方法（基于已有的del-component脚本调用）
  deleteComponent(comOpt) {
    const showConfirm = dataManager.getDeleteComponentConfirm();

    if (showConfirm) {
      // 显示确认对话框
      const { remote } = require('electron');
      const selectedNodes = Editor.Selection.curSelection("node");
      const nodeCount = comOpt.nodeUuids ? comOpt.nodeUuids.length : 1;
      const nodeText = selectedNodes.length > 1 ? `${nodeCount}个节点` : '当前节点';

      const result = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        type: 'warning',
        buttons: ['确定删除', '取消'],
        defaultId: 1,
        message: `删除组件确认`,
        detail: `确定要从${nodeText}中删除组件 [${comOpt.comName}] 吗？`
      });

      if (result !== 0) {
        return; // 用户取消了删除操作
      }
    }

    // 使用已有的del-component脚本调用
    Editor.Scene.callSceneScript('ccc-smart-component-manager', 'del-component', comOpt, (err) => {
      if (err) {
        logger.ipcError("del-component", err);
        return;
      }
      logger.success(`已删除组件: ${comOpt.comName}`);
    });
  },

  refresh() {
    if (Editor.Selection.curSelection("node").length > 0) {
      this.$main.style.display = "";
      this.$tip.style.display = "none";

      this.$curComs.style.display = "";
      this.refreshCurComs();
    }
    else {
      this.$main.style.display = "none";
      this.$tip.style.display = "";
      this.$curComs.style.display = "none";
      this.$curComs.innerHTML = "";
    }

    // 确保空输入时显示收藏组件（独立于当前组件列表）
    if (!this.$eb.value || this.$eb.value.trim().length === 0) {
      this.onInput2();
    }
  },
  refreshCurComs() {
    Editor.Scene.callSceneScript('ccc-smart-component-manager', 'list-current-components', {}, (err) => {
      if (err) {
        // 使用日志管理器处理IPC错误
        logger.ipcError('list-current-components', err);
        return;
      }
    });
  },
  createHighlightedText(match) {
    const { origin, displayName, index, matchLength, type } = match;
    const nameToDisplay = displayName || origin;

    if (index === -1 || matchLength === 0) {
      return nameToDisplay;
    }

    const before = nameToDisplay.substring(0, index);
    const highlighted = nameToDisplay.substring(index, index + matchLength);
    const after = nameToDisplay.substring(index + matchLength);

    // 根据匹配类型使用不同的样式
    let className = 'ctex';
    if (type === 'exact') className += ' exact-match';
    else if (type === 'prefix') className += ' prefix-match';

    return `${before}<span class="${className}">${highlighted}</span>${after}`;
  },

  createBadges(match) {
    // 不再使用标识符号，通过背景颜色区分
    return '';
  },



  // 显示设置页面
  showSettingsPage() {
    this.$main.classList.remove('page-active');
    this.$main.classList.add('page-hidden');
    this.$settingsPage.classList.remove('page-hidden');
    this.$settingsPage.classList.add('page-active');
    this.renderSettingsContent();
  },

  // 应用主题
  applyTheme(themeName) {
    const host = this.shadowRoot ? this.shadowRoot.host : this;
    if (themeName === 'vibrant-dark') {
      host.removeAttribute('data-theme');
    } else {
      host.setAttribute('data-theme', themeName);
    }
  },

  // 显示主页面
  showMainPage() {
    this.$settingsPage.classList.remove('page-active');
    this.$settingsPage.classList.add('page-hidden');
    this.$main.classList.remove('page-hidden');
    this.$main.classList.add('page-active');
  },

  // 渲染设置页面内容
  renderSettingsContent() {
    const currentTheme = dataManager.getTheme();
    const themes = [
      { id: 'vibrant-dark', accent: '#5ba8ff', bg: '#12141a', text: '#e2e8f4' },
      { id: 'warm-dark', accent: '#e8a64b', bg: '#1c1816', text: '#e8ddd0' },
      { id: 'cyberpunk', accent: '#bf5af2', bg: '#0a0a0f', text: '#e0e0e8' },
      { id: 'forest', accent: '#3fb68b', bg: '#141c17', text: '#d4e8dc' },
      { id: 'sunset', accent: '#f06449', bg: '#181416', text: '#ede4db' },
      { id: 'ocean', accent: '#20c9b0', bg: '#101820', text: '#d0e4ed' }
    ];

    const themeCardsHtml = themes.map(theme => `
      <div class="theme-card${currentTheme === theme.id ? ' active' : ''}" data-theme-id="${theme.id}">
        <div class="theme-preview" style="background: ${theme.bg}; border: 2px solid ${currentTheme === theme.id ? theme.accent : 'transparent'};">
          <div class="theme-preview-accent" style="background: ${theme.accent};"></div>
          <div class="theme-preview-text" style="color: ${theme.text};">Aa</div>
        </div>
        <div class="theme-card-label">${t('SETTINGS.theme_' + theme.id.replace('-', '_'))}</div>
      </div>
    `).join('');

    const content = `
      <!-- 主题选择 -->
      <div class="settings-section">
        <div class="settings-section-title">${ICONS.star} ${t('SETTINGS.theme_settings')}</div>
        <div class="theme-grid">
          ${themeCardsHtml}
        </div>
      </div>

      <!-- 收藏管理 -->
      <div class="settings-section">
        <div class="settings-section-title">${ICONS.pin} ${t('SETTINGS.favorites_management')}</div>
        <div id="favorites-list" class="favorites-list"></div>
        <div class="button-group">
          <ui-button id="clear-favorites-btn" class="btn btn-secondary">${t('SETTINGS.clear_favorites')}</ui-button>
        </div>
      </div>

      <!-- 统计信息 -->
      <div class="settings-section">
        <div class="settings-section-title">${ICONS.chart} ${t('SETTINGS.statistics')}</div>
        <div class="stats-list">
          <div class="stat-item">
            <div class="stat-label">${t('SETTINGS.available_components')}</div>
            <div class="stat-value" id="total-components">77</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">${t('SETTINGS.favorite_components')}</div>
            <div class="stat-value" id="favorites-count">1</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">${t('SETTINGS.total_usage')}</div>
            <div class="stat-value" id="total-usage">27</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">${t('SETTINGS.selected_nodes')}</div>
            <div class="stat-value" id="selected-nodes">1</div>
          </div>
        </div>
      </div>

      <!-- 自动挂载设置 -->
      <div class="settings-section">
        <div class="settings-section-title">${ICONS.link} ${t('SETTINGS.auto_property_mount')}</div>
        <div class="form-group">
          <input type="checkbox" id="auto-mount-enabled">
          <label for="auto-mount-enabled">${t('SETTINGS.enable_auto_mount')}</label>
        </div>
        <div id="auto-mount-options" class="auto-mount-options">
          <div class="form-group">
            <input type="checkbox" id="ignore-case">
            <label for="ignore-case">${t('SETTINGS.ignore_case')}</label>
          </div>
          <div class="form-group">
            <input type="checkbox" id="flexible-matching">
            <label for="flexible-matching">${t('SETTINGS.flexible_matching')}</label>
          </div>
          <div class="form-group">
            <input type="checkbox" id="show-mount-log">
            <label for="show-mount-log">${t('SETTINGS.show_mount_log')}</label>
          </div>
        </div>
        <div class="button-container">
          <ui-button id="apply-mount-settings-btn" class="btn btn-primary">${t('SETTINGS.apply_settings')}</ui-button>
        </div>
      </div>

      <!-- 快捷键设置 -->
      <div class="settings-section">
        <div class="settings-section-title">${ICONS.keyboard} ${t('SETTINGS.shortcut_settings')}</div>
        <div class="form-group">
          <label for="focus-search-shortcut">${t('SETTINGS.focus_search_shortcut')}</label>
          <select id="focus-search-shortcut-select">
            <option value="">${t('SETTINGS.no_shortcut')}</option>
            <option value="CmdOrCtrl+F">Ctrl+F (Cmd+F)</option>
            <option value="F3">F3</option>
            <option value="CmdOrCtrl+Shift+F">Ctrl+Shift+F</option>
            <option value="CmdOrCtrl+E">Ctrl+E (Cmd+E)</option>
            <option value="custom">${t('SETTINGS.custom')}</option>
          </select>
        </div>
        <div class="form-group" id="custom-shortcut-group" style="display: none;">
          <label for="custom-shortcut-input">${t('SETTINGS.custom_shortcut')}</label>
          <input type="text" id="custom-shortcut-input" placeholder="${t('SETTINGS.custom_shortcut_placeholder')}" />
          <small style="color: var(--text-muted); font-size: var(--font-size-xs); margin-top: var(--spacing-xs); display: block;">
            ${t('SETTINGS.custom_shortcut_hint')}
          </small>
        </div>
        <div class="button-container">
          <ui-button id="apply-shortcut-btn" class="btn btn-primary">${t('SETTINGS.apply_shortcut')}</ui-button>
          <ui-button id="test-shortcut-btn" class="btn btn-secondary" style="margin-left: var(--spacing-sm);">${t('SETTINGS.test_shortcut')}</ui-button>
        </div>
      </div>

      <!-- 日志设置 -->
      <div class="settings-section">
        <div class="settings-section-title">${ICONS.note} ${t('SETTINGS.log_settings')}</div>
        <div class="compact-form">
          <label>${t('SETTINGS.log_level')}</label>
          <select id="log-level-select">
            <option value="ALL">${t('SETTINGS.log_all')}</option>
            <option value="ERROR_ONLY">${t('SETTINGS.log_error_only')}</option>
          </select>
          <ui-button id="apply-log-level-btn" class="btn btn-primary">${t('SETTINGS.apply')}</ui-button>
        </div>
      </div>

      <!-- 确认对话框设置 -->
      <div class="settings-section">
        <div class="settings-section-title">${ICONS.speech} ${t('SETTINGS.confirmation_settings')}</div>
        <div class="form-group">
          <input type="checkbox" id="delete-component-confirm">
          <label for="delete-component-confirm">${t('SETTINGS.delete_confirm')}</label>
        </div>
        <div class="form-group">
          <input type="checkbox" id="favorite-toggle-confirm">
          <label for="favorite-toggle-confirm">${t('SETTINGS.favorite_confirm')}</label>
        </div>
        <div class="button-container">
          <ui-button id="apply-confirmation-settings-btn" class="btn btn-primary">${t('SETTINGS.apply_settings')}</ui-button>
        </div>
      </div>
    `;

    this.$settingsContentPage.innerHTML = content;

    // 重新绑定事件
    this.bindSettingsEvents();
    this.updateStats();
    this.updateFavoritesPanel();
    this.initAutoMountSettings();
    this.initShortcutSettings();
    this.initLogLevel();
    this.initConfirmationSettings();
  },

  // 绑定设置页面事件
  bindSettingsEvents() {
    // 主题切换事件
    const themeCards = this.$settingsContentPage.querySelectorAll('.theme-card');
    themeCards.forEach(card => {
      card.addEventListener('click', () => {
        const themeId = card.getAttribute('data-theme-id');
        dataManager.setTheme(themeId);
        this.applyTheme(themeId);
        // Update active state visually
        themeCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        // Update preview border colors
        themeCards.forEach(c => {
          const preview = c.querySelector('.theme-preview');
          if (c.classList.contains('active')) {
            const accent = c.querySelector('.theme-preview-accent').style.background;
            preview.style.borderColor = accent;
          } else {
            preview.style.borderColor = 'transparent';
          }
        });
      });
    });

    // 收藏管理
    const clearFavoritesBtn = this.$settingsContentPage.querySelector('#clear-favorites-btn');
    if (clearFavoritesBtn) {
      clearFavoritesBtn.addEventListener('confirm', () => {
        this.clearFavorites();
      });
    }

    // 自动挂载设置
    const autoMountEnabled = this.$settingsContentPage.querySelector('#auto-mount-enabled');
    if (autoMountEnabled) {
      autoMountEnabled.addEventListener('change', () => {
        this.toggleAutoMountOptions();
      });
    }

    const applyMountSettingsBtn = this.$settingsContentPage.querySelector('#apply-mount-settings-btn');
    if (applyMountSettingsBtn) {
      applyMountSettingsBtn.addEventListener('confirm', () => {
        this.applyAutoMountSettings();
      });
    }

    // 快捷键设置
    const focusSearchShortcutSelect = this.$settingsContentPage.querySelector('#focus-search-shortcut-select');
    const customShortcutGroup = this.$settingsContentPage.querySelector('#custom-shortcut-group');
    const customShortcutInput = this.$settingsContentPage.querySelector('#custom-shortcut-input');
    const applyShortcutBtn = this.$settingsContentPage.querySelector('#apply-shortcut-btn');

    if (focusSearchShortcutSelect) {
      focusSearchShortcutSelect.addEventListener('change', () => {
        const isCustom = focusSearchShortcutSelect.value === 'custom';
        if (customShortcutGroup) {
          customShortcutGroup.style.display = isCustom ? 'block' : 'none';
        }
      });
    }

    if (applyShortcutBtn) {
      applyShortcutBtn.addEventListener('confirm', () => {
        this.applyShortcutSettings();
      });
    }

    // 测试快捷键按钮
    const testShortcutBtn = this.$settingsContentPage.querySelector('#test-shortcut-btn');
    if (testShortcutBtn) {
      testShortcutBtn.addEventListener('confirm', () => {
        this.testCurrentShortcut();
      });
    }



    // 日志设置
    const applyLogLevelBtn = this.$settingsContentPage.querySelector('#apply-log-level-btn');
    if (applyLogLevelBtn) {
      applyLogLevelBtn.addEventListener('confirm', () => {
        this.applyLogLevel();
      });
    }

    // 确认对话框设置
    const applyConfirmationSettingsBtn = this.$settingsContentPage.querySelector('#apply-confirmation-settings-btn');
    if (applyConfirmationSettingsBtn) {
      applyConfirmationSettingsBtn.addEventListener('confirm', () => {
        this.applyConfirmationSettings();
      });
    }
  },



  // 更新收藏面板
  updateFavoritesPanel() {
    // 获取当前活动的收藏列表元素
    let favoritesList = this.$favoritesList;

    // 如果在设置页面，使用设置页面的元素
    if (this.$settingsPage && this.$settingsPage.classList.contains('page-active')) {
      const settingsFavoritesList = this.$settingsContentPage.querySelector('#favorites-list');
      if (settingsFavoritesList) {
        favoritesList = settingsFavoritesList;
      }
    }

    if (!favoritesList) return;

    favoritesList.innerHTML = '';

    const favorites = dataManager.getFavorites();

    if (favorites.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'favorite-item';
      emptyItem.style.justifyContent = 'center';
      emptyItem.style.color = '#888';
      emptyItem.style.fontStyle = 'italic';
      emptyItem.innerHTML = '暂无收藏组件';
      favoritesList.appendChild(emptyItem);
      return;
    }

    favorites.forEach((componentName) => {
      const item = document.createElement('div');
      item.className = 'favorite-item';
      item.innerHTML = `
        <span class="favorite-name" title="${componentName}">${componentName}</span>
        <span class="remove-btn" data-component="${componentName}">×</span>
      `;

      // 点击添加组件
      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('remove-btn')) {
          this.addComponentToSelectedNodes(componentName);
        }
      });

      // 点击删除按钮
      item.querySelector('.remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        dataManager.removeFromFavorites(componentName);
        this.updateFavoritesPanel();
        this.updateStats();
        logger.success(`已从收藏夹移除: ${componentName}`);
      });

      favoritesList.appendChild(item);
    });
  },

  // 清空收藏夹
  clearFavorites() {
    dataManager.clearFavorites();
    this.updateFavoritesPanel();
    this.updateStats();
    logger.success('收藏夹已清空');
  },

  // 更新统计信息
  updateStats() {
    // 统计可用组件总数
    let totalComponents = 0;
    for (let key in cc.js._registeredClassNames) {
      if (cc.js.isChildClassOf(cc.js._registeredClassNames[key], cc.Component)) {
        totalComponents++;
      }
    }

    const stats = dataManager.getStats();
    const selectedNodesCount = Editor.Selection.curSelection("node").length;

    // 更新弹窗中的统计信息（如果存在）
    if (this.$totalComponents) this.$totalComponents.textContent = totalComponents;
    if (this.$favoritesCount) this.$favoritesCount.textContent = stats.favoritesCount;
    if (this.$totalUsage) this.$totalUsage.textContent = stats.totalUsage;
    if (this.$selectedNodes) this.$selectedNodes.textContent = selectedNodesCount;

    // 更新设置页面中的统计信息
    if (this.$settingsPage && this.$settingsPage.classList.contains('page-active')) {
      const totalComponentsEl = this.$settingsContentPage.querySelector('#total-components');
      const favoritesCountEl = this.$settingsContentPage.querySelector('#favorites-count');
      const totalUsageEl = this.$settingsContentPage.querySelector('#total-usage');
      const selectedNodesEl = this.$settingsContentPage.querySelector('#selected-nodes');

      if (totalComponentsEl) totalComponentsEl.textContent = totalComponents;
      if (favoritesCountEl) favoritesCountEl.textContent = stats.favoritesCount;
      if (totalUsageEl) totalUsageEl.textContent = stats.totalUsage;
      if (selectedNodesEl) selectedNodesEl.textContent = selectedNodesCount;
    }
  },

  // 初始化自动挂载设置
  initAutoMountSettings() {
    const settings = dataManager.getAutoMountSettings();

    // 获取当前活动的设置元素
    let autoMountEnabled = this.$autoMountEnabled;
    let ignoreCase = this.$ignoreCase;
    let flexibleMatching = this.$flexibleMatching;
    let showMountLog = this.$showMountLog;

    // 如果在设置页面，使用设置页面的元素
    if (this.$settingsPage && this.$settingsPage.classList.contains('page-active')) {
      autoMountEnabled = this.$settingsContentPage.querySelector('#auto-mount-enabled');
      ignoreCase = this.$settingsContentPage.querySelector('#ignore-case');
      flexibleMatching = this.$settingsContentPage.querySelector('#flexible-matching');
      showMountLog = this.$settingsContentPage.querySelector('#show-mount-log');
    }

    if (autoMountEnabled) autoMountEnabled.checked = settings.enabled;
    if (ignoreCase) ignoreCase.checked = settings.ignoreCase;
    if (flexibleMatching) flexibleMatching.checked = settings.flexibleMatching;
    if (showMountLog) showMountLog.checked = settings.showMountLog;

    this.toggleAutoMountOptions();
  },

  // 切换自动挂载选项显示
  toggleAutoMountOptions() {
    // 获取当前活动的设置元素
    let autoMountEnabled = this.$autoMountEnabled;
    let autoMountOptions = this.$autoMountOptions;

    // 如果在设置页面，使用设置页面的元素
    if (this.$settingsPage && this.$settingsPage.classList.contains('page-active')) {
      autoMountEnabled = this.$settingsContentPage.querySelector('#auto-mount-enabled');
      autoMountOptions = this.$settingsContentPage.querySelector('#auto-mount-options');
    }

    if (autoMountEnabled && autoMountOptions) {
      const enabled = autoMountEnabled.checked;
      autoMountOptions.style.display = enabled ? 'block' : 'none';
    }
  },

  // 应用自动挂载设置
  applyAutoMountSettings() {
    // 获取当前活动的设置元素
    let autoMountEnabled = this.$autoMountEnabled;
    let ignoreCase = this.$ignoreCase;
    let flexibleMatching = this.$flexibleMatching;
    let showMountLog = this.$showMountLog;

    // 如果在设置页面，使用设置页面的元素
    if (this.$settingsPage && this.$settingsPage.classList.contains('page-active')) {
      autoMountEnabled = this.$settingsContentPage.querySelector('#auto-mount-enabled');
      ignoreCase = this.$settingsContentPage.querySelector('#ignore-case');
      flexibleMatching = this.$settingsContentPage.querySelector('#flexible-matching');
      showMountLog = this.$settingsContentPage.querySelector('#show-mount-log');
    }

    if (!autoMountEnabled) return;

    const settings = {
      enabled: autoMountEnabled.checked,
      ignoreCase: ignoreCase ? ignoreCase.checked : true,
      flexibleMatching: flexibleMatching ? flexibleMatching.checked : true,
      showMountLog: showMountLog ? showMountLog.checked : true
    };

    dataManager.setAutoMountSettings(settings);
    logger.success('自动挂载设置已保存');
  },

  // 初始化日志等级
  initLogLevel() {
    const currentLevel = dataManager.getLogLevel();

    // 获取当前活动的日志级别选择器
    let logLevelSelect = this.$logLevelSelect;

    // 如果在设置页面，使用设置页面的元素
    if (this.$settingsPage && this.$settingsPage.classList.contains('page-active')) {
      logLevelSelect = this.$settingsContentPage.querySelector('#log-level-select');
    }

    if (logLevelSelect) {
      logLevelSelect.value = currentLevel;
    }
  },

  // 初始化快捷键设置
  initShortcutSettings() {
    const shortcutSettings = dataManager.getShortcutSettings();
    const currentShortcut = shortcutSettings.focusSearchInput;

    // 获取设置页面的元素
    const focusSearchShortcutSelect = this.$settingsContentPage.querySelector('#focus-search-shortcut-select');
    const customShortcutGroup = this.$settingsContentPage.querySelector('#custom-shortcut-group');
    const customShortcutInput = this.$settingsContentPage.querySelector('#custom-shortcut-input');

    if (!focusSearchShortcutSelect) return;

    // 检查是否是预设快捷键
    const presetOptions = ['', 'CmdOrCtrl+F', 'F3', 'CmdOrCtrl+Shift+F', 'CmdOrCtrl+E'];
    if (presetOptions.includes(currentShortcut)) {
      focusSearchShortcutSelect.value = currentShortcut;
      if (customShortcutGroup) {
        customShortcutGroup.style.display = 'none';
      }
    } else {
      // 自定义快捷键
      focusSearchShortcutSelect.value = 'custom';
      if (customShortcutGroup) {
        customShortcutGroup.style.display = 'block';
      }
      if (customShortcutInput) {
        customShortcutInput.value = currentShortcut;
      }
    }
  },

  // 应用快捷键设置
  applyShortcutSettings() {
    const focusSearchShortcutSelect = this.$settingsContentPage.querySelector('#focus-search-shortcut-select');
    const customShortcutInput = this.$settingsContentPage.querySelector('#custom-shortcut-input');

    if (!focusSearchShortcutSelect) return;

    let newShortcut = '';
    if (focusSearchShortcutSelect.value === 'custom') {
      if (!customShortcutInput || !customShortcutInput.value.trim()) {
        logger.warn('请输入自定义快捷键');
        return;
      }
      newShortcut = customShortcutInput.value.trim();

      // 简单验证快捷键格式
      if (!this.validateShortcut(newShortcut)) {
        logger.warn('快捷键格式不正确，请使用类似 CmdOrCtrl+F 的格式');
        return;
      }
    } else {
      newShortcut = focusSearchShortcutSelect.value;
    }

    // 保存设置
    dataManager.setFocusSearchInputShortcut(newShortcut);

    // 重新设置快捷键监听
    this.updateGlobalKeyboardShortcuts();

    logger.success(`快捷键已设置为: ${newShortcut || '无'}`);
  },

  // 验证快捷键格式
  validateShortcut(shortcut) {
    if (!shortcut) return true; // 空字符串是有效的（表示无快捷键）

    // 简单的快捷键格式验证
    const validPatterns = [
      /^F\d{1,2}$/i, // F1-F12
      /^(CmdOrCtrl|Ctrl|Alt|Shift)\+[A-Z]$/i, // Ctrl+A, Alt+B 等
      /^(CmdOrCtrl|Ctrl|Alt|Shift)\+(CmdOrCtrl|Ctrl|Alt|Shift)\+[A-Z]$/i, // Ctrl+Shift+A 等
    ];

    return validPatterns.some(pattern => pattern.test(shortcut));
  },

  // 更新全局快捷键监听
  updateGlobalKeyboardShortcuts() {
    logger.info('正在更新全局快捷键设置...');

    // 移除旧的监听器
    if (this.globalKeydownHandler) {
      document.removeEventListener('keydown', this.globalKeydownHandler);
      logger.debug('已移除旧的快捷键监听器');
    }

    // 重新设置快捷键监听
    this.setupGlobalKeyboardShortcuts();
  },

  // 测试当前快捷键设置
  testCurrentShortcut() {
    const shortcutSettings = dataManager.getShortcutSettings();
    const focusShortcut = shortcutSettings.focusSearchInput;

    logger.info('=== 快捷键测试信息 ===');
    logger.info(`当前配置的快捷键: ${focusShortcut}`);
    logger.info(`数据管理器状态: ${dataManager ? '已加载' : '未加载'}`);
    logger.info(`全局监听器状态: ${this.globalKeydownHandler ? '已设置' : '未设置'}`);

    // 测试快捷键解析
    if (focusShortcut) {
      const parts = focusShortcut.split('+');
      const key = parts[parts.length - 1].toLowerCase();
      const modifiers = parts.slice(0, -1).map(m => m.toLowerCase());
      logger.info(`解析结果: 键='${key}', 修饰键=[${modifiers.join(', ')}]`);
    }

    logger.info('请按下配置的快捷键进行测试...');
    logger.info('===================');
  },

  // 应用日志等级设置
  applyLogLevel() {
    // 获取当前活动的日志级别选择器
    let logLevelSelect = this.$logLevelSelect;

    // 如果在设置页面，使用设置页面的元素
    if (this.$settingsPage && this.$settingsPage.classList.contains('page-active')) {
      logLevelSelect = this.$settingsContentPage.querySelector('#log-level-select');
    }

    if (!logLevelSelect) return;

    const selectedLevel = logLevelSelect.value;
    dataManager.setLogLevel(selectedLevel);
  },

  // 初始化确认对话框设置
  initConfirmationSettings() {
    const confirmationSettings = dataManager.getConfirmationSettings();

    // 获取设置页面的元素
    const deleteComponentConfirm = this.$settingsContentPage.querySelector('#delete-component-confirm');
    const favoriteToggleConfirm = this.$settingsContentPage.querySelector('#favorite-toggle-confirm');

    if (deleteComponentConfirm) {
      deleteComponentConfirm.checked = confirmationSettings.deleteComponentConfirm;
    }
    if (favoriteToggleConfirm) {
      favoriteToggleConfirm.checked = confirmationSettings.favoriteToggleConfirm;
    }
  },

  // 应用确认对话框设置
  applyConfirmationSettings() {
    const deleteComponentConfirm = this.$settingsContentPage.querySelector('#delete-component-confirm');
    const favoriteToggleConfirm = this.$settingsContentPage.querySelector('#favorite-toggle-confirm');

    if (deleteComponentConfirm) {
      dataManager.setDeleteComponentConfirm(deleteComponentConfirm.checked);
    }
    if (favoriteToggleConfirm) {
      dataManager.setFavoriteToggleConfirm(favoriteToggleConfirm.checked);
    }

    logger.success('确认对话框设置已保存');
  },

  // 添加组件到选中节点
  addComponentToSelectedNodes(componentName) {
    const selectedNodes = Editor.Selection.curSelection("node");
    if (selectedNodes.length === 0) {
      logger.warn('请先选择节点');
      return;
    }

    this.addCom(componentName);
  },

  confirmDelete(comOpt) {
    let electron = require("electron");
    const isFavorite = dataManager.isFavorite(comOpt.comName);
    const selectedNodes = Editor.Selection.curSelection("node");
    const hasMultipleNodes = selectedNodes.length > 1;

    var template = [
      {
        label: '删除', click: () => {
          Editor.Scene.callSceneScript('ccc-smart-component-manager', 'del-component', comOpt, (err) => {
            if (err) {
              logger.ipcError("del-component", err);
              return;
            }
          });
        }
      },
      {
        label: '删除全部', click: () => {
          Editor.Scene.callSceneScript('ccc-smart-component-manager', 'del-all-components', comOpt, (err) => {
            if (err) {
              logger.ipcError("del-all-components", err);
              return;
            }
          });
        }
      }
    ];

    // 只有在多选节点时才显示"选中具有该组件的节点"选项
    if (hasMultipleNodes) {
      template.push({
        label: `选中具有 ${comOpt.comName} 的节点 (${comOpt.nodeUuids.length}个)`,
        click: () => {
          this.selectNodesWithComponent(comOpt);
        }
      });
    }

    template.push(
      {
        label: isFavorite ? '取消收藏' : '收藏',
        click: () => {
          if (isFavorite) {
            dataManager.removeFromFavorites(comOpt.comName);
            logger.success(`已从收藏夹移除: ${comOpt.comName}`);
          } else {
            dataManager.addToFavorites(comOpt.comName);
            logger.success(`已添加到收藏夹: ${comOpt.comName}`);
          }
          // 重新搜索以更新收藏组件显示
          this.onInput2();
        }
      },
      {
        label: '自动挂载',
        click: () => {
          this.performAutoMountForComponent(comOpt);
        }
      },
      { label: '取消' }
    );

    let menu = electron.remote.Menu.buildFromTemplate(template);
    menu.popup();
  },

  // 选中具有指定组件的节点
  selectNodesWithComponent(comOpt) {
    const selectedNodes = Editor.Selection.curSelection("node");
    const componentNodeUuids = comOpt.nodeUuids;

    if (selectedNodes.length <= 1) {
      logger.warn('此功能仅在多选节点时有效');
      return;
    }

    if (!componentNodeUuids || componentNodeUuids.length === 0) {
      logger.warn(`没有找到具有组件 [${comOpt.comName}] 的节点`);
      return;
    }

    // 过滤出当前选中节点中具有该组件的节点
    const nodesWithComponent = selectedNodes.filter(nodeUuid =>
      componentNodeUuids.includes(nodeUuid)
    );

    if (nodesWithComponent.length === 0) {
      logger.warn(`当前选中的节点中没有具有组件 [${comOpt.comName}] 的节点`);
      return;
    }

    // 清除当前选择
    Editor.Selection.clear('node');

    // 选中具有该组件的节点
    Editor.Selection.select('node', nodesWithComponent);

    // 获取节点名称用于显示
    this.getNodeNames(nodesWithComponent, (nodeNames) => {
      const nodeNamesStr = nodeNames.length > 3
        ? `${nodeNames.slice(0, 3).join(', ')} 等${nodeNames.length}个节点`
        : nodeNames.join(', ');

      logger.success(`已选中具有组件 [${comOpt.comName}] 的节点: ${nodeNamesStr}`);
    });
  },

  // 获取节点名称（异步）
  getNodeNames(nodeUuids, callback) {
    if (!nodeUuids || nodeUuids.length === 0) {
      callback([]);
      return;
    }

    // 通过场景脚本获取节点名称
    Editor.Scene.callSceneScript('ccc-smart-component-manager', 'get-node-names', nodeUuids, (err, nodeNames) => {
      if (err) {
        logger.error(`获取节点名称失败: ${err.message || err}`);
        callback([]);
        return;
      }
      callback(nodeNames || []);
    });
  },

  // 🆕 设置组件键盘操作功能
  setupComponentKeyboard(buttonElement, componentOption) {
    const componentName = componentOption.comName;

    try {
      // 添加键盘操作样式
      buttonElement.classList.add('keyboard-operable');

      logger.info(`设置键盘操作功能: ${componentName}`);

      // 鼠标进入事件
      buttonElement.addEventListener('mouseenter', () => {
        // 如果组件移动被锁定，不允许切换悬停状态
        if (this.isComponentMoveLocked) {
          return;
        }

        this.hoveredComponentButton = buttonElement;
        this.hoveredComponentName = componentName;
        buttonElement.classList.add('hover-active');

        logger.info(`鼠标悬停在组件: ${componentName} (按A左移，按D右移)`);
      });

      // 鼠标离开事件
      buttonElement.addEventListener('mouseleave', () => {
        // 如果组件移动被锁定，不允许切换悬停状态
        if (this.isComponentMoveLocked) {
          return;
        }

        if (this.hoveredComponentButton === buttonElement) {
          this.hoveredComponentButton = null;
          this.hoveredComponentName = null;
          buttonElement.classList.remove('hover-active');
        }
      });

    } catch (error) {
      logger.error(`设置键盘操作功能失败: ${error.message}`);
    }
  },

  // 🆕 设置键盘移动监听
  setupComponentMoveKeyboard() {
    // 移除之前的事件监听器（如果存在）
    if (this.componentMoveKeyHandler) {
      document.removeEventListener('keydown', this.componentMoveKeyHandler);
    }

    this.componentMoveKeyHandler = (e) => {
      // 只在有悬停组件时处理
      if (!this.hoveredComponentButton || !this.hoveredComponentName) {
        return;
      }

      // 检查是否为单一节点选择
      const selectedNodes = Editor.Selection.curSelection("node");
      if (!selectedNodes || selectedNodes.length !== 1) {
        return;
      }

      // 防止在输入框中触发
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'a':
          e.preventDefault();
          this.moveHoveredComponentLeft();
          break;
        case 'd':
          e.preventDefault();
          this.moveHoveredComponentRight();
          break;
      }
    };

    document.addEventListener('keydown', this.componentMoveKeyHandler);
    logger.info('组件键盘移动已设置: 鼠标悬停组件时按A(左移)或D(右移)');
  },

  // 🆕 向左移动悬停的组件
  moveHoveredComponentLeft() {
    if (!this.hoveredComponentButton || !this.hoveredComponentName) {
      logger.error('没有悬停的组件');
      return;
    }

    const componentName = this.hoveredComponentName;

    // 检查数组是否为空或无效
    if (!this.componentButtons || this.componentButtons.length === 0) {
      logger.error(`组件按钮数组为空，无法移动组件 ${componentName}`);
      return;
    }

    // 使用组件名称而不是对象引用来查找索引
    const currentIndex = this.componentButtons.findIndex(btn =>
      btn && btn.getAttribute && btn.getAttribute('name') === componentName
    );

    if (currentIndex === -1) {
      const hoveredName = this.hoveredComponentButton ? this.hoveredComponentButton.getAttribute('name') : 'null';
      const arrayNames = this.componentButtons.map(btn => btn && btn.getAttribute ? btn.getAttribute('name') : 'invalid').join(', ');
      logger.error(`无法找到组件按钮详细信息:`);
      logger.error(`- 悬停组件名: ${componentName}`);
      logger.error(`- 悬停按钮name属性: ${hoveredName}`);
      logger.error(`- 数组按钮name属性: [${arrayNames}]`);
      logger.error(`- 数组长度: ${this.componentButtons.length}`);
      logger.error(`- 悬停按钮对象: ${this.hoveredComponentButton ? 'exists' : 'null'}`);
      logger.error(`- 悬停组件名对象: ${this.hoveredComponentName ? 'exists' : 'null'}`);
      return;
    }

    if (currentIndex <= 0) {
      logger.info(`组件 [${componentName}] 已经是第一个，无法左移`);
      return;
    }

    // 在移动期间暂时移除悬停状态，避免视觉冲突
    if (this.hoveredComponentButton && this.hoveredComponentButton.classList) {
      this.hoveredComponentButton.classList.remove('hover-active');
      this.hoveredComponentButton.classList.add('moving-left');
    }

    this.performComponentMove(componentName, currentIndex, currentIndex - 1, 'left');
  },

  // 🆕 向右移动悬停的组件
  moveHoveredComponentRight() {
    if (!this.hoveredComponentButton || !this.hoveredComponentName) {
      logger.error('没有悬停的组件');
      return;
    }

    const componentName = this.hoveredComponentName;

    // 检查数组是否为空或无效
    if (!this.componentButtons || this.componentButtons.length === 0) {
      logger.error(`组件按钮数组为空，无法移动组件 ${componentName}`);
      return;
    }

    // 使用组件名称而不是对象引用来查找索引
    const currentIndex = this.componentButtons.findIndex(btn =>
      btn && btn.getAttribute && btn.getAttribute('name') === componentName
    );

    if (currentIndex === -1) {
      const hoveredName = this.hoveredComponentButton ? this.hoveredComponentButton.getAttribute('name') : 'null';
      const arrayNames = this.componentButtons.map(btn => btn && btn.getAttribute ? btn.getAttribute('name') : 'invalid').join(', ');
      logger.error(`无法找到组件按钮详细信息:`);
      logger.error(`- 悬停组件名: ${componentName}`);
      logger.error(`- 悬停按钮name属性: ${hoveredName}`);
      logger.error(`- 数组按钮name属性: [${arrayNames}]`);
      logger.error(`- 数组长度: ${this.componentButtons.length}`);
      logger.error(`- 悬停按钮对象: ${this.hoveredComponentButton ? 'exists' : 'null'}`);
      logger.error(`- 悬停组件名对象: ${this.hoveredComponentName ? 'exists' : 'null'}`);
      return;
    }

    if (currentIndex >= this.componentButtons.length - 1) {
      logger.info(`组件 [${componentName}] 已经是最后一个，无法右移`);
      return;
    }

    // 在移动期间暂时移除悬停状态，避免视觉冲突
    if (this.hoveredComponentButton && this.hoveredComponentButton.classList) {
      this.hoveredComponentButton.classList.remove('hover-active');
      this.hoveredComponentButton.classList.add('moving-right');
    }

    this.performComponentMove(componentName, currentIndex, currentIndex + 1, 'right');
  },

  // 🆕 执行组件移动
  performComponentMove(componentName, fromIndex, toIndex, direction) {
    const selectedNodes = Editor.Selection.curSelection("node");
    if (!selectedNodes || selectedNodes.length !== 1) {
      logger.warn('组件移动仅在选中单一节点时有效');
      return;
    }

    const nodeUuid = selectedNodes[0];

    // 保存当前悬停的组件名称，用于刷新后重新设置悬停状态
    const currentHoveredComponentName = this.hoveredComponentName;

    // 清除上次的解锁定时器（如果存在）
    if (this.unlockTimer) {
      clearTimeout(this.unlockTimer);
      this.unlockTimer = null;
    }

    // 启用移动锁定
    this.isComponentMoveLocked = true;
    logger.info('组件移动锁定已启用');

    // 设置定时解锁
    this.unlockTimer = setTimeout(() => {
      this.isComponentMoveLocked = false;
      this.unlockTimer = null;

      // 解锁后清除所有悬停状态，让用户重新选择
      this.clearAllHoverStates();

      logger.info('组件移动锁定已解除');
    }, 1000);

    // 调用场景脚本移动组件
    Editor.Scene.callSceneScript('ccc-smart-component-manager', 'move-component', {
      nodeUuid: nodeUuid,
      componentName: componentName,
      fromIndex: fromIndex,
      toIndex: toIndex
    }, (err) => {
      // 移除动画类
      setTimeout(() => {
        if (this.hoveredComponentButton) {
          this.hoveredComponentButton.classList.remove('moving-left', 'moving-right');
        }
      }, 300);

      if (err) {
        logger.error(`移动组件失败: ${err.message || err}`);
        // 移动失败时清除定时器并立即解除锁定
        if (this.unlockTimer) {
          clearTimeout(this.unlockTimer);
          this.unlockTimer = null;
        }
        this.isComponentMoveLocked = false;
        logger.info('组件移动锁定已解除（移动失败）');
      } else {
        logger.success(`组件 [${componentName}] 已${direction === 'left' ? '右' : '左'}移`);
        // 刷新组件列表，并在刷新后重新设置悬停状态
        setTimeout(() => {
          this.refreshCurComs();
          setTimeout(() => {
            this.restoreHoverState(currentHoveredComponentName);
          }, 50);
        }, 100);
        // 锁定解除由定时器处理，不需要在这里手动解除
      }
    });
  },

  // 🆕 恢复悬停状态
  restoreHoverState(componentName) {
    if (!componentName) return;

    // 在新的组件按钮数组中找到对应的按钮
    const newButton = this.componentButtons.find(btn =>
      btn.getAttribute('name') === componentName
    );

    if (newButton) {
      this.hoveredComponentButton = newButton;
      this.hoveredComponentName = componentName;
      newButton.classList.add('hover-active');

      logger.info(`恢复悬停状态: ${componentName}`);
    } else {
      logger.warn(`无法恢复悬停状态，未找到组件: ${componentName}`);
    }
  },

  // 🆕 清除所有悬停状态
  clearAllHoverStates() {
    // 清除当前悬停状态
    if (this.hoveredComponentButton) {
      this.hoveredComponentButton.classList.remove('hover-active');
    }
    this.hoveredComponentButton = null;
    this.hoveredComponentName = null;

    // 清除所有组件按钮的悬停样式（防止遗漏）
    this.componentButtons.forEach(btn => {
      btn.classList.remove('hover-active');
    });

    logger.info('已清除所有悬停状态');
  },











  // 对指定组件执行自动挂载
  performAutoMountForComponent(comOpt) {
    const selectedNodes = Editor.Selection.curSelection("node");

    if (selectedNodes.length === 0) {
      logger.warn('请先选择要执行自动挂载的节点');
      return;
    }

    // 检查自动挂载功能是否启用
    if (!dataManager.getAutoMountEnabled()) {
      logger.warn('自动挂载功能已禁用，请在高级面板的设置中启用');
      return;
    }

    logger.info(`开始对选中节点的 [${comOpt.comName}] 组件执行自动挂载...`);

    // 对每个选中的节点执行自动挂载
    selectedNodes.forEach(uuid => {
      Editor.Scene.callSceneScript('ccc-smart-component-manager', 'execute-auto-mount-component', {
        nodeUuid: uuid,
        componentName: comOpt.comName
      }, (err) => {
        if (err) {
          logger.error(`自动挂载失败: ${err.message || err}`);
        }
      });
    });
  },

  // register your ipc messages here
  messages: {
    "ccc-smart-component-manager:dock"(event, type) {
      // Editor.log("panel:dock");
    },
    "selection:selected"(event, type) {
      if (type == "node") {
        this.refresh();
      }
    },
    "selection:unselected"(event, type) {
      if (type == "node") {
        this.refresh();
      }
    },
    // 暂时找不到是否可以监听场景中组件的添加和删除，
    // 手动删除(不通过编辑器)选中节点的话可以调用一下刷新按钮。
    // "scene:component-added"(event, info) {
    //   // 监听场景中组件添加事件
    //   // logger.info(`scene:component-added: ${JSON.stringify(info)}`);
    //   // this.refreshCurComs();
    // },
    // "scene:component-removed"(event, info) {
    //   // 监听场景中组件删除事件
    //   //this.refreshCurComs();
    // },
    // "scene:node-changed"(event, info) {
    //   // 监听节点变化事件
    //   // if (info && (info.type === 'add-component' || info.type === 'remove-component')) {
    //   //   this.refreshCurComs();
    //   // }
    // },
    "ccc-smart-component-manager:res-input-query"(event, matchs) {
      try {
        this.$list.innerHTML = "";
        // 检查搜索结果有效性
        if (!matchs || !Array.isArray(matchs)) {
          logger.warn('接收到无效的搜索结果');
          this.curMatchs = [];
          return;
        }

        // 结果已经在搜索引擎中排序和限制了数量（20个）
        matchs.forEach(match => {
          try {
            if (!match || !match.origin) {
              return; // 跳过无效的匹配项
            }

            let handle = document.createElement("ui-button");

            // 简化的组件名称显示
            let componentNameHtml = this.createHighlightedText(match);
            handle.innerHTML = componentNameHtml;

            // 基础样式类
            let className = `search-result ${match.type || 'default'}`;

            // 根据组件类型添加样式（移除高频组件逻辑）
            if (match.isFavorite) {
              className += ' favorite';
            } else {
              className += ' normal';
            }

            handle.className = className;

            // 添加匹配类型的样式提示
            if (match.score) {
              handle.setAttribute('data-score', match.score);
              handle.setAttribute('data-type', match.type || 'unknown');
              handle.setAttribute('data-component', match.origin);
              handle.setAttribute('title', `${match.origin} (分数: ${match.score})`);
            }

            // 左键点击直接添加组件（使用已有的addCom函数）
            handle.onclick = (e) => {
              e.preventDefault();
              this.addCom(match.origin);
            }

            // 右键点击收藏/取消收藏（使用已有的toggleFavorite函数）
            handle.oncontextmenu = (e) => {
              e.preventDefault();
              this.toggleFavorite(match.origin);
            }

            this.$list.appendChild(handle);
          } catch (itemError) {
            logger.error(`处理搜索结果项时出错: ${itemError.message}`);
          }
        });
        this.curMatchs = matchs.slice();
      } catch (error) {
        logger.error(`处理搜索结果时出错: ${error.message}`);
        this.$list.innerHTML = "";
        this.curMatchs = [];
      }
    },
    "ccc-smart-component-manager:res-list-current-components"(event, comOptionCol) {
      try {
        this.$curComs.innerHTML = "";

        // 检查数据有效性
        if (!comOptionCol || typeof comOptionCol !== 'object') {
          logger.warn('接收到无效的组件数据');
          return;
        }

        // 检查是否为单一节点选择（只有单一节点时才启用键盘操作）
        const selectedNodes = Editor.Selection.curSelection("node");
        const isSingleNodeSelected = selectedNodes && selectedNodes.length === 1;

        // 保存当前悬停状态，用于刷新后恢复
        const currentHoveredComponentName = this.hoveredComponentName;

        // 重置组件按钮数组和悬停状态
        this.componentButtons = [];
        this.hoveredComponentButton = null;
        this.hoveredComponentName = null;

        //生成UI
        for (let key in comOptionCol) {
          try {
            let co = comOptionCol[key];
            if (!co || !co.comName || !co.nodeUuids) {
              continue; // 跳过无效数据
            }

            let handle = document.createElement("ui-button");
            handle.setAttribute("name", co.comName);
            handle.style.background = "var(--error-color)";
            handle.innerHTML = `${co.nodeUuids.length > 1 ? `<span class="ctex">${co.nodeUuids.length}</span>|` : ""}${co.comName}`;

            // 只在单一节点选择时启用键盘操作功能
            if (isSingleNodeSelected) {
              this.componentButtons.push(handle);
              this.setupComponentKeyboard(handle, co);
              logger.info(`添加组件按钮到数组: ${co.comName}, 当前数组长度: ${this.componentButtons.length}`);
            }

            this.$curComs.appendChild(handle);

            // 左键点击弹出tab菜单（使用已有的confirmDelete函数）
            handle.onclick = (e) => {
              e.preventDefault();
              this.confirmDelete(co);
            };

            // 右键点击直接删除单个组件（使用已有的deleteComponent函数）
            handle.oncontextmenu = (e) => {
              e.preventDefault();
              this.deleteComponent(co);
            };
          } catch (itemError) {
            logger.error(`处理组件项 ${key} 时出错: ${itemError.message}`);
          }
        }

        // 如果是单一节点且有多个组件，显示键盘操作提示
        if (isSingleNodeSelected && this.componentButtons.length > 1) {
          logger.info(`组件排序提示: 鼠标悬停在组件上，按A键左移，按D键右移 (共${this.componentButtons.length}个组件)`);
        }

        // 如果之前有悬停状态，尝试恢复
        if (currentHoveredComponentName && isSingleNodeSelected) {
          setTimeout(() => {
            this.restoreHoverState(currentHoveredComponentName);
          }, 50);
        }
      } catch (error) {
        logger.error(`处理组件列表响应时出错: ${error.message}`);
        this.$curComs.innerHTML = "";
      }
    },
    "ccc-smart-component-manager:res-add-component"(event, comOpt) {
      logger.success(t('PANEL.task_complete'));
      this.refresh();
      // 重新搜索以更新组件标识
      if (this.$eb.value.trim().length > 0) {
        this.onInput2();
      }
    },
    "ccc-smart-component-manager:res-del-component"(event, comName) {
      // 删除组件后重新刷新当前组件列表，以获取正确的计数
      this.refreshCurComs();
      logger.info(`删除组件成功: ${comName}`);
    },
    "ccc-smart-component-manager:refresh-search"(event) {
      // 高级面板请求刷新搜索结果
      if (this.$eb.value.trim().length > 0) {
        this.onInput2();
      }
    },
    // 🆕 组件移动完成消息
    "ccc-smart-component-manager:component-moved"(event, result) {
      if (result.success) {
        logger.success(`组件 [${result.componentName}] 顺序调整成功`);
        // 刷新组件列表以反映新的顺序
        this.refreshCurComs();
      } else {
        logger.error(`组件顺序调整失败: ${result.error}`);
      }
    },
    "ccc-smart-component-manager:data-updated"(event, data) {
      // 数据更新通知，重新渲染相关内容
      logger.info(`主面板: 收到数据更新通知: ${JSON.stringify(data)}`);
      if (data) {
        if (data.type === 'usage-cleared' || data.type === 'favorites-cleared') {
          // 使用统计或收藏夹被清空，需要重新搜索以更新收藏组件标识
          // 无论搜索框是否为空都要更新，因为空输入时显示收藏组件
          this.onInput2();
          // 同时刷新当前组件列表
          this.refreshCurComs();
          logger.info('主面板: 收藏组件显示更新完成');
        }
      }
    }
  }
});
