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
 * Черновик анкеты клиента.
 */
@Table("drafts")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Draft {

    @Id
    private String id;

    @Column("user_id")
    private String userId;

    @Column("form_json")
    private String formJson;

    private Integer step;

    @CreatedDate
    @Column("created_at")
    private Instant createdAt;

    @LastModifiedDate
    @Column("updated_at")
    private Instant updatedAt;

    /**
     * Предзаполненные поля (путь к полю в анкете).
     */
    private List<String> prefilled;
}
