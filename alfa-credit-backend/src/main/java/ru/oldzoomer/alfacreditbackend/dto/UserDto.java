package ru.oldzoomer.alfacreditbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO пользователя для отдачи фронтенду.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserDto {

    private String id;
    private String role;
    private String login;
    private String fullName;
    private String position;
    private CompanyDto company;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CompanyDto {
        private String id;
        private String legalForm;
        private String name;
        private String inn;
        private String ogrn;
        private String okved;
        private String okvedName;
        private String registeredAt;
        private Integer employees;
        private Long annualRevenue;
        private String region;
    }
}
