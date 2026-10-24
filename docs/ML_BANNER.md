# Персональный баннер: как подключить модель

Баннер показывается вверху дашборда клиента (`/`). Что именно показать, выбирает модель.
Тексты, суммы и кнопки живут в **каталоге баннеров** (`src/shared/mocks/engine/banner.ts → catalogEntry`),
модель возвращает только код баннера и уверенность.

```
GET /api/client/banner ─► buildBannerContext() ─► predictBanner() ─► renderBanner() ─► PersonalBanner (JSON)
                          признаки клиента          МОДЕЛЬ            каталог текстов
```

## Быстрое подключение (модель как HTTP-сервис)

1. Поднимите модель так, чтобы `POST <url>` принимал JSON ниже и разрешал CORS для адреса фронтенда.
2. В `public/config.js` (без пересборки) укажите:
   ```js
   BANNER_MODEL_URL: 'http://localhost:8000/predict',
   ```
   Либо `VITE_BANNER_MODEL_URL` в `.env`.
3. Обновите страницу. Если модель недоступна, отвечает не по контракту или дольше 3 с — фронт тихо откатится на правила-заглушку и напишет `[banner] модель недоступна` в консоль.

### Запрос к модели

`POST {BANNER_MODEL_URL}`, `Content-Type: application/json`

```json
{
  "client_id": "c-romashka",
  "features": {
    "company": { "legal_form": "OOO", "okved": "47.11", "region": "Москва", "age_months": 60, "employees": 24, "annual_revenue": 84000000 },
    "turnover": { "months_of_history": 12, "avg_inflow_3m": 7400000, "trend_3m_pct": 12.5, "gap_months_12m": 0 },
    "bki": { "has_history": true, "rating": 780, "active_loans": 1, "monthly_payments": 180000, "max_overdue_days": 0, "overdues_12m": 0, "requests_30d": 0 },
    "tax_debt": 0,
    "industry_risk": "LOW",
    "debt_load": 0.02,
    "applications": { "has_draft": false, "draft_step": null, "recent_statuses": ["APPROVED"], "has_active_loan": true, "days_since_last_application": 1 }
  }
}
```

Точные имена и типы полей — интерфейс `BannerFeatures` в `src/shared/mocks/engine/banner.ts`.

### Ответ модели

```json
{
  "banner_code": "CREDIT_LINE_LIMIT",
  "score": 0.88,
  "model_version": "xgb-2026-10-24",
  "amount": 12000000,
  "term_months": 24,
  "reasons": ["Поступления за 3 месяца выросли на 12 %"]
}
```

| Поле | Обязательно | Описание |
|---|---|---|
| `banner_code` | да | Один из кодов ниже. `null` или `"NONE"` — ничего не показывать (фронт получит 204) |
| `score` | да | Уверенность 0..1 |
| `model_version` | нет | Попадает в баннер и в аналитику |
| `amount`, `term_months` | нет | Переопределяют сумму/срок из каталога |
| `reasons` | нет | Текст для блока «Почему я это вижу» (простым языком). Нет — берётся из заглушки/каталога |

### Коды баннеров

| Код | Когда уместен | Кнопка |
|---|---|---|
| `ACCEPT_OFFER` | есть заявка в статусе APPROVED / COUNTER_OFFER | к условиям заявки |
| `SIGN_DOCS` | заявка в статусе SIGNING | к подписанию |
| `CONTINUE_DRAFT` | есть незаконченная анкета | продолжить анкету |
| `CREDIT_LINE_LIMIT` | растущие обороты, хорошая история | анкета: кредитная линия |
| `SEASONAL_BUFFER` | кассовые разрывы | анкета: кредитная линия |
| `STARTER_LOAN` | бизнес < 1 года, нет истории | анкета: оборотный кредит |
| `GROWTH_INVEST` | надёжный заёмщик, развитие | анкета: инвестиционный |
| `REFINANCE` | высокая долговая нагрузка | анкета: оборотный кредит |
| `CLOSE_TAX_DEBT` | налоговый долг / просрочка | без кнопки, совет |
| `WORKING_CAPITAL` | универсальный вариант | анкета: оборотный кредит |

