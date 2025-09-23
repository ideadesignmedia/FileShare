customElements.define('toast-manager', class Toaster extends HTMLElement {
  shadow: ShadowRoot
  constructor() {
    super()
    this.shadow = this.attachShadow({ mode: 'open' })
  }
  connectedCallback() {
    this.shadow.innerHTML = `<style>
      * {
        --toast-bg: #ffffff;
        --toast-color: #0f172a;
        --toast-accent: #3b82f6;
        --toast-border: #3b82f6;
        --toast-success-bg: #ecfdf5;
        --toast-success-color: #064e3b;
        --toast-success-accent: #10b981;
        --toast-error-bg: #fef2f2;
        --toast-error-color: #7f1d1d;
        --toast-error-accent: #ef4444;
        --toast-radius: 12px;
      }
      #toast-box {
        position: fixed;
        top: calc(.75rem + env(safe-area-inset-top));
        right: .75rem;
        display: flex;
        flex-direction: column-reverse;
        align-items: flex-end;
        gap: .5rem;
        z-index: 10000000;
        pointer-events: none;
      }
      .toast-message {
        box-sizing: border-box;
        max-width: min(360px, 92vw);
        display: flex;
        align-items: flex-start;
        gap: .75rem;
        padding: .875rem 1rem .875rem .875rem;
        background: var(--toast-bg);
        color: var(--toast-color);
        border: 1px solid var(--toast-border);
        border-radius: var(--toast-radius);
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.2);
        word-break: break-word;
        pointer-events: auto;
        opacity: 0;
        transform: translateX(16px);
        animation: toast-in 200ms ease-out forwards;
      }
      .toast-message.success {
        --toast-bg: #ffffff;
        --toast-color: #0f172a;
        --toast-accent: var(--toast-success-accent);
        --toast-border: var(--toast-success-accent);
      }
      .toast-message.error {
        --toast-bg: #ffffff;
        --toast-color: #0f172a;
        --toast-accent: var(--toast-error-accent);
        --toast-border: var(--toast-error-accent);
      }
      .icon {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        color: var(--toast-accent);
        margin-top: 2px;
      }
      .content {
        flex: 1 1 auto;
        white-space: pre-line;
        line-height: 1.35;
        font-size: 15px;
        font-weight: 500;
        color: var(--toast-color);
      }
      .close {
        flex: 0 0 auto;
        margin-left: .5rem;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        background: var(--toast-accent);
        border-radius: 9999px;
        cursor: pointer;
        box-shadow: 0 6px 14px rgba(2, 6, 23, 0.28);
        transition: transform 120ms ease-out, filter 120ms ease-out;
        -webkit-appearance: none;
        appearance: none;
        border: none;
        outline: none;
        padding: 0;
        line-height: 0;
        background-clip: padding-box;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        margin: 0;
      }
      .close:hover { transform: translateY(-1px); filter: brightness(1.05); }
      .close:active { transform: translateY(0); filter: brightness(0.98); }
      .close:focus-visible { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.45), 0 6px 14px rgba(2,6,23,0.28); }
      @keyframes toast-in {
        to { opacity: 1; transform: translateX(0); }
      }
    </style><div id="toast-box"></div>`
    window.addEventListener('toast', this.handleEvent)
  }
  disconnectedCallback() {
    window.removeEventListener('toast', this.handleEvent)
  }
  private makeIcon(type: string) {
    const el = document.createElement('span')
    el.className = 'icon'
    el.innerHTML = type === 'error'
      ? '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2"/><path d="M10 5v7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="14.5" r="1.25" fill="currentColor"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2"/><path d="M6 10.5l2.5 2.5L14 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    return el
  }
  showToast({ message, type = '', duration = 5000 }: { message: string, type?: string, duration?: number }) {
    const toast = document.createElement('div')
    const box = this.shadow.getElementById('toast-box')
    toast.classList.add('toast-message')
    if (type) toast.classList.add(type)
    const icon = this.makeIcon(type)
    const content = document.createElement('div')
    content.className = 'content'
    content.textContent = message
    const close = document.createElement('button')
    close.className = 'close'
    close.setAttribute('aria-label', 'Close')
    close.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    close.addEventListener('click', () => toast.remove())
    toast.append(icon, content, close)
    box?.prepend(toast)
    const t = window.setTimeout(() => toast.remove(), duration)
    toast.addEventListener('remove', () => window.clearTimeout(t))
  }
  handleEvent = ({ detail }: any) => {
    this.showToast(typeof detail === 'string' ? { message: detail } : detail)
  }
})
document.body.append(document.createElement('toast-manager'))
export const toast = (message: string) => window.dispatchEvent(new CustomEvent('toast', { detail: { message } }))
