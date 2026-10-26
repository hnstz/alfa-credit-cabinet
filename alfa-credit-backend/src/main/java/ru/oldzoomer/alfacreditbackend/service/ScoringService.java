package ru.oldzoomer.alfacreditbackend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

/**
 * Скоринг-сервис.
 * Рассчитывает оценку риска на основе данных заявки и внешних источников.
 * Возвращает JSON с score, pd, riskLevel, confidence, factors, recommendation.
 */
@Service
public class ScoringService {

    private static final ObjectMapper mapper = new ObjectMapper();

    /**
     * Рассчитать скоринг на основе JSON формы заявки.
     * В реальной системе сюда также передаются данные обогащения (ЕГРЮЛ, БКИ, ФНС).
     */
    public String calculateScoring(String formJson) {
        try {
            JsonNode form = mapper.readTree(formJson);

            // Base score
            int score = 640;
            ArrayNode factors = mapper.createArrayNode();

            // --- Признаки из формы ---

            // 1. Сумма и срок
            long amount = form.has("loan") ? form.path("loan").path("amount").asLong(0) : 0;
            int termMonths = form.has("loan") ? form.path("loan").path("termMonths").asInt(12) : 12;

            if (amount > 0 && termMonths > 0) {
                double monthlyPayment = calculateMonthlyPayment(amount, termMonths, 0.25);
                double debtLoadRatio = calculateDebtLoadRatio(form, monthlyPayment);

                if (debtLoadRatio < 0.3) {
                    score += 30;
                    factors.add(createFactor("DEBT_LOAD_LOW", "Нагрузка по кредиту < 30%", "+30", 30));
                } else if (debtLoadRatio < 0.5) {
                    score += 10;
                    factors.add(createFactor("DEBT_LOAD_MEDIUM", "Нагрузка по кредиту 30-50%", "+10", 10));
                } else {
                    score -= 20;
                    factors.add(createFactor("DEBT_LOAD_HIGH", "Нагрузка по кредиту > 50%", "-20", -20));
                }
            }

            // 2. Юридическая форма
            String legalForm = form.has("company") ? form.path("company").path("legalForm").asText("OOO") : "OOO";
            if ("OOO".equals(legalForm)) {
                score += 5;
                factors.add(createFactor("LEGAL_FORM_OOO", "Форма: ООО", "+5", 5));
            } else {
                score -= 5;
                factors.add(createFactor("LEGAL_FORM_IP", "Форма: ИП", "-5", -5));
            }

            // 3. Система налогообложения
            String taxSystem = form.has("company") ? form.path("company").path("taxSystem").asText("") : "";
            if ("USN_INCOME".equals(taxSystem)) {
                score += 10;
                factors.add(createFactor("TAX_USN", "УСН Доходы", "+10", 10));
            } else if ("OSNO".equals(taxSystem)) {
                score += 5;
                factors.add(createFactor("TAX_OSNO", "ОСНО", "+5", 5));
            }

            // 4. Залог
            String collateral = form.has("finance") ? form.path("finance").path("collateral").asText("NONE") : "NONE";
            if (!"NONE".equals(collateral)) {
                score += 20;
                factors.add(createFactor("COLLATERAL_YES", "Есть залог", "+20", 20));
            }

            // 5. Количество сотрудников
            int employees = form.has("company") ? form.path("company").path("employees").asInt(0) : 0;
            if (employees > 10) {
                score += 10;
                factors.add(createFactor("EMPLOYEES_MANY", "Сотрудников > 10", "+10", 10));
            }

            // 6. Согласия
            boolean hasConsents = form.has("consents") &&
                    form.path("consents").path("creditHistory").asBoolean(false) &&
                    form.path("consents").path("dataProcessing").asBoolean(false);
            if (!hasConsents) {
                score -= 15;
                factors.add(createFactor("NO_CONSENTS", "Нет согласий", "-15", -15));
            }

            // --- Расчёт производных ---
            double pd = Math.max(0.001, Math.min(0.5, 1.0 - (score - 300) / 550.0));
            String riskLevel = pd < 0.1 ? "LOW" : pd < 0.25 ? "MEDIUM" : "HIGH";
            double confidence = Math.min(1.0, 0.5 + Math.abs(score - 640) / 1000.0);
            double ratePercent = switch (riskLevel) {
                case "LOW" -> 18.0 + (1 - confidence) * 5;
                case "MEDIUM" -> 25.0 + (1 - confidence) * 5;
                case "HIGH" -> 35.0 + (1 - confidence) * 10;
                default -> 30.0;
            };

            // --- Рекомендация ---
            boolean canAfford = amount == 0 || monthlyPaymentSafe(amount, termMonths, ratePercent) <
                    (form.has("finance") ? form.path("finance").path("monthlyRevenue").asLong(0) : 0) * 0.5;

            String decision;
            if (score >= 680 && canAfford) {
                decision = "APPROVED";
            } else if (score >= 600) {
                decision = "COUNTER_OFFER";
            } else {
                decision = "REJECTED";
            }

            String route = amount <= 1_000_000 && confidence > 0.7 ? "AUTO" : "MANUAL";
            String routeReason = "AUTO".equals(route)
                    ? "Сумма <= 1 млн и высокая уверенность модели"
                    : "Требует ручной проверки сотрудником";

            // --- Build result ---
            ObjectNode result = mapper.createObjectNode();
            result.put("score", score);
            result.put("pd", Math.round(pd * 1000.0) / 1000.0);
            result.put("riskLevel", riskLevel);
            result.put("confidence", Math.round(confidence * 100.0) / 100.0);
            result.put("ratePercent", Math.round(ratePercent * 10.0) / 10.0);
            result.put("modelVersion", "scoring-v2026-01-01");
            result.set("factors", factors);

            ObjectNode recommendation = mapper.createObjectNode();
            recommendation.put("decision", decision);
            if ("APPROVED".equals(decision) || "COUNTER_OFFER".equals(decision)) {
                ObjectNode terms = mapper.createObjectNode();
                terms.put("amount", amount);
                terms.put("termMonths", termMonths);
                terms.put("ratePercent", Math.round(ratePercent * 10.0) / 10.0);
                terms.put("monthlyPayment", calculateMonthlyPayment(amount, termMonths, ratePercent / 100.0));
                recommendation.set("terms", terms);
            }
            if ("REJECTED".equals(decision)) {
                recommendation.put("rejectReason", score < 550 ? "HIGH_DEBT_LOAD" : "NO_HISTORY");
            }
            recommendation.put("maxAffordableAmount", calculateMaxAffordableAmount(form, termMonths, ratePercent));
            recommendation.put("route", route);
            recommendation.put("routeReason", routeReason);
            result.set("recommendation", recommendation);

            return mapper.writeValueAsString(result);

        } catch (Exception e) {
            // Fallback: default scoring
            try {
                ObjectNode fallback = mapper.createObjectNode();
                fallback.put("score", 600);
                fallback.put("pd", 0.2);
                fallback.put("riskLevel", "MEDIUM");
                fallback.put("confidence", 0.5);
                fallback.put("ratePercent", 25.0);
                fallback.put("modelVersion", "fallback-v1");
                fallback.set("factors", mapper.createArrayNode());
                ObjectNode rec = mapper.createObjectNode();
                rec.put("decision", "COUNTER_OFFER");
                rec.put("maxAffordableAmount", 0);
                rec.put("route", "MANUAL");
                rec.put("routeReason", "Автоматический расчёт не выполнен");
                fallback.set("recommendation", rec);
                return mapper.writeValueAsString(fallback);
            } catch (Exception ex) {
                return "{}";
            }
        }
    }

