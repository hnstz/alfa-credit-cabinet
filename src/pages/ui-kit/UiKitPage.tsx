import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardFooter,
  CardHeader,
  Input,
  Modal,
  MoneyInput,
  Select,
  Skeleton,
  Stepper,
  Table,
} from '@/shared/ui';
import type { BadgeTone, TableColumn, TableSort } from '@/shared/ui';
import { formatMoney } from '@/shared/lib/format';
import styles from './UiKitPage.module.css';

interface DemoApplication {
  id: string;
  company: string;
  product: string;
  amount: number;
  status: 'На проверке' | 'Одобрена' | 'Нужны уточнения' | 'Отказ';
}

const DEMO_ROWS: DemoApplication[] = [
  { id: 'A-1001', company: 'ООО «Ромашка»', product: 'Оборотный кредит', amount: 1_500_000, status: 'На проверке' },
  { id: 'A-1002', company: 'ИП Петров А. С.', product: 'Кредит на оборудование', amount: 4_200_000, status: 'Одобрена' },
  { id: 'A-1003', company: 'ООО «Вектор»', product: 'Кредитная линия', amount: 800_000, status: 'Нужны уточнения' },
  { id: 'A-1004', company: 'ИП Сидорова Е. В.', product: 'Оборотный кредит', amount: 300_000, status: 'Отказ' },
];

const STATUS_TONE: Record<DemoApplication['status'], BadgeTone> = {
  'На проверке': 'info',
  Одобрена: 'success',
  'Нужны уточнения': 'warning',
  Отказ: 'danger',
};

const COLUMNS: TableColumn<DemoApplication>[] = [
  { key: 'id', header: '№', cell: (r) => r.id, width: 100 },
  { key: 'company', header: 'Компания', cell: (r) => r.company, sortable: true },
  { key: 'product', header: 'Продукт', cell: (r) => r.product },
  { key: 'amount', header: 'Сумма', cell: (r) => formatMoney(r.amount), align: 'right', sortable: true },
  {
    key: 'status',
    header: 'Статус',
    cell: (r) => (
      <Badge tone={STATUS_TONE[r.status]} dot>
        {r.status}
      </Badge>
    ),
  },
];

const STEPS = [
  { id: 'goal', title: 'Цель', description: 'Сумма и срок' },
  { id: 'business', title: 'Бизнес', description: 'Данные компании' },
  { id: 'finance', title: 'Финансы', description: 'Показатели' },
  { id: 'review', title: 'Проверка', description: 'Отправка заявки' },
];

const TERM_OPTIONS = [
  { value: '12', label: '12 месяцев' },
  { value: '24', label: '24 месяца' },
  { value: '36', label: '36 месяцев' },
];

