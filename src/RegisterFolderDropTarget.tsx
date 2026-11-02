import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  isVisible: boolean;
  t: (key: 'registerDropAriaLabel' | 'registerDropActive' | 'registerDropHelp' | 'registerDropChooseFile') => string;
  onFolderDrop: (folder: string) => void | Promise<void>;
  onInvalidDrop: () => void;
  onChooseFile: () => void | Promise<void>;
  portalSelector?: string;
};

type DropPosition = { x: number; y: number };
type DropEvent = { type: 'enter' | 'over' | 'leave'; position?: DropPosition };

function RegisterFolderDropTarget({ isVisible, t, onFolderDrop, onInvalidDrop, onChooseFile, portalSelector }: Props) {
  const [active, setActive] = useState(false);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const targetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isVisible || !portalSelector) {
      setPortalHost(null);
      return;
    }
    setPortalHost(document.querySelector<HTMLElement>(portalSelector));
  }, [isVisible, portalSelector]);

  useEffect(() => {
    if (!isVisible) {
      setActive(false);
      return;
    }

    const containsPosition = (position?: DropPosition) => {
      const target = targetRef.current;
      if (!target || !position) return false;
      const bounds = target.getBoundingClientRect();
      const x = position.x / window.devicePixelRatio;
      const y = position.y / window.devicePixelRatio;
      return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
    };
    const onDrag = (event: Event) => {
      const detail = (event as CustomEvent<DropEvent>).detail;
      setActive(detail.type !== 'leave' && containsPosition(detail.position));
    };
    const onDrop = (event: Event) => {
      const detail = (event as CustomEvent<{ paths: unknown; position: DropPosition }>).detail;
      if (!containsPosition(detail.position)) return;
      setActive(false);
      const paths = detail.paths;
      if (!Array.isArray(paths) || paths.length !== 1 || typeof paths[0] !== 'string' || !paths[0]) {
        onInvalidDrop();
        return;
      }
      void onFolderDrop(paths[0]);
    };

    window.addEventListener('b6h-folder-drag', onDrag);
    window.addEventListener('b6h-folder-drop', onDrop);
    return () => {
      window.removeEventListener('b6h-folder-drag', onDrag);
      window.removeEventListener('b6h-folder-drop', onDrop);
    };
  }, [isVisible, onFolderDrop, onInvalidDrop]);

  const target = (
    <div ref={targetRef} className={`register-folder-drop${active ? ' drag-active' : ''}`} role="group" aria-label={t('registerDropAriaLabel')}>
      {active && <p>{t('registerDropActive')}</p>}
      <span>{t('registerDropHelp')} <button type="button" className="register-drop-choose" onClick={() => void onChooseFile()}>{t('registerDropChooseFile')}</button></span>
    </div>
  );

  if (!isVisible) return null;
  if (portalSelector) return portalHost ? createPortal(target, portalHost) : null;
  return target;
}

export default RegisterFolderDropTarget;
