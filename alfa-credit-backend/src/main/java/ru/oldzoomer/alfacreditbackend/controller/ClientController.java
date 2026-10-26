package ru.oldzoomer.alfacreditbackend.controller;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import ru.oldzoomer.alfacreditbackend.dto.BannerEventRequest;
import ru.oldzoomer.alfacreditbackend.dto.FeedItemDto;
import ru.oldzoomer.alfacreditbackend.dto.ProductDto;
import ru.oldzoomer.alfacreditbackend.entity.User;
import ru.oldzoomer.alfacreditbackend.service.ClientService;

import java.util.List;

@RestController
@RequestMapping("/api/client")
public class ClientController {

    private final ClientService clientService;

    public ClientController(ClientService clientService) {
        this.clientService = clientService;
    }

    @GetMapping("/products")
    public ResponseEntity<List<ProductDto>> products(@AuthenticationPrincipal User user) {
        return ResponseEntity.ok(clientService.getProducts());
    }

    @GetMapping("/feed")
    public ResponseEntity<List<FeedItemDto>> feed(@AuthenticationPrincipal User user) {
        return ResponseEntity.ok(clientService.getFeed(user));
    }

    @GetMapping("/banner")
    public ResponseEntity<ClientService.PersonalBanner> banner(@AuthenticationPrincipal User user) {
        ClientService.PersonalBanner banner = clientService.getBanner(user);
        if (banner == null) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok(banner);
    }

    @PostMapping("/banner/events")
    public ResponseEntity<Void> bannerEvent(@AuthenticationPrincipal User user,
                                            @Valid @RequestBody BannerEventRequest request) {
        clientService.logBannerEvent(user, request.getBannerId(), request.getEvent());
        return ResponseEntity.noContent().build();
    }
}
