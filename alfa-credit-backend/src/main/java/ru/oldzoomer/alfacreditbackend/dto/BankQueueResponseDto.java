package ru.oldzoomer.alfacreditbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Ответ очереди банка (с счётчиками).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BankQueueResponseDto {

    private List<BankQueueItemDto> items;
    private Integer total;
    private QueueCountersDto counters;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class QueueCountersDto {
        private Integer awaitingDecision;
        private Integer inPipeline;
        private Integer decidedToday;
        private Double overrideRate;
    }
}
