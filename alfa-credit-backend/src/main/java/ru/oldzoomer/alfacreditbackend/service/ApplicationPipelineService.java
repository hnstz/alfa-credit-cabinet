package ru.oldzoomer.alfacreditbackend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import ru.oldzoomer.alfacreditbackend.entity.ApplicationStatus;
import ru.oldzoomer.alfacreditbackend.entity.AuditEntry;
import ru.oldzoomer.alfacreditbackend.repository.ApplicationRepository;
import ru.oldzoomer.alfacreditbackend.repository.AuditEntryRepository;
import ru.oldzoomer.alfacreditbackend.repository.UserRepository;

import java.time.Instant;
import java.util.*;

/**
 * Сервис управления жизненным циклом заявки (pipeline).
 * Управляет переходами статусов, создаёт заявки из черновиков,
 * обрабатывает офферы и подписание.
 */
@Service
public class ApplicationPipelineService {

    private static final ObjectMapper mapper = new ObjectMapper();
    private static final int TOTAL_STEPS = 4;

    public static final int TOTAL_APPLICATION_STEPS = 4;

    private final ApplicationRepository applicationRepository;
    private final UserRepository userRepository;
    private final AuditEntryRepository auditEntryRepository;
    private final StatusTransitionValidator statusTransitionValidator;
    private final ScoringService scoringService;

    public ApplicationPipelineService(ApplicationRepository applicationRepository,
                                      UserRepository userRepository,
                                      AuditEntryRepository auditEntryRepository,
                                      StatusTransitionValidator statusTransitionValidator,
                                      ScoringService scoringService) {
        this.applicationRepository = applicationRepository;
        this.userRepository = userRepository;
        this.auditEntryRepository = auditEntryRepository;
        this.statusTransitionValidator = statusTransitionValidator;
        this.scoringService = scoringService;
    }

    /**
     * Создать заявку из черновика.
     */
    public ru.oldzoomer.alfacreditbackend.entity.Application createApplication(String draftId, String userId, Instant now) {
        ru.oldzoomer.alfacreditbackend.entity.Application app = new ru.oldzoomer.alfacreditbackend.entity.Application();
        app.setId(UUID.randomUUID().toString());
        app.setNumber(generateNumber());
        app.setUserId(userId);
        app.setStatus(ApplicationStatus.SUBMITTED);
        app.setCreatedAt(now);
        app.setUpdatedAt(now);
        app.setSubmittedAt(now);

        // Generate audit entry
        AuditEntry audit = AuditEntry.builder()
                .id(UUID.randomUUID().toString())
                .applicationId(app.getId())
                .stage("SUBMITTED")
                .action("application_submitted")
                .actorType("client")
                .actorName(getUserName(userId))
                .at(now)
                .build();

        applicationRepository.save(app);
        auditEntryRepository.save(audit);

        return app;
    }

    /**
     * Продвинуть заявку к следующему этапу конвейера.
     */
    public ru.oldzoomer.alfacreditbackend.entity.Application advanceToNextStage(String applicationId, Instant now) {
        Optional<ru.oldzoomer.alfacreditbackend.entity.Application> opt = applicationRepository.findById(applicationId);
        if (opt.isEmpty()) {
            throw new IllegalArgumentException("Заявка не найдена: " + applicationId);
        }

        ru.oldzoomer.alfacreditbackend.entity.Application app = opt.get();
        ApplicationStatus current = app.getStatus();

        // State machine transitions
        ApplicationStatus next;
        switch (current) {
            case SUBMITTED -> next = ApplicationStatus.VALIDATION;
            case VALIDATION -> next = ApplicationStatus.ENRICHMENT;
            case ENRICHMENT -> {
                // Run scoring
                String scoringResult = scoringService.calculateScoring(app.getFormJson());
                app.setScoringJson(scoringResult);

                // Check if auto-decision is possible (amount <= 1M and high confidence)
                try {
                    JsonNode scoringNode = mapper.readTree(scoringResult);
                    boolean autoDecision = scoringNode.has("recommendation");
                    if (autoDecision) {
                        JsonNode rec = scoringNode.path("recommendation");
                        String decision = rec.path("decision").asText();
                        String route = rec.path("route").asText();

                        if ("AUTO".equals(route)) {
                            switch (decision) {
                                case "APPROVED" -> next = ApplicationStatus.APPROVED;
                                case "COUNTER_OFFER" -> next = ApplicationStatus.COUNTER_OFFER;
                                case "REJECTED" -> next = ApplicationStatus.REJECTED;
                                default -> next = ApplicationStatus.UNDER_REVIEW;
                            }
                            // Set decision JSON
                            app.setDecisionJson(scoringResult);
                            break;
                        }
                    }
                } catch (Exception e) {
                    // JSON parsing error, fall through to manual review
                }
                next = ApplicationStatus.SCORING;
            }
            case SCORING -> next = ApplicationStatus.UNDER_REVIEW;
            default -> throw new IllegalStateException("Нельзя продвинуть статус: " + current);
        }

        // Validate transition
        statusTransitionValidator.validateAndTransition(current, next);

        app.setStatus(next);
        app.setUpdatedAt(now);

        // Add audit entry
        AuditEntry audit = AuditEntry.builder()
                .id(UUID.randomUUID().toString())
                .applicationId(app.getId())
                .stage(next.name())
                .action("status_advanced")
                .actorType("system")
                .actorName("system")
                .at(now)
                .build();

        applicationRepository.save(app);
        auditEntryRepository.save(audit);

        return app;
    }

