import { useEffect } from 'react';
import { useStudioStore } from '../store/useStudioStore';

function isInputElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function useHotkeys() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing into any input/textarea/select
      if (isInputElement(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      const { setActiveTab, toggleInspector } = useStudioStore.getState();

      if (e.key === '1') {
        e.preventDefault();
        setActiveTab('telemetry');
      } else if (e.key === '2') {
        e.preventDefault();
        setActiveTab('framebuffer');
      } else if (e.key === '3') {
        e.preventDefault();
        setActiveTab('console');
      } else if (e.key === '4') {
        e.preventDefault();
        setActiveTab('controls');
      } else if (e.key === ']') {
        e.preventDefault();
        toggleInspector();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
