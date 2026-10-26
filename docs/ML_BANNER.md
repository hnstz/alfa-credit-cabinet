# Персональный баннер: как подключить модель

Вверху дашборда клиента (`/`) стоит **витрина из трёх баннеров**: один персональный и два классических
(правило показа из [`ml/README.md`](../ml/README.md), раздел «Показ баннеров»).

- **Персональный** — что показать, выбирает модель. Тексты, суммы и кнопки живут в **каталоге баннеров**
  (`src/shared/mocks/engine/banner.ts → catalogEntry`), модель возвращает только код баннера и уверенность.
- **Классические** — продуктовая линейка банка: кредит на оборотные средства и кредитная линия, условия одинаковые
  для всех клиентов (`classicBanners()` там же). Если персональный баннер уже предлагает один из этих продуктов,
  его место в классическом ряду занимает инвестиционный кредит — чтобы на экране не было двух разных лимитов по одному продукту.

```
GET /api/client/banners ─► buildBannerContext() ─► predictBanner() ─► renderBanner() ─► personal
                           признаки клиента          МОДЕЛЬ            каталог текстов
                        └► classicBanners(personal) ─────────────────────────────────► classic[2]
```

### Правило показа: 4 показа без реакции

| Показов без реакции | Что делает витрина |
|---|---|
| 1–4 | баннер остаётся |
| больше 4 | баннер скрывается |
| клик по кнопке баннера | счётчик обнуляется |

Показ — одно открытие дашборда с этим баннером (автообновление дашборда не считается). Счётчики ведёт фронтенд
(`src/entities/banner/model/shows.ts`) в `localStorage['alfa-credit:banner-shows']`, отдельно для каждого пользователя;
новый повод показа (другой `id` баннера) — новый счётчик. Те же показы и клики уходят на сервер событиями `VIEW` / `CLICK`
для аналитики и дообучения. Для демо на карточках видна подпись «Показов без реакции: N из 4»
(`SHOW_BANNER_COUNTERS` в `public/config.js`); кнопка «Сбросить демо-данные» на странице входа обнуляет счётчики.

## Быстрое подключение (модель как HTTP-сервис)

1. Поднимите модель так, чтобы `POST <url>` принимал JSON ниже и разрешал CORS для адреса фронтенда.
2. В `public/config.js` (без пересборки) укажите адрес ML-сервиса — баннер пойдёт на `{ML_API_URL}/predict`:
   ```js
   ML_API_URL: '/ml',   // dev-прокси Vite на http://127.0.0.1:8000; можно и 'http://localhost:8000'
   ```
   Только для баннера, другим адресом: `BANNER_MODEL_URL: 'http://host:8000/predict'`. Либо `VITE_ML_API_URL` / `VITE_BANNER_MODEL_URL` в `.env`.
   Ответ `204` от модели означает «баннер не показывать» — фронт так и делает, на заглушку не откатывается.
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

Дашборд ходит в `GET /client/banners` (витрина) и `POST /client/banner/events` (OpenAPI-фрагмент ниже).
`GET /client/banner` — только персональный баннер, оставлен для совместимости. Откуда бэкенд берёт баннеры — детали реализации.

```yaml
/client/banners:
  get:
    summary: Витрина дашборда — один персональный баннер и два классических
    security: [{ bearerAuth: [] }]
    responses:
      "200":
        description: Витрина
        content:
          application/json:
            schema:
              type: object
              required: [personal, classic]
              properties:
                personal: { nullable: true, allOf: [{ $ref: "#/components/schemas/PersonalBanner" }], description: "null — модель решила ничего не показывать" }
                classic: { type: array, maxItems: 2, items: { $ref: "#/components/schemas/PersonalBanner" }, description: "Продуктовые баннеры: modelVersion = catalog, score = 0, без reasons" }
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
        theme: { type: string, enum: [brand, dark, positive, warning, amethyst, salad], description: "amethyst / salad — темы классических баннеров" }
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

Если подключаете реальный бэкенд (`USE_MOCKS: false`), он должен реализовать `GET /client/banners` и `POST /client/banner/events`
(в `alfa-credit-backend` — `ClientController`); фронтенд менять не нужно.

## Что смотреть на демо

| Логин | Персональный баннер | Почему |
|---|---|---|
| `romashka` | «Кредит одобрен — осталось оформить» | есть одобренная заявка |
| `petrova` | «У банка есть предложение для вас» | встречное предложение |
| `novikov` | «Заявка ждёт вас» | незаконченная анкета |

Рядом с персональным у всех — классические «Кредит на оборотные средства» и «Кредитная линия».
После отказа/подписания/закрытия заявок персональный баннер меняется на рекомендацию модели (кредитная линия, подушка на слабые месяцы, стартовый кредит и т. д.).

Проверка правила показа: откройте дашборд 4 раза подряд (подпись дойдёт до «4 из 4»), на 5-й раз баннеры исчезнут.
Нажмите кнопку на одном из них до этого — у него счётчик начнётся заново с 1.
Журнал событий VIEW/CLICK/DISMISS: `localStorage['alfa-credit:banner-events']`, счётчики показов: `localStorage['alfa-credit:banner-shows']`.
«Закрыть» (×) прячет баннер до конца сессии вкладки, новый повод показа (другой `id`) покажется снова.

## Файлы

| Файл | Роль |
|---|---|
| `src/entities/banner/` | типы `PersonalBanner` и `BannerShowcase`, API-клиент (`GET /client/banners`, `POST /client/banner/events`), правило показа (`model/shows.ts`) |
| `src/widgets/banner-showcase/` | витрина из трёх карточек: тема, CTA, «Почему я это вижу», закрытие, счётчик показов, отправка событий |
| `src/shared/mocks/engine/banner.ts` | **признаки → модель → каталог**; здесь подключается ваша модель. Там же классический ряд (`classicBanners`) |
| `src/shared/mocks/handlers/client.ts` | MSW-обработчики баннеров |
| `src/pages/client-home/ClientHomePage.tsx` | встраивание в дашборд |
