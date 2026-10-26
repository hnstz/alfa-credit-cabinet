package ru.oldzoomer.alfacreditbackend.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.relational.core.mapping.Column;
import org.springframework.data.relational.core.mapping.Table;

import java.time.Instant;
import java.util.List;

/**
 * Сущность заявки — агрегатный корень. Содержит JSON-поля для формы, обогащения, скоринга и решения.
 */
@Table("applications")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Application {

    @Id
    private String id;

    private String number;

    @Column("user_id")
    private String userId;

    private ApplicationStatus status;

    private String product;

    private Long amount;

    @Column("term_months")
    private Integer termMonths;

    private String purpose;

    @Column("form_json")
    private String formJson;

    @Column("enrichment_json")
    private String enrichmentJson;

    @Column("scoring_json")
    private String scoringJson;

    @Column("decision_json")
    private String decisionJson;

    @Column("signing_json")
    private String signingJson;

    @CreatedDate
    @Column("created_at")
    private Instant createdAt;

    @Column("submitted_at")
    private Instant submittedAt;

    @LastModifiedDate
    @Column("updated_at")
    private Instant updatedAt;

    /**
     * Вложенные аудиторные записи — не сохраняются автоматически в SD JDBC, управляются вручную.
     */
    private List<AuditEntry> auditEntries;
}
