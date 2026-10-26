package ru.oldzoomer.alfacreditbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Ответ на запрос кода подписания.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SigningCodeResponse {

    private String phoneMask;
    private String demoCode;
}
