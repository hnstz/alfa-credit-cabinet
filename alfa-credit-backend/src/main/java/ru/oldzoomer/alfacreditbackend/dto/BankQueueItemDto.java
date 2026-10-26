package ru.oldzoomer.alfacreditbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Элемент очереди банка.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BankQueueItemDto {

    private String id;
    private String number;
    private String status;
    private String companyName;
    private String inn;
    private String legalForm;
    private String product;
    private Long amount;
    private Integer termMonths;
    private String submittedAt;
    private String updatedAt;
    private Integer score;
    private String riskLevel;
    private String recommendation;
}
