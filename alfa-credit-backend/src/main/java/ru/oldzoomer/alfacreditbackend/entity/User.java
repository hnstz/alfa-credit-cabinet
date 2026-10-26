package ru.oldzoomer.alfacreditbackend.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Column;
import org.springframework.data.relational.core.mapping.Table;

/**
 * Сущность пользователя — агрегатный корень.
 */
@Table("users")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class User {
    @Id
    private String id;

    private UserRole role;

    private String login;

    @Column("password_hash")
    private String passwordHash;

    @Column("full_name")
    private String fullName;

    private String position;

    @Column("company_id")
    private String companyId;
}
