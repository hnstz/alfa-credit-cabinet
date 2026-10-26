package ru.oldzoomer.alfacreditbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Сводка черновика для дашборда клиента.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DraftSummaryDto {

    private String id;
    private Integer step;
    private Integer totalSteps;
    private String updatedAt;
    private String product;
    private Long amount;
}
