package ru.oldzoomer.alfacreditbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Элемент ленты новостей клиента.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FeedItemDto {

    private String id;
    private String type;
    private String title;
    private String text;
    private String createdAt;
    private String link;
}
