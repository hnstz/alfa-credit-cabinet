package ru.oldzoomer.alfacreditbackend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import ru.oldzoomer.alfacreditbackend.service.UserService;

/**
 * Заполняет БД демо-данными при старте приложения.
 * Вызывается один раз после инициализации контекста Spring.
 */
@Configuration
public class SeedConfig {

    private static final Logger log = LoggerFactory.getLogger(SeedConfig.class);

    @Bean
    CommandLineRunner seedData(UserService userService) {
        return args -> {
            log.info("Seeding demo data...");
            userService.seedDemoData();
            log.info("Demo data seeded successfully.");
        };
    }
}
