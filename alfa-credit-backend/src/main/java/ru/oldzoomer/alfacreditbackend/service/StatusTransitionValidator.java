package ru.oldzoomer.alfacreditbackend.service;

import org.springframework.stereotype.Service;
import ru.oldzoomer.alfacreditbackend.entity.ApplicationStatus;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Валидатор допустимых переходов статусов заявки (state machine).
 */
@Service
public class StatusTransitionValidator {

    private static final Map<ApplicationStatus, Set<ApplicationStatus>> TRANSITIONS = Map.ofEntries(
            Map.entry(ApplicationStatus.DRAFT, Set.of(ApplicationStatus.SUBMITTED, ApplicationStatus.CANCELLED)),
            Map.entry(ApplicationStatus.SUBMITTED, Set.of(ApplicationStatus.VALIDATION, ApplicationStatus.CANCELLED)),
            Map.entry(ApplicationStatus.VALIDATION, Set.of(ApplicationStatus.ENRICHMENT, ApplicationStatus.NEEDS_INFO)),
            Map.entry(ApplicationStatus.ENRICHMENT, Set.of(ApplicationStatus.SCORING)),
            Map.entry(ApplicationStatus.SCORING, Set.of(ApplicationStatus.UNDER_REVIEW, ApplicationStatus.APPROVED, ApplicationStatus.COUNTER_OFFER, ApplicationStatus.REJECTED)),
            Map.entry(ApplicationStatus.UNDER_REVIEW, Set.of(ApplicationStatus.NEEDS_INFO, ApplicationStatus.APPROVED, ApplicationStatus.COUNTER_OFFER, ApplicationStatus.REJECTED)),
            Map.entry(ApplicationStatus.NEEDS_INFO, Set.of(ApplicationStatus.UNDER_REVIEW, ApplicationStatus.VALIDATION, ApplicationStatus.CANCELLED)),
            Map.entry(ApplicationStatus.APPROVED, Set.of(ApplicationStatus.OFFER_ACCEPTED, ApplicationStatus.OFFER_DECLINED, ApplicationStatus.EXPIRED)),
            Map.entry(ApplicationStatus.COUNTER_OFFER, Set.of(ApplicationStatus.OFFER_ACCEPTED, ApplicationStatus.OFFER_DECLINED, ApplicationStatus.EXPIRED)),
            Map.entry(ApplicationStatus.OFFER_ACCEPTED, Set.of(ApplicationStatus.SIGNING)),
            Map.entry(ApplicationStatus.SIGNING, Set.of(ApplicationStatus.SIGNED, ApplicationStatus.CANCELLED)),
            Map.entry(ApplicationStatus.SIGNED, Set.of(ApplicationStatus.DISBURSED))
    );

    /**
     * Проверить, допустим ли переход из текущего статуса в целевой.
     */
    public boolean canTransition(ApplicationStatus current, ApplicationStatus target) {
        Set<ApplicationStatus> allowed = TRANSITIONS.get(current);
        return allowed != null && allowed.contains(target);
    }

    /**
     * Получить список допустимых следующих статусов.
     */
    public List<ApplicationStatus> getNextStates(ApplicationStatus current) {
        Set<ApplicationStatus> fallback = TRANSITIONS.get(current);
        if (fallback != null) {
            return new ArrayList<>(fallback);
        }
        return new ArrayList<>();
    }

    /**
     * Применить переход, бросает IllegalArgumentException если недопустим.
     */
    public ApplicationStatus validateAndTransition(ApplicationStatus current, ApplicationStatus target) {
        if (!canTransition(current, target)) {
            throw new IllegalArgumentException(
                    String.format("Недопустимый переход статуса: %s -> %s. Допустимые: %s",
                            current, target, getNextStates(current))
            );
        }
        return target;
    }
}
