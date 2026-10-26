package ru.oldzoomer.alfacreditbackend.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Column;
import org.springframework.data.relational.core.mapping.Table;

import java.time.LocalDate;

/**
 * Сущность компании — агрегатный корень.
 */
@Table("companies")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Company {
    @Id
    private String id;

    private CompanyLegalForm legalForm;

    private String name;

    private String inn;

    private String ogrn;

    @Column("okved")
    private String okvedCode;

    @Column("okved_name")
    private String okvedName;

    @Column("registered_at")
    private LocalDate registeredAt;

    private Integer employees;

    @Column("annual_revenue")
    private Long annualRevenue;

    private String region;
}
