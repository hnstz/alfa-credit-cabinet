package ru.oldzoomer.alfacreditbackend.entity;

/**
 * Статус заявки — полный state machine из 17 состояний.
 */
public enum ApplicationStatus {
    DRAFT,
    SUBMITTED,
    VALIDATION,
    ENRICHMENT,
    SCORING,
    UNDER_REVIEW,
    NEEDS_INFO,
    APPROVED,
    COUNTER_OFFER,
    REJECTED,
    OFFER_ACCEPTED,
    OFFER_DECLINED,
    SIGNING,
    SIGNED,
    DISBURSED,
    CANCELLED,
    EXPIRED
}
