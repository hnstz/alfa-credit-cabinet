package ru.oldzoomer.alfacreditbackend.security;

import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class TokenService {

    private static final String PREFIX = "Bearer ";
    private static final String TOKEN_VERSION = "v1.";

    // userId -> token (in production, use JWT or token store in DB)
    private final Map<String, String> tokenStore = new ConcurrentHashMap<>();
    private final Map<String, String> userStore = new ConcurrentHashMap<>();

    /**
     * Generate a token for the given userId.
     */
    public String generateToken(String userId) {
        String token = TOKEN_VERSION + UUID.randomUUID().toString();
        tokenStore.put(token, userId);
        userStore.put(userId, token);
        return token;
    }

    /**
     * Resolve token to userId. Returns null if invalid.
     */
    public String resolveUserId(String token) {
        if (token == null || !token.startsWith(TOKEN_VERSION)) {
            return null;
        }
        return tokenStore.get(token);
    }

    /**
     * Invalidate token (logout).
     */
    public void revokeToken(String token) {
        if (token != null) {
            String userId = tokenStore.remove(token);
            if (userId != null) {
                userStore.remove(userId);
            }
        }
    }

    public static String extractToken(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.startsWith(PREFIX)) {
            return null;
        }
        return authorizationHeader.substring(PREFIX.length());
    }
}
