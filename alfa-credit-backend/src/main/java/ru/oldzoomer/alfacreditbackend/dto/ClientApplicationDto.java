package ru.oldzoomer.alfacreditbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Детальная заявка клиента (ClientApplication).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ClientApplicationDto {

    private String id;
    private String number;
    private String status;
    private String product;
    private Long amount;
    private Integer termMonths;
    private String purpose;
    private String createdAt;
    private String submittedAt;
    private String updatedAt;
    private String formJson;
    private String enrichmentJson;
    private String scoringJson;
    private String decisionJson;
    private String signingJson;
    private List<StatusHistoryItemDto> history;
    private String stageEta;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StatusHistoryItemDto {
        private String status;
        private String at;
    }
}