`ACCEPT_OFFER` и `SIGN_DOCS` без подходящей заявки отбрасываются (используется заглушка). Неизвестный код — тоже.
Новый код: добавьте его в `BANNER_CODES` и в `catalogEntry`.

## Контракт фронтенд ↔ бэкенд (если модель стоит за реальным бэкендом)

Фронт знает только эти два эндпоинта (OpenAPI-фрагмент ниже). Откуда бэкенд берёт баннер — детали реализации.

```yaml
/client/banner:
  get:
    summary: Персональный баннер клиента
    security: [{ bearerAuth: [] }]
    responses:
      "200": { description: Баннер, content: { application/json: { schema: { $ref: "#/components/schemas/PersonalBanner" } } } }
      "204": { description: Модель решила ничего не показывать }
/client/banner/events:
  post:
    summary: Событие по баннеру (для аналитики и дообучения)
    requestBody:
      content:
        application/json:
          schema:
            type: object
            required: [bannerId, event]
            properties:
              bannerId: { type: string }
              event: { type: string, enum: [VIEW, CLICK, DISMISS] }
    responses: { "204": { description: Принято } }
components:
  schemas:
    PersonalBanner:
      type: object
      required: [id, code, modelVersion, score, title, text, perks, theme, cta, reasons]
      properties:
        id: { type: string, description: "Меняется, когда меняется повод показа; по нему считаются VIEW и «закрыть»" }
        code: { type: string }
        modelVersion: { type: string }
        score: { type: number, minimum: 0, maximum: 1 }
        title: { type: string }
        text: { type: string }
        badge: { type: string }
        highlight: { type: object, required: [value], properties: { value: { type: string }, caption: { type: string } } }
        perks: { type: array, items: { type: string } }
        theme: { type: string, enum: [brand, dark, positive, warning] }
        validUntil: { type: string, format: date-time }
        reasons: { type: array, items: { type: string } }
        cta:
          nullable: true
          oneOf:
            - { type: object, properties: { kind: { const: NEW_APPLICATION }, label: { type: string }, product: { type: string, enum: [WORKING_CAPITAL, INVESTMENT, EQUIPMENT, CREDIT_LINE] }, amount: { type: number }, termMonths: { type: integer } } }
            - { type: object, properties: { kind: { const: CONTINUE_DRAFT }, label: { type: string } } }
            - { type: object, properties: { kind: { const: OPEN_APPLICATION }, label: { type: string }, applicationId: { type: string }, applicationStatus: { type: string } } }
            - { type: object, properties: { kind: { const: LINK }, label: { type: string }, href: { type: string, description: "Только внутренний путь, начинается с /" } } }
```

Если подключаете реальный бэкенд (`USE_MOCKS: false`), он должен реализовать оба эндпоинта; фронтенд менять не нужно.

## Что смотреть на демо

| Логин | Баннер | Почему |
|---|---|---|
| `romashka` | «Кредит одобрен — осталось оформить» | есть одобренная заявка |
| `petrova` | «У банка есть предложение для вас» | встречное предложение |
| `novikov` | «Заявка ждёт вас» | незаконченная анкета |

После отказа/подписания/закрытия заявок баннер меняется на рекомендацию модели (кредитная линия, подушка на слабые месяцы, стартовый кредит и т. д.).
Журнал событий VIEW/CLICK/DISMISS: `localStorage['alfa-credit:banner-events']`.
«Закрыть» (×) прячет баннер до конца сессии вкладки, новый повод показа (другой `id`) покажется снова.

## Файлы

| Файл | Роль |
|---|---|
| `src/entities/banner/` | тип `PersonalBanner`, API-клиент (`GET /client/banner`, `POST /client/banner/events`) |
| `src/widgets/personal-banner/` | виджет: тема, CTA, «Почему я это вижу», закрытие, отправка событий |
| `src/shared/mocks/engine/banner.ts` | **признаки → модель → каталог**; здесь подключается ваша модель |
| `src/shared/mocks/handlers/client.ts` | MSW-обработчики баннера |
| `src/pages/client-home/ClientHomePage.tsx` | встраивание в дашборд |
