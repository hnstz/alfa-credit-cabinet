package ru.oldzoomer.alfacreditbackend.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Column;
import org.springframework.data.relational.core.mapping.Table;

import java.time.Instant;

/**
 * Аудиторная запись заявки — логирование всех действий.
 */
@Table("application_audit")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuditEntry {

    @Id
    private String id;

    @Column("application_id")
    private String applicationId;

    private String stage;

    private String action;

    private String comment;

    @Column("actor_type")
    private String actorType;

    @Column("actor_name")
    private String actorName;

    private Instant at;
}
