# ====== Сборка ======
FROM gradle:9.8.2-jdk25-alpine AS build

WORKDIR /app

# Копируем gradle-wrapper и конфигурацию сначала (кэширование слоёв)
COPY alfa-credit-backend/gradle ./alfa-credit-backend/gradle
COPY alfa-credit-backend/gradlew ./alfa-credit-backend/gradlew
COPY alfa-credit-backend/settings.gradle ./alfa-credit-backend/settings.gradle
COPY alfa-credit-backend/build.gradle ./alfa-credit-backend/build.gradle

# Скачиваем зависимости (кэшируется, если файлы не менялись)
RUN chmod +x ./alfa-credit-backend/gradlew
RUN cd alfa-credit-backend && ./gradlew dependencies --no-daemon || true

# Копируем исходники
COPY alfa-credit-backend/src ./alfa-credit-backend/src

# Собираем jar
RUN cd alfa-credit-backend && ./gradlew bootJar --no-daemon

# ====== Рантайм ======
FROM eclipse-temurin:25-jre-alpine

ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -Djava.security.egd=file:/dev/./urandom"

WORKDIR /app

COPY --from=build /app/alfa-credit-backend/build/libs/*.jar app.jar

RUN apk add curl

EXPOSE 8080

ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS} -jar app.jar"]
