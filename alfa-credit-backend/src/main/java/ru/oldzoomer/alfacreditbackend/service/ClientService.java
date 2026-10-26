package ru.oldzoomer.alfacreditbackend.service;

import org.springframework.stereotype.Service;
import ru.oldzoomer.alfacreditbackend.dto.FeedItemDto;
import ru.oldzoomer.alfacreditbackend.dto.ProductDto;
import ru.oldzoomer.alfacreditbackend.entity.User;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class ClientService {

    private static final List<ProductDto> PRODUCTS = List.of(
            ProductDto.builder().id("p-1").code("WORKING_CAPITAL").name("Оборотный кредит")
                    .description("Кредит на пополнение оборотных средств").minAmount(100_000L).maxAmount(10_000_000L)
                    .minTermMonths(3).maxTermMonths(36).build(),
            ProductDto.builder().id("p-2").code("INVESTMENT").name("Инвестиционный кредит")
                    .description("Кредит на развитие бизнеса и инвестиции").minAmount(500_000L).maxAmount(50_000_000L)
                    .minTermMonths(6).maxTermMonths(60).build(),
            ProductDto.builder().id("p-3").code("EQUIPMENT").name("Кредит на оборудование")
                    .description("Финансирование покупки оборудования").minAmount(200_000L).maxAmount(30_000_000L)
                    .minTermMonths(6).maxTermMonths(48).build(),
            ProductDto.builder().id("p-4").code("CREDIT_LINE").name("Кредитная линия")
                    .description("Овердрафт и кредитная линия для операционной деятельности").minAmount(100_000L).maxAmount(20_000_000L)
                    .minTermMonths(1).maxTermMonths(12).build()
    );

    public List<ProductDto> getProducts() {
        return PRODUCTS;
    }

    public List<FeedItemDto> getFeed(User user) {
        List<FeedItemDto> feed = new ArrayList<>();
        feed.add(FeedItemDto.builder()
                .id("f-1").type("news").title("Новые условия по оборотным кредитам")
                .text("Сниженные ставки для надёжных заёмщиков с кредитной историей более 2 лет.")
                .createdAt(Instant.now().minusSeconds(3600).toString()).link("/products/working-capital").build());
        feed.add(FeedItemDto.builder()
                .id("f-2").type("promo").title("Бесплатная консультация по налогам")
                .text("Запишитесь на бесплатную консультацию с нашим налоговым экспертом.")
                .createdAt(Instant.now().minusSeconds(86400).toString()).link("/consulting").build());
        return feed;
    }

    /**
     * Персональный баннер. Возвращает null если показывать нечего.
     * В реальной системе здесь вызывается ML-модель.
     */
    public PersonalBanner getBanner(User user) {
        // Simple rule-based banner logic (like the frontend mock)
        // In production: call ML model endpoint

        // For now, return a simple default banner.
        // id стабилен, пока не сменился повод показа: по нему фронт считает показы без реакции
        return new PersonalBanner(
                "WORKING_CAPITAL:" + user.getId(),
                "WORKING_CAPITAL",
                "rule-based-v1",
                0.7,
                "Возможно, вам подойдёт оборотный кредит",
                "На основе данных вашего бизнеса мы подобрали персональное предложение.",
                "Рекомендуем",
                new PersonalBanner.HighlightDto("от 18%", "ставка от"),
                List.of("Решение за 2 дня", "Без залога до 1 млн", "Досрочное погашение без штрафов"),
                "brand",
                Instant.now().plusSeconds(86400 * 7).toString(),
                List.of("У вас стабильные обороты", "Хорошая кредитная история"),
                new PersonalBanner.CtaDto("NEW_APPLICATION", "Подать заявку", "WORKING_CAPITAL", 1_000_000L, 12, null, null, null)
        );
    }

    /**
     * Классический ряд витрины: продуктовые баннеры, условия одинаковые для всех клиентов.
     * Третий продукт запасной: встаёт вместо продукта, который уже предлагает персональный баннер.
     */
    private static final List<ClassicBanner> CLASSIC_LINEUP = List.of(
            new ClassicBanner("WORKING_CAPITAL", "Кредит на оборотные средства",
                    "Закупка товара, зарплаты, аренда и налоги. Решение по заявке — в течение дня.",
                    "Онлайн-заявка за 5 минут", "до 3 млн ₽", "от 17,5 % на 24 месяца", "Оформить", 3_000_000L, 24),
            new ClassicBanner("CREDIT_LINE", "Кредитная линия",
                    "Берёте деньги частями, когда нужно, и платите проценты только за использованную сумму.",
                    "Лимит восстанавливается", "до 5 млн ₽", "от 18,5 % на 24 месяца", "Подключить", 5_000_000L, 24),
            new ClassicBanner("INVESTMENT", "Кредит на развитие бизнеса",
                    "Новая точка, ремонт, расширение производства: длинный срок и комфортный платёж.",
                    "Срок до 5 лет", "до 10 млн ₽", "от 16,9 % на 36 месяцев", "Рассчитать", 10_000_000L, 36)
    );

    private static final List<String> CLASSIC_THEMES = List.of("amethyst", "salad");

    /**
     * Витрина дашборда: один персональный баннер и два классических.
     * Правило «4 показа без реакции» применяет фронтенд по событиям VIEW / CLICK.
     */
    public BannerShowcase getShowcase(User user) {
        PersonalBanner personal = getBanner(user);
        String taken = personal != null && personal.cta() != null && "NEW_APPLICATION".equals(personal.cta().kind())
                ? personal.cta().product()
                : null;
        List<PersonalBanner> classic = new ArrayList<>();
        for (ClassicBanner entry : CLASSIC_LINEUP) {
            if (classic.size() == CLASSIC_THEMES.size()) {
                break;
            }
            if (!entry.product().equals(taken)) {
                classic.add(entry.toBanner(CLASSIC_THEMES.get(classic.size())));
            }
        }
        return new BannerShowcase(personal, classic);
    }

    public void logBannerEvent(User user, String bannerId, String event) {
        // In production: log to analytics database
        // For now: just acknowledge
    }

    /**
     * DTO персонального баннера.
     */
    public record PersonalBanner(
            String id,
            String code,
            String modelVersion,
            Double score,
            String title,
            String text,
            String badge,
            HighlightDto highlight,
            List<String> perks,
            String theme,
            String validUntil,
            List<String> reasons,
            CtaDto cta
    ) {
        public record HighlightDto(String value, String caption) {
        }

        public record CtaDto(
                String kind,
                String label,
                String product,
                Long amount,
                Integer termMonths,
                String applicationId,
                String applicationStatus,
                String href
        ) {
        }
    }

    /**
     * DTO витрины: персональный баннер (null — модель решила ничего не показывать) и классические.
     */
    public record BannerShowcase(PersonalBanner personal, List<PersonalBanner> classic) {
    }

    private record ClassicBanner(
            String product,
            String title,
            String text,
            String perk,
            String highlight,
            String caption,
            String ctaLabel,
            Long amount,
            Integer termMonths
    ) {
        PersonalBanner toBanner(String theme) {
            // score 0: классический баннер модель не выбирает
            return new PersonalBanner(
                    "CLASSIC:" + product,
                    "CLASSIC_" + product,
                    "catalog",
                    0.0,
                    title,
                    text,
                    null,
                    new PersonalBanner.HighlightDto(highlight, caption),
                    List.of(perk),
                    theme,
                    null,
                    List.of(),
                    new PersonalBanner.CtaDto("NEW_APPLICATION", ctaLabel, product, amount, termMonths, null, null, null)
            );
        }
    }
}
