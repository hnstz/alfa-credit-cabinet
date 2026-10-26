package ru.oldzoomer.alfacreditbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Продукт, доступный клиенту.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProductDto {

    private String id;
    private String code;
    private String name;
    private String description;
    private Long minAmount;
    private Long maxAmount;
    private Integer minTermMonths;
    private Integer maxTermMonths;
}
