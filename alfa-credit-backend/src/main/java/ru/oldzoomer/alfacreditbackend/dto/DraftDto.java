package ru.oldzoomer.alfacreditbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Полный черновик анкеты.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DraftDto {

    private String id;
    private String formJson;
    private Integer step;
    private String updatedAt;
    private List<String> prefilled;
}