export function UiKitPage() {
  const [amount, setAmount] = useState<number | null>(1_500_000);
  const [term, setTerm] = useState('');
  const [inn, setInn] = useState('');
  const [step, setStep] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [sort, setSort] = useState<TableSort | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const innError = inn.length > 0 && !/^\d{10}(\d{2})?$/.test(inn) ? 'ИНН — 10 или 12 цифр' : undefined;

  const sortedRows = useMemo(() => {
    if (!sort) return DEMO_ROWS;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...DEMO_ROWS].sort((a, b) => {
      const va = a[sort.key as keyof DemoApplication];
      const vb = b[sort.key as keyof DemoApplication];
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
  }, [sort]);

  function fakeSubmit() {
    setSubmitting(true);
    setTimeout(() => setSubmitting(false), 1500);
  }

  function fakeReload() {
    setTableLoading(true);
    setTimeout(() => setTableLoading(false), 1500);
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.h1}>UI-kit</h1>

      <section className={styles.section}>
        <h2>Button</h2>
        <div className={styles.row}>
          <Button>Оформить заявку</Button>
          <Button variant="secondary">Вернуться</Button>
          <Button variant="outline">Сохранить черновик</Button>
          <Button variant="ghost">Отмена</Button>
          <Button variant="danger">Отказать</Button>
          <Button disabled>Недоступно</Button>
          <Button loading={submitting} onClick={fakeSubmit}>
            {submitting ? 'Отправляем…' : 'Нажми — загрузка'}
          </Button>
        </div>
        <div className={styles.row}>
          <Button size="s">Small</Button>
          <Button size="m">Medium</Button>
          <Button size="l">Large</Button>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Input / MoneyInput / Select</h2>
        <div className={styles.grid}>
          <MoneyInput
            label="Сумма кредита"
            hint="От 300 000 до 10 000 000 ₽"
            value={amount}
            onChange={setAmount}
          />
          <Select
            label="Срок"
            placeholder="Выберите срок"
            options={TERM_OPTIONS}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <Input
            label="ИНН"
            placeholder="10 или 12 цифр"
            value={inn}
            onChange={(e) => setInn(e.target.value)}
            error={innError}
            required
          />
          <Input label="Недоступное поле" value="Только чтение" disabled readOnly />
        </div>
        <p className={styles.note}>
          Значение суммы в состоянии: <b>{amount === null ? 'null' : amount}</b>
        </p>
      </section>

      <section className={styles.section}>
        <h2>Stepper</h2>
        <Stepper steps={STEPS} currentIndex={step} onStepClick={setStep} />
        <div className={styles.row}>
          <Button size="s" variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Назад
          </Button>
          <Button size="s" disabled={step === STEPS.length - 1} onClick={() => setStep(step + 1)}>
            Далее
          </Button>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Card / Badge / Skeleton</h2>
        <div className={styles.grid}>
          <Card>
            <CardHeader title="Оборотный кредит" action={<Badge tone="brand">Хит</Badge>} />
            <p>От 15,9% годовых · до 36 месяцев</p>
            <CardFooter>
              <Button size="s">Подробнее</Button>
            </CardFooter>
          </Card>
          <Card variant="outlined" interactive>
            <CardHeader title="Кликабельная карточка" />
            <p>Приподнимается при наведении.</p>
          </Card>
          <Card aria-busy="true">
            <Skeleton variant="text" width="50%" />
            <div style={{ height: 12 }} />
            <Skeleton variant="text" lines={3} width="100%" />
            <div style={{ height: 12 }} />
            <div className={styles.row}>
              <Skeleton variant="circle" width={40} height={40} />
              <Skeleton width={120} height={40} />
            </div>
          </Card>
        </div>
        <div className={styles.row}>
          <Badge>Neutral</Badge>
          <Badge tone="brand">Brand</Badge>
          <Badge tone="success" dot>Success</Badge>
          <Badge tone="warning" dot>Warning</Badge>
          <Badge tone="danger" dot>Danger</Badge>
          <Badge tone="info" size="s">Info S</Badge>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Table</h2>
        <div className={styles.row}>
          <Button size="s" variant="outline" onClick={fakeReload}>
            Показать загрузку
          </Button>
        </div>
        <Table
          caption="Заявки"
          columns={COLUMNS}
          rows={sortedRows}
          getRowKey={(r) => r.id}
          sort={sort}
          onSortChange={setSort}
          loading={tableLoading}
          onRowClick={(r) => alert(`Открыть заявку ${r.id}`)}
        />
      </section>

      <section className={styles.section}>
        <h2>Modal</h2>
        <Button onClick={() => setModalOpen(true)}>Открыть окно</Button>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Отправить заявку?"
          description="После отправки изменить данные будет нельзя."
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Отмена
              </Button>
              <Button onClick={() => setModalOpen(false)}>Отправить</Button>
            </>
          }
        >
          <p>Esc, клик по затемнению и крестик закрывают окно. Фокус остаётся внутри.</p>
        </Modal>
      </section>
    </main>
  );
}
