import styles from '../Wizard.module.css';

/** Подпись поля с пометкой «из данных банка» — клиент видит, что мы заполнили сами. */
export function FieldLabel({ text, prefilled }: { text: string; prefilled?: boolean }) {
  return (
    <>
      {text}
      {prefilled && (
        <span className={styles.prefilled} title="Заполнили по данным банка — проверьте">
          из банка
        </span>
      )}
    </>
  );
}
