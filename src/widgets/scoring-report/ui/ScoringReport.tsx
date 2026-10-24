import { useState } from 'react';
import { RISK_LABEL, RISK_TONE } from '@/entities/application';
import type { Scoring, ScoringFactor } from '@/entities/application';
import { cx } from '@/shared/lib/cx';
import { formatDateTime, formatPercent } from '@/shared/lib/format';
import { Badge, Button } from '@/shared/ui';
import { ArrowDownIcon, ArrowUpIcon } from '@/shared/ui/icons';
import styles from './ScoringReport.module.css';

const SCALE_MIN = 300;
const SCALE_MAX = 900;
const ZONES = [
  { from: 300, to: 600, label: 'Высокий риск', tone: 'high' },
  { from: 600, to: 700, label: 'Средний', tone: 'medium' },
  { from: 700, to: 900, label: 'Низкий', tone: 'low' },
] as const;

const pct = (score: number) => ((score - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;

/** Шкала балла с зонами риска и отметкой текущей заявки. */
function ScoreScale({ score }: { score: number }) {
  return (
    <div className={styles.scale}>
      <div className={styles.track} role="img" aria-label={`Балл ${score} из ${SCALE_MAX}`}>
        {ZONES.map((z) => (
          <span
            key={z.tone}
            className={cx(styles.zone, styles[`zone_${z.tone}`])}
            style={{ left: `${pct(z.from)}%`, width: `${pct(z.to) - pct(z.from)}%` }}
          >
            {z.label}
          </span>
        ))}
        <span className={styles.pointer} style={{ left: `${pct(score)}%` }}>
          <span className={styles.pointerLabel}>{score}</span>
        </span>
      </div>
      <div className={styles.scaleTicks} aria-hidden="true">
        {[300, 600, 700, 900].map((t) => (
          <span key={t} style={{ left: `${pct(t)}%` }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Объяснимость: вклад каждого признака в балл (как SHAP).
 * Расходящиеся столбцы от нуля: вправо — повышает оценку, влево — понижает.
 * Каждый столбец подписан числом и стрелкой — цвет не единственный носитель смысла.
 */
function FactorChart({ factors }: { factors: ScoringFactor[] }) {
  const max = Math.max(1, ...factors.map((f) => Math.abs(f.impact)));

  return (
    <ul className={styles.factors}>
      {factors.map((f) => {
        const positive = f.impact > 0;
        const width = `${(Math.abs(f.impact) / max) * 50}%`;
        return (
          <li key={f.code} className={styles.factor}>
            <div className={styles.factorText}>
              <span className={styles.factorLabel}>{f.label}</span>
              <span className={styles.factorValue}>{f.value}</span>
            </div>
            <div
              className={styles.factorBarArea}
              title={`${f.label}: ${positive ? '+' : '−'}${Math.abs(f.impact)} баллов`}
            >
              <span className={styles.axis} aria-hidden="true" />
              <span
                className={cx(styles.bar, positive ? styles.barPositive : styles.barNegative)}
                style={positive ? { left: '50%', width } : { right: '50%', width }}
              />
            </div>
            <span className={cx(styles.impact, positive ? styles.impactPositive : styles.impactNegative)}>
              {positive ? <ArrowUpIcon size={14} /> : <ArrowDownIcon size={14} />}
              {positive ? '+' : '−'}
              {Math.abs(f.impact)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const TOP = 6;

export function ScoringReport({ scoring }: { scoring: Scoring }) {
  const [showAll, setShowAll] = useState(false);
  const factors = showAll ? scoring.factors : scoring.factors.slice(0, TOP);

  return (
    <div className={styles.report}>
      <dl className={styles.metrics}>
        <div>
          <dt>Скоринговый балл</dt>
          <dd className={styles.metricMain}>{scoring.score}</dd>
        </div>
        <div>
          <dt>Риск</dt>
          <dd>
            <Badge tone={RISK_TONE[scoring.riskLevel]} dot>
              {RISK_LABEL[scoring.riskLevel]}
            </Badge>
          </dd>
        </div>
        <div>
          <dt>PD (вероятность дефолта)</dt>
          <dd>{formatPercent(scoring.pd * 100, 2)}</dd>
        </div>
        <div>
          <dt>Ставка по риску</dt>
          <dd>{formatPercent(scoring.ratePercent)}</dd>
        </div>
        <div>
          <dt>Уверенность модели</dt>
          <dd>{Math.round(scoring.confidence * 100)} %</dd>
        </div>
      </dl>

      <ScoreScale score={scoring.score} />

      <section aria-labelledby="factors-title">
        <div className={styles.factorsHead}>
          <h4 id="factors-title" className={styles.subTitle}>
            Что повлияло на оценку
          </h4>
          <span className={styles.legend}>
            <span><i className={styles.swatchPositive} /> повышает</span>
            <span><i className={styles.swatchNegative} /> понижает</span>
          </span>
        </div>
        <FactorChart factors={factors} />
        {scoring.factors.length > TOP && (
          <Button variant="ghost" size="s" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Показать главные' : `Показать все (${scoring.factors.length})`}
          </Button>
        )}
      </section>

      <p className={styles.footnote}>
        Модель {scoring.modelVersion} · рассчитано {formatDateTime(scoring.calculatedAt)} · база 640 баллов + вклад
        признаков
      </p>
    </div>
  );
}
