package ru.oldzoomer.alfacreditbackend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Запрос на принятие решения по заявке (bank).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BankDecisionRequest {

    @NotBlank
    private String decision; // APPROVED, COUNTER_OFFER, REJECTED

    private String terms; // JSON string with LoanTerms

    private String rejectReason;

    @NotBlank
    private String comment;
}
