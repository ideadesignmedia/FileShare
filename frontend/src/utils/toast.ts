customElements.define('toast-manager', class Toaster extends HTMLElement {
  shadow
  constructor() {
    super()
    this.shadow = this.attachShadow({ mode: 'open' })
  }
  connectedCallback() {
    this.shadow.innerHTML = `<style>
          * {
            --toast-bg: blue;
            --toast-color: #fff;
            --toast-success-bg: #000;
            --toast-success-color: #fff;
            --toast-error-bg: #000;
            --toast-error-color: #fff;
            --toast-very-small-radius: 0.125rem;
            --toast-medium-radius: 0.5rem;
            --toast-medium: 2rem;
            --toast-border: #000;
          }
          #toast-box {
            position: fixed;
            top: calc(.2rem + env(safe-area-inset-top));
            right: .2rem;
            height: auto;
            width: auto;
            max-width: min(300px, 90%);
            display: flex;
            flex-direction: column-reverse;
            align-items: flex-end;
            z-index: 10000000;
          }
          #toast {
            max-width: min(300px, 90%);
            z-index: 10000000;
          }
          
          .toast-message {
            width: 100%;
            max-width: min(100%, 280px);
            padding: 1.5rem;
            padding-top: 1.75rem;
            background: var(--toast-bg);
            margin: 0.25rem 1rem;
            color: var(--toast-color);
            border: 1px solid var(--toast-border);
            border-radius: var(--toast-medium-radius);
            position: relative;
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: normal;
          }

          .toast-message.success {
            background: var(--toast-success-bg);
            color: var(--toast-success-color);
          }
      
          .toast-message.error {
            background: var(--toast-error-bg);
            color: var(--toast-error-color);
          }
          
          .toast-message.animate {
            animation: slide-left 350ms ease-in-out;
          }
          
          .toast-message .absthing {
            cursor: pointer;
            z-index: 10000000;
            font-weight: 800;
            position: absolute;
            top: .2rem;
            right: .2rem;
            padding: 0.05rem;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border-radius: 25%;
          }

          .absthing:hover {
            background-color: gray;
            color: white;
          }
          
          @keyframes slide-left {
            0% {
              transform: translateX(100%);
            }
          
            100% {
              transform: translateX(0%);
            }
          }</style><div id="toast-box"></div>`
    window.addEventListener('toast', this.handleEvent.bind(this))
  }
  disconnectedCallback() {
    window.removeEventListener('toast', this.handleEvent.bind(this))
  }
  showToast({ message, type = '', duration = 5000 }: { message: string, type?: string, duration?: number }) {
    const toast = document.createElement('div')
    toast.classList.add(...['toast-message', 'animate'].concat(type ? [type] : []))
    toast.innerHTML = `
    ${message}
    <span class="absthing" onclick="this.parentElement.remove()">
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="2" width="18" height="18" rx="4" ry="4" fill="none" stroke="none" stroke-width="2"/>
        <path d="M6 6 L16 16 M16 6 L6 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </span>
            `;
    this.shadow.getElementById('toast-box')?.prepend(toast)
    setTimeout(() => toast.remove(), duration)
  }
  handleEvent({ detail }: any) {
    this.showToast(typeof detail === 'string' ? { message: detail } : detail)
  }
})
document.body.append(document.createElement('toast-manager'))
export const toast = (message: string) => window.dispatchEvent(new CustomEvent('toast', { detail: { message } }))