    /**
     * Принять предложение клиентом.
     */
    public ru.oldzoomer.alfacreditbackend.entity.Application acceptOffer(String applicationId, Instant now) {
        ru.oldzoomer.alfacreditbackend.entity.Application app = getApplication(applicationId);
        statusTransitionValidator.validateAndTransition(app.getStatus(), ApplicationStatus.OFFER_ACCEPTED);

        app.setStatus(ApplicationStatus.OFFER_ACCEPTED);
        app.setUpdatedAt(now);

        addAuditEntry(app.getId(), ApplicationStatus.OFFER_ACCEPTED, "offer_accepted", "client", getUserName(app.getUserId()), now);
        return applicationRepository.save(app);
    }

    /**
     * Отклонить предложение клиентом.
     */
    public ru.oldzoomer.alfacreditbackend.entity.Application declineOffer(String applicationId, String reason, Instant now) {
        ru.oldzoomer.alfacreditbackend.entity.Application app = getApplication(applicationId);
        statusTransitionValidator.validateAndTransition(app.getStatus(), ApplicationStatus.OFFER_DECLINED);

        app.setStatus(ApplicationStatus.OFFER_DECLINED);
        app.setUpdatedAt(now);

        addAuditEntry(app.getId(), ApplicationStatus.OFFER_DECLINED, "offer_declined", "client", getUserName(app.getUserId()), now, reason);
        return applicationRepository.save(app);
    }

    /**
     * Перейти в статус подписание.
     */
    public ru.oldzoomer.alfacreditbackend.entity.Application startSigning(String applicationId, Instant now) {
        ru.oldzoomer.alfacreditbackend.entity.Application app = getApplication(applicationId);
        statusTransitionValidator.validateAndTransition(app.getStatus(), ApplicationStatus.SIGNING);

        app.setStatus(ApplicationStatus.SIGNING);
        app.setUpdatedAt(now);

        // Generate signing info
        try {
            Map<String, Object> signingInfo = new HashMap<>();
            signingInfo.put("documents", List.of(
                    Map.of("id", "doc-1", "title", "Договор кредитования", "description", "Основной договор", "pages", 5),
                    Map.of("id", "doc-2", "title", "Спецификация условий", "description", "Детальные условия кредита", "pages", 3)
            ));
            signingInfo.put("signedAt", null);
            signingInfo.put("phoneMask", "****" + app.getUserId().substring(app.getUserId().length() - 4));
            app.setSigningJson(mapper.writeValueAsString(signingInfo));
        } catch (Exception e) {
            // Ignore
        }

        addAuditEntry(app.getId(), ApplicationStatus.SIGNING, "signing_started", "system", "system", now);
        return applicationRepository.save(app);
    }

    /**
     * Подтвердить подписание.
     */
    public ru.oldzoomer.alfacreditbackend.entity.Application confirmSigning(String applicationId, String code, Instant now) {
        ru.oldzoomer.alfacreditbackend.entity.Application app = getApplication(applicationId);
        statusTransitionValidator.validateAndTransition(app.getStatus(), ApplicationStatus.SIGNED);

        app.setStatus(ApplicationStatus.SIGNED);
        app.setUpdatedAt(now);

        // Update signing info
        try {
            JsonNode signingNode = mapper.readTree(app.getSigningJson());
            ((ObjectNode) signingNode).put("signedAt", now.toString());
            app.setSigningJson(mapper.writeValueAsString(signingNode));
        } catch (Exception e) {
            // Ignore JSON parsing errors
        }

        addAuditEntry(app.getId(), ApplicationStatus.SIGNED, "signing_confirmed", "client", getUserName(app.getUserId()), now);
        return applicationRepository.save(app);
    }