    private double calculateMonthlyPayment(long amount, int termMonths, double monthlyRate) {
        if (monthlyRate == 0) return amount / (double) termMonths;
        return amount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths));
    }

    private double monthlyPaymentSafe(long amount, int termMonths, double ratePercent) {
        return calculateMonthlyPayment(amount, termMonths, ratePercent / 100.0);
    }

    private double calculateDebtLoadRatio(JsonNode form, double newPayment) {
        long monthlyRevenue = form.has("finance") ? form.path("finance").path("monthlyRevenue").asLong(0) : 0;
        long otherPayments = form.has("finance") ? form.path("finance").path("otherLoansPayment").asLong(0) : 0;
        if (monthlyRevenue == 0) return 1.0;
        return (newPayment + otherPayments) / (double) monthlyRevenue;
    }

    private long calculateMaxAffordableAmount(JsonNode form, int termMonths, double ratePercent) {
        long monthlyRevenue = form.has("finance") ? form.path("finance").path("monthlyRevenue").asLong(0) : 0;
        long otherPayments = form.has("finance") ? form.path("finance").path("otherLoansPayment").asLong(0) : 0;
        double maxPayment = monthlyRevenue * 0.4 - otherPayments;
        if (maxPayment <= 0) return 0;
        double monthlyRate = ratePercent / 100.0 / 12.0;
        if (monthlyRate == 0) return (long) (maxPayment * termMonths);
        return (long) (maxPayment * (1 - Math.pow(1 + monthlyRate, -termMonths)) / monthlyRate);
    }

    private ObjectNode createFactor(
            String code, String label, String value, int impact) {
        ObjectNode factor = mapper.createObjectNode();
        factor.put("code", code);
        factor.put("label", label);
        factor.put("value", value);
        factor.put("impact", impact);
        return factor;
    }
}
