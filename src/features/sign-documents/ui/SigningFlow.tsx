import { useState } from 'react';
import type { FormEvent } from 'react';
import { applicationApi } from '@/entities/application';
import type { ClientApplication, LoanTerms, SigningDocument } from '@/entities/application';
import { getErrorMessage } from '@/shared/api';
import { plural } from '@/shared/lib/format';
import { Alert, Button, Checkbox, Input, Modal } from '@/shared/ui';
import { FileIcon, LockIcon } from '@/shared/ui/icons';
import { DocumentPreview } from './DocumentPreview';
import styles from './SigningFlow.module.css';

interface SigningFlowProps {
  application: ClientApplication;
  terms: LoanTerms;
  onSigned: (application: ClientApplication) => void;
}

/**
 * Мок подписания: ознакомиться с документами -> получить код -> ввести код.
 * В демо SMS не отправляется — код показываем на экране.
 */
export function SigningFlow({ application, terms, onSigned }: SigningFlowProps) {
  const documents = application.signing?.documents ?? [];
  const [opened, setOpened] = useState<SigningDocument | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [codeInfo, setCodeInfo] = useState<{ phoneMask: string; demoCode: string } | null>(null);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<'code' | 'sign' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function requestCode() {
    setPending('code');
    setError(null);
    try {
      setCodeInfo(await applicationApi.requestSignCode(application.id));
      setCode('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setPending(null);
    }
  }

  async function sign(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      setError('Введите 6 цифр из SMS');
      return;
    }
    setPending('sign');
    setError(null);
    try {
      onSigned(await applicationApi.sign(application.id, code));
    } catch (err) {
      setError(getErrorMessage(err));
      setPending(null);
    }
  }

  return (
    <div className={styles.flow}>
      <section aria-labelledby="docs-title">
        <h3 id="docs-title" className={styles.heading}>
          {documents.length} {plural(documents.length, ['документ', 'документа', 'документов'])} на подпись
        </h3>
        <ul className={styles.docs}>
          {documents.map((d) => (
            <li key={d.id} className={styles.doc}>
              <span className={styles.docIcon} aria-hidden="true">
                <FileIcon size={20} />
              </span>
              <div className={styles.docBody}>
                <span className={styles.docTitle}>{d.title}</span>
                <span className={styles.docMeta}>
                  {d.description} · {d.pages} стр.
                </span>
              </div>
              <Button size="s" variant="outline" onClick={() => setOpened(d)}>
                Открыть
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <Checkbox
        label="Я ознакомился(-ась) с документами и согласен(на) с условиями"
        checked={agreed}
        onChange={(e) => setAgreed(e.target.checked)}
        disabled={codeInfo !== null}
      />

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}

      {!codeInfo ? (
        <div>
          <Button size="l" leftIcon={<LockIcon size={18} />} disabled={!agreed} loading={pending === 'code'} onClick={requestCode}>
            Подписать документы
          </Button>
          <p className={styles.note}>Отправим код подтверждения на номер из анкеты.</p>
        </div>
      ) : (
        <form className={styles.codeForm} onSubmit={sign} noValidate>
          <Alert tone="info" title={`Код отправлен на ${codeInfo.phoneMask}`}>
            Демо-режим: SMS не отправляется. Ваш код — <strong className={styles.demoCode}>{codeInfo.demoCode}</strong>
          </Alert>
          <div className={styles.codeRow}>
            <Input
              label="Код из SMS"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              wrapperClassName={styles.codeInput}
            />
            <Button type="submit" size="m" loading={pending === 'sign'} className={styles.codeSubmit}>
              Подтвердить
            </Button>
          </div>
          <button type="button" className={styles.resend} onClick={requestCode} disabled={pending !== null}>
            Отправить код ещё раз
          </button>
        </form>
      )}

      <Modal open={opened !== null} onClose={() => setOpened(null)} size="l" title={opened?.title ?? ''}>
        {opened && <DocumentPreview document={opened} terms={terms} />}
      </Modal>
    </div>
  );
}