    /**
     * Принять решение от сотрудника банка.
     */
    public ru.oldzoomer.alfacreditbackend.entity.Application makeDecision(String applicationId,
                                                                          String decision,
                                                                          String termsJson,
                                                                          String rejectReason,
                                                                          String comment,
                                                                          Instant now) {
        ru.oldzoomer.alfacreditbackend.entity.Application app = getApplication(applicationId);
        ApplicationStatus targetStatus = switch (decision) {
            case "APPROVED" -> ApplicationStatus.APPROVED;
            case "COUNTER_OFFER" -> ApplicationStatus.COUNTER_OFFER;
            case "REJECTED" -> ApplicationStatus.REJECTED;
            default -> throw new IllegalArgumentException("Неизвестное решение: " + decision);
        };

        statusTransitionValidator.validateAndTransition(app.getStatus(), targetStatus);
        app.setStatus(targetStatus);
        app.setUpdatedAt(now);

        // Build decision JSON
        try {
            Map<String, Object> decisionMap = new HashMap<>();
            decisionMap.put("decision", decision);
            if (termsJson != null) {
                decisionMap.put("terms", termsJson);
            }
            if (rejectReason != null) {
                decisionMap.put("rejectReason", rejectReason);
            }
            decisionMap.put("comment", comment);
            decisionMap.put("decidedBy", Map.of("type", "officer", "name", getUserName(app.getUserId())));
            decisionMap.put("decidedAt", now.toString());
            decisionMap.put("isOverride", false);
            app.setDecisionJson(mapper.writeValueAsString(decisionMap));
        } catch (Exception e) {
            // Ignore
        }

        addAuditEntry(app.getId(), targetStatus, "decision_made", "officer", getUserName(app.getUserId()), now, comment);
        return applicationRepository.save(app);
    }

    /**
     * Отменить заявку.
     */
    public ru.oldzoomer.alfacreditbackend.entity.Application cancelApplication(String applicationId, Instant now) {
        ru.oldzoomer.alfacreditbackend.entity.Application app = getApplication(applicationId);
        statusTransitionValidator.validateAndTransition(app.getStatus(), ApplicationStatus.CANCELLED);

        app.setStatus(ApplicationStatus.CANCELLED);
        app.setUpdatedAt(now);

        addAuditEntry(app.getId(), ApplicationStatus.CANCELLED, "application_cancelled", "client", getUserName(app.getUserId()), now);
        return applicationRepository.save(app);
    }

    /**
     * Выдать кредит (перейти в DISBURSED).
     */
    public ru.oldzoomer.alfacreditbackend.entity.Application disburse(String applicationId, Instant now) {
        ru.oldzoomer.alfacreditbackend.entity.Application app = getApplication(applicationId);
        statusTransitionValidator.validateAndTransition(app.getStatus(), ApplicationStatus.DISBURSED);

        app.setStatus(ApplicationStatus.DISBURSED);
        app.setUpdatedAt(now);

        addAuditEntry(app.getId(), ApplicationStatus.DISBURSED, "disbursed", "system", "system", now);
        return applicationRepository.save(app);
    }

    // --- Helpers ---

    private ru.oldzoomer.alfacreditbackend.entity.Application getApplication(String applicationId) {
        return applicationRepository.findById(applicationId)
                .orElseThrow(() -> new IllegalArgumentException("Заявка не найдена: " + applicationId));
    }

    private String getUserName(String userId) {
        return userRepository.findById(userId)
                .map(u -> u.getFullName())
                .orElse("Unknown");
    }

    private void addAuditEntry(String applicationId, ApplicationStatus stage, String action,
                               String actorType, String actorName, Instant at) {
        addAuditEntry(applicationId, stage, action, actorType, actorName, at, null);
    }

    private void addAuditEntry(String applicationId, ApplicationStatus stage, String action,
                               String actorType, String actorName, Instant at, String comment) {
        AuditEntry audit = AuditEntry.builder()
                .id(UUID.randomUUID().toString())
                .applicationId(applicationId)
                .stage(stage.name())
                .action(action)
                .actorType(actorType)
                .actorName(actorName)
                .at(at)
                .comment(comment)
                .build();
        auditEntryRepository.save(audit);
    }

    private String generateNumber() {
        // Format: APP-YYYYMMDD-NNNN
        String date = Instant.now().toString().substring(0, 10).replace("-", "");
        long seq = java.util.stream.StreamSupport.stream(applicationRepository.findAll().spliterator(), false)
                .filter(a -> a.getNumber().startsWith("APP-" + date))
                .mapToInt(a -> {
                    try {
                        return Integer.parseInt(a.getNumber().substring(a.getNumber().lastIndexOf("-") + 1));
                    } catch (NumberFormatException e) {
                        return 0;
                    }
                })
                .max()
                .orElse(0) + 1;
        return String.format("APP-%s-%04d", date, seq);
    }
}
