package ru.oldzoomer.alfacreditbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Сводка заявки (список).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApplicationSummaryDto {

    private String id;
    private String number;
    private String status;
    private String product;
    private Long amount;
    private Integer termMonths;
    private String createdAt;
    private String updatedAt;
}
