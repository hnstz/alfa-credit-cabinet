package ru.oldzoomer.alfacreditbackend.controller;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import ru.oldzoomer.alfacreditbackend.dto.AuthRequest;
import ru.oldzoomer.alfacreditbackend.dto.AuthResponse;
import ru.oldzoomer.alfacreditbackend.dto.UserDto;
import ru.oldzoomer.alfacreditbackend.entity.User;
import ru.oldzoomer.alfacreditbackend.security.TokenService;
import ru.oldzoomer.alfacreditbackend.service.UserService;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;
    private final TokenService tokenService;

    public AuthController(UserService userService, TokenService tokenService) {
        this.userService = userService;
        this.tokenService = tokenService;
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody AuthRequest request) {
        User user = userService.authenticate(request.getLogin(), request.getPassword());
        if (user == null) {
            return ResponseEntity.status(401).body(null);
        }
        String token = tokenService.generateToken(user.getId());
        UserDto userDto = userService.toUserDto(user);
        return ResponseEntity.ok(AuthResponse.builder()
                .accessToken(token)
                .user(userDto)
                .build());
    }

    @GetMapping("/me")
    public ResponseEntity<UserDto> me(@AuthenticationPrincipal User user) {
        if (user == null) {
            return ResponseEntity.status(401).body(null);
        }
        return ResponseEntity.ok(userService.toUserDto(user));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestHeader(value = "Authorization", required = false) String authorization) {
        String token = TokenService.extractToken(authorization);
        if (token != null) {
            tokenService.revokeToken(token);
        }
        return ResponseEntity.noContent().build();
    }
}
