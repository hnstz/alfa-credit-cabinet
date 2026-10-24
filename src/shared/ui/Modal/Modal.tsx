import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { cx } from '@/shared/lib/cx';
import { CloseIcon } from '../icons';
import styles from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Кнопки действий внизу окна. */
  footer?: ReactNode;
  size?: 's' | 'm' | 'l';
  /** Закрывать по клику на затемнение. Для критичных подтверждений поставьте false. */
  closeOnBackdrop?: boolean;
}

/**
 * Модальное окно на нативном <dialog>:
 * фокус-ловушка, Esc и aria-modal работают «из коробки».
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'm',
  closeOnBackdrop = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Синхронизируем prop `open` с состоянием <dialog>
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Блокируем прокрутку страницы под окном
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={cx(styles.dialog, styles[`size_${size}`])}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(e) => {
        // Esc: не даём браузеру закрыть самому — состоянием управляет родитель
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Клик по ::backdrop приходит с target === сам <dialog>
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <div className={styles.panel}>
          <header className={styles.header}>
            <div>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className={styles.description}>
                  {description}
                </p>
              )}
            </div>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
              <CloseIcon />
            </button>
          </header>
          {children && <div className={styles.body}>{children}</div>}
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
