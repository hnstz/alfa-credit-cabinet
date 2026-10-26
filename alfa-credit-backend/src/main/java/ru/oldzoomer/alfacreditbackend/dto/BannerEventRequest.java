package ru.oldzoomer.alfacreditbackend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Событие баннера: VIEW, CLICK, DISMISS.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BannerEventRequest {

    @NotBlank
    private String bannerId;

    @NotBlank
    private String event; // VIEW, CLICK, DISMISS
}
