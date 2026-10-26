package ru.oldzoomer.alfacreditbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Детальная заявка для рабочего места сотрудника банка.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BankApplicationDto {

    private String id;
    private String number;
    private String status;
    private String product;
    private String createdAt;
    private String submittedAt;
    private String updatedAt;
    private String formJson;
    private String enrichmentJson;
    private String scoringJson;
    private String decisionJson;
    private List<BankAuditEntryDto> audit;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BankAuditEntryDto {
        private String id;
        private String at;
        private String actorType;
        private String actorName;
        private String stage;
        private String action;
        private String comment;
    }
}
